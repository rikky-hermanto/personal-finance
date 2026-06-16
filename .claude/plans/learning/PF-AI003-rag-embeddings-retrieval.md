# PF-AI003 — RAG Phase 1: Embeddings + Semantic Search

> **Learning Phase:** Phase 1 · Week 3 of 12 · Day ~10 of 90
> **Status:** IN PROGRESS
> **Started:** 2026-06-06
> **Pivot goal:** Close the "can you build a RAG pipeline?" gap — the #1 applied AI skill in current job descriptions. After this week, `POST /search { "query": "belanja makan Maret" }` returns the right transactions ranked by semantic similarity, with MRR measured. You can answer "how did you build your retrieval layer?" with numbers and a working endpoint.

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

Up to now, finding a transaction in this app means scrolling the transactions table or filtering by exact category/date. This chapter adds **semantic search**: type a natural-language question like `"belanja makan Maret"` and get back the right transactions, ranked by *meaning* — even when none of the words in the query appear in the transaction text. That's the first half of a RAG (Retrieval-Augmented Generation) pipeline: build an index once, then query it many times.

```
 1. BUILD THE INDEX  (offline, once per transaction)
 ──────────────────────────────────────────────────────────────────────────
   Transaction row          compose            embed                ┌─────────┐
   "GOFOOD GEPREK    ──▶   search_text   ──▶  (OpenAI          ──▶  │ 1010 0101│
    BENSU" | Food &         (desc + cat         text-embedding-      │ 1110 1011│
    Dining | BCA             + wallet)           3-small)            │ 0011 1010│
                                                                      └─────────┘
                                                                       pgvector DB
                                                                 (transaction_embeddings)

 2. ANSWER A QUERY  (online, every request — this is what makes it "search")
 ──────────────────────────────────────────────────────────────────────────
   USER  ───────▶    embed query    ───────▶   pgvector cosine   ───────▶  ranked
   "food spending      (same model)              search (<=>)              transactions
    in March"                                                              + similarity
```

This chapter builds both halves: the embed-and-store path, and the embed-query-and-search path. Re-ranking and a generated answer on top of these results is Chapter 4 (PF-AI004) — out of scope here.

Three mini-ladders below — one per concept this chapter ships.

## Embeddings

**Stage 0 — keyword search, the version you already have.** Filter transactions with `description ILIKE '%makan%'` (or the existing category-rule keyword matcher). It works as long as the query shares an exact word with the text.

> **The wall:** a BCA row often looks like `description = "DEBIT"` with the rule engine separately setting `category = "Food & Dining"`. A query for `"food spending"` shares zero words with `"DEBIT"` — keyword search returns nothing, even though the transaction is exactly what the user meant.

**Stage 1 — embeddings: text becomes a point in meaning-space.** An **embedding** is a dense vector that represents what a piece of text *means*, not the literal characters in it. Two semantically similar texts (`"food spending"` and `"GOFOOD FOOD ORDER"`) produce vectors that sit close together — measured by cosine similarity — even though they share no words.

> **The wall:** if you embed only the raw `description` field, a terse bank code like `"DEBIT TRANSFER"` still carries almost no semantic signal — there's nothing in the text itself for the embedding to capture as "food-related."

**Stage 2 — enrich what you embed.** Compose `description + remarks + category + wallet` into one `search_text` string before embedding (`EmbedItem.search_text()`, Step 4). The category the rule engine already assigned carries the semantic meaning the raw bank text lacks. → *this is what ships.*

