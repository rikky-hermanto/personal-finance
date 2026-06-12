# RAG Embeddings & Semantic Search — How To Use

Operational guide for the PF-AI003/PF-AI003b retrieval pipeline: embedding transactions, backfilling, semantic search, and running the MRR@5 benchmark.

> **What this covers:** the `transaction_embeddings` pipeline — `EMBEDDING_PROVIDER` (OpenAI or Gemini) → pgvector cosine search.
> Extraction (PDF/image → transactions) is a separate flow — see [LLM-endpoint-test.md](LLM-endpoint-test.md).

---

## How it fits together

```
transactions table ──┐
                     ├─► EmbeddingService.embed_and_store()
accounts (wallet) ───┘        │  EmbeddingProvider (OpenAI or Gemini, 1536 dims)
                              ▼
                    transaction_embeddings  (pgvector, ivfflat index, model column)
                              ▲
query text ──► RetrievalService.search()  ──► ranked SearchResult[]
               embeds query (same provider), WHERE te.model = <active model>
               runs `<=>` cosine SQL, LEFT JOIN accounts
```

- **Embed on upload (live):** `TransactionsController.SubmitTransactions` fires a fire-and-forget `POST /embed-transactions` after insert. New transactions get embedded automatically with the active provider.
- **Backfill (one-off):** `scripts/backfill_embeddings.py` embeds every transaction missing an embedding OR whose stored model differs from the active model.
- **Search:** `POST /search` (or `RetrievalService` directly) for semantic lookup — only searches vectors from the active embedding model.

---

## Prerequisites

| Requirement | Why | Check |
|-------------|-----|-------|
| Local Supabase running | `database_url` points at `127.0.0.1:54322` | `supabase status` |
| `EMBEDDING_PROVIDER` set | Selects which provider embeds your vectors | see `.env` |
| Matching API key set | `GEMINI_API_KEY` (gemini) or `OPENAI_API_KEY` (openai) | see `.env` |
| Venv installed | `openai`, `google-genai`, `asyncpg`, `pgvector` deps | `pip install -e ".[dev]"` |
| Transactions exist in DB | Nothing to embed otherwise | Supabase Studio → `transactions` |

`services/ai-service/.env` keys used by this pipeline (see [app/config.py](../app/config.py)):

```ini
# Gemini (default — same key as AI_PROVIDER=gemini)
EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key-here
# EMBEDDING_MODEL=gemini-embedding-001   # optional override

# OpenAI (alternative)
# EMBEDDING_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# EMBEDDING_MODEL=text-embedding-3-small  # optional override

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
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

**Dry run first** — counts missing + model-mismatch transactions, hits no API, spends nothing:

```powershell
python scripts/backfill_embeddings.py --dry-run
```

Expected output:

```
Active embedding model : gemini-embedding-001
Missing embeddings     : 4823
Model-mismatch rows    : 0

Dry run — not embedding anything.
```

**Run for real** — embeds in batches of 50 (override with `--batch-size`):

```powershell
python scripts/backfill_embeddings.py
# or: python scripts/backfill_embeddings.py --batch-size 100
```

```
Active embedding model : gemini-embedding-001
Missing embeddings     : 4823
Model-mismatch rows    : 0

Embedding 4823 transactions using gemini-embedding-001 ...
Batch 1: embedded=50, skipped=0
Batch 2: embedded=50, skipped=0
...
Done.
```

Idempotent — re-running only embeds rows still missing or mismatched. Safe to interrupt and resume.

**Cost:**
- Gemini: **free** (free tier, no per-token charge).
- OpenAI: ~$0.000002/doc (≈100 tokens × $0.02/1M). A 5,000-transaction backfill ≈ **$0.01**.

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
Provider: gemini | Model: gemini-embedding-001
Query                                               MRR  Latency  Top-3 IDs
------------------------------------------------------------------------------------------
tagihan listrik PLN bulan Maret                    1.00     142ms  [24561, 24890, 23001]
gaji bulanan salary income                         0.50     128ms  [22118, 22201, 22247]
...
MRR@5 (macro avg)                                  0.714
Target: >= 0.60 this week, >= 0.80 after Week 4 re-ranking
```

The **Provider / Model** header line makes MRR@5 numbers attributable to a specific provider — useful when comparing across a provider switch (eval → switch → backfill → eval again).

---

## Step 5 — Log the numbers

Record MRR@5 + p50/p95 latency in [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md):

- Provider + model name
- MRR@5 (macro avg)
- p50 / p95 search latency (ms)
- cost/doc and total backfill cost

---

## Switching providers

To switch from one embedding provider to another (e.g. OpenAI → Gemini):

1. **Set `EMBEDDING_PROVIDER`** in `.env`:
   ```ini
   EMBEDDING_PROVIDER=gemini
   GEMINI_API_KEY=your-gemini-key-here
   ```

2. **Dry-run the backfill** to see what will be replaced:
   ```powershell
   python scripts/backfill_embeddings.py --dry-run
   ```
   Output will show the mismatch count with the old model name.

3. **Run backfill** — the script prints a destructive-action warning and requires confirmation:
   ```
   WARNING: Found 4823 embeddings from model(s) ['text-embedding-3-small'].
   Active model is 'gemini-embedding-001'. ALL 4823 existing embeddings will be replaced.
   Proceed? [y/N]
   ```
   Type `y` to continue, or `n` to abort. Use `--yes` to skip the prompt in non-interactive use.

4. **Re-run the eval** to measure MRR@5 under the new provider.

> **Why re-embed everything?** Vectors from different embedding models live in incompatible geometric spaces. A Gemini vector compared against an OpenAI vector gives a meaningless cosine distance. The `WHERE te.model = <active_model>` filter in the retriever guards against cross-model comparisons during the transition — search results shrink until backfill completes.

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

Returns ranked `SearchResult[]` with `transaction_id`, `description`, `wallet`, and cosine `similarity`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Found 0 transactions without embeddings` | Already backfilled, or empty `transactions` table | Verify data in Supabase Studio; this is normal after a successful run |
| `asyncpg ... Connection refused` | Local Supabase not running | `supabase start`; confirm `DATABASE_URL` port `54322` |
| `openai.AuthenticationError` | `OPENAI_API_KEY` missing/invalid | Set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` in `.env` |
| `ValueError: GEMINI_API_KEY is not set` | Gemini provider selected but key missing | Set `GEMINI_API_KEY` in `.env` |
| `WARNING: EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set` | Key missing for active embedding provider | Add the matching API key to `.env` |
| `WARNING: N queries have no expected_top5_ids` | Placeholder IDs not replaced | Fill `evals/search_queries.json` (Step 3) |
| Low MRR despite correct IDs | Backfill didn't run / wrong IDs / wrong model | Re-run Step 2; re-verify IDs in Studio; check eval header for model name |
| `ModuleNotFoundError: app` | Wrong working dir | Run from `services/ai-service` with `PYTHONPATH=.` |
| Zero results from `/search` after provider switch | Backfill incomplete — retriever filters by active model | Complete the backfill with `python scripts/backfill_embeddings.py` |

---

## Related docs

- [LLM-endpoint-test.md](LLM-endpoint-test.md) — extraction endpoint testing
- [langfuse-integration.md](langfuse-integration.md) — AI cost/latency tracing
- [evals/README.md](../evals/README.md) — embedding mental model + eval harness notes
- [.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) — PF-AI003 build plan
- [.claude/plans/learning/PF-AI003b-embedding-provider-toggle.md](../../../.claude/plans/learning/PF-AI003b-embedding-provider-toggle.md) — PF-AI003b provider toggle plan
