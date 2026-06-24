---
title: "The bug my unit tests couldn't catch — so I built an LLM eval harness"
slug: "eval-harness"
tags: ["ai-engineering", "python", "csharp", "llm", "evaluation"]
series: "Backend to AI Engineer in 90 Days"
canonical_url: "https://rikky.hashnode.dev/eval-harness"
status: draft
hashnode_url: null
---

## The Problem

For three months, my LLM extraction pipeline had 100% passing tests. Every mock test said the plumbing was correct. And then I wrote one real eval fixture and discovered that `flow` was *always* serializing as `"FlowType.DB"` — not `"DB"` — on every single transaction the model had ever extracted. The tests never caught it because the tests never ran a real model.

That's the thing about mock-based contract tests: they prove the wiring works, but they never prove the model gets the right answer. I needed something different.

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  Bank Statement  │───▶│ LlmParser        │───▶│ TransactionResult[] │
│  (text / PDF)   │    │ (Gemini/Anthropic)│    │ (structured output) │
└─────────────────┘    └──────────────────┘    └──────────┬──────────┘
                                                           │
                        ┌──────────────────────────────────▼──────────┐
                        │            Eval Harness                      │
                        │  ┌────────────┐   ┌──────────────────────┐  │
                        │  │ 20 Fixtures│   │ Ground Truth JSON    │  │
                        │  │ (real text)│   │ (hand-labeled)       │  │
                        │  └─────┬──────┘   └──────────┬───────────┘  │
                        │        └──────┬───────────────┘              │
                        │               ▼                               │
                        │  ┌─────────────────────────────────────────┐ │
                        │  │ scorer.py: align on (date+amount) key   │ │
                        │  │ → row F1 + critical-field accuracy      │ │
                        │  └─────────────────────────────────────────┘ │
                        └──────────────────────────────────────────────┘
```

## What I Built

A 20-fixture eval harness in `services/ai-service/evals/` that runs real bank statement text through both LLM providers (Gemini and Anthropic), scores the output against hand-labeled ground truth, and reports row-level F1 plus critical-field accuracy across the set. Running it today: Gemini 2.5 Flash hits 100% row F1 on BCA CSV, NeoBank PDF, and screenshot fixtures. That number is quotable. Before this harness, I had nothing.

## The Wall I Hit

The first design mistake was comparison by position. I wrote a scorer that zipped the predicted list against the ground-truth list index-by-index and compared field by field. It felt obvious. It was wrong.

The problem: LLMs don't guarantee output order. If a model emits transactions in chronological order but the ground truth is in statement order, a single shifted row cascades into five wrong fields instead of one wrong row. The metric looked terrible even when the extraction was actually perfect.

I re-read Hamel Husain's *Your AI Product Needs Evals* that night and found the framing I'd been missing: **alignment is a matching problem, not a comparison problem**. Ground truth rows aren't at position N — they have a natural identity key. For bank transactions, that key is `(date, amount_idr)` — the same composite key my .NET deduplication pipeline already uses. Match on the key first, then field-compare the matched pairs. Unmatched ground-truth rows are misses (recall hit); unmatched predicted rows are phantoms (precision hit).

```python
def _row_key(tx: dict) -> tuple[str, Decimal]:
    return (str(tx.get("date", "")).strip(), _norm_amount(tx.get("amount_idr")))

def score_fixture(predicted: list[dict], ground_truth: list[dict]) -> FixtureScore:
    truth_map = {_row_key(t): t for t in ground_truth}
    pred_map  = {_row_key(p): p for p in predicted}

    matched_keys = set(truth_map) & set(pred_map)
    missed_keys  = set(truth_map) - set(pred_map)   # recall hits
    phantom_keys = set(pred_map)  - set(truth_map)  # precision hits
    ...
```

**C# equivalent** (Python `dict` keyed on a tuple → C# `Dictionary<(string, decimal), Transaction>`; `set` intersection → LINQ `.Intersect()`):

```csharp
var truthMap  = groundTruth.ToDictionary(t => (t.Date, RoundAmount(t.AmountIdr)));
var predMap   = predicted.ToDictionary(p => (p.Date, RoundAmount(p.AmountIdr)));

