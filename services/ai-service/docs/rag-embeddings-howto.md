# RAG Embeddings & Semantic Search — How To Use

Operational guide for the PF-AI003 retrieval pipeline: embedding transactions, backfilling, semantic search, and running the MRR@5 benchmark.

> **What this covers:** the `transaction_embeddings` pipeline — OpenAI `text-embedding-3-small` → pgvector cosine search.
> Extraction (PDF/image → transactions) is a separate flow — see [LLM-endpoint-test.md](LLM-endpoint-test.md).

---

## How it fits together

```
transactions table ──┐
                     ├─► EmbeddingService.embed_and_store()
accounts (wallet) ───┘        │  OpenAI text-embedding-3-small (batched)
                              ▼
                    transaction_embeddings  (pgvector, ivfflat index)
                              ▲
query text ──► RetrievalService.search()  ──► ranked SearchResult[]
               embeds query, runs `<=>` cosine SQL, LEFT JOIN accounts
```

- **Embed on upload (live):** `TransactionsController.SubmitTransactions` fires a fire-and-forget `POST /embed-transactions` after insert. New transactions get embedded automatically.
- **Backfill (one-off):** `scripts/backfill_embeddings.py` embeds every transaction that has no row in `transaction_embeddings` yet.
- **Search:** `POST /search` (or `RetrievalService` directly) for semantic lookup.

---

## Prerequisites

| Requirement | Why | Check |
|-------------|-----|-------|
| Local Supabase running | `database_url` points at `127.0.0.1:54322` | `supabase status` |
| `OPENAI_API_KEY` set in `services/ai-service/.env` | Embeddings call OpenAI | see `.env` |
| Venv installed | `openai`, `asyncpg`, `pgvector` deps | `pip install -e ".[dev]"` |
| Transactions exist in DB | Nothing to embed otherwise | Supabase Studio → `transactions` |

`services/ai-service/.env` keys used by this pipeline (see [app/config.py](../app/config.py)):

```ini
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small          # default, optional
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres   # local Supabase default
```

---

## Step 1 — Activate the venv

All commands run from `services/ai-service` with the venv active.

```powershell
cd services/ai-service
.venv\Scripts\activate          # PowerShell / Windows
# source .venv/bin/activate     # macOS / Linux
```

---

## Step 2 — Backfill embeddings

The script auto-adds the repo root to `sys.path`, so `PYTHONPATH` is optional when run from `services/ai-service`.

**Dry run first** — counts transactions missing embeddings, hits no API, spends nothing:

```powershell
python scripts/backfill_embeddings.py --dry-run
```

Expected output:

```
Found 4823 transactions without embeddings.
Dry run — not embedding anything.
```

**Run for real** — embeds in batches of 50 (override with `--batch-size`):

```powershell
python scripts/backfill_embeddings.py
# or: python scripts/backfill_embeddings.py --batch-size 100
```

```
Found 4823 transactions without embeddings.
Batch 1: embedded=50, skipped=0
Batch 2: embedded=50, skipped=0
...
```

Idempotent — re-running only embeds rows still missing from `transaction_embeddings`. Safe to interrupt and resume.

**Cost:** ~$0.000002/doc (≈100 tokens × $0.02/1M). A full 5,000-transaction backfill ≈ **$0.01**.

---

## Step 3 — Fill the eval query set with real IDs

`evals/search_queries.json` ships with placeholder IDs. Replace `expected_top5_ids` with real transaction IDs that *should* be the top matches for each query.

How to find them:

1. Supabase Studio → `http://localhost:54323` → Table Editor → `transactions`
2. Filter by `description` / `category` matching the query intent (e.g. salary, PLN, Netflix)
3. Copy the `id` values into the matching query's `expected_top5_ids` array

```json
{
  "query": "tagihan listrik PLN bulan Maret",
  "expected_top5_ids": [24561, 24890],
  "note": "PLN electricity bill — Bills & Utilities."
}
```

A query with an empty `expected_top5_ids` is skipped and scores 0 — the runner warns you which ones are unfilled.

---

## Step 4 — Run the MRR@5 benchmark

```powershell
$env:PYTHONPATH = "."
python evals/eval_retrieval.py
```

Output:

```
Query                                               MRR  Latency  Top-3 IDs
------------------------------------------------------------------------------------------
tagihan listrik PLN bulan Maret                    1.00     142ms  [24561, 24890, 23001]
gaji bulanan salary income                         0.50     128ms  [22118, 22201, 22247]
...
MRR@5 (macro avg)                                  0.714
Target: >= 0.60 this week, >= 0.80 after Week 4 re-ranking
```

**MRR@5** = mean reciprocal rank: `1/rank` of the first relevant hit in each query's top-5, averaged across queries. `1.00` = relevant result ranked #1; `0.50` = ranked #2; `0.00` = no relevant hit in top-5.

**Target: ≥ 0.60.** If below, check that the backfill actually ran and `expected_top5_ids` are correct before tuning the query/embedding.

---

## Step 5 — Log the numbers

Record MRR@5 + p50/p95 latency in [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md):

- MRR@5 (macro avg)
- p50 / p95 search latency (ms)
- cost/doc and total backfill cost

---

## Live endpoints

With the service running (`uvicorn app.main:app --reload --port 8000`):

### `POST /embed-transactions`

Embed a batch of transactions (called automatically on upload; also usable manually).

```bash
curl -X POST http://localhost:8000/embed-transactions \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"transaction_id": 24561, "description": "PLN PASCABAYAR", "remarks": "", "category": "Bills & Utilities", "wallet": "BCA"}
    ]
  }'
```

### `POST /search`

Semantic search over embedded transactions.

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "tagihan listrik PLN", "top_k": 5}'
```

Returns ranked `SearchResult[]` with `transaction_id`, `description`, `wallet`, and cosine `score`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Found 0 transactions without embeddings` | Already backfilled, or empty `transactions` table | Verify data in Supabase Studio; this is normal after a successful run |
| `asyncpg ... Connection refused` | Local Supabase not running | `supabase start`; confirm `DATABASE_URL` port `54322` |
| `openai.AuthenticationError` | `OPENAI_API_KEY` missing/invalid | Set it in `services/ai-service/.env` |
| `WARNING: N queries have no expected_top5_ids` | Placeholder IDs not replaced | Fill `evals/search_queries.json` (Step 3) |
| Low MRR despite correct IDs | Backfill didn't run / wrong IDs | Re-run Step 2; re-verify IDs in Studio |
| `ModuleNotFoundError: app` | Wrong working dir | Run from `services/ai-service` with `PYTHONPATH=.` |

---

## Related docs

- [LLM-endpoint-test.md](LLM-endpoint-test.md) — extraction endpoint testing
- [langfuse-integration.md](langfuse-integration.md) — AI cost/latency tracing
- [evals/README.md](../evals/README.md) — embedding mental model + eval harness notes
- [.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) — full PF-AI003 build plan