▶ **Watch/read for this concept:** [Jay Alammar — The Illustrated Word2Vec](https://jalammar.github.io/illustrated-word2vec/) — the best visual intuition for "words/sentences as points in space."

## Vector storage & search (pgvector)

**Stage 0 — brute-force cosine in a loop.** Keep every embedding in a Python list, and for each query, loop over all of them computing cosine similarity by hand, sort, take the top-K.

> **The wall:** this works for a handful of rows in a notebook, but it isn't queryable SQL — you can't `JOIN` it against the real `transactions` table for dates/amounts/wallet in the same round trip, and every query re-scans every row in pure Python.

**Stage 1 — pgvector: a native vector column in Postgres.** Store embeddings as a `vector(1536)` column and compare them with the `<=>` cosine-distance operator directly in SQL — `JOIN`-able with `transactions` in one query, no separate vector database to run.

> **The wall:** without an index, `<=>` still does a full sequential scan of every row in `transaction_embeddings` to answer one query — fine for thousands of rows, the wrong tool past hundreds of thousands.

**Stage 2 — an `ivfflat` index for approximate nearest-neighbor search.** The index partitions vectors into clusters (`lists = 100`) so a query only has to search the nearest few clusters instead of every row. → *this is what ships* (Step 2 migration).

▶ **Watch/read for this concept:** [pgvector README](https://github.com/pgvector/pgvector) — distance operators, index types, query tips.

## Measuring retrieval quality (MRR@5)

**Stage 0 — eyeball a few queries and see if the results "look right."** Run `/search` for `"makan"`, skim the top results, decide subjectively whether it worked.

> **The wall:** "looks right" isn't a number — you can't compare today's retrieval against last week's, can't show an interviewer evidence, and can't tell if a code change made things better or worse.

**Stage 1 — Mean Reciprocal Rank (MRR@5).** For a set of test queries with a known-correct answer, score each query `1/rank` of the first relevant result in the top 5, then average across all queries. MRR = 1.0 means the right answer is always rank 1; MRR = 0.5 means it's usually around rank 2. → *this is what ships* (Step 13, `eval_retrieval.py`).

▶ **Watch/read for this concept:** [OpenAI cookbook — Embeddings quickstart](https://cookbook.openai.com/examples/get_embeddings_with_chunked_inputs) — read the code, not the prose.

# 🔧 Implementation

## 🎯 Objective

`pgvector` is already enabled in the schema (initial migration, line 1), but the `transaction_embeddings` table doesn't exist yet, and no code embeds anything. The upload pipeline extracts → validates → stores transactions, then stops. There is zero semantic search capability.

This task builds the first half of the RAG pipeline — **embedding and retrieval**:

1. Create a `transaction_embeddings` table (Supabase migration) — `transaction_id` + `vector(1536)` + `search_text` + `model`.
2. Build `EmbeddingService` in the Python AI service — calls OpenAI `text-embedding-3-small`, stores the vector to Postgres via `asyncpg`.
3. Add `POST /embed-transactions` to the FastAPI app — receives a list of `{transaction_id, description, remarks, category, wallet}` objects, embeds each, stores.
4. Build `RetrievalService` — pgvector cosine-similarity search returning ranked `transaction_id` + similarity score.
5. Add `POST /search` to FastAPI — receives `{query, top_k}`, returns ranked transactions.
6. Wire the `.NET` upload pipeline to call `/embed-transactions` after a successful insert batch.
7. Build [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) — MRR measurement against 10 handwritten test queries.

The deliverable is: a working semantic search over your own transactions, with MRR captured and the embedding cost-per-document added to [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md).

**Depends on:** PF-AI001 (reuses `estimate_cost_usd()` + Langfuse), PF-AI002 (the 20 eval fixtures become the Week 4 retrieval test corpus — label them well now).
**Unblocks:** Week 4 RAG (re-ranking + generation), Week 5 Streaming (streams the grounded answer over SSE).

## ✅ Acceptance Criteria

- [x] Supabase migration `20260606000001_transaction_embeddings.sql` applies cleanly (`supabase db push`)
- [x] [embedder.py](../../../services/ai-service/app/services/embedder.py) — `EmbeddingService.embed_and_store(items)` embeds via OpenAI `text-embedding-3-small`, stores to pgvector, logs token cost via Langfuse and `estimate_embed_cost_usd()`
- [x] [config.py](../../../services/ai-service/app/config.py) has `openai_api_key`, `embedding_model` (default `text-embedding-3-small`), `database_url` (Supabase Postgres direct URL for asyncpg)
- [x] `POST /embed-transactions` endpoint accepts `list[EmbedRequest]`, embeds, stores, returns `{embedded: N, skipped: M}`
- [x] [retriever.py](../../../services/ai-service/app/services/retriever.py) — `RetrievalService.search(query, top_k)` embeds query, runs pgvector `<=>` cosine-distance query, returns ranked `SearchResult` list
- [x] `POST /search` endpoint accepts `{query, top_k}`, returns ranked transactions with similarity scores
- [x] `.NET` `TransactionsController.SubmitTransactions` calls `/embed-transactions` (fire-and-forget via `Task.Run`) after successful insert batch
- [x] Backfill script [backfill_embeddings.py](../../../services/ai-service/scripts/backfill_embeddings.py) embeds all existing transactions (run once manually)
- [x] [search_queries.json](../../../services/ai-service/evals/search_queries.json) — 10 test queries with `expected_transaction_ids` (placeholder IDs — fill from Supabase Studio then run backfill)
- [x] [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) — runs 10 queries, computes MRR@5, prints table
- [ ] MRR@5 ≥ 0.6 on the test set (baseline; target ≥ 0.8 after Week 4 re-ranking)
  > Not met: requires filling search_queries.json with real transaction IDs, running backfill_embeddings.py, then eval_retrieval.py
- [x] [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md) updated with: embedding cost/doc, search latency p50/p95 (cost populated; latency TBD after first run)
- [x] [test_embedder.py](../../../services/ai-service/tests/test_embedder.py) — 7 unit tests pass (mocked OpenAI + asyncpg)
- [x] [test_retriever.py](../../../services/ai-service/tests/test_retriever.py) — 4 unit tests pass (mocked OpenAI + asyncpg)

## 🧭 Approach

**OpenAI `text-embedding-3-small`, not Ollama — for Week 3.** Ollama/nomic-embed is free and runs locally, but adds `docker pull` friction and a new infrastructure dependency on Day 1 of a new topic. `text-embedding-3-small` works immediately, costs ~$0.02/1M tokens (a 5,000-transaction corpus = ~2.5M characters ≈ ~625K tokens ≈ $0.01 total to embed once), and is the standard interview reference. Start fast; the architecture is provider-swappable by design (same interface pattern as `GeminiProvider` / `AnthropicProvider`).

**Python AI service embeds AND retrieves — no PostgREST.** The `.NET` backend uses `supabase-csharp` via PostgREST, which doesn't support pgvector `<=>` operations natively. The clean separation is: `.NET` handles business logic + storage (via PostgREST), Python handles all ML/vector operations (via direct `asyncpg` connection). This is the same boundary that already exists for LLM extraction — extend it, don't break it.

**`asyncpg` for Postgres access in Python.** Direct connection to Supabase's Postgres (port 54322 locally, port 5432 on Supabase Cloud). `asyncpg` is the fastest async Postgres driver for Python, one `pip install`, zero ORM. The AI service already lives outside the .NET codebase — a direct Postgres connection is fine and gives you raw `<=>` operator access.

**The `search_text` field is an audit trail.** What you embedded should be stored alongside the vector. If you change the embedding template (add `wallet`, remove `remarks`), you know which rows to re-embed. Without it, you're flying blind on freshness.

**MRR@5 is the Week 3 baseline metric.** Mean Reciprocal Rank at K=5 is the canonical retrieval metric — "on average, how high in the top-5 results is the first correct answer?" An MRR of 0.5 means the right answer is around rank 2 on average; 1.0 means always rank 1. You'll measure it this week and then re-measure after Week 4 re-ranking to show the lift. That delta ("re-ranking improved MRR from 0.X to 0.Y") is an interview-ready number.

Out of scope: re-ranking (Week 4), LLM synthesis (Week 4), streaming the answer (Week 5), hybrid search / BM25 (Week 6). Don't add those now.

## 📂 Affected Files

| File | Change |
|------|--------|
| [20260606000001_transaction_embeddings.sql](../../../supabase/migrations/20260606000001_transaction_embeddings.sql) | Create — `transaction_embeddings` table + ivfflat index |
| [config.py](../../../services/ai-service/app/config.py) | Add `openai_api_key`, `embedding_model`, `database_url` |
| [observability.py](../../../services/ai-service/app/observability.py) | Add OpenAI embedding cost table + `estimate_embed_cost_usd()` |
| [models.py](../../../services/ai-service/app/models.py) | Add `EmbedItem`, `EmbedRequest`, `EmbedResponse`, `SearchRequest`, `SearchResult`, `SearchResponse` |
| [embedder.py](../../../services/ai-service/app/services/embedder.py) | Create — `EmbeddingService` (OpenAI `text-embedding-3-small`) |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Create — `RetrievalService` (pgvector cosine similarity) |
| [main.py](../../../services/ai-service/app/main.py) | Add `POST /embed-transactions` and `POST /search` endpoints |
| [test_embedder.py](../../../services/ai-service/tests/test_embedder.py) | Create — unit tests for `EmbeddingService` (mocked client) |
| [test_retriever.py](../../../services/ai-service/tests/test_retriever.py) | Create — unit tests for `RetrievalService` (mocked asyncpg) |
| [search_queries.json](../../../services/ai-service/evals/search_queries.json) | Create — 10 test queries with expected transaction IDs |
| [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) | Create — MRR@5 benchmark runner |
| [backfill_embeddings.py](../../../services/ai-service/scripts/backfill_embeddings.py) | Create — one-off backfill script |
| [LlmSearchClient.cs](../../../apps/api/src/PersonalFinance.Infrastructure/External/LlmSearchClient.cs) | Create — typed HttpClient for `/embed-transactions` and `/search` |
| [ILlmSearchClient.cs](../../../apps/api/src/PersonalFinance.Application/Interfaces/ILlmSearchClient.cs) | Create — interface (Application layer owns interfaces, ARCH-02) |
| [Program.cs](../../../apps/api/src/PersonalFinance.Api/Program.cs) | Register `ILlmSearchClient` / `LlmSearchClient` |
| [UploadTransactionsCommandHandler.cs](../../../apps/api/src/PersonalFinance.Application/Commands/UploadTransactionsCommandHandler.cs) | Add fire-and-forget call to `ILlmSearchClient.EmbedTransactionsAsync` after insert |
| [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md) | Add embedding cost/doc + search latency numbers |

## 📋 TODO

### [x] STEP 1 — Learn: The embedding mental model (theory anchor, 60 min)

This week's one genuine pre-read. The "wall" here is understanding *what an embedding is* at the level you can explain it — not the math, but the intuition. Without it, you'll write code that embeds the wrong text and won't know why MRR is low.

**Read (one each, in this order):**
1. Jay Alammar — *The Illustrated Word2Vec* → https://jalammar.github.io/illustrated-word2vec/ (skim the first half for the "words as points in space" intuition — 15 min)
2. Anthropic — *What are embeddings?* → https://docs.anthropic.com/en/docs/build-with-claude/embeddings (short, concrete, the "text → vector → similarity" loop — 10 min)
3. OpenAI cookbook — *Embeddings quickstart* → https://cookbook.openai.com/examples/get_embeddings_with_chunked_inputs (read the code, not the prose — 10 min)

**Active-retrieval task (do NOT skip):** Close all tabs. In [evals/README.md](../../../services/ai-service/evals/README.md) (you already have this from PF-AI002), append a new section `## Embedding mental model (written from memory)` and answer:
- What is an embedding? (one sentence, no jargon)
- Why does cosine *distance* work for "semantic similarity"? (the geometric intuition)
- What text should you embed for a transaction — the raw `description` alone, or `description + remarks + category + wallet`? Why does the extra context matter?

> **Why theory first, just this once?** The non-obvious thing is the *what to embed* decision. If you embed only `description`, a query for "food spending in March" won't match a BCA transaction where `description = "DEBIT"` and the category set by the rule engine is `"Food & Dining"`. Embedding `description + remarks + category + wallet` makes semantic search actually work. You'd discover this by trial and error — but reading the "what makes a good embedding" section in 20 minutes saves you an hour of debugging MRR=0.2.

> **The interview frame:** "An embedding is a dense vector in a high-dimensional space where semantic similarity is preserved. Two semantically similar texts produce vectors with high cosine similarity (low cosine *distance*). For my transactions, I embed `description + remarks + category + wallet` because the category adds the semantic layer that raw transaction text often lacks — especially for terse codes like BCA's `DEBIT TRANSFER`."

### [x] STEP 2 — Create the Supabase migration: `transaction_embeddings`

Create [supabase/migrations/20260606000001_transaction_embeddings.sql](../../../supabase/migrations/20260606000001_transaction_embeddings.sql):

```sql
-- PF-AI003: transaction_embeddings table for pgvector semantic search
-- vector(1536) matches OpenAI text-embedding-3-small output dimension.
-- ivfflat index is appropriate for ~thousands of rows; switch to hnsw at ~100k+.

CREATE TABLE transaction_embeddings (
    id          integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    transaction_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    embedding   vector(1536) NOT NULL,
    search_text text NOT NULL,           -- audit trail: what was embedded
    model       text NOT NULL DEFAULT 'text-embedding-3-small',
    created_at  timestamp with time zone DEFAULT now()
);

-- one embedding per transaction (UNIQUE enforces idempotent upsert in the service)
CREATE UNIQUE INDEX ON transaction_embeddings (transaction_id);

-- ivfflat index for cosine distance (<=>). lists=100 is good for up to ~1M rows.
CREATE INDEX ON transaction_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

Apply it:
```bash
supabase db push
```

Verify in Studio (http://localhost:54323) → Table Editor → `transaction_embeddings` should appear with the `embedding` column shown as `vector`.

> **Why `UNIQUE INDEX ON (transaction_id)`?** The embedder will be called every time a transaction batch is uploaded — including re-uploads of the same statement. Without a unique constraint, each upload would create a duplicate embedding row. With it, the `ON CONFLICT (transaction_id) DO UPDATE` in Step 4 makes the embed call idempotent: re-embedding the same transaction just updates the vector (useful when you change the embedding template).

> **Why `ivfflat` and not `hnsw`?** For a personal finance database with thousands of rows, either works. `ivfflat` (inverted file with flat compression) has faster build time and lower memory footprint; `hnsw` has better recall at high query volumes. pgvector added `hnsw` in 0.5.0. Knowing the tradeoff is the interview content — state it explicitly: "I used `ivfflat` for now because the dataset is small; I'd switch to `hnsw` if it grew past ~100k rows."

**C# equivalent** (schema management note — this is SQL, not C#, but the .NET equivalent of "applying a migration" is informative):

```csharp
// In the Supabase-first world (post-PF-S07), schema changes always go through
// supabase/migrations/ + supabase db push. There is no EF Core migration command.
// The C# equivalent of pgvector's vector type is float[] or ReadOnlyMemory<float>.
// Npgsql + pgvector exposes it via:
//   using Npgsql;
//   NpgsqlConnection.GlobalTypeMapper.UseVector();  // in Program.cs
//   await cmd.ExecuteScalarAsync();  // returns Vector type from Npgsql.PostgreSQL.Types
//
// In the Python AI service, asyncpg reads it as a list[float] via the pgvector
// asyncpg codec registered in STEP 4.
```

### [x] STEP 3 — Extend [config.py](../../../services/ai-service/app/config.py) with embedding settings

```python
class Settings(BaseSettings):
    # ... existing fields ...

    # OpenAI (embeddings only — extraction still uses Gemini/Anthropic)
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"

    # Direct Postgres URL for asyncpg (pgvector operations bypass PostgREST)
    # Local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres
    # Supabase Cloud: from Project Settings → Database → Connection string → URI
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Add to your `.env` file (not committed — already in `.gitignore`):
```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**C# equivalent** (Python `pydantic-settings` env-var binding → .NET `appsettings.json` + environment variable override):

```csharp
// appsettings.json
{
  "AiService": {
    "BaseUrl": "http://localhost:8000",
    "EmbeddingModel": "text-embedding-3-small"
  }
}

// In Program.cs — the typed options binding:
builder.Services.Configure<AiServiceOptions>(
    builder.Configuration.GetSection("AiService"));

public sealed class AiServiceOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8000";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
}

// Environment override: AiService__EmbeddingModel=text-embedding-3-large
// matches Python's: EMBEDDING_MODEL=text-embedding-3-large
// Both frameworks use the same double-underscore → colon nesting convention.
```

> **Why a separate `database_url` in the AI service?** The .NET API accesses Supabase via PostgREST (REST API). The Python AI service needs raw SQL for pgvector `<=>` operator queries — PostgREST doesn't expose that. Direct `asyncpg` connection to port 54322 (local) is the clean solution. In production, this becomes the Supabase "connection pooler" URL (Transaction mode, port 6543).

### [x] STEP 4 — Build [embedder.py](../../../services/ai-service/app/services/embedder.py)

Create [services/ai-service/app/services/embedder.py](../../../services/ai-service/app/services/embedder.py):

```python
"""EmbeddingService: generate and store transaction embeddings via OpenAI.

Stores vectors directly to Postgres via asyncpg (bypasses PostgREST —
pgvector requires raw SQL <=> operator).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import asyncpg
import openai

from app.config import settings
from app.observability import langfuse, estimate_embed_cost_usd

logger = logging.getLogger(__name__)

# pgvector asyncpg codec — register once at module level.
# Without this, asyncpg returns vector data as raw bytes.
# Install: pip install pgvector
from pgvector.asyncpg import register_vector


@dataclass
class EmbedItem:
    transaction_id: int
    description: str
    remarks: str = ""
    category: str = ""
    wallet: str = ""

    def search_text(self) -> str:
        """Compose the text that will be embedded.
        Include category + wallet so semantic search works even when
        the raw description is a terse code like 'DEBIT TRANSFER BCA'.
        """
        parts = [self.description]
        if self.remarks:
            parts.append(self.remarks)
        if self.category and self.category != "Uncategorized":
            parts.append(self.category)
        if self.wallet:
            parts.append(self.wallet)
        return " | ".join(parts)


class EmbeddingService:
    def __init__(self) -> None:
        self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.embedding_model
        self._db_url = settings.database_url

    async def embed_and_store(self, items: list[EmbedItem]) -> tuple[int, int]:
        """Embed a batch of transactions and upsert into transaction_embeddings.

        Returns (embedded, skipped) counts.
        """
        if not items:
            return 0, 0

        texts = [item.search_text() for item in items]

        # -- Generate embeddings (one API call for the whole batch) --
        generation = langfuse.start_observation(
            as_type="generation",
            name="openai-embed-batch",
            model=self._model,
            input=f"{len(texts)} texts",
        )
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=texts,
                encoding_format="float",
            )
        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise

        tokens = response.usage.total_tokens
        cost = estimate_embed_cost_usd(self._model, tokens)
        generation.update(
            usage_details={"input": tokens, "output": 0},
            cost_details={"usd": cost},
        )
        generation.end()

        logger.info(
            "Embeddings generated | model=%s | texts=%d | tokens=%d | cost_usd=%.6f",
            self._model, len(texts), tokens, cost,
        )

        vectors = [e.embedding for e in response.data]

        # -- Store to Postgres via asyncpg --
        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            embedded = 0
            skipped = 0
            for item, text, vector in zip(items, texts, vectors):
                try:
                    await conn.execute(
                        """
                        INSERT INTO transaction_embeddings
                            (transaction_id, embedding, search_text, model)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (transaction_id) DO UPDATE
                            SET embedding = EXCLUDED.embedding,
                                search_text = EXCLUDED.search_text,
                                model = EXCLUDED.model
                        """,
                        item.transaction_id,
                        vector,
                        text,
                        self._model,
                    )
                    embedded += 1
                except Exception as exc:
                    logger.warning("Failed to store embedding for tx %d: %s", item.transaction_id, exc)
                    skipped += 1
        finally:
            await conn.close()

        return embedded, skipped
```

**C# equivalent** (Python's `openai.AsyncOpenAI` + `asyncpg` → a .NET `EmbeddingClient` using `HttpClient` and `NpgsqlConnection`):

```csharp
// app/services/EmbeddingService.cs — what the Python class maps to in .NET
// Key translations:
//   openai.AsyncOpenAI → OpenAI SDK's EmbeddingClient (or typed HttpClient to api.openai.com)
//   asyncpg.connect()  → NpgsqlDataSourceBuilder().Build().OpenConnectionAsync()
//   await conn.execute(...) → await cmd.ExecuteNonQueryAsync()
//   ON CONFLICT ... DO UPDATE → same SQL, Npgsql passes parameters typed

public sealed class EmbeddingService
{
    private readonly HttpClient _openAiClient;
    private readonly NpgsqlDataSource _ds;
    private readonly string _model;

    public EmbeddingService(HttpClient openAiClient, NpgsqlDataSource ds, string model)
    {
        _openAiClient = openAiClient;
        _ds = ds;
        _model = model;
    }

    // Python's dataclass → C# record (immutable, value-based equality)
    public record EmbedItem(int TransactionId, string Description,
        string Remarks = "", string Category = "", string Wallet = "")
    {
        public string SearchText() => string.Join(" | ",
            new[] { Description, Remarks, Category, Wallet }
                .Where(s => !string.IsNullOrWhiteSpace(s) && s != "Uncategorized"));
    }

    public async Task<(int Embedded, int Skipped)> EmbedAndStoreAsync(
        IReadOnlyList<EmbedItem> items, CancellationToken ct = default)
    {
        var texts = items.Select(i => i.SearchText()).ToList();

        // OpenAI embeddings request (typed HttpClient — omit for brevity)
        var vectors = await GenerateEmbeddingsAsync(texts, ct);

        await using var conn = await _ds.OpenConnectionAsync(ct);
        var embedded = 0; var skipped = 0;
        foreach (var (item, vector) in items.Zip(vectors))
        {
            try
            {
                await using var cmd = conn.CreateCommand();
                // Npgsql maps float[] to pgvector vector type via UseVector() registration
                cmd.CommandText = """
                    INSERT INTO transaction_embeddings
                        (transaction_id, embedding, search_text, model)
                    VALUES ($1, $2::vector, $3, $4)
                    ON CONFLICT (transaction_id) DO UPDATE
                        SET embedding = EXCLUDED.embedding,
                            search_text = EXCLUDED.search_text,
                            model = EXCLUDED.model
                    """;
                cmd.Parameters.AddWithValue(item.TransactionId);
                cmd.Parameters.AddWithValue(vector);       // float[]
                cmd.Parameters.AddWithValue(item.SearchText());
                cmd.Parameters.AddWithValue(_model);
                await cmd.ExecuteNonQueryAsync(ct);
                embedded++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to store embedding for tx {Id}", item.TransactionId);
                skipped++;
            }
        }
        return (embedded, skipped);
    }
}

// Python's ON CONFLICT DO UPDATE == SQL UPSERT — same in .NET.
// Python's `await conn.execute(...)` is single-statement, no reader needed.
// C# equivalent: ExecuteNonQueryAsync() for INSERT/UPDATE with no result set.
```

> **Why batch the OpenAI call (`input=texts`) instead of one call per transaction?** OpenAI's embedding API accepts up to 2048 texts in a single request. One API call for a 100-transaction upload = 1 HTTP round trip, ~200ms. 100 individual calls = 100 round trips, ~20 seconds. The batch API is how embeddings work in production — always batch.

> **Why `ON CONFLICT (transaction_id) DO UPDATE`?** Re-uploading the same bank statement re-triggers `/embed-transactions`. Without upsert semantics, you'd get duplicate rows (violating the UNIQUE index) or throw a constraint error. With it, re-embedding is idempotent: safe to call multiple times.

> **Why `asyncpg`, not `supabase-py`?** `supabase-py` uses PostgREST (HTTP) under the hood — it can't issue raw SQL with the `<=>` vector operator. `asyncpg` is a direct wire-protocol Postgres client, same connection your local `psql` uses. The AI service is a Python process, not a browser — a direct DB connection is correct here.

### [x] STEP 5 — Extend [observability.py](../../../services/ai-service/app/observability.py) with embedding cost tracking

Add an `OPENAI_EMBED_COST` table and `estimate_embed_cost_usd()` function to [app/observability.py](../../../services/ai-service/app/observability.py):

```python
# OpenAI embedding pricing per 1M tokens (as of 2026-05)
# Source: https://openai.com/pricing
OPENAI_EMBED_COST: dict[str, float] = {
    "text-embedding-3-small": 0.02,   # $/1M tokens
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002":  0.10,
}


def estimate_embed_cost_usd(model: str, total_tokens: int) -> float:
    price = OPENAI_EMBED_COST.get(model, 0.0)
    return total_tokens * price / 1_000_000
```

**C# equivalent** (Python module-level dict + function → static dictionary + static method):

```csharp
// In Observability.cs (or a new EmbeddingCostEstimator.cs)
public static class EmbeddingCosts
{
    private static readonly Dictionary<string, decimal> PricePerMillionTokens = new()
    {
        ["text-embedding-3-small"] = 0.02m,
        ["text-embedding-3-large"] = 0.13m,
        ["text-embedding-ada-002"]  = 0.10m,
    };

    public static decimal EstimateCostUsd(string model, int totalTokens)
    {
        if (!PricePerMillionTokens.TryGetValue(model, out var price)) return 0m;
        return totalTokens * price / 1_000_000m;
    }
}

// Python's module-level DICT → C# static readonly field on a static class.
// Python's module-level function → C# static method.
// Python uses float for cost (IEEE 754); .NET uses decimal for money (no rounding errors).
// For cost *display* either is fine; for cost *accumulation*, always decimal in .NET.
```

### [x] STEP 6 — Add Pydantic models to [models.py](../../../services/ai-service/app/models.py)

Append to [services/ai-service/app/models.py](../../../services/ai-service/app/models.py):

```python
# ── RAG: Embeddings + Search ──────────────────────────────────────────────────

class EmbedItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    transaction_id: int
    description: str
    remarks: str = ""
    category: str = ""
    wallet: str = ""


class EmbedTransactionsRequest(BaseModel):
    items: list[EmbedItem]


class EmbedTransactionsResponse(BaseModel):
    embedded: int
    skipped: int
    model: str


class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=50)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)


class SearchResult(BaseModel):
    transaction_id: int
    similarity: float          # 1 - cosine_distance (0..1, higher = more similar)
    description: str
    date: str                  # ISO 8601
    amount_idr: float
    flow: str
    wallet: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total_found: int
```

**C# equivalent** (Python `BaseModel` with `ConfigDict` → C# `record` or POCO with `[Required]`; Pydantic `Field(ge=1)` → `[Range(1, 50)]`):

```csharp
// DTOs in PersonalFinance.Application/Dtos/ or PersonalFinance.Infrastructure/Dtos/

public sealed record EmbedItemDto(
    int TransactionId,
    string Description,
    string Remarks = "",
    string Category = "",
    string Wallet = "");

public sealed record EmbedTransactionsRequest(IReadOnlyList<EmbedItemDto> Items);

public sealed record EmbedTransactionsResponse(int Embedded, int Skipped, string Model);

public sealed record SearchRequest(
    [property: Required, MaxLength(500)] string Query,
    [property: Range(1, 50)] int TopK = 5,
    [property: Range(0.0, 1.0)] double MinSimilarity = 0.0);

public sealed record SearchResult(
    int TransactionId, double Similarity,
    string Description, string Date, decimal AmountIdr,
    string Flow, string Wallet);

public sealed record SearchResponse(
    IReadOnlyList<SearchResult> Results, string Query, int TotalFound);

// Python ConfigDict(str_strip_whitespace=True) → set in model, applies to all str fields
// .NET equivalent: a custom ModelBinder or FluentValidation rule — there's no single attribute.
// Closest: trim in the setter, or apply via a FluentValidation Must() rule.

// Python Field(ge=1, le=50) → [Range(1, 50)] data annotation in .NET
// Both validate at the boundary (API input), not in the domain.
```

### [x] STEP 7 — Build [retriever.py](../../../services/ai-service/app/services/retriever.py)

Create [services/ai-service/app/services/retriever.py](../../../services/ai-service/app/services/retriever.py):

```python
"""RetrievalService: pgvector cosine-similarity search over transaction embeddings."""
from __future__ import annotations

import logging

import asyncpg
import openai
from pgvector.asyncpg import register_vector

from app.config import settings
from app.models import SearchResult

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self) -> None:
        self._embed_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.embedding_model
        self._db_url = settings.database_url

    async def search(
        self, query: str, top_k: int = 5, min_similarity: float = 0.0
    ) -> list[SearchResult]:
        # 1. Embed the query with the same model used for storage.
        #    Always embed the query text as-is (no category/wallet addition —
        #    those fields augment the stored docs, not the query).
        embed_response = await self._embed_client.embeddings.create(
            model=self._model,
            input=[query],
            encoding_format="float",
        )
        query_vector = embed_response.data[0].embedding

        # 2. Run pgvector cosine-distance search.
        #    <=> = cosine distance (0 = identical, 2 = opposite).
        #    1 - distance = cosine similarity (1 = identical).
        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            rows = await conn.fetch(
                """
                SELECT
                    te.transaction_id,
                    1 - (te.embedding <=> $1::vector) AS similarity,
                    t.description,
                    t.date::text AS date,
                    t.amount_idr,
                    t.flow,
                    t.wallet
                FROM transaction_embeddings te
                JOIN transactions t ON t.id = te.transaction_id
                WHERE 1 - (te.embedding <=> $1::vector) >= $3
                ORDER BY te.embedding <=> $1::vector   -- ascending distance = descending similarity
                LIMIT $2
                """,
                query_vector,
                top_k,
                min_similarity,
            )
        finally:
            await conn.close()

        return [
            SearchResult(
                transaction_id=row["transaction_id"],
                similarity=float(row["similarity"]),
                description=row["description"],
                date=row["date"],
                amount_idr=float(row["amount_idr"]),
                flow=row["flow"],
                wallet=row["wallet"],
            )
            for row in rows
        ]
```

**C# equivalent** (`asyncpg.connect` + `conn.fetch` → `NpgsqlConnection` + `ExecuteReaderAsync`; Python `await conn.fetch(sql, *params)` returns `list[Record]` → C# `DbDataReader` loop):

```csharp
public sealed class RetrievalService
{
    private readonly HttpClient _openAiClient;    // for query embedding
    private readonly NpgsqlDataSource _ds;
    private readonly string _model;

    public async Task<IReadOnlyList<SearchResult>> SearchAsync(
        string query, int topK = 5, double minSimilarity = 0.0,
        CancellationToken ct = default)
    {
        // 1. Embed the query
        var queryVector = await EmbedQueryAsync(query, ct);

        // 2. pgvector search via Npgsql
        await using var conn = await _ds.OpenConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT te.transaction_id,
                   1 - (te.embedding <=> $1::vector) AS similarity,
                   t.description, t.date::text, t.amount_idr, t.flow, t.wallet
            FROM transaction_embeddings te
            JOIN transactions t ON t.id = te.transaction_id
            WHERE 1 - (te.embedding <=> $1::vector) >= $3
            ORDER BY te.embedding <=> $1::vector
            LIMIT $2
            """;
        cmd.Parameters.AddWithValue(queryVector);   // float[] → vector via Npgsql
        cmd.Parameters.AddWithValue(topK);
        cmd.Parameters.AddWithValue(minSimilarity);

        var results = new List<SearchResult>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);

        // Python's `for row in rows` → C# `while (await reader.ReadAsync())`
        while (await reader.ReadAsync(ct))
        {
            results.Add(new SearchResult(
                TransactionId: reader.GetInt32(0),
                Similarity: reader.GetDouble(1),
                Description: reader.GetString(2),
                Date: reader.GetString(3),
                AmountIdr: reader.GetDecimal(4),
                Flow: reader.GetString(5),
                Wallet: reader.GetString(6)));
        }
        return results;
    }
}

