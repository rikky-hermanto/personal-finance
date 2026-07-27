# AI Observability Metrics — Personal Finance Platform

**Captured:** 2026-05-31  
**Tool:** Langfuse Cloud (https://cloud.langfuse.com)  
**Provider:** Gemini 2.5 Flash (primary) / Claude Sonnet 4.6 (alternate)

## Extraction Pipeline Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Average cost per document | $0.00 | Full PDF statement, ~Xk tokens input |
| p50 latency | 19.02ms | Median extraction time |
| p95 latency | 32.65ms | Tail latency (slow statements) |
| Error rate | 0% | Captured in Langfuse error level |

## Provider Comparison (preliminary)

| Provider | Cost/doc | p50 Latency | p95 Latency |
|----------|----------|-------------|-------------|
| Gemini 2.5 Flash | $X.XXX | 19.02ms | 32.65ms |
| Claude Sonnet 4.6 | $X.XXX | Xms | Xms |

## Interview-ready numbers

1. "Extraction costs **$X.XXX per document** on Gemini 2.5 Flash"
2. "p95 extraction latency is **Xms** — measured via Langfuse tracing on real bank statements"
3. "Gemini is **X% cheaper** than Anthropic on our structured extraction workload"

_Numbers will be refined in Week 2 eval harness benchmarks._

## Embedding Pipeline Metrics (PF-AI003 — Week 3)

| Metric | Value | Notes |
|--------|-------|-------|
| Embedding model | `text-embedding-3-small` | OpenAI, 1536 dimensions |
| Cost per document | ~$0.000002 | ~100 tokens/doc × $0.02/1M tokens |
| Full corpus cost (5,000 docs) | ~$0.01 | One-time backfill cost |
| p50 embed latency (batch 50) | — | To be measured after backfill |
| p95 embed latency (batch 50) | — | To be measured after backfill |
| Search p50 latency | ~640ms | Median over 7 queries (2026-06-12) |
| Search p95 latency | ~1900ms | Tail = cold start (first OpenAI embed + asyncpg connect) |
| Search warm latency | ~420–730ms | After connection pool + client warm |
| **MRR@5 baseline** | **0.476** | Set-based relevance, naive dense retrieval (2026-06-12) |
| Hit@5 | 0.57 | 4 of 7 queries surface ≥1 relevant result in top-5 |
| P@5 | 0.26 | Fraction of top-5 that are relevant |

### Chapter-3 retrieval baseline (2026-06-12) — set-based relevance

**MRR@5 = 0.476 · Hit@5 = 0.57 · P@5 = 0.26** (macro avg over 7 queries), naive dense
retrieval, `text-embedding-3-small`, no re-ranking, no hybrid search.

**Eval methodology — set-based, not exact-ID.** An earlier exact-ID run scored 0.00 — but
the hand-labeled IDs were *real and relevant*; the 0.00 was an **eval-design artifact**, not a
retrieval failure. This corpus has many near-duplicate transactions (36 Electricity, 317
Groceries, 32 Salary), so exact-ID matching scores a valid retrieval as a miss whenever it
surfaces a *different* correct transaction than the one labeled. The eval was rewritten so a
query's relevant set is **rule-defined** (`category` match ∪ `description ILIKE`), computed
against the live DB — measuring "did the top-K surface a transaction of the right *kind*?".

**Per-query failure profile (this is the Chapter-4 to-do list):**

| Query | Hit | MRR | Read |
|-------|-----|-----|------|
| belanja grocery minimarket | ✅ | 1.00 | Well-described merchants (Grandlucky, Dapur Prima) — dense retrieval excels |
| gaji bulanan salary | ✅ | 1.00 | Finds one then drifts (P@5 0.20) |
| coffee kedai kopi Fore | ✅ | 1.00 | Same — rank-1 hit, low precision |
| bayar kontrakan | ✅ | 0.33 | Small relevant set (9), first hit at rank 3 |
| tagihan listrik PLN | ❌ | 0.00 | Terse one-word `Listrik` carries weak semantic signal |
| Netflix Spotify streaming | ❌ | 0.00 | Subscriptions paid via opaque `TRSF E-BANKING DB` codes |
| investasi saham Mansek | ❌ | 0.00 | Brokerage transfers hidden in transfer-out codes |

**Interview number:** "Naive dense retrieval gets MRR@5 0.48 on my finance corpus. It nails
well-described categories — groceries scored a perfect 1.0 — but misses terse Indonesian bank
codes like single-word 'Listrik'. That failure profile is exactly why hybrid keyword+vector
search is the next iteration: BM25 catches the literal tokens dense embeddings drop."

_Search latency numbers above are real query round-trips. Re-run: `PYTHONPATH=. python evals/eval_retrieval.py`._

## Retrieval Architecture (PF-AI003)

- **Table:** `transaction_embeddings` (pgvector 1536-dim, ivfflat index, cosine distance)
- **Embed text:** `description | remarks | category | wallet` — category adds semantic signal for terse bank codes
- **Index:** ivfflat (lists=100); switch to hnsw at ~100k+ rows
- **Endpoint:** `POST /embed-transactions` (batch upsert), `POST /search` (cosine similarity top-K)

## RAG Phase 2 (PF-AI004) — re-ranking + generation

| Metric | Value |
|--------|-------|
| MRR@5 baseline (Chapter 3, corrupted — ivfflat probes=1 bug) | 0.476 |
| MRR@5 after probes=10 fix (real Chapter 3 baseline) | 1.000 |
| P@5 baseline (top-5 cosine, probes=10) | 0.657 |
| P@5 reranked (top-10 → FlashRank → top-5) | 0.600 (2026-06-23, live) |
| P@5 re-ranking lift | **-0.057** (negative — see finding below) |
| MRR@5 reranked | 0.857 (2026-06-23, live — dropped from 1.000, see finding below) |
| /ask retrieval_ms (p50) | ~887ms (5-question smoke test, 2026-07-03) |
| /ask generation_ms (p50) | ~2683ms (5-question smoke test, 2026-07-03) |
| RAGAS faithfulness (5 answers, gpt-4o-mini judge) | **0.900** (2026-07-01, Gemini generator) |

**✅ Update (2026-07-01) — STEP 10 faithfulness measured live.** The earlier blocker notes were
resolved: Docker Desktop started cleanly, `supabase start` brought Postgres up (4,467 transactions,
all embedded), and `ragas` installed fine once pinned to the **0.2 line** (`ragas>=0.2,<0.3` +
`langchain-openai>=0.2,<0.3`). The prior "scikit-network needs MSVC" diagnosis was **incorrect** —
the real install failure was an unbounded `>=0.2` resolving to `ragas 0.4.x` + `langchain 1.x`
(mutually incompatible), plus a venv polluted with Python-3.14 wheels in a 3.11 venv. `eval_faithfulness.py`
now runs end-to-end with a cross-provider judge (Gemini generates, gpt-4o-mini scores):

| Question | Faithfulness | Note |
|----------|-------------|------|
| total pengeluaran makan Maret 2025 | 1.00 | grounded |
| kapan terakhir bayar listrik PLN | 1.00 | grounded |
| pengeluaran kopi Maret 2025 | 1.00 (refusal) | correct — 0 coffee rows in March 2025 |
| biggest expense March 2025 | 0.50 | **finding:** superlative/aggregation questions are a known RAG weakness — semantic top-3 ≠ actual max amount, so the "biggest" claim isn't fully supported by the 3 retrieved contexts |
| sewa apartemen 2031 (adversarial) | 1.00 (refusal) | canary passed — `confident=false`, no invented number |

**Mean faithfulness = 0.900** (target ≥ 0.80). Refusals score 1.0 (a no-data refusal makes zero
claims → vacuously faithful); RAGAS returns 0/NaN on empty context, so the eval special-cases them.

Three real bugs surfaced only by running the pipeline live (mocked unit tests couldn't catch them):
1. **Marker-vs-id citation bug** — the LLM put the `[2]` context marker into `cited_transaction_ids`
   instead of the real `id=24561`, so the hallucination guard dropped every citation. Fixed by
   disambiguating `SYSTEM_PROMPT` (`answerer.py`).
2. **asyncpg date-binding bug** — `RetrievalService.search()` passed date *strings* to a `$n::date`
   parameter; asyncpg's date codec expects `datetime.date` (`'str' object has no attribute
   'toordinal'`). Fixed with `date.fromisoformat()` (`retriever.py`).
3. **Fixture year mismatch** — `ask_questions.json` targeted March 2026 (0 rows); data runs
   2024-01 → 2026-01. Retargeted to March 2025.

**🤔⁉️ Finding (2026-06-23) — re-ranking produced a *negative* delta on Indonesian queries.**
`eval_retrieval.py --rerank` (retrieve top-10 → FlashRank `ms-marco-MiniLM-L-12-v2` → top-5)
moved P@5 from 0.657 → 0.600 (**-0.057**) and MRR@5 from 1.000 → 0.857. The `gaji bulanan salary
income` query collapsed from MRR=1.00 to MRR=0.00 — the cross-encoder demoted every relevant
salary/income result out of the top-5 entirely. Root cause: `ms-marco` is trained on English MS
MARCO passages and doesn't recognize Indonesian financial vocabulary as relevant; the bi-encoder
(OpenAI `text-embedding-3-small`) is multilingual and was already ranking correctly, and the
English-only cross-encoder overrode that correct ranking with wrong scores. See plan STEP 5 for
the full per-query table. Next step (not yet done): swap to FlashRank's multilingual model and
re-run.

**✅ Update (2026-07-03) — `/ask` live smoke test + Langfuse trace confirmed (plan STEP 9).**
Ran all 5 questions from `ask_questions.json` against the live service (Supabase up, 4,467
embedded transactions):

| Question | Result |
|----------|--------|
| total pengeluaran makan Maret 2025 | ✅ confident=true, Rp 77,200 from 2 cited transactions |
| kapan terakhir bayar listrik PLN | ✅ confident=true, cites the correct 2025-03-06 Rp 1,004,800 row |
| pengeluaran kopi Maret 2025 | confident=false — retrieval genuinely found no strong coffee match that month (consistent with STEP 10's faithfulness run) |
| biggest expense March 2025 | ✅ confident=true, cites Rp 61,136 Wise transfer fee |
| sewa apartemen 2031 (adversarial) | ✅ confident=false, no invented number — canary passed |

Queried the Langfuse public API (`GET /api/public/traces`, `GET /api/public/observations`)
directly and confirmed `POST /ask` traces land with a nested `gemini-generate-json` GENERATION
observation carrying `cost_usd`, token usage, and latency per call — tracing works end-to-end with
zero new code, exactly as `AnswerService` calling the existing `provider.generate_json()` predicted.
`/ask retrieval_ms` and `generation_ms` p50 above are the median across these 5 live calls.

**What is verified (2026-07-03):** every number in the table above is now a real, live measurement
— `chunker.py`, `reranker.py`, `answerer.py`, and `retriever.py` pass their unit-test suites, and
`eval_retrieval.py --rerank`, `eval_faithfulness.py`, and `POST /ask` have all been run against
real Supabase data with real provider calls. No blanks remain in the table; the infrastructure gap
noted in earlier sessions (Docker/Supabase unavailable) is resolved.

**One real (non-mocked) data point obtained without a DB:** `RerankerService` was run for real
(actual FlashRank `ms-marco-MiniLM-L-12-v2` inference, no mocks) against three hand-picked
candidates for the query `"makan"` — see [evals/README.md § Re-ranking mental model](../../services/ai-service/evals/README.md).
The model ranked an irrelevant `"MAKANAN TERNAK SAPI BERKAH"` (cattle feed) **above** the relevant
`"GOFOOD GEPREK BENSU GADING"` (food delivery) — concrete evidence that the English-trained
cross-encoder mishandles this Indonesian lexical-overlap case. This doesn't replace the full
`--rerank` eval (one query, three hand-picked candidates, no aggregate P@5), but it's a real
signal — worth checking against the multilingual FlashRank model if the full eval's lift
disappoints.
- **Interview number:** "Embedding costs ~$0.000002/doc on text-embedding-3-small; 5,000 transactions = $0.01 total"

## RAG Answer Accuracy (PF-AI005 PART 2) — query routing + deterministic aggregation

**Why this section exists.** A 2026-07-08 UI test caught the streaming chat fabricating a
February PLN total (Rp 400,500 from rows summing to Rp 96,800) and *denying* April food spending
that the DB holds (43 rows, Rp 2,309,954). Root cause was architectural: every question — including
"how much did I spend on X" — was answered by summing the top-3 semantically-similar rows, and the
streaming path had no citation guard. PART 2 routes aggregation questions to SQL so the number is
computed by Postgres, never the model.

### Numeric exact-match — before/after

| Run | Numeric exact-match (aggregate set) | Method |
|-----|-------------------------------------|--------|
| **Before (by construction)** | **~0/10** | top-K RAG summed a 3-row *sample* of the population — a sum over a sample is not the sum; no K guarantees coverage |
| **After (target)** | **≥ 9/10** | `AggregationService` runs parametrized `SUM(amount_idr)` over the whole `transactions` table; the LLM only narrates a precomputed figure |

**Harness:** [`evals/eval_numeric_accuracy.py`](../../services/ai-service/evals/eval_numeric_accuracy.py)
over [`evals/ask_numeric_questions.json`](../../services/ai-service/evals/ask_numeric_questions.json)
(10 aggregate questions + 1 lookup routing control). Ground truth is computed **live** by the
harness with its own independent SQL — never asserted against `AggregationService`'s own output —
and matched on integer rupiah (money is right or wrong; there is no "close"). Run:
`PYTHONPATH=. python evals/eval_numeric_accuracy.py`.

> **⏳ Live measurement pending (2026-07-09).** Code + unit tests are complete and green
> (`test_query_planner.py`, `test_aggregator.py`, `test_answerer.py`, `test_streaming.py` — 25
> passed, no real LLM/DB). The before/after numeric run, planner-latency p50, `/ask/stream`
> verified-rate, and the Langfuse two-GENERATION-per-trace confirmation require the Supabase stack
> up (unavailable in this session). Fill the numbers below on the next run with infra up.

| Metric | Value | Notes |
|--------|-------|-------|
| Numeric exact-match (before) | _pending_ | expect ~0/10 — the pinned baseline (STEP 0) |
| Numeric exact-match (after) | _pending_ | target ≥ 9/10 |
| Routing correct (intent) | _pending_ | 11/11 expected incl. the lookup control |
| Planner latency p50 | _pending_ | added cost of routing — expect ~300–600 ms (one Flash/Haiku-class call) |
| `/ask/stream` verified-rate | _pending_ | share of lookup answers whose `[n]` markers all map to sent contexts |
| RAGAS faithfulness (re-run) | _pending_ | should hold ≥ 0.90 — aggregate answers are now grounded by construction |

**The transferable pattern:** money rides in the response/`done` payload (`total_idr`, straight from
SQL); the prose is decoration. Even a disobedient narration ("Rp 999.999") cannot corrupt what the
UI renders, because the UI reads the payload field — the trust boundary is structural, not a prompt
plea. This is the same shape as PF-AI004's "citations validated against the context actually sent."

**Langfuse (zero new tracing code):** each `/ask` now emits **two** GENERATION observations per trace
— the planner's `generate_json` classification and the answer's `generate_json`/`stream_generate`
narration — both free via the existing provider abstraction (PF-AI001 rails). Per-question cost now
includes the one extra small planner call.

## Advanced RAG Patterns — Hybrid Search (PF-AI006)

**Re-scope note (2026-07-23):** this chapter was cut down to hybrid search only. Sentence-window
retrieval and auto-merging (the other two techniques originally planned) are deferred to
[PF-AI006-PART2](../../.claude/plans/learning/PF-AI006-PART2-sentence-window-automerging-todo.md) —
they need a new data source (statement PDF narrative text) that isn't yet a product requirement.

**What shipped:** `RetrievalService.search()` gained `bm25` (PostgreSQL `tsvector` + `ts_rank`,
`simple` config, GIN index on `transactions.description_tsv`) and `hybrid` (Reciprocal Rank Fusion,
k=60, merging the vector and bm25 ranked ID lists) modes alongside the existing `vector` path.
`SearchRequest.search_mode` **stays defaulted to `vector`** — see the finding below; the `/ask`
lookup path is unchanged.

**5 adversarial queries added** to `search_queries.json` (PLN keyword-exact, English-language
coffee query, semantic-paraphrase lunch query, date-crossing query, adversarial "suspicious
transfer" query with no matching vocabulary) — designed so BM25 and vector each get a query they
should individually win, per the "adversarial eval design" principle (a homogeneous eval set can't
reveal complementarity).

**✅ Live measurement (2026-07-24)** — local Supabase started (Docker was down earlier this
session; both pending migrations, including `20260724000001_hybrid_search.sql`, applied and
verified: `description_tsv` column + GIN index present, 4,467 transactions/embeddings intact).
`PYTHONPATH=. python evals/eval_retrieval.py --all` run against real data:

| Mode | MRR@5 | P@5 | Hit@5 | p50 latency |
|------|-------|-----|-------|-------------|
| **vector** (default) | **0.771** | **0.533** | 0.83 | 726ms |
| hybrid | 0.750 | 0.467 | 0.75 | 689ms |
| vector+rerank | 0.625 | 0.467 | 0.67 | 705ms |
| hybrid+rerank | 0.558 | 0.483 | 0.67 | 746ms |
| bm25 | 0.433 | 0.333 | 0.50 | 137ms |

**🤔⁉️ Finding — hybrid search UNDERPERFORMS pure vector on this corpus.** The plan's working
assumption (RRF-merged BM25+vector beats pure vector on term-rich Indonesian descriptions) does not
hold here. Per-query breakdown shows why: on `tagihan listrik PLN bulan Maret`, plain vector already
scores a perfect P@5=1.00 (the stored embedding text is `description | remarks | category | wallet`
— the `Electricity`/`Listrik` category tag already gives the embedding strong signal, so BM25's
exact-keyword advantage is redundant here, not additive). RRF's merge then pulls bm25's *other*,
noisier keyword matches into the fused top-5, **displacing** vector hits that were already correct
— e.g. `makan siang di kantor` drops from vector MRR=0.25 to hybrid MRR=0.00 because bm25 has zero
real matches for that query (no "makan"/"warung" keyword overlap) yet still contributes candidate
IDs that get merged in. `bm25` alone is the weakest of the three (MRR 0.433) — most eval queries are
semantic/category-based (`grocery`, `salary`, `subscription`) with no literal keyword in the actual
descriptions, so BM25 has nothing to match. **Root cause: this specific corpus's embedding scheme
already encodes the category tag that made BM25 look necessary in the Chapter-3 qualitative
analysis — hybrid search would help more on a corpus where descriptions are the *only* signal (e.g.
raw statement text without a category column).** `search_mode="hybrid"`/`"bm25"` are kept in
`RetrievalService` and exposed via `SearchRequest` for future use (e.g. once sentence-window
document search in PART2 lacks a category tag to lean on), but the production default stays
`vector` — flipping it would have been shipping an assumption instead of a measurement, exactly the
mistake the plan's own "adversarial eval design" section warns against.

**Migration:** `supabase/migrations/20260724000001_hybrid_search.sql` — applied and verified via
`supabase db push` + a direct asyncpg query confirming `description_tsv` (tsvector, generated
column) and `idx_transactions_description_tsv` (GIN) both exist on `transactions`.

**Bug found and fixed during live testing:** the original bm25 implementation used
`plainto_tsquery`, which ANDs every query word — a 5-word natural-language question
(`"tagihan listrik PLN bulan Maret"`) never matches a 2-4 word bank description in full, so `bm25`
mode returned **zero results for every query** until this was caught by the live eval (mocked unit
tests couldn't catch it — they assert SQL shape, not real match behavior). Fixed by OR-joining
tokens before calling `to_tsquery` (`retriever.py::_to_or_tsquery`) — `ts_rank` still weights rows
with more matched terms higher, so this approximates real BM25 (score on any term, weighted by
frequency/rarity) instead of a boolean AND filter. This is the same category of "mocked tests pass,
real pipeline reveals the bug" finding already on record above for the citation-marker and
asyncpg-date-binding bugs.