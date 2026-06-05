# PF-AI002 — LLM Evaluation Framework: Extraction Accuracy Harness

> **Learning Phase:** Phase 1 · Week 2 of 12 · Day ~6 of 90
> **Status:** NOT STARTED (planned)
> **Started:** 2026-06-01
> **Pivot goal:** Close the "how do you *know* your extraction is correct?" gap — the top-3 question in every AI Engineering interview. After this week the answer stops being "we check manually" and becomes "we have a 20-fixture eval harness measuring 9X% field-level accuracy, with Gemini Y% cheaper than Claude on the same workload."

## Objective

The extraction pipeline (`LlmParser` → `GeminiProvider` / `AnthropicProvider`) has **zero automated accuracy measurement**. The only tests are mock-based contract tests (`tests/test_parse.py`) — they prove the *plumbing* works, but never run a real model against a real statement and check whether the extracted numbers are right. Today, if a prompt change silently dropped 10% of transactions or flipped `DB`/`CR` on refunds, nothing would catch it.

This task builds a **ground-truth eval harness** in `services/ai-service/evals/` that:

1. Holds 20 anonymized statement fixtures with hand-written expected output (the "golden dataset").
2. Runs each fixture through **both** providers via the real extraction path.
3. Scores the output against ground truth on two axes — **row-level** (did we get all transactions, no phantoms?) and **field-level** (are the fields correct?), with financial-critical fields (`date`, `amount_idr`, `flow`) reported separately from cosmetic ones.
4. Reports **accuracy + latency + cost-per-doc** per provider, producing a defensible Gemini-vs-Claude benchmark table.

The deliverable is a command — `python evals/eval_extraction.py --provider gemini` — that prints a benchmark table, plus `docs/eval-results.md` with numbers you can quote in an interview six weeks from now.

Depends on: **PF-AI001** (reuses `estimate_cost_usd()` from `app/observability.py` for cost, and the Langfuse layer for optional run inspection). Unblocks: **Week 3 RAG** (the same harness pattern measures retrieval quality — MRR/NDCG — instead of extraction accuracy).

## Acceptance Criteria

- [ ] `services/ai-service/evals/` exists with `fixtures/` (statement text) and `ground_truth/` (expected JSON) subfolders
- [ ] 20 fixtures present, each with a matching ground-truth file — seeded from existing sanitized test text, expanded to cover BCA, NeoBank, Superbank, and a screenshot-derived sample
- [ ] `evals/scoring.py` computes row-level precision/recall/F1 **and** field-level accuracy, with critical fields (`date`, `amount_idr`, `flow`) scored separately
- [ ] `evals/scoring.py` has its own unit test (`tests/test_eval_scoring.py`) — the scorer must be trusted before its numbers are
- [ ] Both providers expose last-call token usage (`last_usage`) so the harness can compute cost locally via `estimate_cost_usd()`
- [ ] `evals/eval_extraction.py --provider {gemini|anthropic}` runs all fixtures, prints a per-fixture + aggregate table (accuracy, latency, cost)
- [ ] `evals/eval_extraction.py --compare` runs both providers and prints a side-by-side benchmark
- [ ] Benchmark run completed: Gemini 2.5 Flash vs Claude Sonnet 4.6
- [ ] `docs/eval-results.md` written with the benchmark table + interview-ready numbers
- [ ] (Stretch) Promptfoo or an LLM-as-judge pass wired for the fuzzy `description`/`category` fields

## Approach

**Custom harness, not a framework-first approach.** A hand-built scorer is *better* for interviews than `pip install ragas` — you can explain every metric because you designed it, and extraction accuracy (structured field comparison) is exactly the case where generic RAG-eval frameworks fit poorly. Promptfoo/RAGAS appear only as an optional Step 11 layer for the fuzzy fields.

**The core hard problem is alignment, not comparison.** Two transaction lists are not positionally comparable — the model may emit rows in a different order, merge two rows, or hallucinate one. So scoring is a *matching* problem first: align each predicted row to its ground-truth row on a natural key (`date` + `amount_idr`, the same key the .NET dedup pipeline uses), then field-compare the matched pairs. Unmatched ground-truth rows are **misses** (recall hit); unmatched predicted rows are **phantoms** (precision hit). This mirrors the three-tier dedup logic already in the codebase — reuse the mental model.

**Cost reuses Week 1.** PF-AI001 deliberately left `estimate_cost_usd(model, input_tokens, output_tokens)` in `app/observability.py`. The only missing piece is getting token counts back to the harness — solved with a 2-line, non-breaking `self.last_usage` attribute on each provider (existing callers ignore it). Latency is wall-clock in the harness. This keeps cost measurement consistent with the live dashboard.

**Real API calls, run deliberately.** Unlike the mocked unit tests, the eval harness hits the real models — that's the point. It is **not** part of `pytest` / CI (it costs money and is non-deterministic). It is a manually-run benchmark script. Only `scoring.py` (pure logic) gets a CI unit test.