// Python asyncpg.fetch() → returns all rows at once (like ToListAsync in EF).
// C# ExecuteReaderAsync() → streaming reader; must call ReadAsync() per row.
// For small result sets (top-K ≤ 50), either is fine. For large results, reader wins.

// Python row["column_name"] (dict-like access) → C# reader.GetXxx(ordinal).
// asyncpg rows are Record objects with both index and name access.
// In .NET, use reader.GetOrdinal("column_name") to get ordinal, then GetXxx().
```

> **Why query the same model that was used for storage?** Embedding spaces are model-specific. A vector from `text-embedding-3-small` and one from `text-embedding-ada-002` live in different spaces — comparing them gives meaningless cosine distances. Always embed queries with `settings.embedding_model`, which is the same field written into the `model` column at storage time. If you ever change the embedding model, you must re-embed all stored transactions first.

> **Why `1 - distance` for similarity?** pgvector's `<=>` operator returns *cosine distance* (0 = identical, 2 = maximally different). For display and filtering, you want *cosine similarity* (1 = identical, -1 = opposite). The `1 -` flip makes the semantic obvious: `similarity >= 0.7` means "at least 70% similar". Order by distance ascending (ORDER BY `<=>`) to get most-similar first.

### [x] STEP 8 — Add endpoints to [main.py](../../../services/ai-service/app/main.py)

Add these two endpoints to [services/ai-service/app/main.py](../../../services/ai-service/app/main.py):

```python
from app.services.embedder import EmbeddingService, EmbedItem as EmbedItemInternal
from app.services.retriever import RetrievalService
from app.models import EmbedTransactionsRequest, EmbedTransactionsResponse, SearchRequest, SearchResponse

