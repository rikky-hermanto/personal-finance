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
| P@5 baseline (top-5 cosine, probes=10) | 0.66 |
| P@5 reranked (top-10 → FlashRank → top-5) | **not measured — see note below** |
| P@5 re-ranking lift | **not measured** |
| MRR@5 reranked (expected: no change — already 1.000) | **not measured** |
| Re-rank latency added per query | **not measured** |
| /ask retrieval_ms (p50) | **not measured** |
| /ask generation_ms (p50) | **not measured** |
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

**Still open (separate session):** `eval_retrieval.py --rerank` P@5 was last measured 2026-06-23
(reranked P@5 = 0.600 vs 0.657 baseline — negative delta, English-only ms-marco on Indonesian
queries; see plan STEP 5). `/ask` p50 latency split not yet captured.

**What *is* verified:** `chunker.py`, `reranker.py` (FlashRank, real cross-encoder, mocked only
at the `Ranker` boundary in unit tests), `answerer.py`, and the `retriever.py` SQL-filter compiler
all pass their full unit-test suites against real logic — only the network/DB/judge-LLM calls are
mocked. The code is ready to produce these numbers; running `eval_retrieval.py --rerank` once
Supabase is up, and `eval_faithfulness.py` once `ragas` is installed (requires MSVC Build Tools or
a non-Windows dev box), will fill in this table. Do not treat the blanks above as "0" or "skipped
intentionally" — they are an infrastructure gap, not a design decision.

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