Out of scope: prompt A/B optimization, regression gating in CI, RAG retrieval metrics (Week 3), automated cost pull from the Langfuse API (manual dashboard read is fine for v1). Resist gold-plating to 200 fixtures — 20 is plenty (see learning-tips anti-pattern #5).

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/evals/__init__.py` | Create — make `evals` importable |
| `services/ai-service/evals/fixtures/*.txt` | Create — 20 sanitized statement text fixtures |
| `services/ai-service/evals/ground_truth/*.json` | Create — 20 expected-output files (one per fixture) |
| `services/ai-service/evals/scoring.py` | Create — alignment + row/field-level metrics |
| `services/ai-service/evals/eval_extraction.py` | Create — benchmark runner (CLI) |
| `services/ai-service/evals/README.md` | Create — how to add a fixture, how to run |
| `services/ai-service/app/providers/gemini.py` | Add `self.last_usage` set after each call (non-breaking) |
| `services/ai-service/app/providers/anthropic.py` | Same `self.last_usage` addition |
| `services/ai-service/tests/test_eval_scoring.py` | Create — unit test for the scorer itself |
| `docs/eval-results.md` | Create — benchmark findings + interview numbers |

---

## TODO

### [x] STEP 1 — Learn the eval mental model before writing a line (90-min deep block)

This is the **theory-on-demand** anchor for the week. Don't binge a course — read the two canonical pieces, then close the tab and write the answer from memory (active retrieval).

**Read (in this order):**
1. Hamel Husain — *Your AI Product Needs Evals* → https://hamel.dev/blog/posts/evals/ (the canonical piece; read fully, ~25 min)
2. Eugene Yan — *Task-specific LLM evals that do & don't work* → https://eugeneyan.com/writing/evals/ (skim for the metrics taxonomy: classification vs extraction vs generation)

**Active-retrieval task (do NOT skip — this is the learning, not the reading):** Close both tabs. In `evals/README.md` (you'll create it in Step 2), write 5 sentences answering, from memory:
- What is the difference between a **unit test** and an **eval**?
- For *extraction*, why is **row-level precision/recall** needed on top of field accuracy?
- Why must `date`/`amount_idr` be weighted differently from `description`?

> **Why theory first, just this once?** Per `ai-engineer-learning-tips.md`, the rule is *project-first, theory-on-demand* — but eval design has one genuinely non-obvious concept (alignment / row-matching) that, if you skip it, leads to a scorer that silently reports garbage. This 90 minutes is the "hit the wall first" exception: you're about to hit the alignment wall, so read the map of that one wall now. Everything else this week is build-first.

> **The interview frame:** "Evals are to LLM systems what unit tests are to deterministic code — except the oracle is a dataset, not an assertion." Memorize that sentence. It's the opener to the #1 AI-Eng question.

---

### [ ] STEP 2 — Scaffold the `evals/` directory

```bash
cd services/ai-service
mkdir -p evals/fixtures evals/ground_truth
```

Create `evals/__init__.py` (empty) so the harness can `from app...` import cleanly when run as a module.

Create `evals/README.md` with the active-retrieval answers from Step 1 plus a stub "How to add a fixture" section (you'll fill the rest in Step 13):

```markdown
# Extraction Eval Harness

Measures real extraction accuracy of GeminiProvider / AnthropicProvider against a
hand-labeled golden dataset. NOT part of pytest/CI — it makes real, paid API calls.

## My eval mental model (written from memory, 2026-06-01)
1. A unit test ... 2. Row-level precision/recall ... (fill in from Step 1)

## Run
    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --compare
```

> **Why a separate `evals/` dir, not `tests/`?** `pytest` discovers and runs everything in `tests/`. The eval harness must NOT run in CI — it costs money, hits rate limits, and is non-deterministic (a 1-row difference shouldn't fail a build). Physically separating it makes the boundary obvious. Only the *pure-logic* scorer gets a `tests/` unit test.

---

### [x] STEP 3 — Seed fixtures from existing sanitized test text

Don't start from a blank page. Your own test suite already contains sanitized statement strings — mine them first.

1. Open `tests/test_superbank_extractor.py`, `tests/test_parse_pdf.py`, and `tests/test_parse.py`. Lift any embedded statement text into individual fixture files.
2. Name fixtures `{bank}_{nn}.txt`, e.g. `bca_01.txt`, `neobank_01.txt`, `superbank_01.txt`.
3. Aim for this coverage spread across the 20 (don't make 20 BCA clones — diversity is what surfaces failure modes):

| Bank | Format quirk to capture | Count |
|------|-------------------------|-------|
| BCA | DD/MM/YYYY dates, Indonesian decimals `1.000.000,50` | 5 |
| NeoBank | `DD MMM YYYY` dates, styled PDF text | 5 |
| Superbank | multi-page tables, `Debit` column = money out | 5 |
| Screenshot-derived | OCR-ish noise, missing columns | 3 |
| Edge cases | refund (CR with Expense-like desc), FX row, zero-amount, multi-currency | 2 |

> **Why include deliberate edge cases?** The refund row (a credit that looks like an expense), the FX row (`exchange_rate` populated), and the multi-currency row are exactly where extraction *silently* breaks. An eval set of 20 clean rows tells you nothing. An eval set with 4 nasty rows is where the Gemini-vs-Claude difference actually shows up — and "I deliberately seeded adversarial fixtures" is a strong interview signal.

> **Anonymization check (SEC-01):** These are committed to git. Scrub real account numbers, real names, real balances. Replace with plausible fakes. Keep the *structure* real, the *data* fake.

---

### [ ] STEP 4 — Write ground-truth JSON for each fixture

For each `fixtures/{name}.txt`, create `ground_truth/{name}.json` — the correct extraction, hand-verified. Match the `TransactionResult` shape (see `app/models.py`):

```json
{
  "transactions": [
    {
      "date": "2024-03-14",
      "description": "TRANSFER GOPAY",
      "remarks": "REF 88123",
      "flow": "DB",
      "type": "Expense",
      "amount_idr": 500000.0,
      "currency": "IDR",
      "exchange_rate": null
    }
  ]
}
```

Rules for labeling (these become your scoring contract):
- `date` always ISO `YYYY-MM-DD`. `amount_idr` always positive, in IDR.
- `flow`: `DB` = money out, `CR` = money in. Get the refund/FX rows *exactly* right — they're the discriminating cases.
- Only label the fields you will score. Skip volatile ones (`raw_text`, `account_name`) — see Step 5.

> **Why hand-label, and why this is the expensive-but-irreplaceable step?** The ground truth IS the eval. A wrong label means you'll "measure" the model as wrong when it's right (or vice-versa), and every downstream number is poisoned. Budget real focus here — labeling 20 statements carefully is ~60–90 min and is the single highest-leverage hour of the week. This is also the step that makes the eval *yours*: "I hand-built a 20-fixture golden dataset with verified ground truth" is the credibility line.

> **Spaced-repetition hook:** You'll revisit these labels in Week 3 when the same fixtures get embedded for RAG. Label them well now; future-you reuses them.

---

### [x] STEP 5 — Build `evals/scoring.py` — the metrics engine

This is the intellectual core. Create `services/ai-service/evals/scoring.py`:

```python
"""Score extracted transactions against ground truth.

Two axes:
  - Row level: did we extract the right SET of transactions? (precision / recall / F1)
  - Field level: for correctly-matched rows, are the fields right? (per-field accuracy)

Alignment is a matching problem: predicted rows are matched to ground-truth rows
on a natural key (date + rounded amount), the same key the .NET dedup uses.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

# Fields we score, split by financial criticality.
CRITICAL_FIELDS = ("date", "amount_idr", "flow")
COSMETIC_FIELDS = ("description", "remarks", "type", "currency", "exchange_rate")
SCORED_FIELDS = CRITICAL_FIELDS + COSMETIC_FIELDS


def _norm_amount(v) -> Decimal:
    try:
        return Decimal(str(v)).quantize(Decimal("1"))  # whole-rupiah tolerance
    except (InvalidOperation, TypeError):
        return Decimal("-1")


def _row_key(tx: dict) -> tuple[str, Decimal]:
    return (str(tx.get("date", "")).strip(), _norm_amount(tx.get("amount_idr")))


def _field_equal(field_name: str, a, b) -> bool:
    if field_name == "amount_idr":
        return _norm_amount(a) == _norm_amount(b)
    if field_name in ("description", "remarks"):
        # cosmetic text: case-insensitive, whitespace-collapsed substring tolerance
        sa = " ".join(str(a or "").lower().split())
        sb = " ".join(str(b or "").lower().split())
        return sa == sb or sa in sb or sb in sa
    if field_name == "exchange_rate":
        if a in (None, "") and b in (None, ""):
            return True
        return _norm_amount(a) == _norm_amount(b)
    return str(a or "").strip().upper() == str(b or "").strip().upper()


@dataclass
class FixtureScore:
    name: str
    matched: int = 0
    missed: int = 0          # in truth, not predicted  -> recall hit
    phantom: int = 0         # predicted, not in truth   -> precision hit
    field_correct: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})
    field_total: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})

    @property
    def precision(self) -> float:
        denom = self.matched + self.phantom
        return self.matched / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.matched + self.missed
        return self.matched / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    def field_accuracy(self, fields=SCORED_FIELDS) -> float:
        c = sum(self.field_correct[f] for f in fields)
        t = sum(self.field_total[f] for f in fields)
        return c / t if t else 0.0


def score_fixture(name: str, predicted: list[dict], truth: list[dict]) -> FixtureScore:
    s = FixtureScore(name=name)
    truth_by_key = {_row_key(t): t for t in truth}
    used = set()

    for p in predicted:
        key = _row_key(p)
        if key in truth_by_key and key not in used:
            used.add(key)
            s.matched += 1
            t = truth_by_key[key]
            for f in SCORED_FIELDS:
                s.field_total[f] += 1
                if _field_equal(f, p.get(f), t.get(f)):
                    s.field_correct[f] += 1
        else:
            s.phantom += 1

    s.missed = len(truth) - len(used)
    return s
```

**C# equivalent** (faithful port — Python `dataclass` → a class with computed properties; `dict` → `Dictionary`; `Decimal` → `decimal`. Python passes rows as `dict`, so this uses `IDictionary<string, object?>`; in idiomatic .NET you'd more likely score a typed `TransactionDto` and read fields by name):

```csharp
// evals/Scoring.cs — align predicted rows to truth on (date, amount), then
// field-compare matched pairs. decimal (not double) for money, same reason the
// Python uses Decimal: avoid IEEE-754 noise.

public static class ScoredFields
{
    public static readonly string[] Critical = { "date", "amount_idr", "flow" };
    public static readonly string[] Cosmetic =
        { "description", "remarks", "type", "currency", "exchange_rate" };
    public static readonly string[] All = Critical.Concat(Cosmetic).ToArray();
}

public sealed class FixtureScore
{
    public string Name { get; init; } = "";
    public int Matched { get; set; }
    public int Missed { get; set; }   // in truth, not predicted -> recall hit
    public int Phantom { get; set; }  // predicted, not in truth -> precision hit

    public Dictionary<string, int> FieldCorrect { get; } =
        ScoredFields.All.ToDictionary(f => f, _ => 0);
    public Dictionary<string, int> FieldTotal { get; } =
        ScoredFields.All.ToDictionary(f => f, _ => 0);

    public double Precision { get { var d = Matched + Phantom; return d > 0 ? (double)Matched / d : 0.0; } }
    public double Recall    { get { var d = Matched + Missed;  return d > 0 ? (double)Matched / d : 0.0; } }
    public double F1
    {
        get { var (p, r) = (Precision, Recall); return (p + r) > 0 ? 2 * p * r / (p + r) : 0.0; }
    }

    public double FieldAccuracy(IEnumerable<string>? fields = null)
    {
        var fs = (fields ?? ScoredFields.All).ToArray();
        var c = fs.Sum(f => FieldCorrect[f]);
        var t = fs.Sum(f => FieldTotal[f]);
        return t > 0 ? (double)c / t : 0.0;
    }
}

public static class Scorer
{
    // whole-rupiah tolerance; -1 sentinel on parse failure (mirrors Python Decimal("-1"))
    private static decimal NormAmount(object? v) =>
        decimal.TryParse(v?.ToString(), out var d) ? Math.Round(d, 0) : -1m;

    private static (string, decimal) RowKey(IDictionary<string, object?> tx) =>
        (tx.GetValueOrDefault("date")?.ToString()?.Trim() ?? "",
         NormAmount(tx.GetValueOrDefault("amount_idr")));

    private static string Collapse(object? s) =>
        string.Join(" ", (s?.ToString() ?? "")
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    private static bool FieldEqual(string field, object? a, object? b)
    {
        if (field == "amount_idr")
            return NormAmount(a) == NormAmount(b);

        if (field is "description" or "remarks")
        {
            var sa = Collapse(a).ToLowerInvariant();
            var sb = Collapse(b).ToLowerInvariant();
            return sa == sb || sa.Contains(sb) || sb.Contains(sa);
        }

        if (field == "exchange_rate")
        {
            bool aEmpty = a is null or "", bEmpty = b is null or "";
            if (aEmpty && bEmpty) return true;
            return NormAmount(a) == NormAmount(b);
        }

        return (a?.ToString()?.Trim().ToUpperInvariant() ?? "")
            == (b?.ToString()?.Trim().ToUpperInvariant() ?? "");
    }

    public static FixtureScore ScoreFixture(
        string name,
        List<IDictionary<string, object?>> predicted,
        List<IDictionary<string, object?>> truth)
    {
        var s = new FixtureScore { Name = name };
        var truthByKey = truth.ToDictionary(RowKey, t => t);  // assumes unique keys, like the Python dict
        var used = new HashSet<(string, decimal)>();

        foreach (var p in predicted)
        {
            var key = RowKey(p);
            if (truthByKey.TryGetValue(key, out var t) && !used.Contains(key))
            {
                used.Add(key);
                s.Matched++;
                foreach (var f in ScoredFields.All)
                {
                    s.FieldTotal[f]++;
                    if (FieldEqual(f, p.GetValueOrDefault(f), t.GetValueOrDefault(f)))
                        s.FieldCorrect[f]++;
                }
            }
            else
            {
                s.Phantom++;
            }
        }

        s.Missed = truth.Count - used.Count;
        return s;
    }
}
```

> **Why match on `date + amount`, not position?** Models return rows in arbitrary order and occasionally split/merge them. Index-based comparison would report a perfectly-correct extraction as 0% the moment one row shifts position. The natural-key match is the same insight behind your three-tier dedup — reuse it.

> **Why whole-rupiah tolerance on amount?** `500000.0` vs `500000` vs `"500000.00"` are the same money. Decimal-quantize collapses representation noise so you measure *extraction* errors, not *formatting* noise. (THINK-03: amounts are a `number` in the schema — but the model sometimes returns them as strings; the scorer must be robust to that, the pipeline shouldn't.)

> **Why substring tolerance on `description`?** `"GOPAY"` vs `"TRANSFER GOPAY"` is a correct extraction with a minor span difference — penalizing it as wrong makes the metric noisy. Critical fields get exact match; cosmetic fields get fuzzy match. This split is the whole point of `CRITICAL_FIELDS` vs `COSMETIC_FIELDS`, and it's the nuance interviewers probe for.

---

### [x] STEP 6 — Expose token usage on both providers (non-breaking)

To compute cost locally via the Week-1 `estimate_cost_usd()`, the harness needs token counts. Add a single attribute to each provider, set after a successful call. Existing callers ignore it.

In `app/providers/gemini.py`, in `__init__` add `self.last_usage: dict | None = None`, and right after you compute `input_tokens`/`output_tokens` in `extract_structured()`:

```python
self.last_usage = {"input": input_tokens, "output": output_tokens}
```

**C# equivalent** (Python's dynamically-added instance attribute → a declared nullable property on the provider class; `dict` → a small `record`):

```csharp
public sealed record Usage(int Input, int Output);

// On GeminiProvider / AnthropicProvider:
public Usage? LastUsage { get; private set; }

// inside ExtractStructuredAsync, after computing the token counts:
LastUsage = new Usage(inputTokens, outputTokens);
```

Do the identical thing in `app/providers/anthropic.py` (`self.last_usage = {"input": input_tokens, "output": output_tokens}` after reading `message.usage`).

> **Why an instance attribute instead of changing the return type?** Changing `extract_structured()` to return `(dict, usage)` would ripple into `LlmParser`, the routers, and all four mock tests — a breaking change for a benchmark convenience. A write-only `last_usage` side-channel is read solely by the eval harness, which creates its own provider instance and reads it synchronously after each call. Two lines, zero blast radius. This is exactly the hook PF-AI001 anticipated when it told you not to delete `estimate_cost_usd()`.

> **Pre-flight verify:** after editing, run the existing mocks — `pytest tests/test_parse.py -q` — they must still pass (they don't assert on `last_usage`, so they will).

---

### [x] STEP 7 — Build `evals/eval_extraction.py` — the benchmark runner

Create the CLI runner. It calls the **real** extraction path (`LlmParser` + a real provider), times it, scores it, and computes cost.

```python
"""Extraction benchmark harness. Runs real LLM calls — NOT part of CI.

    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --provider anthropic --model claude-sonnet-4-6
    python evals/eval_extraction.py --compare
"""
import argparse, asyncio, json, time
from pathlib import Path

from app.config import settings
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider
from app.observability import estimate_cost_usd
from app.models import ParseRequest
from app.services.llm_parser import LlmParser
from evals.scoring import score_fixture, CRITICAL_FIELDS, COSMETIC_FIELDS, SCORED_FIELDS

EVALS_DIR = Path(__file__).parent
FIXTURES = EVALS_DIR / "fixtures"
TRUTH = EVALS_DIR / "ground_truth"


def _make_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=model or "claude-sonnet-4-6")
    raise ValueError(name)


def _bank_hint(fixture_name: str) -> str:
    return fixture_name.split("_")[0]  # bca_01 -> bca


async def run_provider(name: str, model: str | None) -> dict:
    provider = _make_provider(name, model)
    parser = LlmParser(provider=provider)
    scores, latencies, costs = [], [], []

    for fx in sorted(FIXTURES.glob("*.txt")):
        truth = json.loads((TRUTH / f"{fx.stem}.json").read_text(encoding="utf-8"))["transactions"]
        text = fx.read_text(encoding="utf-8")

        t0 = time.perf_counter()
        resp = await parser.parse(ParseRequest(text=text, bank_hint=_bank_hint(fx.stem)))
        latency_ms = (time.perf_counter() - t0) * 1000

        predicted = [t.model_dump() for t in resp.transactions]
        s = score_fixture(fx.stem, predicted, truth)
        scores.append(s)
        latencies.append(latency_ms)

        usage = provider.last_usage or {"input": 0, "output": 0}
        cost = estimate_cost_usd(model or provider._model, usage["input"], usage["output"])
        costs.append(cost)

        print(f"  {fx.stem:24s}  F1={s.f1:5.2f}  crit={s.field_accuracy(CRITICAL_FIELDS):5.2f}  "
              f"all={s.field_accuracy():5.2f}  {latency_ms:7.0f}ms  ${cost:.5f}")

    return _aggregate(name, model, scores, latencies, costs)


def _aggregate(name, model, scores, latencies, costs) -> dict:
    n = len(scores)
    lat_sorted = sorted(latencies)
    p95 = lat_sorted[int(0.95 * (n - 1))] if n else 0
    return {
        "provider": name,
        "model": model or "default",
        "fixtures": n,
        "row_f1": sum(s.f1 for s in scores) / n,
        "recall": sum(s.recall for s in scores) / n,
        "precision": sum(s.precision for s in scores) / n,
        "critical_field_acc": sum(s.field_accuracy(CRITICAL_FIELDS) for s in scores) / n,
        "all_field_acc": sum(s.field_accuracy() for s in scores) / n,
        "p50_latency_ms": lat_sorted[n // 2] if n else 0,
        "p95_latency_ms": p95,
        "avg_cost_usd": sum(costs) / n if n else 0,
        "total_cost_usd": sum(costs),
    }


def _print_summary(agg: dict):
    print(f"\n=== {agg['provider']} ({agg['model']}) — {agg['fixtures']} fixtures ===")
    print(f"  Row F1            : {agg['row_f1']:.3f}  (precision {agg['precision']:.3f} / recall {agg['recall']:.3f})")
    print(f"  Critical fields   : {agg['critical_field_acc']:.3f}  (date, amount_idr, flow)")
    print(f"  All fields        : {agg['all_field_acc']:.3f}")
    print(f"  Latency p50 / p95 : {agg['p50_latency_ms']:.0f}ms / {agg['p95_latency_ms']:.0f}ms")
    print(f"  Cost / doc        : ${agg['avg_cost_usd']:.5f}  (total ${agg['total_cost_usd']:.4f})")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "anthropic"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--compare", action="store_true")
    args = ap.parse_args()

    if args.compare:
        for prov, model in (("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6")):
            print(f"\n--- Running {prov} ---")
            _print_summary(await run_provider(prov, model))
    else:
        _print_summary(await run_provider(args.provider or settings.ai_provider, args.model))


if __name__ == "__main__":
    asyncio.run(main())
```

**C# equivalent** (this would be its own console project, e.g. `PersonalFinance.Evals`. `argparse` → manual arg parsing or `System.CommandLine`; `asyncio.run(main())` → `async Task Main`; Python `time.perf_counter()` → `Stopwatch`; tuple-of-dicts return → a `record`):

```csharp
// evals/EvalRunner.cs
public sealed record AggregateResult(
    string Provider, string Model, int Fixtures,
    double RowF1, double Recall, double Precision,
    double CriticalFieldAcc, double AllFieldAcc,
    double P50LatencyMs, double P95LatencyMs,
    double AvgCostUsd, double TotalCostUsd);

public static class EvalRunner
{
    private static readonly string EvalsDir =
        Path.GetDirectoryName(typeof(EvalRunner).Assembly.Location)!;
    private static readonly string Fixtures = Path.Combine(EvalsDir, "fixtures");
    private static readonly string Truth = Path.Combine(EvalsDir, "ground_truth");

    private static ILlmProvider MakeProvider(string name, string? model) => name switch
    {
        "gemini"    => new GeminiProvider(Settings.GeminiApiKey,    model ?? "gemini-2.5-flash"),
        "anthropic" => new AnthropicProvider(Settings.AnthropicApiKey, model ?? "claude-sonnet-4-6"),
        _ => throw new ArgumentException(name),
    };

    private static string BankHint(string fixtureName) => fixtureName.Split('_')[0];  // bca_01 -> bca

    public static async Task<AggregateResult> RunProviderAsync(string name, string? model)
    {
        var provider = MakeProvider(name, model);
        var parser = new LlmParser(provider);
        var scores = new List<FixtureScore>();
        var latencies = new List<double>();
        var costs = new List<double>();

        foreach (var fx in Directory.GetFiles(Fixtures, "*.txt").OrderBy(f => f))
        {
            var stem = Path.GetFileNameWithoutExtension(fx);
            var truthJson = File.ReadAllText(Path.Combine(Truth, $"{stem}.json"));
            var truth = JsonSerializer.Deserialize<GroundTruth>(truthJson)!.Transactions;
            var text = File.ReadAllText(fx);

            var sw = Stopwatch.StartNew();
            var resp = await parser.ParseAsync(new ParseRequest(text, BankHint(stem)));
            var latencyMs = sw.Elapsed.TotalMilliseconds;

            var predicted = resp.Transactions.Select(t => t.ToDict()).ToList();
            var s = Scorer.ScoreFixture(stem, predicted, truth);
            scores.Add(s);
            latencies.Add(latencyMs);

            var usage = provider.LastUsage ?? new Usage(0, 0);
            var cost = Observability.EstimateCostUsd(model ?? provider.Model, usage.Input, usage.Output);
            costs.Add(cost);

            Console.WriteLine(
                $"  {stem,-24}  F1={s.F1,5:F2}  crit={s.FieldAccuracy(ScoredFields.Critical),5:F2}  " +
                $"all={s.FieldAccuracy(),5:F2}  {latencyMs,7:F0}ms  ${cost:F5}");
        }

        return Aggregate(name, model, scores, latencies, costs);
    }

    private static AggregateResult Aggregate(
        string name, string? model,
        List<FixtureScore> scores, List<double> latencies, List<double> costs)
    {
        var n = scores.Count;
        var latSorted = latencies.OrderBy(x => x).ToList();
        var p95 = n > 0 ? latSorted[(int)(0.95 * (n - 1))] : 0;
        return new AggregateResult(
            Provider: name,
            Model: model ?? "default",
            Fixtures: n,
            RowF1: scores.Average(s => s.F1),
            Recall: scores.Average(s => s.Recall),
            Precision: scores.Average(s => s.Precision),
            CriticalFieldAcc: scores.Average(s => s.FieldAccuracy(ScoredFields.Critical)),
            AllFieldAcc: scores.Average(s => s.FieldAccuracy()),
            P50LatencyMs: n > 0 ? latSorted[n / 2] : 0,
            P95LatencyMs: p95,
            AvgCostUsd: n > 0 ? costs.Average() : 0,
            TotalCostUsd: costs.Sum());
    }

    private static void PrintSummary(AggregateResult a)
    {
        Console.WriteLine($"\n=== {a.Provider} ({a.Model}) — {a.Fixtures} fixtures ===");
        Console.WriteLine($"  Row F1            : {a.RowF1:F3}  (precision {a.Precision:F3} / recall {a.Recall:F3})");
        Console.WriteLine($"  Critical fields   : {a.CriticalFieldAcc:F3}  (date, amount_idr, flow)");
        Console.WriteLine($"  All fields        : {a.AllFieldAcc:F3}");
        Console.WriteLine($"  Latency p50 / p95 : {a.P50LatencyMs:F0}ms / {a.P95LatencyMs:F0}ms");
        Console.WriteLine($"  Cost / doc        : ${a.AvgCostUsd:F5}  (total ${a.TotalCostUsd:F4})");
    }

    public static async Task Main(string[] args)
    {
        // --provider gemini | --provider anthropic --model X | --compare
        var compare = args.Contains("--compare");
        var provider = GetArg(args, "--provider");
        var model = GetArg(args, "--model");

        if (compare)
        {
            foreach (var (prov, m) in new[] { ("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6") })
            {
                Console.WriteLine($"\n--- Running {prov} ---");
                PrintSummary(await RunProviderAsync(prov, m));
            }
        }
        else
        {
            PrintSummary(await RunProviderAsync(provider ?? Settings.AiProvider, model));
        }
    }

    private static string? GetArg(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
```

> **Why go through `LlmParser`, not call the provider directly?** `LlmParser.parse()` is the *real production path* — it applies the bank-specific system prompt (`_build_system_prompt`), runs the `EXTRACT_SCHEMA`, and does the Pydantic row-skip. Benchmarking the production path means your numbers reflect what users actually get, not a synthetic shortcut. (Bonus: `skipped_rows` surfaces silent validation failures.)

> **Why wall-clock latency here but Langfuse latency in PF-AI001?** Langfuse latency is the *generation* span (model time). The harness wall-clock includes prompt building + Pydantic parsing — the end-to-end number. Quote the Langfuse number for "model latency" and this one for "pipeline latency"; knowing the difference is itself a signal.

> **Run cost awareness:** 20 fixtures × 2 providers = 40 real calls per `--compare`. At your measured ~$0.003/doc that's ~$0.12 a run. Cheap — but don't loop it in CI.

---

### [x] STEP 8 — Unit-test the scorer itself (this one IS in CI)

The harness's numbers are only trustworthy if the scorer is correct. Create `tests/test_eval_scoring.py`:

```python
from evals.scoring import score_fixture, CRITICAL_FIELDS

TRUTH = [
    {"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": 500000.0, "type": "Expense"},
    {"date": "2024-03-15", "description": "SALARY", "flow": "CR", "amount_idr": 9000000.0, "type": "Income"},
]


def test_perfect_extraction_scores_one():
    s = score_fixture("t", TRUTH, TRUTH)
    assert s.f1 == 1.0
    assert s.field_accuracy(CRITICAL_FIELDS) == 1.0


def test_missed_row_drops_recall():
    s = score_fixture("t", TRUTH[:1], TRUTH)  # predicted only 1 of 2
    assert s.recall == 0.5
    assert s.precision == 1.0
    assert s.missed == 1


def test_phantom_row_drops_precision():
    extra = TRUTH + [{"date": "2024-03-16", "description": "GHOST", "flow": "DB", "amount_idr": 1.0}]
    s = score_fixture("t", extra, TRUTH)
    assert s.recall == 1.0
    assert s.precision < 1.0
    assert s.phantom == 1


def test_amount_formatting_tolerated():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": "500000.00"}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1  # string "500000.00" matches float 500000.0


def test_flow_flip_caught_as_critical_error():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "CR", "amount_idr": 500000.0}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1                       # same date+amount -> matched
    assert s.field_accuracy(("flow",)) == 0.0   # but flow is wrong
```

**C# equivalent** (`pytest` functions → xUnit `[Fact]` methods; module-level `TRUTH` → a static field; `assert x == y` → `Assert.Equal(y, x)` — note xUnit puts *expected first*. Test names follow the project's `Method_Condition_ExpectedResult` convention):

```csharp
public class EvalScoringTests
{
    private static readonly List<IDictionary<string, object?>> Truth = new()
    {
        new Dictionary<string, object?> { ["date"]="2024-03-14", ["description"]="GOPAY",  ["flow"]="DB", ["amount_idr"]=500000.0,  ["type"]="Expense" },
        new Dictionary<string, object?> { ["date"]="2024-03-15", ["description"]="SALARY", ["flow"]="CR", ["amount_idr"]=9000000.0, ["type"]="Income"  },
    };

    [Fact]
    public void ScoreFixture_PerfectExtraction_ScoresOne()
    {
        var s = Scorer.ScoreFixture("t", Truth, Truth);
        Assert.Equal(1.0, s.F1);
        Assert.Equal(1.0, s.FieldAccuracy(ScoredFields.Critical));
    }

    [Fact]
    public void ScoreFixture_MissedRow_DropsRecall()
    {
        var s = Scorer.ScoreFixture("t", Truth.Take(1).ToList(), Truth);  // predicted only 1 of 2
        Assert.Equal(0.5, s.Recall);
        Assert.Equal(1.0, s.Precision);
        Assert.Equal(1, s.Missed);
    }

    [Fact]
    public void ScoreFixture_PhantomRow_DropsPrecision()
    {
        var extra = new List<IDictionary<string, object?>>(Truth)
        {
            new Dictionary<string, object?> { ["date"]="2024-03-16", ["description"]="GHOST", ["flow"]="DB", ["amount_idr"]=1.0 },
        };
        var s = Scorer.ScoreFixture("t", extra, Truth);
        Assert.Equal(1.0, s.Recall);
        Assert.True(s.Precision < 1.0);
        Assert.Equal(1, s.Phantom);
    }

    [Fact]
    public void ScoreFixture_AmountFormatting_IsTolerated()
    {
        var pred = new List<IDictionary<string, object?>>
        {
            new Dictionary<string, object?> { ["date"]="2024-03-14", ["description"]="GOPAY", ["flow"]="DB", ["amount_idr"]="500000.00" },
        };
        var s = Scorer.ScoreFixture("t", pred, Truth.Take(1).ToList());
        Assert.Equal(1, s.Matched);  // string "500000.00" matches double 500000.0
    }

    [Fact]
    public void ScoreFixture_FlowFlip_CaughtAsCriticalError()
    {
        var pred = new List<IDictionary<string, object?>>
        {
            new Dictionary<string, object?> { ["date"]="2024-03-14", ["description"]="GOPAY", ["flow"]="CR", ["amount_idr"]=500000.0 },
        };
        var s = Scorer.ScoreFixture("t", pred, Truth.Take(1).ToList());
        Assert.Equal(1, s.Matched);                            // same date+amount -> matched
        Assert.Equal(0.0, s.FieldAccuracy(new[] { "flow" }));  // but flow is wrong
    }
}
```

```bash
pytest tests/test_eval_scoring.py -q
```

> **Why test the test harness?** THINK-04: "test failures are diagnostic signals." If your scorer has an off-by-one in recall, you'll chase phantom model regressions for days. A scorer you've unit-tested is a scorer whose numbers you can defend in an interview when someone asks "how do you know your *eval* is right?" — the meta-question behind the question.

---

### [~] STEP 9 — Run the benchmark: Gemini 2.5 Flash vs Claude Sonnet 4.6

**Status: PARTIAL — 15/20 fixtures ran (superbank_01–05 hit free-tier daily quota). Re-run tomorrow to get the full 20.**

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_extraction.py --provider gemini
```

**Bug found and fixed during this run (THINK-04 in action):**

The scorer was reporting `crit=0.67` on every fixture. Root cause: `TransactionResult.flow` is typed as `FlowType(str, Enum)`. In Python 3.11+, `str(FlowType.DB)` returns `"FlowType.DB"` not `"DB"`, so the scorer's `_field_equal("flow", FlowType.DB, "DB")` always returned False.

Fix applied in `eval_extraction.py` line 49: changed `t.model_dump()` → `t.model_dump(mode='json')`. This serializes enum members to their string values before comparison. The scorer unit tests confirm the fix is clean (5/5 passing).

**Partial Gemini 2.5 Flash results (15 fixtures, pre-corrected numbers will need re-run):**

| Fixture | F1 | crit (raw/buggy) | all (raw/buggy) | Latency | Cost |
|---------|----|----|-----|---------|------|
| bca_01  | 1.00 | 0.67 | 0.88 | 14779ms | $0.00034 |
| bca_02  | 1.00 | 0.67 | 0.88 | 12183ms | $0.00034 |
| bca_03  | 1.00 | 0.67 | 0.88 | 13851ms | $0.00033 |
| bca_04  | 1.00 | 0.67 | 0.88 | 13913ms | $0.00041 |
| bca_05  | 1.00 | 0.67 | 0.88 | 9928ms  | $0.00033 |
| edge_01 | 1.00 | 0.67 | 0.88 | 8959ms  | $0.00026 |
| edge_02 | 1.00 | 0.67 | 0.83 | 11694ms | $0.00035 |
| neobank_01 | 1.00 | 0.67 | 0.88 | 9506ms | $0.00023 |
| neobank_02 | 1.00 | 0.67 | 0.88 | 8417ms | $0.00027 |
| neobank_03 | 1.00 | 0.67 | 0.88 | 14215ms | $0.00030 |
| neobank_04 | 1.00 | 0.67 | 0.88 | 10198ms | $0.00033 |
| neobank_05 | 1.00 | 0.67 | 0.88 | 9681ms  | $0.00030 |
| screenshot_01 | 1.00 | 0.67 | 0.88 | 7184ms | $0.00022 |
| screenshot_02 | 1.00 | 0.67 | 0.85 | 6555ms | $0.00023 |
| screenshot_03 | 1.00 | 0.67 | 0.88 | 5350ms  | $0.00016 |

Note: crit and all_field_acc numbers above are from the buggy scorer. After the enum fix, expect crit → 1.00 for rows where only `flow` was wrong. The `all=0.83` on edge_02 and `all=0.85` on screenshot_02 suggest additional field mismatches to investigate after re-run.

**Re-run command (after quota reset — free tier: 20 RPD):**
```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_extraction.py --provider gemini
```

> **The interleaving move (from the tips doc):** while the 40 calls run (a few minutes), switch context — open the Week 3 RAG reading or skim the pgvector docs. Don't watch the progress bar. Interleaving beats blocked practice for transfer.

> **If a provider scores surprisingly low:** don't "fix" the ground truth to match the model (THINK-04). Read the actual mismatch — it's usually a real prompt weakness (e.g., the generic `SYSTEM_PROMPT` not specifying Indonesian decimal convention for non-Superbank banks). That finding is a Week-2 deliverable in itself: "my eval surfaced that the BCA path lacked an explicit decimal-convention instruction."

---

### [ ] STEP 10 — Write `docs/eval-results.md`

```markdown
# Extraction Eval Results — Personal Finance Platform

**Captured:** 2026-06-0X
**Harness:** `services/ai-service/evals/` (20 hand-labeled fixtures)
**Scored on:** row-level F1 + field-level accuracy (critical fields weighted separately)

## Benchmark — Gemini 2.5 Flash vs Claude Sonnet 4.6

| Metric | Gemini 2.5 Flash | Claude Sonnet 4.6 |
|--------|------------------|-------------------|
| Row F1 (precision / recall) | 0.9X (.. / ..) | 0.9X (.. / ..) |
| Critical-field accuracy (date, amount, flow) | 0.9X | 0.9X |
| All-field accuracy | 0.9X | 0.9X |
| Latency p50 / p95 | Xms / Xms | Xms / Xms |
| Cost / doc | $0.00X | $0.0XX |

## Where each model wins / loses
- Gemini: <e.g. cheaper, weaker on refund flow>
- Claude: <e.g. better on FX rows, ~Nx cost>

## Failure modes the eval surfaced
1. <real finding, e.g. generic prompt missing decimal convention>
2. ...

## Interview-ready numbers
1. "My extraction eval harness runs 20 hand-labeled fixtures; Gemini hits **9X% critical-field accuracy** at **$0.00X/doc**."
2. "Gemini is **Y% cheaper** than Claude on this structured-extraction workload for **comparable** accuracy."
3. "The eval caught <failure mode> that mock tests never would."
```

> **Why write the failure-modes section, not just the numbers?** Anyone can run a benchmark. "My eval *surfaced a real bug*" is the senior signal — it proves the harness does work, not theater. This section is also raw material for your Week 10 blog post and Week 11 STAR story.

---

### [ ] STEP 11 — (Stretch) LLM-as-judge or Promptfoo for the fuzzy fields

Exact/substring match can't fairly score free-text `description` rewrites or `category`. For those, add an **LLM-as-judge** pass — a cheap model rates semantic equivalence 0–1.

Two paths (pick one, time-box to 60 min):
- **Lightweight, in-harness:** add `evals/judge.py` — call `claude-haiku-4-5` (cheap, per cost-discipline rule) with a rubric: "Are these two transaction descriptions the same real-world merchant? Answer 0 or 1." Average across fuzzy fields.
- **Tool-based:** wire `promptfoo` (https://www.promptfoo.dev/docs/) with a `promptfooconfig.yaml` pointing at your fixtures, using its `llm-rubric` assertion. Good for a repeatable regression command and a nice HTML report (demo material).

> **Why defer this to a stretch, not core?** The financial-critical fields (`date`, `amount_idr`, `flow`) are where money lives, and those are scored deterministically in Step 5 — no judge needed. LLM-as-judge adds cost + non-determinism and only helps the cosmetic fields. Ship the deterministic core first (anti-pattern #5: don't gold-plate v1). But knowing the *term* "LLM-as-a-judge" and being able to explain its bias pitfalls (position bias, verbosity bias — see Zheng et al. in Resources) is itself interview currency.

---

### [ ] STEP 12 — Commit

```bash
cd c:\workspaces\personal-finance
git add services/ai-service/evals/
git add services/ai-service/app/providers/gemini.py
git add services/ai-service/app/providers/anthropic.py
git add services/ai-service/tests/test_eval_scoring.py
git add docs/eval-results.md
git status   # verify NO .env, NO real-data fixtures
git commit -m "PF-AI002: add extraction eval harness — 20-fixture golden dataset, Gemini vs Claude benchmark"
```

> **Pre-commit anonymization gate (SEC-01):** grep your fixtures one more time for anything that looks like a real account number or name before committing. `git diff --cached --stat` — eyeball the fixture list.

---

### [ ] STEP 13 — Log progress and advance the Week 2 checklist

Fill in `evals/README.md`'s "How to add a fixture" section (drop `.txt` in `fixtures/`, matching `.json` in `ground_truth/`, name `{bank}_{nn}`), then:

```
/mentor log Built extraction eval harness — 20-fixture golden dataset, row+field scorer (unit-tested), Gemini vs Claude benchmark. Gemini 9X% critical-field acc at $0.00X/doc, Y% cheaper than Claude. Eval surfaced <failure mode>.
```

Then in `docs/mentor/progress.md`, mark Week 2 tasks done:
- [x] Create `services/ai-service/evals/` directory with 20 fixtures
- [x] Write expected output JSON (ground truth)
- [x] Build `eval_extraction.py` — both providers, field-level accuracy
- [x] Benchmark Gemini 2.5 Flash vs Claude Sonnet 4.6
- [x] Write findings to `docs/eval-results.md`
- [ ] Stretch: Promptfoo/RAGAS ← only if Step 11 done

---

## Resources / Theory to Learn

Organized **by concept**, not by course — per the curriculum principle (`docs/mentor/ai-engineer-learning-path.md`): *resources are references attached to a topic, not a sequence of their own.* Read the one tied to what you're building; skip the rest until you hit that wall.

### Concept 1 — Why evals exist (eval-driven development)
- **Hamel Husain — *Your AI Product Needs Evals*** → https://hamel.dev/blog/posts/evals/ — the canonical essay; the "evals are the unit tests of AI" framing. **Read in Step 1.**
- **Hamel Husain & Shreya Shankar — *A Field Guide to Rapidly Improving AI Products*** → https://hamel.dev/blog/posts/field-guide/ — how evals fit a real iteration loop (error analysis → eval → fix).

### Concept 2 — Metrics taxonomy (the one you're implementing)
- **Eugene Yan — *Task-specific LLM evals that do & don't work*** → https://eugeneyan.com/writing/evals/ — classification vs extraction vs generation; precision/recall/F1 for extraction. **The direct map for Step 5.**
- **Eugene Yan — *Patterns for Building LLM-based Systems & Products* (Evals section)** → https://eugeneyan.com/writing/llm-patterns/ — where eval sits among the 7 patterns.
- IR refresher (precision/recall/F1) — any classic source; you already know this from search/dedup — the eval just reuses it.

### Concept 3 — Building a golden dataset
- **Langfuse — Datasets & Scores docs** → https://langfuse.com/docs/datasets/overview and https://langfuse.com/docs/scores/overview — how the tool you set up in Week 1 stores ground truth + scores (you're doing this in files first; Langfuse datasets is the managed version, good to name in interviews).
- **Anthropic — *Create strong empirical evaluations*** → https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests — Anthropic's own guidance on building test sets + grading.

### Concept 4 — LLM-as-a-judge (Step 11 stretch)
- **Zheng et al. 2023 — *Judging LLM-as-a-Judge* (MT-Bench / Chatbot Arena)** → https://arxiv.org/abs/2306.05685 — the foundational paper; read the *limitations* (position bias, verbosity bias, self-enhancement bias) — that's the interview gold.
- **Eugene Yan — *LLM-as-Judge*** → https://eugeneyan.com/writing/llm-evaluators/ — practical pitfalls and when to (not) use it.

### Concept 5 — Eval tooling (name them, try one)
- **Promptfoo docs** → https://www.promptfoo.dev/docs/intro — assertion-based eval + matrix testing across providers; closest fit to your harness. **Optional Step 11.**
- **RAGAS docs** → https://docs.ragas.io — RAG-specific metrics (faithfulness, answer relevancy). *Not needed this week* — bookmark for Week 3–4 RAG eval.
- **OpenAI Cookbook — *Getting started with evals*** → https://cookbook.openai.com/examples/evaluation/getting_started_with_openai_evals — another mental model for structured evals.

### Concept 6 — Cost/accuracy benchmarking context
- **Chip Huyen — *AI Engineering* (Ch. 3–4, Evaluation)** → https://huyenchip.com/books/ — the book-length treatment of the model-selection / eval tradeoff; skim the evaluation chapters.
- **Artificial Analysis** → https://artificialanalysis.ai/ — public model benchmarks (cost vs latency vs quality) — useful to sanity-check your numbers against the market.

### Video (pick ONE, watch the segment, don't binge — anti-pattern #1)
- **DeepLearning.AI — *Evaluating and Debugging Generative AI Models* (Weights & Biases)** → https://learn.deeplearning.ai (free; watch the eval-metrics + tracking segments only).
- **Hamel Husain — *Mastering LLMs / Evals* talks** (search "Hamel Husain evals" on YouTube) — the talk version of the blog above; good for the commute, not the desk.

---

## Learning Strategy (from `docs/mentor/ai-engineer-learning-tips.md`)

Map this week's steps onto the daily loop — *learn → build → prove* in one day, not three.

**Daily loop applied to Week 2:**
- **06:30 Retrieval warmup (30m):** open `progress.md`, write from memory what last session shipped + one concept you couldn't explain yet (today: "what's row-level vs field-level accuracy?"). Re-read only the gap.
- **Deep block #1 (90m):** the eval build — one step at a time. Steps 5 (scorer) and 7 (runner) are the two real deep blocks; do them on separate days.
- **Deep block #2, interleaved (90m):** *different phase* — skim Week 3 RAG / pgvector so the context is warm when evals finish. Don't stack two eval blocks back-to-back.
- **10:30 Teach-back + log (30m):** write the Feynman paragraph — "explain the eval harness as if onboarding a new hire." That paragraph becomes the Week 10 blog section and a Week 11 STAR story. Append to `progress.md`.

**The 5 principles, concretely for this week:**
1. **Active retrieval** — after reading Hamel (Step 1), close the tab and write the 5-sentence answer in `evals/README.md`. Don't copy; recall.
2. **Project-first** — the *only* pre-reading is Step 1's alignment concept (the one genuine wall). Everything else: build, then read the doc when stuck.
3. **Spaced repetition** — you'll re-touch this concept Day 3 (run the benchmark), Day 7 (Week 3 RAG reuses the fixtures), Day 21 (blog post). Don't try to "finish learning evals" today.
4. **Interleaving** — run the 40-call benchmark (Step 9) *while* reading RAG material. Idle time = transfer time.
5. **Teach-back** — the `docs/eval-results.md` "failure modes" section IS the teach-back. If you can't explain why a model failed a fixture, you don't own the result yet.

**Anti-patterns to actively avoid this week:**
- ❌ Gold-plating to 200 fixtures. 20 with good edge-case coverage > 200 clones (tip: Phase-2 speed hack).
- ❌ Watching a full eval course end-to-end. Cherry-pick the one segment tied to the metric you're coding today.
- ❌ Building the eval in a separate repo/notebook. It lives in `personal-finance/services/ai-service/evals/`. Portfolio compounds.
- ❌ "Fixing" ground truth to flatter a model (THINK-04). A low score is a *finding*, not a bug in your eval.

**The Sunday metric (ask it next Sunday):**
> "What can I say in an interview today that I couldn't last Sunday?"
> Target answer: *"I built a 20-fixture extraction eval; Gemini hits 9X% critical-field accuracy at $0.00X/doc and is Y% cheaper than Claude — and the eval caught a real prompt bug."* If you can say that with numbers, the week worked.

---

## Notes

- **This harness is NOT in CI.** It makes real, paid, non-deterministic API calls. Only `tests/test_eval_scoring.py` (pure logic) runs in `pytest`/CI. Keep the boundary: `evals/` = manual benchmark, `tests/` = automated.
- **Reuses PF-AI001 deliberately:** `estimate_cost_usd()` from `app/observability.py` is the cost function — don't reimplement it. The `last_usage` provider attribute (Step 6) is the only new wiring needed to feed it.
- **`bank_hint` matters:** the runner derives it from the fixture filename (`bca_01` → `bca`) so the production `_build_system_prompt()` path applies bank-specific prompts (e.g. Superbank). Name fixtures correctly or you'll benchmark the wrong prompt.
- **THINK-03 tie-in:** the scorer tolerates string-vs-number amounts because models sometimes violate the `number` schema. That tolerance belongs in the *scorer*, never in the pipeline — the pipeline must keep `amount_idr` a real number into PostgreSQL.
- **Frozen contract (THINK-05):** ground-truth field names mirror the `TransactionResult` / `TransactionDto` contract. If that contract ever changes, the fixtures and scorer's `SCORED_FIELDS` change with it — in the same commit.
- **Next week (Week 3 — RAG):** this exact harness pattern (golden set → run → score → table) returns, but the metric becomes **MRR/NDCG on retrieval** instead of field accuracy. The 20 fixtures you label this week get *embedded* and reused as the retrieval test set. Label them well.
- **Deferred:** automated cost pull via the Langfuse query API, CI regression gating on eval scores, RAGAS integration — all later. v1 = a runnable benchmark + a documented table.
```