# -- Instantiate services (module-level singletons, like LlmParser) --
_embedder = EmbeddingService()
_retriever = RetrievalService()


@app.post("/embed-transactions", response_model=EmbedTransactionsResponse)
async def embed_transactions(request: EmbedTransactionsRequest) -> EmbedTransactionsResponse:
    """Embed a batch of transactions and store vectors to transaction_embeddings."""
    items = [
        EmbedItemInternal(
            transaction_id=i.transaction_id,
            description=i.description,
            remarks=i.remarks,
            category=i.category,
            wallet=i.wallet,
        )
        for i in request.items
    ]
    embedded, skipped = await _embedder.embed_and_store(items)
    return EmbedTransactionsResponse(
        embedded=embedded,
        skipped=skipped,
        model=settings.embedding_model,
    )


@app.post("/search", response_model=SearchResponse)
async def search_transactions(request: SearchRequest) -> SearchResponse:
    """Semantic search over transactions using pgvector cosine similarity."""
    results = await _retriever.search(
        query=request.query,
        top_k=request.top_k,
        min_similarity=request.min_similarity,
    )
    return SearchResponse(
        results=results,
        query=request.query,
        total_found=len(results),
    )
```

Manual smoke test (after starting the service with `uvicorn app.main:app --reload`):
```bash
# Embed a test transaction (use a real transaction_id from your DB)
curl -X POST http://localhost:8000/embed-transactions \
  -H "Content-Type: application/json" \
  -d '{"items": [{"transaction_id": 1, "description": "GOPAY FOOD ORDER", "category": "Food & Dining", "wallet": "BCA"}]}'

