# PF-AI005 PART 2 — Answer Accuracy: Query Routing, Deterministic Aggregation, Grounded Streaming

> **Learning Phase:** Phase 2 · Chapter 5 addendum (PART 2 of 2) · Day ~42 of 90
> **Status:** Code complete (2026-07-09) — live eval + metrics pending Supabase stack
> **Started:** 2026-07-08
> **Planned from branch:** main
> **Depends on:** PF-AI005 PART 1 (SSE streaming, `/ask/stream`, ChatPage) — shipped 2026-07-06
> **Unblocks:** Chapter 6 (Advanced RAG Patterns) with a trustworthy baseline; previews Chapter 7 (tool routing is a proto-agent decision)
> **Pivot goal:** PART 1 made the chat *fast*. PART 2 makes it *correct*. A live UI test (2026-07-08) caught the chat confidently fabricating a February PLN total and denying that April food spending exists — while the database holds 43 Food transactions in April 2024 totaling Rp 2,309,954. This is financial data: one wrong digit destroys trust in the whole product. The fix is architectural, not a prompt tweak — and "I caught my RAG system lying about money and redesigned the query path so it *can't*" is a stronger interview story than any clean demo.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
  - [High level — what went wrong?](#high-level--what-went-wrong)
  - [Aggregation vs lookup — why top-K RAG cannot count](#aggregation-vs-lookup--why-top-k-rag-cannot-count)
  - [Query understanding](#query-understanding)
  - [Streaming that cannot lie](#streaming-that-cannot-lie)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
    - [STEP 0 — Reproduce and pin the failure](#--step-0--reproduce-and-pin-the-failure)
    - [STEP 1 — Learn: query routing, and why RAG is not a calculator](#--step-1--learn-query-routing-and-why-rag-is-not-a-calculator)
    - [STEP 2 — Build `query_planner.py` — intent + filters via structured extraction](#--step-2--build-query_plannerpy--intent--filters-via-structured-extraction)
    - [STEP 3 — Build `aggregator.py` — deterministic SQL totals](#--step-3--build-aggregatorpy--deterministic-sql-totals)
    - [STEP 4 — Wire the router into `/ask` and `/ask/stream`](#--step-4--wire-the-router-into-ask-and-askstream)
    - [STEP 5 — Post-stream citation guard for the lookup path](#--step-5--post-stream-citation-guard-for-the-lookup-path)
    - [STEP 6 — Frontend: sources that tell the truth](#--step-6--frontend-sources-that-tell-the-truth)
    - [STEP 7 — Numeric-accuracy eval harness](#--step-7--numeric-accuracy-eval-harness)
    - [STEP 8 — Record metrics, close the loop](#--step-8--record-metrics-close-the-loop)
  - [📌 Notes](#-notes)
  - [📚 Resources / Theory to Learn](#-resources--theory-to-learn)
  - [🧠 Learning Strategy](#-learning-strategy)
  - [📝 Knowledge Check](#-knowledge-check)

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what went wrong?

Three real queries from the 2026-07-08 UI test, and what the shipped pipeline did with them:

| Query | Chat said | Reality (SQL) |
|---|---|---|
| "tagihan listrik pln bulan februari" | "Total Rp 400,500, transaksi [3] Rp 200,000 + [2] Rp 200,500, confident=true" | The 3 displayed sources were **WSS Batu Bulan** rows from **January** — Rp 48,950 / 11,350 / 36,500. None is PLN, none is February, no combination sums to 400,500. **Fabricated.** |
| "pengeluaran makan bulan april" | "Tidak mencakup April. Semua transaksi berasal dari Januari 2024." | `SELECT SUM(amount_idr) WHERE category='Food' AND flow='DB' AND date IN April 2024` → **43 rows, Rp 2,309,954**. The data exists; retrieval never looked there. |
| "tagihan listrik pln bulan maret" | "Tidak tersedia, confident=false" | Correct refusal — but for the wrong reason (unlucky retrieval, not absence of data). |

The root cause is one architectural decision made in PART 1: **every question, regardless of type, is answered by sampling the 3 most semantically-similar rows from the whole corpus and letting the LLM reason over that sample.** For "which transaction was X" questions that design is fine. For "how much did I spend on Y in month Z" it is wrong in three independent ways, and each gets its own mini-ladder below:

```
User query ─▶ [what kind of question is this?] ── lookup ──▶ embed → retrieve → rerank → cite   (PART 1, keep)
                        │
                        └──────────────────────── aggregate ─▶ extract filters → SQL SUM → LLM narrates
                                                               (PART 2 — the number comes from Postgres,
                                                                never from the model)
```

## Aggregation vs lookup — why top-K RAG cannot count

**Sum whatever the retriever returns.** This is what ships today: `/ask/stream` retrieves top-10 by cosine similarity, reranks to top-3, and the LLM adds up what it sees. For "berapa pengeluaran makan bulan April?" the top-3 happened to be three January minimarket rows — so the model concluded April doesn't exist. The database had 43 matching rows.

Fine for finding *a* transaction, a dead end for totals: a top-K result set is a **sample**, and a sum over a sample is not the sum. No prompt engineering fixes this — the correct rows were never in the context window.

**Raise top_k.** Retrieve 50, 100? Two new walls appear. First, you still can't prove coverage — is 100 enough for a month with 120 food transactions? Second, you've now handed the LLM a hundred numbers and asked it to do arithmetic. LLMs are unreliable adders; the February answer above shows the model producing Rp 400,500 from rows summing to Rp 96,800. **Never let the model do math on money.**

**Route by intent: aggregation questions go to SQL.** `SUM(amount_idr)` over a `WHERE` clause is exact over the *entire* table, costs nothing, and cannot hallucinate — Postgres has no imagination. The LLM's only job on this path is narrating a number that was computed before it was ever called. The retrieval funnel stays for lookup questions, where "the 3 most relevant rows" is genuinely the right shape. → *This is the `QueryPlanner` + `AggregationService` split STEPs 2–4 build.*

▶ **Watch/read for this concept:** [Neon — RAG is not a calculator: routing analytical queries to SQL](https://neon.tech/blog/rag-txt2sql) — the exact pattern, including why generating *filters* is safer than generating *SQL*.

## Query understanding

**Hope the embedding carries the month.** "pengeluaran makan bulan april" gets embedded whole; surely rows dated April land nearer? They don't — embeddings encode *topic*, not *time*. A January GOFOOD row and an April GOFOOD row are nearly identical vectors. The date information in the query is simply discarded. Worse: the retriever *already supports* `date_from`/`date_to` as parametrized SQL (built in PF-AI004!) — the chat just never sends them. The capability exists; nothing extracts the filters from the question.

**Parse dates with regex.** Match "april" → month 4. Works until the first real user phrase: "bulan lalu", "3 bulan terakhir", "awal tahun", "minggu ini", English/Indonesian mixes, a missing year ("april" of *which* year?). Date language is exactly the kind of soft, ambiguous input LLMs are good at and regex is not.

**LLM structured extraction, closed vocabulary, temperature 0.** One cheap `generate_json` call turns the raw query into a typed plan: `{intent, date_from, date_to, categories}`. Two constraints make it safe. The **reference date** (today) is injected into the prompt so "bulan lalu" resolves deterministically. And `categories` must be chosen from the *actual category list in the database* (Food, Groceries, Electricity, …) — the model selects from a menu, it never invents a label. This is the same THINK-03 discipline as the extraction schemas: structured output with enforced types, `temperature=0.0`, no free text. → *This is `query_planner.py`, STEP 2.*

## Streaming that cannot lie

**Stream free text and trust it.** PART 1's `/ask/stream` calls `stream_generate` — plain prose, token by token, no schema, no post-check. The non-streaming `/ask` validates every cited id against the real context and drops fabrications ([answerer.py](../../../services/ai-service/app/services/answerer.py)'s hallucination guard); the streaming path traded that guard away for time-to-first-token. The February fabrication walked straight through the gap — the guard existed, the UI just never used the path that has it.

**Buffer everything, verify, then emit.** Run generation to completion server-side, validate, then flush. Safe — and it deletes the entire point of Chapter 5: TTFT goes back to ~3 seconds and the streaming UI becomes a progress bar with extra steps.

**Make the facts verified *before* generation, and check citations *after* the stream.** The insight: you don't have to verify what the model says about the number if the model never produces the number. On the aggregate path the total is computed by SQL *first* and injected into the prompt as a constant the model must repeat — the `done` event also carries `total_idr` from the SQL result, so the UI can render the figure from data even if the prose mangles it. On the lookup path, buffer the streamed text server-side *while* forwarding tokens (zero TTFT cost), and when the stream ends validate every `[n]` marker against the contexts actually sent; the `done` payload reports `verified: true/false` and the UI badges unverified answers. → *This is STEPs 4–5.*

> **Teaser — not built here:** full mid-stream guardrails (token-level constrained decoding, streaming JSON parsers). Real technology, wrong cost/benefit for a two-path chat; the precompute-then-narrate pattern removes the need for the hard version.

▶ **Watch/read for this concept:** [Anthropic — Reducing hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — "give the model the facts, constrain it to them" is their first-listed technique.

# 🔧 Implementation

## 🎯 Objective

Chat answers about money must be **provably correct or explicitly unverified** — never confidently wrong. Concretely:

1. **Query planner** — [query_planner.py](../../../services/ai-service/app/services/query_planner.py): one `generate_json` call classifies intent (`aggregate` | `lookup`) and extracts `date_from`/`date_to`/`categories` (closed vocabulary from the DB) at `temperature=0.0`.
2. **Deterministic aggregation** — [aggregator.py](../../../services/ai-service/app/services/aggregator.py): parametrized `SUM`/`COUNT` over `transactions` using `Decimal`; the LLM narrates a precomputed number, never computes one.
3. **Routed `/ask` + `/ask/stream`** — aggregate intent → SQL path; lookup intent → the existing retrieve→rerank→cite funnel. Response/`done` payloads carry `intent`, `verified`, and (aggregate) `total_idr`.
4. **Streaming citation guard** — buffer-while-forwarding; post-stream `[n]`-marker validation; `verified` flag in `done`.
5. **Honest UI** — sources attached per-message (not one global panel), labeled "Transaksi yang dipertimbangkan" unless actually cited, visible error state, unverified badge.
6. **Numeric-accuracy eval** — [eval_numeric_accuracy.py](../../../services/ai-service/evals/eval_numeric_accuracy.py): 10 aggregation questions, ground truth computed by SQL in the harness itself, exact-match on the rupiah figure. Before/after recorded.

## ✅ Acceptance Criteria

- [x] [query_planner.py](../../../services/ai-service/app/services/query_planner.py) — `QueryPlanner.plan(query, today, categories)` returns a validated `QueryPlan` (`intent`, `date_from`, `date_to`, `categories ⊆ known list`); `temperature=0.0`; unit-tested with a mocked provider (≥ 5 tests incl. "bulan lalu" relative-date resolution and an invented-category rejection)
  > Verification: 6 tests in [test_query_planner.py](../../../services/ai-service/tests/test_query_planner.py) pass; `temperature=0.0` is enforced inside `provider.generate_json` (see [gemini.py](../../../services/ai-service/app/providers/gemini.py)); closed-vocab guard drops invented categories.
- [x] [aggregator.py](../../../services/ai-service/app/services/aggregator.py) — `AggregationService.aggregate(plan)` runs parametrized SQL only (no string interpolation of values), returns `Decimal` total + row count + top rows for display; unit-tested
  > Verification: 6 tests in [test_aggregator.py](../../../services/ai-service/tests/test_aggregator.py) assert values bind as params (never in the SQL string), `Decimal` total, `datetime.date` binding, and connection close.
- [x] `POST /ask` and `POST /ask/stream` route by intent; for aggregate queries the answer's rupiah figure equals the SQL result exactly (asserted in tests by mocking the provider with a *wrong* number and checking the response still carries the SQL `total_idr`)
  > Verification: `test_aggregate_total_comes_from_sql_not_prose` (answerer) and `test_ask_stream_aggregate_carries_sql_total_in_payload` (streaming) — provider mocked to say "Rp 999.999", payload still carries the SQL total.
- [x] `/ask/stream` lookup path buffers the streamed text and validates `[n]` markers post-stream; `done` payload carries `{confident, verified, intent, total_idr?}`; a test where the mocked provider cites `[7]` (not in context) must yield `verified: false`
  > Verification: `test_ask_stream_unknown_marker_is_unverified` + `test_ask_stream_valid_marker_is_verified` + `test_ask_stream_no_markers_is_unverified` in [test_streaming.py](../../../services/ai-service/tests/test_streaming.py).
- [ ] The three failing queries from 2026-07-08 now behave: "pengeluaran makan bulan april" returns Rp 2,309,954 (43 transactions, April 2024 — or the correct year-disambiguated set); "tagihan listrik pln bulan februari" returns only real PLN rows or a refusal; no answer ever displays sources unrelated to its claim
  > Not met (live): requires the Supabase stack (down this session). Correct by construction (aggregate → SQL `SUM` over Food/April; sources come from the same filtered rows) and encoded as eval fixtures `food-apr-2024` / `electricity-feb-2024`; live rupiah confirmation pending.
- [x] [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) — contexts stored per-message; sources rendered under their own message only; label distinguishes cited vs considered; stream errors show a visible message; `verified: false` answers show a badge
  > Verification: read the file — `Message.contexts` per-message, `sourceLabel()` distinguishes cited/considered, `⚠ tidak terverifikasi` badge on `verified === false`, error branch renders the failure text; `npm run build` + scoped eslint pass. Not visually verified (no live UI this session).
- [ ] [eval_numeric_accuracy.py](../../../services/ai-service/evals/eval_numeric_accuracy.py) over [ask_numeric_questions.json](../../../services/ai-service/evals/ask_numeric_questions.json) (10 questions): **exact-match ≥ 9/10** on the aggregate set (was ~0/10 by design before); results recorded in [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md)
  > Partial: harness + 10-aggregate/1-lookup question set created and import-verified; a pending-numbers section is scaffolded in the metrics doc. The ≥ 9/10 live run requires the Supabase stack (down) — pending.
- [x] All new services Langfuse-visible (planner + narration calls appear as GENERATION observations — free via the existing provider abstraction)
  > Verification: `QueryPlanner.plan` calls `provider.generate_json` and the narration calls `generate_json`/`stream_generate` — all three wrap `langfuse.start_observation(as_type="generation")` in [gemini.py](../../../services/ai-service/app/providers/gemini.py). Tracing is structural (zero new code); live dashboard confirmation pending infra.
- [x] `pytest` green: `test_query_planner.py`, `test_aggregator.py`, updated `test_streaming.py`, `test_answerer.py` — no real LLM/DB calls in unit tests
  > Verification: 25 passed across the four files; full suite 117 passed, 1 failure pre-existing and unrelated (`test_merchant_suggester.py::test_is_pii_keyword[REK123456-True]`, untouched by this work).

## 🧭 Approach

**Generate filters, not SQL.** Text-to-SQL hands the model a loaded gun (injection, cross-user reads once auth lands, unbounded queries). The planner emits a *typed plan* — dates, category names from a closed list, an intent enum — and trusted code compiles it to the same parametrized WHERE-clause style [retriever.py](../../../services/ai-service/app/services/retriever.py) already uses. The model chooses *what* to query; it never writes *how*.

**The LLM never touches the number.** On the aggregate path the flow is SQL → number → prompt ("The verified total is Rp 2,309,954 from 43 transactions. Present this figure; do not alter it.") → narration. The `done`/response payload carries `total_idr` from SQL, so even a disobedient narration can't corrupt what the UI shows. This is the money-domain version of "give the model the facts" — and it's why the numeric eval can demand exact match.

**Keep PART 1's funnel for what it's good at.** Lookup questions ("kapan terakhir bayar PLN?", "transaksi terbesar minggu lalu?") stay on retrieve→rerank→cite — now with planner-extracted date filters actually passed to the retriever, fixing the "embeddings don't encode time" hole for lookups too.

**Router is one planner call, not an agent.** Chapter 7 builds real tool-calling agents; this chapter deliberately stops at a single structured-extraction call + an `if`. Cheap (one Haiku/Flash-class call), traceable, testable — and the contrast ("when did you graduate from a router to an agent, and why?") is itself interview material.

Out of scope: conversation memory (Chapter 8), hybrid BM25 (Chapter 6), multi-step questions ("compare March vs April" — needs plan lists, Chapter 7 territory), .NET proxy/auth (PF-S08).

## 📂 Affected Files

| File | Change |
|------|--------|
| [query_planner.py](../../../services/ai-service/app/services/query_planner.py) | Create — intent + filter extraction (`generate_json`, closed category vocab) |
| [aggregator.py](../../../services/ai-service/app/services/aggregator.py) | Create — parametrized SQL SUM/COUNT, `Decimal` |
| [answerer.py](../../../services/ai-service/app/services/answerer.py) | Edit — route by plan; aggregate path narrates precomputed total |
| [main.py](../../../services/ai-service/app/main.py) | Edit — `/ask/stream` routing, buffer-while-forwarding, post-stream marker guard, enriched `done` payload; wire planner/aggregator in lifespan |
| [models.py](../../../services/ai-service/app/models.py) | Edit — `QueryPlan`; `AskResponse` + stream `done` gain `intent`, `verified`, `total_idr` |
| [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) | Edit — `done` payload type; surface `verified`/`total_idr` |
| [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) | Edit — per-message contexts, honest source labels, error state, unverified badge |
| [test_query_planner.py](../../../services/ai-service/tests/test_query_planner.py) | Create |
| [test_aggregator.py](../../../services/ai-service/tests/test_aggregator.py) | Create |
| [test_streaming.py](../../../services/ai-service/tests/test_streaming.py) | Edit — marker-guard + routed-path cases |
| [eval_numeric_accuracy.py](../../../services/ai-service/evals/eval_numeric_accuracy.py) | Create — SQL-ground-truth exact-match harness |
| [ask_numeric_questions.json](../../../services/ai-service/evals/ask_numeric_questions.json) | Create — 10 aggregation questions with filter specs |
| [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md) | Edit — numeric-accuracy before/after, planner latency |

## 📋 TODO

### [!] STEP 0 — Reproduce and pin the failure

> **Skipped:** Supabase stack unavailable this session (no docker/supabase up) — the live baseline was not captured. Exact commands + expected findings are recorded in the `## STEP 0 baseline` note at the bottom of this file; run them when the stack is up.

Before changing anything, freeze the evidence. With the stack up (`supabase start`, AI service on 8000):

```bash
# The ground truth the chat contradicted:
docker exec supabase_db_personal-finance psql -U postgres -d postgres -c \
  "SELECT COUNT(*), SUM(amount_idr) FROM transactions
   WHERE category='Food' AND flow='DB' AND date >= '2024-04-01' AND date < '2024-05-01';"
# → 43 | 2309954

# The failing behavior, via the guarded non-streaming endpoint for comparison:
curl -s -X POST http://localhost:8000/ask -H "Content-Type: application/json" \
  -d '{"query": "berapa pengeluaran makan bulan april 2024?"}' | python -m json.tool

# And the same query WITH the filters the chat never sends — proving the plumbing works:
curl -s -X POST http://localhost:8000/ask -H "Content-Type: application/json" \
  -d '{"query": "berapa pengeluaran makan bulan april 2024?", "top_k": 10,
       "category": "Food", "date_from": "2024-04-01", "date_to": "2024-04-30"}' | python -m json.tool
```

Record all three outputs in a `## STEP 0 baseline` note at the bottom of this file. Expected finding: unfiltered → wrong/refusal; filtered → still wrong for *totals* (top-10 of 43 rows is still a sample — this is the proof that filters alone don't fix aggregation, motivating STEP 3).

> **Why pin first?** The headline of this chapter is a before/after. "0/10 numeric exact-match → 9/10" only lands if the 0 was actually measured (THINK-04: failures are diagnostic signals — capture them, don't pave over them).

### [x] STEP 1 — Learn: query routing, and why RAG is not a calculator (45 min)

**Read:**
1. Neon — *RAG ≠ text-to-SQL, and when to route* → https://neon.tech/blog/rag-txt2sql (15 min)
2. Anthropic — *Reducing hallucinations* → https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations (10 min — the "quote the provided facts" pattern)
3. Skim: LlamaIndex *Router Query Engine* docs → https://docs.llamaindex.ai/en/stable/module_guides/querying/router/ (10 min — the same idea, framework flavor; you're hand-rolling it to understand it)

**Active-retrieval task (do NOT skip):** append to [evals/README.md](../../../services/ai-service/evals/README.md) a section `## Query routing mental model (written from memory)`:
- Why is a top-K retrieval result the wrong input for a SUM, *even with perfect retrieval*?
- Why generate filters instead of SQL? Name two failure classes filter-generation eliminates.
- On the aggregate path, what is the LLM's remaining job, and what happens if it disobeys?

> **The interview frame:** "My chat fabricated a February electricity total during UI testing — retrieval sampled 3 rows, the LLM summed them wrong, and streaming had no citation guard. I fixed it architecturally: a temperature-0 planner classifies intent and extracts typed filters against a closed category vocabulary; aggregation questions route to parametrized SQL so the number is computed by Postgres, not the model; and the streaming path validates citation markers post-stream. Numeric exact-match went from 0/10 to 9/10, and the UI badges anything unverified."

### [x] STEP 2 — Build [query_planner.py](../../../services/ai-service/app/services/query_planner.py) — intent + filters via structured extraction

Add to [models.py](../../../services/ai-service/app/models.py):

```python
class QueryPlan(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    intent: Literal["aggregate", "lookup"]
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    categories: list[str] = []          # must be ⊆ the known category list
    flow: Literal["DB", "CR"] | None = None
```

Create [services/ai-service/app/services/query_planner.py](../../../services/ai-service/app/services/query_planner.py):

```python
"""QueryPlanner: classify intent and extract typed filters from a chat question.

One cheap structured-extraction call. The model chooses WHAT to query
(dates, categories from a closed list, aggregate vs lookup); it never
writes SQL and never sees the data.
"""
from __future__ import annotations

import datetime
import logging

from app.models import QueryPlan
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["aggregate", "lookup"]},
        "date_from": {"type": ["string", "null"]},
        "date_to": {"type": ["string", "null"]},
        "categories": {"type": "array", "items": {"type": "string"}},
        "flow": {"type": ["string", "null"], "enum": ["DB", "CR", None]},
    },
    "required": ["intent", "categories"],
}

SYSTEM_PROMPT = """You classify a personal-finance question and extract filters. Rules:
- intent=aggregate when the user asks for a total, sum, count, or average \
("berapa", "total", "how much"). intent=lookup when they ask about specific \
transactions ("kapan", "transaksi apa", "yang terbesar").
- Resolve relative dates ("bulan lalu", "this week") against the reference date. \
If the user names a month without a year, use the reference date's year.
- categories MUST be chosen from the provided list verbatim — never invent one. \
Map colloquial terms ("makan" → "Food", "listrik" → "Electricity", "belanja \
minimarket" → "Groceries"). Empty list if nothing maps.
- flow: "DB" for spending questions, "CR" for income questions, null if unclear.
- Dates are YYYY-MM-DD. Do not guess filters the question doesn't imply."""


class QueryPlanner:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def plan(
        self, query: str, today: datetime.date, categories: list[str]
    ) -> QueryPlan:
        user_prompt = (
            f"Reference date: {today.isoformat()}\n"
            f"Known categories: {', '.join(categories)}\n\n"
            f"Question: {query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, PLAN_SCHEMA)
        plan = QueryPlan(**raw)

        # Closed-vocabulary guard: drop anything the model invented.
        known = set(categories)
        invented = [c for c in plan.categories if c not in known]
        if invented:
            logger.warning("planner invented categories %s — dropped", invented)
            plan.categories = [c for c in plan.categories if c in known]
        return plan
```

**C# equivalent** (Pydantic `Literal`/pattern validation → C# record + FluentValidation; `generate_json` → a typed `ILlmProvider.GenerateJsonAsync<T>`; set-difference guard → LINQ `Except`):

```csharp
public sealed record QueryPlan(
    string Intent,                       // "aggregate" | "lookup"
    string? DateFrom, string? DateTo,    // YYYY-MM-DD
    IReadOnlyList<string> Categories,
    string? Flow);                       // "DB" | "CR" | null

public sealed class QueryPlanner
{
    private readonly ILlmProvider _provider;
    private readonly ILogger<QueryPlanner> _logger;

    public QueryPlanner(ILlmProvider provider, ILogger<QueryPlanner> logger)
        => (_provider, _logger) = (provider, logger);

    public async Task<QueryPlan> PlanAsync(string query, DateOnly today, IReadOnlyList<string> categories)
    {
        var userPrompt = $"Reference date: {today:yyyy-MM-dd}\nKnown categories: {string.Join(", ", categories)}\n\nQuestion: {query}";
        var plan = await _provider.GenerateJsonAsync<QueryPlan>(SystemPrompt, userPrompt);

        var invented = plan.Categories.Except(categories).ToList();
        if (invented.Count > 0)
        {
            _logger.LogWarning("Planner invented categories {Invented} — dropped", invented);
            plan = plan with { Categories = plan.Categories.Intersect(categories).ToList() };
        }
        return plan;
    }
}
```

Create [tests/test_query_planner.py](../../../services/ai-service/tests/test_query_planner.py) — mocked provider (house pattern from [test_answerer.py](../../../services/ai-service/tests/test_answerer.py)), ≥ 5 cases:
1. `aggregate` intent for "berapa total pengeluaran makan bulan april?" with mocked raw returning Food + April dates
2. `lookup` intent for "kapan terakhir bayar PLN?"
3. invented category ("Makanan Enak") is dropped, warning logged
4. relative date: mocked raw resolving "bulan lalu" given `today=2026-07-08` → June 2026 range (the test asserts the prompt *contains* the reference date — resolution itself is the model's job)
5. missing optional fields → `QueryPlan` defaults hold (no crash)

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_query_planner.py -v
```

> **Why closed vocabulary instead of letting the model emit any category string?** `t.category` is populated by the 106-rule categorizer — the values are a finite, known set (Food, Groceries, Electricity, …). Free-text category output would silently match nothing ("Makanan" ≠ "Food") and produce a confident Rp 0. Selecting from a menu turns a hallucination risk into a validation no-op. Same THINK-03 energy as the extraction schemas: constrain first, validate anyway.

### [x] STEP 3 — Build [aggregator.py](../../../services/ai-service/app/services/aggregator.py) — deterministic SQL totals

Create [services/ai-service/app/services/aggregator.py](../../../services/ai-service/app/services/aggregator.py):

```python
"""AggregationService: exact totals over transactions via parametrized SQL.

Postgres computes the number. Decimal end-to-end — money never touches float.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

import asyncpg

from app.models import QueryPlan, SearchResult

logger = logging.getLogger(__name__)


class AggregateResult:
    def __init__(self, total_idr: Decimal, count: int, rows: list[SearchResult]) -> None:
        self.total_idr = total_idr
        self.count = count
        self.rows = rows          # top rows by amount, for the sources panel


class AggregationService:
    def __init__(self, db_url: str) -> None:
        self._db_url = db_url

    async def aggregate(self, plan: QueryPlan, display_rows: int = 5) -> AggregateResult:
        where = ["1=1"]
        params: list = []

        def add(clause: str, value) -> None:
            params.append(value)
            where.append(clause.format(n=len(params)))

        if plan.categories:
            add("t.category = ANY(${n})", plan.categories)
        if plan.flow:
            add("t.flow = ${n}", plan.flow)
        if plan.date_from:
            add("t.date >= ${n}::date", date.fromisoformat(plan.date_from))
        if plan.date_to:
            add("t.date <= ${n}::date", date.fromisoformat(plan.date_to))

        conn = await asyncpg.connect(self._db_url)
        try:
            agg = await conn.fetchrow(
                f"SELECT COALESCE(SUM(t.amount_idr), 0) AS total, COUNT(*) AS n "
                f"FROM transactions t WHERE {' AND '.join(where)}",
                *params,
            )
            rows = await conn.fetch(
                f"""SELECT t.id AS transaction_id, t.description, t.date::text AS date,
                           t.amount_idr, t.flow, COALESCE(a.name, '') AS wallet
                    FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
                    WHERE {' AND '.join(where)}
                    ORDER BY t.amount_idr DESC LIMIT {int(display_rows)}""",
                *params,
            )
        finally:
            await conn.close()

        return AggregateResult(
            total_idr=Decimal(str(agg["total"])),
            count=agg["n"],
            rows=[
                SearchResult(
                    transaction_id=r["transaction_id"], similarity=1.0,
                    description=r["description"], date=r["date"],
                    amount_idr=float(r["amount_idr"]), flow=r["flow"], wallet=r["wallet"],
                )
                for r in rows
            ],
        )
```

**C# equivalent** (asyncpg positional `$n` params → Npgsql/Dapper named params; Python `Decimal(str(...))` → C# `decimal` natively — the .NET side never had the float problem; dynamic WHERE building → the same list-of-clauses pattern):

```csharp
public sealed class AggregationService
{
    private readonly string _connString;
    public AggregationService(string connString) => _connString = connString;

    public async Task<AggregateResult> AggregateAsync(QueryPlan plan, int displayRows = 5)
    {
        var where = new List<string> { "1=1" };
        var p = new DynamicParameters();

        if (plan.Categories.Count > 0) { where.Add("t.category = ANY(@cats)"); p.Add("cats", plan.Categories); }
        if (plan.Flow is not null)     { where.Add("t.flow = @flow");          p.Add("flow", plan.Flow); }
        if (plan.DateFrom is not null) { where.Add("t.date >= @from");         p.Add("from", DateOnly.Parse(plan.DateFrom)); }
        if (plan.DateTo is not null)   { where.Add("t.date <= @to");           p.Add("to",   DateOnly.Parse(plan.DateTo)); }

        var clause = string.Join(" AND ", where);
        await using var conn = new NpgsqlConnection(_connString);
        var agg = await conn.QuerySingleAsync<(decimal Total, int N)>(
            $"SELECT COALESCE(SUM(t.amount_idr), 0), COUNT(*) FROM transactions t WHERE {clause}", p);
        // decimal is exact — SUM of money in C# was never a float question.
        var rows = await conn.QueryAsync<SearchResult>(
            $@"SELECT t.id AS TransactionId, t.description, t.date, t.amount_idr AS AmountIdr,
                      t.flow, COALESCE(a.name, '') AS Wallet
               FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
               WHERE {clause} ORDER BY t.amount_idr DESC LIMIT @lim",
            new DynamicParameters(p).Also(d => d.Add("lim", displayRows)));

        return new AggregateResult(agg.Total, agg.N, rows.ToList());
    }
}
```

Create [tests/test_aggregator.py](../../../services/ai-service/tests/test_aggregator.py) — mock `asyncpg.connect` (pattern from [test_retriever.py](../../../services/ai-service/tests/test_retriever.py)); assert: (1) categories compile to `= ANY($n)` with the list as a bound param, never in the SQL string; (2) empty plan → `WHERE 1=1` (full-table total is legal); (3) `total_idr` is `Decimal`; (4) date strings become `datetime.date` before binding (the asyncpg codec bug from PF-AI004 STEP 10 — regression-guard it here).

> **Why does the aggregate query skip the embeddings table entirely?** Aggregation doesn't need semantic similarity — the planner already resolved "makan" → `Food`. Joining `transaction_embeddings` would only *shrink* the result to rows that happen to be embedded. The whole point is totals over the **population**, not a sample; `transactions` is the population.

### [x] STEP 4 — Wire the router into `/ask` and `/ask/stream`

Extend [models.py](../../../services/ai-service/app/models.py): `AskResponse` gains `intent: str = "lookup"`, `verified: bool = True`, `total_idr: float | None = None`.

Edit [answerer.py](../../../services/ai-service/app/services/answerer.py) — `AnswerService` takes `planner` + `aggregator`; `ask()` becomes the router:

```python
NARRATE_PROMPT = """You present a precomputed financial result. The VERIFIED \
figures below were computed by SQL over the full transaction table. Rules:
- State the total EXACTLY as given — never recompute, round, or adjust it.
- Mention the transaction count. Reference example rows as [1], [2] if helpful.
- Answer in the question's language. One to three sentences."""

    async def ask(self, request: AskRequest) -> AskResponse:
        today = datetime.date.today()
        plan = await self._planner.plan(request.query, today, self._categories)

        if plan.intent == "aggregate":
            t0 = time.perf_counter()
            agg = await self._aggregator.aggregate(plan)
            retrieval_ms = (time.perf_counter() - t0) * 1000

            if agg.count == 0:
                return AskResponse(
                    answer="Tidak ada transaksi yang cocok dengan filter pertanyaan ini.",
                    confident=False, citations=[], model="none", intent="aggregate",
                    verified=True, total_idr=0.0,
                    retrieval_ms=retrieval_ms, generation_ms=0.0,
                )

            t1 = time.perf_counter()
            user_prompt = (
                f"VERIFIED TOTAL: Rp {agg.total_idr:,.0f} from {agg.count} transactions\n"
                f"Filters: categories={plan.categories} {plan.date_from}..{plan.date_to} flow={plan.flow}\n"
                f"Largest rows:\n{_format_context(agg.rows)}\n\nQuestion: {request.query}"
            )
            raw = await self._provider.generate_json(NARRATE_PROMPT, user_prompt, ANSWER_SCHEMA)
            generation_ms = (time.perf_counter() - t1) * 1000

            return AskResponse(
                answer=raw["answer"], confident=True,
                citations=_citations_for(agg.rows, raw), model=settings.ai_model,
                intent="aggregate", verified=True, total_idr=float(agg.total_idr),
                retrieval_ms=retrieval_ms, generation_ms=generation_ms,
            )

        # lookup → the existing PART 1 funnel, now with planner-extracted filters
        # merged into the request (planner dates win over absent request dates).
        ...
```

**C# equivalent** (intent routing → a strategy `switch`; the pattern to note is *where the number lives*: it's set on the response from `agg.TotalIdr` before the LLM is even consulted — `response.TotalIdr = agg.TotalIdr;` then `response.Answer = await NarrateAsync(...)`; the narration can only decorate, never define):

```csharp
public async Task<AskResponse> AskAsync(AskRequest request)
{
    var plan = await _planner.PlanAsync(request.Query, DateOnly.FromDateTime(DateTime.UtcNow), _categories);
    return plan.Intent switch
    {
        "aggregate" => await AnswerAggregateAsync(request, plan),   // SQL total FIRST, narration second
        _           => await AnswerLookupAsync(request, plan),      // PART 1 funnel + plan filters
    };
}
```

Mirror the routing in [main.py](../../../services/ai-service/app/main.py) `/ask/stream`: aggregate → compute `agg` first, emit `metadata` with `agg.rows` **and** `{"total_idr": ..., "count": ..., "intent": "aggregate"}`, stream the narration, then `done` with `{"confident": true, "verified": true, "intent": "aggregate", "total_idr": ...}`. Wire `QueryPlanner`/`AggregationService` in lifespan; load the category list once at startup (`SELECT DISTINCT category FROM transactions WHERE category <> ''`).

Tests (extend [test_answerer.py](../../../services/ai-service/tests/test_answerer.py)): the AC's key case — mock the provider to *disobey* (answer text says "Rp 999.999") and assert `response.total_idr` still equals the mocked SQL total. That test IS the design: the payload is the truth, prose is presentation.

### [x] STEP 5 — Post-stream citation guard for the lookup path

In `/ask/stream`'s lookup branch, accumulate while forwarding:

```python
        buffer: list[str] = []
        async for token in app.state.provider.stream_generate(SYSTEM_PROMPT, user_prompt):
            if await req.is_disconnected():
                break
            buffer.append(token)
            yield {"event": "token", "data": token}

        # Post-stream guard: every [n] marker must map to a context we sent.
        text = "".join(buffer)
        markers = {int(m) for m in re.findall(r"\[(\d+)\]", text)}
        valid = set(range(1, len(contexts) + 1))
        verified = markers <= valid and bool(markers)
        if markers - valid:
            logger.warning("stream cited unknown markers %s — flagged unverified", markers - valid)

        yield {"event": "done", "data": json.dumps(
            {"confident": True, "verified": verified, "intent": "lookup"}
        )}
```

**C# equivalent** (`re.findall` set-comprehension → `Regex.Matches(...).Select(...).ToHashSet()`; subset check `markers <= valid` → `markers.IsSubsetOf(valid)`; the buffering-while-yielding shape → `await foreach` over an `IAsyncEnumerable<string>` appending to a `StringBuilder` before each `yield return`):

```csharp
var buffer = new StringBuilder();
await foreach (var token in _provider.StreamGenerateAsync(systemPrompt, userPrompt, ct))
{
    buffer.Append(token);
    yield return SseEvent.Token(token);
}
var markers = Regex.Matches(buffer.ToString(), @"\[(\d+)\]")
    .Select(m => int.Parse(m.Groups[1].Value)).ToHashSet();
var valid = Enumerable.Range(1, contexts.Count).ToHashSet();
var verified = markers.Count > 0 && markers.IsSubsetOf(valid);
yield return SseEvent.Done(new { confident = true, verified, intent = "lookup" });
```

Update [test_streaming.py](../../../services/ai-service/tests/test_streaming.py): (1) mocked stream citing `[1]` → `done.verified == true`; (2) mocked stream citing `[7]` with 3 contexts → `verified == false` + warning logged; (3) mocked stream with *no* markers → `verified == false` (an uncited lookup answer is unverifiable by definition); (4) existing event-order tests still green with the enriched `done` payload.

> **Why is this guard weaker than `/ask`'s, and why is that acceptable?** The non-streaming guard validates *transaction ids* from structured output; this one validates *markers* in free text — it catches "cited something I never sent" but not "described row [2] inaccurately." The full answer is the two-path design: questions where prose inaccuracy destroys value (totals) don't use this path at all — their numbers ride in the payload. The residual risk on lookups is a mis-described row whose true values sit directly below in the sources panel. Known, bounded, documented — that's what "production tradeoff" means in an interview answer.

### [x] STEP 6 — Frontend: sources that tell the truth

> **Note:** All 5 code changes done (per-message contexts, honest labels, payload money figure, unverified badge, visible error state) across [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts), [useChatSession.ts](../../../apps/frontend/src/hooks/useChatSession.ts), [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx), and [AiChatPanel.tsx](../../../apps/frontend/src/components/chat/AiChatPanel.tsx) (the last wired for compilation after the global-contexts removal). `npm run build` + scoped `eslint` pass clean. Live UI re-run of the 3 STEP 0 queries + screenshots deferred to a session with the stack up.

Edit [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) + [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts):

1. **Per-message contexts** — `Message` gains `contexts?: ContextItem[]`, `verified?: boolean`, `intent?: string`, `totalIdr?: number`; `onMetadata` writes into the pending assistant message, not a global array. Sources render *inside* each assistant bubble's footer. (Kills the "one global panel shows only the last query's evidence" bug.)
2. **Honest labels** — aggregate + verified: `"Sumber transaksi ({count} transaksi, {n} terbesar ditampilkan)"`; lookup + verified: `"Sumber transaksi"`; `verified: false` or `confident: false`: `"Transaksi yang dipertimbangkan (tidak dikutip)"` in muted style. Never present unused candidates as evidence.
3. **The number comes from the payload** — for aggregate answers render `totalIdr` (via `toLocaleString("id-ID")`) as a small monospace figure in the bubble footer: the UI's displayed total is SQL's total even if the prose garbles it.
4. **Unverified badge** — `verified: false` → subtle warning chip ("⚠ tidak terverifikasi") on the bubble.
5. **Visible error state** — `onError` currently just stops the cursor; replace the empty bubble with "Terjadi kesalahan saat memuat jawaban — coba lagi." so a dropped stream is distinguishable from a finished one.

Follow [data-oriented-theme](../../skills/data-oriented-theme/SKILL.md) (monospace for the money figure, muted secondary text, no decorative dividers — whitespace separates sources from prose per [feedback_no_dividers](../../../.claude/plans/learning/PF-AI005-streaming-sse-todo.md)-era card rules).

Verify with `npm run build && npm run lint`, then live: re-run the three STEP 0 queries in the UI and screenshot for the STEP 8 log entry.

### [x] STEP 7 — Numeric-accuracy eval harness

> **Note:** [eval_numeric_accuracy.py](../../../services/ai-service/evals/eval_numeric_accuracy.py) + [ask_numeric_questions.json](../../../services/ai-service/evals/ask_numeric_questions.json) (10 aggregate + 1 lookup control) created and import-verified; ground truth is computed live by the harness's own independent SQL. The router is driven in-process via `AnswerService.ask` (no uvicorn needed). **Retried live 2026-07-14 with Supabase up — infra is no longer the blocker.** Failed on question 1 with `429 RESOURCE_EXHAUSTED` (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 20/day on `gemini-2.5-flash`) — a fixed daily cap already exhausted from same-day live testing before this run started. **Deferred pending a paid-tier subscription** (Gemini paid tier or a funded `ANTHROPIC_API_KEY`) — the ≥ 9/10 run resumes once that's active.

Create [evals/ask_numeric_questions.json](../../../services/ai-service/evals/ask_numeric_questions.json) — 10 aggregation questions, each with the *filter spec* (not the answer — ground truth is computed live, so it never goes stale):

```json
[
  {
    "id": "food-apr-2024",
    "query": "berapa total pengeluaran makan bulan April 2024?",
    "truth_filters": {"categories": ["Food"], "flow": "DB",
                      "date_from": "2024-04-01", "date_to": "2024-04-30"}
  },
  {
    "id": "electricity-feb-2024",
    "query": "berapa tagihan listrik bulan Februari 2024?",
    "truth_filters": {"categories": ["Electricity"], "flow": "DB",
                      "date_from": "2024-02-01", "date_to": "2024-02-29"}
  }
]
```

…plus 8 more spanning: Groceries, a full-year total, an income (`CR`/Salary) question, a month with zero rows (expected total 0 + `confident=false`), "bulan lalu" relative phrasing, and one English question. Include one **lookup** question as a control (harness must *not* score it numerically — asserts the router sent it down the other path via `intent` in the response).

Create [evals/eval_numeric_accuracy.py](../../../services/ai-service/evals/eval_numeric_accuracy.py):

```python
"""Numeric exact-match eval: /ask's figure vs SQL ground truth, same filters.

Ground truth is computed live by this harness — the same parametrized SQL
shape as AggregationService, independent code path. Exact match on integer
rupiah: money is right or it's wrong; there is no 'close'.
"""
# per question:
#   truth = SQL SUM over truth_filters (Decimal)
#   resp  = POST /ask {"query": q}          ← no filter hints; planner must earn them
#   got   = resp["total_idr"]  (None → extract nothing; aggregate resp must carry it)
#   pass  = intent routed correctly AND int(got) == int(truth)
# prints a table: id | intent | truth | got | ✓/✗ | planner_ms | total latency
```

**C# equivalent** (no port — this is an operational CLI harness like `eval_retrieval.py`; its C#-relevant idea is the *independent verification path*: the eval recomputes truth with its own SQL rather than trusting `AggregationService`, the same reason integration tests never assert against the code under test's own output).

Run before STEP 4 lands (expect ~0/9 numeric — the pinned baseline) and after (target ≥ 9/10 incl. the routing control). Failures are diagnostic: a planner mis-extraction (wrong month) fails differently than a narration disobedience (payload right, prose wrong — still a pass numerically, note it separately).

### [!] STEP 8 — Record metrics, close the loop

> **Skipped (partial), now explicitly deferred (2026-07-14):** The recordable-without-infra parts are done — a "RAG Answer Accuracy (PF-AI005 PART 2)" section was added to [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md) with the before/after design, the by-construction ~0/10 baseline, the ≥ 9/10 target, and a pending-numbers table; the [BOARD.md](../../BOARD.md) row was updated. **No longer an infra problem** — Supabase was confirmed up and the eval retried live 2026-07-14; it still hit Gemini's `GenerateRequestsPerDayPerProjectPerModel-FreeTier` daily cap (20/day, `gemini-2.5-flash`). **Deferred pending a paid-tier subscription** — numeric exact-match before/after, planner-latency p50, `/ask/stream` verified-rate, the Langfuse two-GENERATION-per-trace confirmation, and the `eval_faithfulness.py` re-run all resume then (both faithfulness harnesses already updated to the new constructor so they run cleanly once unblocked). `/mentor log` left as a user follow-up.

1. [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md): numeric exact-match before/after table, planner latency p50 (the added cost of routing — expect ~300–600 ms), `/ask/stream` verified-rate.
2. Confirm Langfuse shows the planner call + narration call as separate GENERATION observations per `/ask` trace (zero new tracing code — same PF-AI001 rails; note the per-question cost now includes one extra small call).
3. Re-run [eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py) — faithfulness should hold or rise (aggregate answers are now grounded by construction). Record the delta.
4. Update this plan's checkboxes + STEP 0 baseline note; BOARD.md row → Done (learning plans stay in `learning/`, mark Status in place).
5. `/mentor log` with the headline numbers.

## 📌 Notes

- **Money in the payload, prose as decoration** is this chapter's transferable pattern — the same shape as PF-AI004's "citations validated against the context actually sent." Trust boundaries live in code; the model operates inside them.
- The lookup path's `top_k` semantics are unchanged — Chapter 6 (hybrid BM25, sentence-window) improves *that* path; this chapter made sure the questions it can't serve no longer reach it.
- "compare March vs April" needs a *list* of plans — deliberately deferred to Chapter 7 (agents), where multi-step decomposition is the actual lesson.
- The planner adds one small LLM call per chat turn. If latency bites, it's a Haiku/Flash-class classification per the cost-discipline rule in [ai-service.md](../../rules/ai-service.md) — a config change, not a redesign.

## 📚 Resources / Theory to Learn

| Resource | What it covers | When |
|---|---|---|
| [Neon — RAG ≠ txt2SQL routing](https://neon.tech/blog/rag-txt2sql) | The routing pattern, filters-not-SQL rationale | STEP 1 (required) |
| [Anthropic — Reducing hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) | Grounding via provided facts, allowing refusal | STEP 1 (required) |
| [LlamaIndex Router Query Engine](https://docs.llamaindex.ai/en/stable/module_guides/querying/router/) | Framework version of intent routing | STEP 1 (skim) |
| [Pinecone — metadata filtering in vector search](https://www.pinecone.io/learn/vector-search-filtering/) | Why filters belong in the query, not post-hoc | Pull if stuck on STEP 4 |
| [OWASP LLM Top 10 — LLM02 Insecure Output Handling](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | Why generated SQL is an attack surface | Reference for the STEP 2 "why" |

## 🧠 Learning Strategy

- **Daily loop:** one STEP per session; run its tests before closing; log same-day (the Chapter-4 retro about reconstructing three sessions from artifacts — don't repeat it).
- **The failure is the curriculum.** This chapter exists because the UI test caught a lie. Keep the STEP 0 screenshots; the before/after pair is the blog post ("My RAG chat fabricated an electricity bill") and the strongest STAR story in the pipeline so far.
- **Anti-pattern to resist:** patching the SYSTEM_PROMPT harder ("please REALLY don't invent totals") instead of removing the model's opportunity to invent. Prompts are pleas; architecture is enforcement.
- **Sunday metric:** numeric exact-match ≥ 9/10, verified-rate visible in the UI, faithfulness ≥ 0.90 held.

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering
> certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS
> Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the
> style and topic areas of those exams — not verbatim exam items. Each question is tagged to
> the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Retrieval architecture (Databricks GenAI focus)

*Scenario:* A finance chat answers "total food spending in April?" by retrieving the top-3 semantically-similar transactions and having the LLM sum them. April has 43 food transactions.

*Question:* What is the fundamental flaw?

- **A.** top_k is too low — raising it to 50 makes the sum reliable
- **B.** The embedding model is too small to encode amounts accurately
- **C.** A top-K retrieval result is a sample, and an aggregate over a sample cannot answer a population question — regardless of retrieval quality
- **D.** Cosine similarity should be replaced with dot product for numeric queries

<details>
<summary>Show answer</summary>

**C** — even perfect retrieval returns K rows, not all matching rows; SUM needs the population. A helps but never guarantees coverage and worsens LLM-arithmetic risk; B and D confuse similarity mechanics with the sampling problem.
*Maps to: Databricks GenAI Engineer · Application Development (retrieval design)*
</details>

### 2. Structured extraction safety (AI-102 focus)

*Scenario:* A query planner turns "pengeluaran makan bulan lalu" into filters. Two designs: (a) the LLM writes a SQL WHERE clause as text; (b) the LLM emits `{intent, date_from, date_to, categories}` where categories must come from a provided list, and trusted code compiles parametrized SQL.

*Question:* Why is (b) strongly preferred?

- **A.** (b) is cheaper because JSON tokens are shorter than SQL tokens
- **B.** (b) confines the model to typed, validatable choices — injection and invented column/category values are eliminated by construction, and the SQL stays parametrized
- **C.** (a) fails because LLMs cannot produce syntactically valid SQL
- **D.** (b) is required for Langfuse tracing to work

<details>
<summary>Show answer</summary>

**B** — the model decides *what* to query, never *how*; validation is a set-membership check. C is false (LLMs write valid SQL often — that's exactly the danger), A is marginal, D is unrelated.
*Maps to: Azure AI-102 · Implement generative AI solutions (grounding & safety)*
</details>

### 3. Numeric grounding (Databricks GenAI focus)

*Question:* In the shipped design, what guarantees the total shown to the user is correct even if the narration LLM disobeys its prompt?

- **A.** The response/`done` payload carries `total_idr` straight from the SQL result, and the UI renders that field — the prose never defines the figure
- **B.** temperature=0.0 makes the narration deterministic, so it cannot alter the number
- **C.** The RAGAS faithfulness gate blocks any answer scoring below 0.80
- **D.** The system prompt states the total must be repeated exactly

<details>
<summary>Show answer</summary>

**A** — the trust boundary is structural: data flows around the model, not through it. B reduces variance but not disobedience; D is a plea, not enforcement; C is an offline eval, not a runtime gate.
*Maps to: Databricks GenAI Engineer · Assembling & Deploying Applications*
</details>

### 4. Streaming guardrails (AWS MLE-A focus)

*Scenario:* An SSE endpoint streams free-text answers. You must catch fabricated citations without hurting time-to-first-token.

*Question:* Which design achieves both?

- **A.** Buffer the full generation server-side, validate, then send all tokens at once
- **B.** Validate each token against the context as it is generated
- **C.** Switch streaming off for all financial queries
- **D.** Forward tokens immediately while also buffering them; after the final token, validate the `[n]` markers against the sent contexts and report `verified` in the terminal event

<details>
<summary>Show answer</summary>

**D** — buffering-while-forwarding costs nothing at stream time; verification lands in the `done` event the client already waits for. A destroys TTFT, B is meaningless per-token (markers span tokens), C throws away the feature instead of fixing it.
*Maps to: AWS Certified ML Engineer – Associate · Deployment & Orchestration*
</details>

### 5. Money representation (GCP PMLE focus)

*Question:* The aggregator returns `Decimal(str(row["total"]))` in Python (and `decimal` in the C# twin). Why does money never ride in `float`?

- **A.** float is slower than Decimal for database sums
- **B.** IEEE 754 binary floats cannot represent most decimal fractions exactly — accumulated sums drift, and in finance a one-rupiah discrepancy is a correctness bug, not noise
- **C.** Postgres cannot cast NUMERIC to float
- **D.** JSON serializers reject float for currency fields

<details>
<summary>Show answer</summary>

**B** — the same rule as the Pydantic model conventions in [ai-service.md](../../rules/ai-service.md): `Decimal` for all monetary values. A is false (float is faster — and irrelevant), C and D are false.
*Maps to: Google Cloud PMLE · Data preparation & processing (numeric integrity)*
</details>

### 6. Intent routing vs agents (Databricks GenAI focus)

*Question:* The router here is one structured-extraction call plus an `if`. When does this design stop being enough, warranting a real tool-calling agent (Chapter 7)?

- **A.** When the category list exceeds the planner's context window
- **B.** When latency requires the planner to run on GPU
- **C.** As soon as more than two intents exist
- **D.** When answering requires *composing multiple steps whose sequence depends on intermediate results* — e.g. "compare March vs April" needs two aggregations plus a comparison the model must plan dynamically

<details>
<summary>Show answer</summary>

**D** — a fixed single-shot plan handles any *one* query shape; dynamic multi-step decomposition is what tool-calling loops are for. C alone is just a bigger enum; A and B are capacity concerns, not architecture triggers.
*Maps to: Databricks GenAI Engineer · Application Development (agents & orchestration)*
</details>

## STEP 0 baseline

> **⏳ Not captured live (2026-07-09).** The Supabase stack was unavailable in the execution
> environment (no `supabase start` / docker; port 8000 and 54322 both unreachable), so the three
> baseline outputs could not be recorded. This does **not** block the code steps — every unit test
> mocks the DB and provider — but the headline before/after ("~0/10 numeric exact-match → ≥ 9/10")
> still needs the pinned `0` measured on a live stack. Run these when the stack is up and paste the
> outputs here:
>
> ```bash
> # 1) Ground truth the chat contradicted (expect 43 | 2309954):
> docker exec supabase_db_personal-finance psql -U postgres -d postgres -c \
>   "SELECT COUNT(*), SUM(amount_idr) FROM transactions
>    WHERE category='Food' AND flow='DB' AND date >= '2024-04-01' AND date < '2024-05-01';"
>
> # 2) Failing behavior via the guarded non-streaming endpoint (unfiltered — expect wrong/refusal):
> curl -s -X POST http://localhost:8000/ask -H "Content-Type: application/json" \
>   -d '{"query": "berapa pengeluaran makan bulan april 2024?"}' | python -m json.tool
>
> # 3) Same query WITH filters (proves the plumbing — but a top-10 of 43 rows is still a sample,
> #    so the TOTAL is still wrong; this is the motivation for STEP 3's SQL aggregation):
> curl -s -X POST http://localhost:8000/ask -H "Content-Type: application/json" \
>   -d '{"query": "berapa pengeluaran makan bulan april 2024?", "top_k": 10,
>        "category": "Food", "date_from": "2024-04-01", "date_to": "2024-04-30"}' | python -m json.tool
> ```
>
> **Expected finding (the design premise this chapter is built on):** unfiltered → wrong number or
> a false "April doesn't exist" refusal; filtered → retrieval now looks in the right place but the
> *total* is still wrong because summing a top-10 sample of 43 rows is not the population sum.
> After PART 2, the same question routes to `SELECT SUM(amount_idr) … WHERE …` and returns exactly
> Rp 2,309,954. The fastest post-infra check of the whole chapter is
> `PYTHONPATH=. python evals/eval_numeric_accuracy.py`.