var matchedKeys = truthMap.Keys.Intersect(predMap.Keys).ToHashSet();
var missedKeys  = truthMap.Keys.Except(predMap.Keys).ToHashSet();   // recall
var phantomKeys = predMap.Keys.Except(truthMap.Keys).ToHashSet();   // precision
```

The alignment fix cleaned up the scorer. But the first real run was still a disaster.

## The Bug the Eval Caught

Row F1: **0.00**. Every transaction unmatched. I assumed the worst — the model was returning garbage. I printed the raw extracted transactions and read them by eye.

The fields looked correct: right dates, right amounts, right descriptions. I ran a manual key lookup. The date matched. The amount matched. But the lookup returned `None`.

I narrowed it down to `flow`. The ground truth had `"DB"` and `"CR"`. The extracted output had `"FlowType.DB"` and `"FlowType.CR"`.

The cause: `TransactionResult.flow` is typed as `FlowType(str, Enum)`. In Python 3.11+, `str(FlowType.DB)` returns `"FlowType.DB"` — the full enum representation — not `"DB"`. The mock tests never caught this because they mocked the provider return value directly; they never called `.flow` on a real `FlowType` instance.

The fix is one line in the runner:

```python
# BEFORE — silently serializes enum name, not value
rows = [dict(t) for t in result.transactions]

# AFTER — Pydantic v2 serializes enums to their string values correctly
rows = [t.model_dump(mode="json") for t in result.transactions]
```

**C# equivalent** (Python `model_dump(mode='json')` → C# `JsonSerializer.Serialize()` with `JsonStringEnumConverter`, which handles this correctly by default when the converter is registered):

```csharp
// System.Text.Json — enum serialization controlled at the property level.
// [JsonConverter(typeof(JsonStringEnumConverter))] serializes "DB", not "FlowType.DB".
// No equivalent footgun: .NET serializer respects the attribute, not raw .ToString().
var json = JsonSerializer.Serialize(transaction, new JsonSerializerOptions {
    Converters = { new JsonStringEnumConverter() }
});
```

> The .NET ecosystem enforces this at the declaration site. Python's `str(enum)` behavior depends on the Python version and the enum base class. If you're on Python 3.11+ with a `str, Enum` mixin, always use `model_dump(mode='json')` — never `str()` on an enum field.

## The Metric

After the `model_dump` fix, I re-ran on 15 fixtures (the remaining 5 Superbank batches hit Gemini's 20-requests-per-day free-tier quota):

| Provider | Fixtures | Row F1 | Critical Fields | Cost/doc |
|---|---|---|---|---|
| Gemini 2.5 Flash | 15/20 | **1.00** | **1.00** | ~$0.003 |
| Claude Sonnet 4.6 | 15/20 | **1.00** | **1.00** | ~$0.018 |

Both providers hit perfect scores on every fixture that ran. Critical fields — `date`, `amount_idr`, `flow` — are the three that matter for financial integrity. They were all correct, across every matched fixture.

Before this harness, my answer to "how do you know your extraction is correct?" was "we spot-check manually." Now it's "we have a 20-fixture eval that measures row-level F1 and critical-field accuracy; Gemini hits 100% on BCA, NeoBank, and screenshot formats."

## What I'd Do Differently

I'd have written the scorer unit test first, before running the harness. `scoring.py` has pure logic — it doesn't need a real LLM — but I didn't write `test_eval_scoring.py` until after the first confused run, when I wasn't sure if the zero F1 was a scorer bug or a provider bug. Writing the scorer tests first would have made that confusion impossible. Test your oracle before you trust its verdicts.

## What This Shows I Can Do

I can build LLM evaluation infrastructure that catches real data-quality bugs before they reach production — including bugs that mocked unit tests will never surface. The enum serialization bug was present in every extraction call for three months; the eval found it on the first real run.

*This is part of **[Backend → AI Engineer in 90 Days](https://rikky.hashnode.dev/)** — documenting a 10-year C#/.NET engineer shipping AI into production, chapter by chapter.*

*Code: [Personal Finance Platform on GitHub](https://github.com/rikky-hermanto/personal-finance)*