# Search
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "food spending", "top_k": 5}'
```

**C# equivalent** (FastAPI `@app.post(...)` → ASP.NET Core controller action; Python `response_model=` → `[ProducesResponseType(200)]`):

```csharp
// In LlmSearchController.cs (or extend an existing controller)
[ApiController]
[Route("api/[controller]")]
public sealed class SearchController : ControllerBase
{
    private readonly ILlmSearchClient _searchClient;
    public SearchController(ILlmSearchClient searchClient) => _searchClient = searchClient;

    [HttpPost("embed")]
    [ProducesResponseType(typeof(EmbedTransactionsResponse), 200)]
    public async Task<IActionResult> EmbedTransactions(
        [FromBody] EmbedTransactionsRequest request, CancellationToken ct)
    {
        var result = await _searchClient.EmbedTransactionsAsync(request, ct);
        return Ok(result);
    }

    [HttpPost("search")]
    [ProducesResponseType(typeof(SearchResponse), 200)]
    public async Task<IActionResult> Search(
        [FromBody] SearchRequest request, CancellationToken ct)
    {
        var result = await _searchClient.SearchAsync(request, ct);
        return Ok(result);
    }
}

// FastAPI's module-level _embedder = EmbeddingService() → C# singleton DI registration:
//   builder.Services.AddSingleton<EmbeddingService>();
// FastAPI automatically picks up the singleton from module scope.
// ASP.NET DI needs an explicit lifetime declaration.
```

### [x] STEP 9 — Build the .NET `LlmSearchClient`

Create [apps/api/src/PersonalFinance.Application/Interfaces/ILlmSearchClient.cs](../../../apps/api/src/PersonalFinance.Application/Interfaces/ILlmSearchClient.cs):

```csharp
namespace PersonalFinance.Application.Interfaces;

public interface ILlmSearchClient
{
    Task EmbedTransactionsAsync(IReadOnlyList<EmbedItemRequest> items, CancellationToken ct = default);
    Task<SearchResponse> SearchAsync(string query, int topK = 5, CancellationToken ct = default);
}

public sealed record EmbedItemRequest(
    int TransactionId, string Description,
    string Remarks = "", string Category = "", string Wallet = "");

public sealed record SearchResultDto(
    int TransactionId, double Similarity,
    string Description, string Date, decimal AmountIdr, string Flow, string Wallet);

public sealed record SearchResponse(IReadOnlyList<SearchResultDto> Results, string Query, int TotalFound);
```

Create [apps/api/src/PersonalFinance.Infrastructure/External/LlmSearchClient.cs](../../../apps/api/src/PersonalFinance.Infrastructure/External/LlmSearchClient.cs):

```csharp
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public sealed class LlmSearchClient : ILlmSearchClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LlmSearchClient> _logger;

    public LlmSearchClient(HttpClient http, ILogger<LlmSearchClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task EmbedTransactionsAsync(
        IReadOnlyList<EmbedItemRequest> items, CancellationToken ct = default)
    {
        var payload = new { items };
        var response = await _http.PostAsJsonAsync("/embed-transactions", payload, ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Embed request failed | status={Status} | count={Count}",
                response.StatusCode, items.Count);
            // Fire-and-forget: do not throw — embedding failure must not break the upload.
        }
    }

    public async Task<SearchResponse> SearchAsync(
        string query, int topK = 5, CancellationToken ct = default)
    {
        var payload = new { query, top_k = topK };
        var response = await _http.PostAsJsonAsync("/search", payload, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SearchResponse>(ct))!;
    }
}
```

Register in [Program.cs](../../../apps/api/src/PersonalFinance.Api/Program.cs) (follow the existing `LlmExtractionClient` pattern):

```csharp
builder.Services.AddHttpClient<ILlmSearchClient, LlmSearchClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000"));
```

> **Why `EmbedTransactionsAsync` doesn't throw on failure?** Embedding is enrichment, not a core upload requirement. If the embed call fails (AI service down, OpenAI rate limit), the transaction is still saved in Postgres — the data is not lost. The embedding can be backfilled later. Throwing here would surface an AI service outage as an upload failure to the user, which is a worse UX. Fire-and-forget is the correct semantic for optional enrichment.

### [x] STEP 10 — Wire embed call after upload

In [UploadTransactionsCommandHandler.cs](../../../apps/api/src/PersonalFinance.Application/Commands/UploadTransactionsCommandHandler.cs) (or wherever the transaction batch is committed), add the embed call after a successful insert. Find the post-insert block and add:

```csharp
// After: var insertedTransactions = await _supabase.From<Transaction>().Insert(batch);
// Add:
_ = Task.Run(async () =>
{
    try
    {
        var embedItems = insertedTransactions
            .Select(t => new EmbedItemRequest(
                TransactionId: t.Id,
                Description:   t.Description,
                Remarks:       t.Remarks ?? "",
                Category:      t.Category ?? "",
                Wallet:        t.Wallet))
            .ToList();
        await _searchClient.EmbedTransactionsAsync(embedItems);
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Background embed failed for {Count} transactions", batch.Count);
    }
}, CancellationToken.None);
```

**Python equivalent** (C#'s `Task.Run()` fire-and-forget → Python's `asyncio.create_task()`):

```python
# In a Python FastAPI handler that inserts transactions and then embeds:
async def upload_transactions(request: ...) -> ...:
    # Insert first
    inserted = await _insert_transactions(request.transactions)

    # Fire-and-forget embed — failure must not break the upload response
    async def _embed_bg():
        try:
            items = [EmbedItem(t.id, t.description, t.remarks, t.category, t.wallet) for t in inserted]
            await _embedder.embed_and_store(items)
        except Exception as exc:
            logger.warning("Background embed failed: %s", exc)

    asyncio.create_task(_embed_bg())  # Python equivalent of Task.Run()

    return UploadResponse(saved=len(inserted))

# C#'s Task.Run() → asyncio.create_task() in Python
# Both schedule work on the event loop / thread pool without awaiting completion.
# Both swallow exceptions in the background task (must catch explicitly, as shown).
```

### [x] STEP 11 — Backfill existing transactions

Create [services/ai-service/scripts/backfill_embeddings.py](../../../services/ai-service/scripts/backfill_embeddings.py) (run once manually after the service is up):

```python
"""One-off backfill: embed all transactions that don't have an embedding yet.

    python scripts/backfill_embeddings.py [--batch-size 50] [--dry-run]
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Allow running from scripts/ without pip install -e .
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings
from app.services.embedder import EmbeddingService, EmbedItem


async def backfill(batch_size: int, dry_run: bool) -> None:
    conn = await asyncpg.connect(settings.database_url)
    await register_vector(conn)

    # Fetch transactions that don't have an embedding yet
    rows = await conn.fetch(
        """
        SELECT t.id, t.description, t.remarks, t.category, t.wallet
        FROM transactions t
        LEFT JOIN transaction_embeddings te ON te.transaction_id = t.id
        WHERE te.transaction_id IS NULL
        ORDER BY t.id
        """
    )
    await conn.close()

    total = len(rows)
    print(f"Found {total} transactions without embeddings.")
    if dry_run:
        print("Dry run — not embedding anything.")
        return

    service = EmbeddingService()
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        items = [
            EmbedItem(
                transaction_id=r["id"],
                description=r["description"],
                remarks=r["remarks"] or "",
                category=r["category"] or "",
                wallet=r["wallet"] or "",
            )
            for r in batch
        ]
        embedded, skipped = await service.embed_and_store(items)
        print(f"Batch {i // batch_size + 1}: embedded={embedded}, skipped={skipped}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(backfill(args.batch_size, args.dry_run))
```

Run:
```bash
cd services/ai-service
PYTHONPATH=. python scripts/backfill_embeddings.py --dry-run   # check count first
PYTHONPATH=. python scripts/backfill_embeddings.py --batch-size 50
```

**C# equivalent** (Python `argparse` → .NET `System.CommandLine`; `asyncio.run()` → `await Task` from `Main`):

```csharp
// scripts/BackfillEmbeddings.cs — a .NET console app or a one-off CLI tool
// Run: dotnet run -- --batch-size 50 --dry-run

var batchSize = GetArg(args, "--batch-size", 50);
var dryRun = args.Contains("--dry-run");

// Python: asyncpg.connect() → C#: NpgsqlDataSourceBuilder().Build().OpenConnectionAsync()
// Python: await conn.fetch("SELECT ...") → C#: ExecuteReaderAsync() loop
// Python: asyncio.run(backfill()) → C#: await Main() (async Task entry point)
// Python: rows[i:i + batch_size] → C#: rows.Skip(i).Take(batchSize)

static int GetArg(string[] args, string name, int def)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length && int.TryParse(args[i + 1], out var v) ? v : def;
}
```

### [x] STEP 12 — Unit-test `EmbeddingService` and `RetrievalService`

Create [services/ai-service/tests/test_embedder.py](../../../services/ai-service/tests/test_embedder.py):

```python
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.embedder import EmbeddingService, EmbedItem


@pytest.fixture
def mock_openai_and_asyncpg():
    mock_embed_response = MagicMock()
    mock_embed_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
    mock_embed_response.usage.total_tokens = 10

    with patch("app.services.embedder.openai.AsyncOpenAI") as mock_openai_cls, \
         patch("app.services.embedder.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.embedder.register_vector", new_callable=AsyncMock):

        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_embed_response)
        mock_openai_cls.return_value = mock_client

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_connect.return_value = mock_conn

        yield mock_client, mock_conn


@pytest.mark.asyncio
async def test_embed_and_store_calls_openai_with_batch(mock_openai_and_asyncpg):
    mock_openai, _ = mock_openai_and_asyncpg
    service = EmbeddingService()
    items = [EmbedItem(transaction_id=1, description="GOPAY FOOD", category="Food & Dining")]

    embedded, skipped = await service.embed_and_store(items)

    mock_openai.embeddings.create.assert_called_once()
    assert embedded == 1
    assert skipped == 0


@pytest.mark.asyncio
async def test_embed_empty_list_returns_zeros(mock_openai_and_asyncpg):
    mock_openai, _ = mock_openai_and_asyncpg
    service = EmbeddingService()

    embedded, skipped = await service.embed_and_store([])

    mock_openai.embeddings.create.assert_not_called()
    assert embedded == 0 and skipped == 0


def test_embed_item_search_text_includes_category():
    item = EmbedItem(transaction_id=1, description="DEBIT TRANSFER", category="Food & Dining", wallet="BCA")
    text = item.search_text()
    assert "Food & Dining" in text
    assert "BCA" in text


def test_embed_item_search_text_skips_uncategorized():
    item = EmbedItem(transaction_id=1, description="DEBIT", category="Uncategorized")
    text = item.search_text()
    assert "Uncategorized" not in text
```

**C# equivalent** (Python `pytest.fixture` → xUnit constructor or `IClassFixture`; `AsyncMock` → `Mock<T>` with `ReturnsAsync`; `patch(...)` → Moq constructor injection):

```csharp
// tests/Services/EmbeddingServiceTests.cs
public class EmbeddingServiceTests
{
    [Fact]
    public void EmbedItem_SearchText_IncludesCategory()
    {
        var item = new EmbeddingService.EmbedItem(1, "DEBIT TRANSFER",
            Category: "Food & Dining", Wallet: "BCA");
        var text = item.SearchText();
        Assert.Contains("Food & Dining", text);
        Assert.Contains("BCA", text);
    }

    [Fact]
    public void EmbedItem_SearchText_SkipsUncategorized()
    {
        var item = new EmbeddingService.EmbedItem(1, "DEBIT", Category: "Uncategorized");
        var text = item.SearchText();
        Assert.DoesNotContain("Uncategorized", text);
    }

    // Python @pytest.mark.asyncio async def test_... → [Fact] async Task in xUnit 2+
    // Python AsyncMock → Mock<IOpenAiClient>().Setup(x => x.CreateEmbeddingsAsync(...)).ReturnsAsync(...)
    // Python patch("app.services.embedder.asyncpg.connect") → inject mock INpgsqlDataSource via constructor
}
```

### [x] STEP 13 — Write 10 test queries + build [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) (MRR)

**First:** write [evals/search_queries.json](../../../services/ai-service/evals/search_queries.json) — 10 handwritten queries, each with the transaction IDs you'd expect in the top-5 results. Use your real transactions (from local Supabase Studio, `http://localhost:54323`):

```json
[
  {
    "query": "belanja makan siang GoFood GrabFood",
    "expected_top5_ids": [12, 34, 56, 78, 90],
    "note": "Indonesian food delivery — should match Food & Dining transactions"
  },
  {
    "query": "tagihan listrik PLN bulan Maret",
    "expected_top5_ids": [23, 45],
    "note": "PLN electricity bill — Bills & Utilities"
  },
  {
    "query": "gaji bulanan salary income",
    "expected_top5_ids": [1, 15, 30],
    "note": "Monthly salary credit — Income / CR transactions"
  },
  {
    "query": "transfer ke teman Gopay Dana OVO",
    "expected_top5_ids": [7, 19, 42],
    "note": "P2P transfers to e-wallets"
  },
  {
    "query": "bensin BBM Pertamina Shell",
    "expected_top5_ids": [8, 21],
    "note": "Transportation fuel — Transport category"
  },
  {
    "query": "belanja Indomaret Alfamart minimarket",
    "expected_top5_ids": [11, 25, 38, 50],
    "note": "Convenience store shopping"
  },
  {
    "query": "Netflix Spotify Vidio langganan streaming",
    "expected_top5_ids": [6, 18],
    "note": "Subscription services"
  },
  {
    "query": "coffee kedai kopi Starbucks",
    "expected_top5_ids": [14, 29, 47],
    "note": "Coffee shops"
  },
  {
    "query": "investasi saham BBCA BBRI reksa dana",
    "expected_top5_ids": [33, 55],
    "note": "Investment transactions"
  },
  {
    "query": "cicilan kredit kartu hutang angsuran",
    "expected_top5_ids": [4, 16, 40],
    "note": "Loan / credit card repayments"
  }
]
```

**Replace the IDs** above with real transaction IDs from your database. Verify each by looking at the actual transaction text in Studio.

Now create [services/ai-service/evals/eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py):

```python
"""Retrieval benchmark: MRR@5 on 10 handwritten queries.

    PYTHONPATH=. python evals/eval_retrieval.py
"""
import asyncio, json, time
from pathlib import Path
from app.services.retriever import RetrievalService

QUERIES_FILE = Path(__file__).parent / "search_queries.json"


def mrr_at_k(ranked_ids: list[int], relevant_ids: set[int], k: int = 5) -> float:
    """Mean Reciprocal Rank at K for a single query."""
    for rank, tid in enumerate(ranked_ids[:k], start=1):
        if tid in relevant_ids:
            return 1.0 / rank
    return 0.0


async def run() -> None:
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    service = RetrievalService()

    rr_scores = []
    print(f"{'Query':<50}  {'MRR':>5}  {'Latency':>8}  Top-3 IDs")
    print("-" * 90)

    for q in queries:
        t0 = time.perf_counter()
        results = await service.search(q["query"], top_k=5)
        latency_ms = (time.perf_counter() - t0) * 1000

        ranked_ids = [r.transaction_id for r in results]
        relevant = set(q["expected_top5_ids"])
        rr = mrr_at_k(ranked_ids, relevant, k=5)
        rr_scores.append(rr)

        top3 = ranked_ids[:3]
        print(f"{q['query'][:48]:<50}  {rr:5.2f}  {latency_ms:6.0f}ms  {top3}")

    mrr = sum(rr_scores) / len(rr_scores) if rr_scores else 0.0
    print(f"\n{'MRR@5 (macro avg)':<50}  {mrr:5.3f}")
    print(f"Target: ≥ 0.60 this week, ≥ 0.80 after Week 4 re-ranking")


if __name__ == "__main__":
    asyncio.run(run())
```

**C# equivalent** (Python's `asyncio.run(run())` → `await Main()`; `mrr_at_k` → a static utility method):

```csharp
// evals/EvalRetrieval.cs
public static class EvalRetrieval
{
    private static double MrrAtK(IReadOnlyList<int> rankedIds, IReadOnlySet<int> relevant, int k = 5)
    {
        // Python: enumerate(ranked_ids[:k], start=1) → C#: .Take(k).Select((id, i) => (id, rank: i + 1))
        foreach (var (id, rank) in rankedIds.Take(k).Select((id, i) => (id, i + 1)))
        {
            if (relevant.Contains(id)) return 1.0 / rank;
        }
        return 0.0;
    }

    public static async Task Main(string[] args)
    {
        // Python: json.loads(file.read_text()) → C#: JsonSerializer.Deserialize<>(File.ReadAllText())
        // Python: RetrievalService() → C#: new RetrievalService(httpClient, dataSource, model)
        // Python: time.perf_counter() → C#: Stopwatch.GetTimestamp() / Stopwatch.Frequency
    }
}

// Python's MRR function maps directly — the algorithm is the same.
// The difference is Python's list slicing `ranked[:k]` → C# `.Take(k)`
// Python's set comprehension `set(ids)` → C# `new HashSet<int>(ids)`
```

Run and capture the output:
```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py
```

Record the MRR@5 in [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md).

### [x] STEP 14 — Commit

```bash
cd c:\workspaces\personal-finance
git add supabase/migrations/20260606000001_transaction_embeddings.sql
git add services/ai-service/app/services/embedder.py
git add services/ai-service/app/services/retriever.py
git add services/ai-service/app/models.py
git add services/ai-service/app/config.py
git add services/ai-service/app/observability.py
git add services/ai-service/app/main.py
git add services/ai-service/tests/test_embedder.py
git add services/ai-service/tests/test_retriever.py
git add services/ai-service/evals/search_queries.json
git add services/ai-service/evals/eval_retrieval.py
git add services/ai-service/scripts/backfill_embeddings.py
git add apps/api/src/PersonalFinance.Application/Interfaces/ILlmSearchClient.cs
git add apps/api/src/PersonalFinance.Infrastructure/External/LlmSearchClient.cs
git add apps/api/src/PersonalFinance.Api/Program.cs
git status    # verify NO .env, NO credentials
git commit -m "PF-AI003: RAG Phase 1 — transaction embeddings + pgvector semantic search"
```

### [x] STEP 15 — Log progress

```
/mentor log Built RAG Phase 1: transaction_embeddings table (pgvector), EmbeddingService (OpenAI text-embedding-3-small, batched), RetrievalService (cosine similarity via asyncpg), /embed-transactions + /search endpoints, .NET LlmSearchClient wired after upload. MRR@5 = 0.XX on 10 queries. Embedding cost $0.0000X/doc.
```

## 📌 Notes

- **`pgvector` extension is already on.** `CREATE EXTENSION IF NOT EXISTS vector;` is in [supabase/migrations/20260101000000_initial_schema.sql](../../../supabase/migrations/20260101000000_initial_schema.sql) line 1. The migration in Step 2 only creates the table — no extension install needed.
- **`asyncpg` is not in [pyproject.toml](../../../services/ai-service/pyproject.toml) yet.** Add `asyncpg>=0.29` and `pgvector>=0.3` to your dependencies: `pip install asyncpg pgvector` and update `pyproject.toml`.
- **`openai` SDK version.** The Python AI service currently uses Google Gemini and Anthropic SDKs. Add `openai>=1.30` to `pyproject.toml`. The `AsyncOpenAI` client in Step 4 uses the same async pattern as `anthropic.AsyncAnthropic` — familiar surface.
- **The `EmbedItem` dataclass in Step 4 vs the Pydantic `EmbedItem` in Step 6.** They serve different purposes: the Pydantic model is the API request shape (FastAPI validation); the dataclass is the internal service type (no serialization overhead). The endpoint converts Pydantic → dataclass in Step 8.
- **Connection pooling deferred.** Step 4 and 7 open a new `asyncpg` connection per call. For Week 3 (low volume, manual testing), this is fine. Add `asyncpg.create_pool()` as a FastAPI lifespan event in Week 5 when the service handles concurrent requests from the streaming chat.
- **THINK-05 (frozen contract):** the `/search` response fields (`transaction_id`, `similarity`, `description`, `date`, `amount_idr`, `flow`, `wallet`) are now a cross-service contract between Python and .NET. Rename on one side → update the other in the same commit.
- **Next week (Week 4 — Re-ranking + Generation):** the `eval_retrieval.py` you write in Step 13 becomes the baseline. Week 4 adds a re-ranker on top of the top-10 results and measures MRR lift. The delta ("re-ranking improved MRR@5 from 0.XX to 0.YY") is an interview-ready number. Set up the harness to make that measurement easy.
- **Deferred:** connection pooling, hybrid BM25+vector search (Week 6), re-ranking (Week 4), LLM synthesis / `/ask` endpoint (Week 4), Supabase RPC alternative for .NET-side search (Week 6 consideration).

## 📚 Resources / Theory to Learn

Organized by concept — read the one tied to what you're building; skip the rest until you hit that wall.

### Concept 1 — What embeddings are (Step 1 anchor)
- **Jay Alammar — *The Illustrated Word2Vec*** → https://jalammar.github.io/illustrated-word2vec/ — the best visual intuition for "words/sentences as points in space". Skim the first half only.
- **OpenAI — *Embeddings* docs*** → https://platform.openai.com/docs/guides/embeddings — the production API guide; model comparison table (3-small vs 3-large vs ada-002), chunking guidelines, use cases.

### Concept 2 — pgvector (Step 2 + Step 7)
- **pgvector README** → https://github.com/pgvector/pgvector — the authoritative reference. Read: distance operators (`<=>`, `<->`, `<#>`), index types (ivfflat vs hnsw), query tips.
- **Supabase — *pgvector quickstart*** → https://supabase.com/docs/guides/ai/vector-columns — Supabase-specific setup; already done in your initial migration, but useful for understanding the `lists` parameter in ivfflat.
- **pgvector-python** → https://github.com/pgvector/pgvector-python — the asyncpg codec registration (`register_vector`). Step 4 uses this directly.

### Concept 3 — Retrieval metrics (Step 13)
- **IR Metrics primer** (any source — you know this from the eval harness): MRR = 1/rank of first relevant result. For retrieval, "does the right transaction appear in the top-5?" is the question. MRR@5 is the metric.
- **RAGAS docs — *Context Recall* and *Context Precision*** → https://docs.ragas.io/en/stable/concepts/metrics/ — Week 4 will add grounded generation; RAGAS is the framework you'll layer on top. Skim now for vocabulary; don't implement yet.

### Concept 4 — Embedding best practices (what to embed — Step 1 + Step 4)
- **OpenAI cookbook — *Embedding Wikipedia articles for search*** → https://cookbook.openai.com/examples/embedding_wikipedia_articles_for_search — shows the "embed the doc, not just the title" principle; maps directly to "embed `description + category + wallet`, not just `description`".
- **Chip Huyen — *AI Engineering* (Ch. 5, Retrieval-Augmented Generation)*** → https://huyenchip.com/books/ — the book-length treatment; skim the chunking + embedding sections.

### Concept 5 — Async Postgres in Python (Steps 4 + 7)
- **asyncpg docs** → https://magicstack.github.io/asyncpg/current/ — especially the `fetch()` / `execute()` / `connect()` API. You're using the simplest form (no connection pool) for Week 3; add `asyncpg.create_pool()` in Week 5 when the service takes more load.
- **pgvector-python asyncpg example** → https://github.com/pgvector/pgvector-python#asyncpg — the `register_vector(conn)` pattern used in Steps 4 and 7.

### Video (one segment, not a full course)
- **DeepLearning.AI — *Building Systems with the ChatGPT API* (Embeddings section)*** → https://learn.deeplearning.ai — the 20-minute embeddings + similarity search segment explains the cosine geometry you need for the interview frame.

## 🧠 Learning Strategy

**Daily loop for Week 3:**
- **Morning (90 min, deep block #1):** embedding + storage path (Steps 2–6). Stop when `/embed-transactions` returns HTTP 200 for one transaction.
- **Midday interleave (30 min):** skim the Week 4 re-ranking reading (Cohere Rerank, FlashRank) while the embedding run is processing. You're not building it yet — you're warming the context.
- **Afternoon (90 min, deep block #2):** retrieval + MRR harness (Steps 7, 8, 13). Stop when `eval_retrieval.py` prints a number.
- **Evening (30 min):** log, update metrics doc, commit.

**The 5 principles applied to Week 3:**
1. **Active retrieval:** after Step 1 reading, close tabs and write the embedding mental model from memory in `evals/README.md`. The three questions in Step 1 are the test.
2. **Project-first:** the *only* pre-reading is Step 1 (the "what to embed" wall). Everything else: build first, read the doc when the code doesn't work.
3. **Same-day shipping:** Step 2 (migration) + Step 4 (embedder) on Day 1. Step 7 (retriever) + Step 13 (MRR) on Day 2. Commit both days.
4. **Interleaving:** run the backfill script (Step 11) while writing the test queries (Step 13) — both require wall time.
5. **Teach-back:** the "Interview frame" after Step 7 is the teach-back. If you can explain cosine distance vs similarity in one sentence without looking it up, you own the concept.

**Anti-patterns to avoid this week:**
- ❌ Starting with Ollama/nomic-embed to avoid OpenAI costs. The cost is ~$0.01 for your entire corpus. The setup friction is not worth it on Week 1 of RAG.
- ❌ Using `supabase-py` for the pgvector queries. It routes through PostgREST — you'll hit a wall trying to write `<=>`. Use `asyncpg` as specified.
- ❌ Building the re-ranker now. That's Week 4. Resist the impulse.
- ❌ Using `float` for the embedding vector in the schema check — use `vector(1536)` (pgvector type). A `float[]` column won't support the `<=>` operator.
- ❌ Embedding queries the same way as documents (adding `category + wallet`). Queries are natural language ("food in March"). Documents are enriched with category/wallet. The asymmetry is intentional.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I built a pgvector semantic search layer over my transaction history — embedding `description + category + wallet` with `text-embedding-3-small`, storing 1536-dim vectors in Supabase, and measuring MRR@5 = 0.XX on 10 handwritten queries. Embedding costs $0.0000X per document."* If you can say that with real numbers, the week worked.

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Troubleshooting a RAG pipeline (Databricks · AWS ML Engineer)

*Scenario:* Your "ask your finances" RAG feature frequently misses relevant transactions or makes up answers not grounded in the data.

*Question:* What's the best first step to troubleshoot?

- **A.** Raise the LLM's temperature so it's more creative
- **B.** Switch to a larger closed-source model
- **C.** Inspect the retrieval step first — what text you embed, your chunking/enrichment, and retrieval params (e.g., increase `top_k`, add re-ranking) so relevant context actually reaches the LLM
- **D.** Delete the vector store and re-embed in a different modality

<details>
<summary>Show answer</summary>

**C** — missing-context and hallucination in RAG are usually a *retrieval* problem first; fix what's retrieved before touching the generator.
*Maps to: Databricks GenAI Engineer Associate · Assembling & Evaluating RAG Applications; AWS Certified ML Engineer – Associate · Generative AI / RAG*
</details>

### 2. What to embed (Databricks · Google Cloud PMLE)

*Scenario:* A BCA row has `description = "DEBIT"` but the rule engine set `category = "Food & Dining"`. A query for "food spending in March" returns nothing.

*Question:* The most effective fix is to:

- **A.** Embed an enriched string (`description + remarks + category + wallet`) so the semantic signal the terse text lacks gets into the vector
- **B.** Embed only the raw `description`
- **C.** Lowercase the description before embedding
- **D.** Increase the vector dimension to 3072

<details>
<summary>Show answer</summary>

**A** — enriching the embedded text adds the semantic context that terse bank codes lack, which is what makes the search match.
*Maps to: Databricks GenAI Engineer Associate · Data Preparation (chunking/enrichment); Google Cloud PMLE · Vector Search & Embeddings*
</details>

### 3. Cosine distance vs similarity (Google Cloud PMLE · Databricks)

*Scenario:* pgvector's `<=>` operator returns a value where 0 means identical.

*Question:* Which statement is correct?

- **A.** `<=>` returns similarity, so `ORDER BY ... DESC` gives the most similar first
- **B.** Cosine distance ranges from 0 to 100
- **C.** Distance and similarity are the same value
- **D.** `<=>` returns cosine *distance* (0 = identical); compute similarity as `1 - distance` and `ORDER BY distance ASC` for most-similar-first

<details>
<summary>Show answer</summary>

**D** — `<=>` is cosine distance; similarity = `1 - distance`; order by distance ascending to get the most similar rows first.
*Maps to: Google Cloud PMLE · Vector Search & Embeddings; Databricks GenAI Engineer Associate · Retrieval*
</details>

### 4. Choosing a vector index (Databricks · Azure AI-102)

*Scenario:* Your embeddings table has a few thousand rows today but may grow significantly.

*Question:* Choosing between pgvector's `ivfflat` and `hnsw`:

- **A.** `ivfflat` always outperforms `hnsw`
- **B.** `ivfflat` has faster build time and lower memory and is fine for small/medium datasets; `hnsw` gives better recall at high query volume and scale — switch as the table grows (~100k+ rows)
- **C.** `hnsw` only runs on GPUs
- **D.** Index type affects neither recall nor latency

<details>
<summary>Show answer</summary>

**B** — `ivfflat` is cheaper to build and lighter on memory for smaller sets; `hnsw` gives better recall at scale; choose by dataset size and query volume.
*Maps to: Databricks GenAI Engineer Associate · Vector stores; Azure AI-102 · Configure a vector index (Azure AI Search)*
</details>

### 5. Query vs document embedding (Databricks · Google Cloud PMLE)

*Scenario:* Documents are embedded as `description + category + wallet`; now you embed the query "food in March".

*Question:* Which is correct?

- **A.** Embed the query with the same enrichment (add a category/wallet) as the documents
- **B.** Any embedding model works for the query as long as the dimensions match
- **C.** Re-embed all documents on every query
- **D.** Embed the query as natural language as-is, but always use the SAME embedding model that produced the stored vectors — different models live in different vector spaces and aren't comparable

<details>
<summary>Show answer</summary>

**D** — the query stays natural language (intentionally asymmetric to the enriched docs), but the embedding *model* must match storage; mixing models breaks similarity.
*Maps to: Databricks GenAI Engineer Associate · Retrieval; Google Cloud PMLE · Embeddings*
</details>

### 6. The retrieval metric (Databricks · AWS ML Engineer)

*Scenario:* For 10 test queries you know the correct transaction IDs, and you want one number for "how high up is the first correct result, on average."

*Question:* The appropriate metric is:

- **A.** MRR@k (Mean Reciprocal Rank) — the average of `1/rank` of the first relevant result across queries; MRR = 1.0 means the right answer is always rank 1
- **B.** Training accuracy
- **C.** BLEU score
- **D.** The generator's F1

<details>
<summary>Show answer</summary>

**A** — MRR@k measures the rank of the first relevant hit, the canonical retrieval-quality metric (and exactly what `eval_retrieval.py` computes).
*Maps to: Databricks GenAI Engineer Associate · Evaluating RAG Applications; AWS Certified ML Engineer – Associate · Model evaluation*
</details>
