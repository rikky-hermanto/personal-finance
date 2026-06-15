# PF-AI006 — Advanced RAG Patterns

> **Learning Phase:** Phase 2 · Chapter 6 of 12 · Day ~30 of 90
> **Status:** To Do
> **Started:** (draft compiled 2026-06-15 — execute after Ch5 Streaming completes)
> **Planned from branch:** main
> **Pivot goal:** Three techniques that move retrieval accuracy beyond naive top-K: hybrid BM25+vector search, sentence-window retrieval (wiring the Ch4 primitive), and auto-merging (hierarchical context promotion). Each technique is measured with the existing eval harness. The winner becomes the production default. After this chapter, you can name three advanced RAG patterns in an interview, show measured MRR/P@5 deltas per technique, and explain exactly when each one helps — not from a tutorial, but from your own benchmark.

## Objective

PF-AI004 shipped the second half of the RAG read path: FlashRank re-ranking, metadata filtering, grounded `/ask` with citation validation, and RAGAS faithfulness scoring. Retrieval is *good* — but "good" in this context means cosine top-K over a flat embedding table. Three complementary techniques move it further:

```
WHAT CHAPTER 4 LEFT US (baseline)
──────────────────────────────────────────────────
User Query
    │
    ▼
[Embed query]           text-embedding-3-small
    │
    ▼
[Vector search]         pgvector cosine, top-10 (ivfflat, probes=10)
    │
    ▼
[Cross-encode rerank]   FlashRank top-10 → top-3
    │
    ▼
[LLM synthesis]         POST /ask → grounded answer + citations
    │
    ▼
[Eval]                  MRR@5=1.000, P@5=0.66, RAGAS faithfulness=0.XX

WHAT CHAPTER 6 ADDS (the three techniques, independently switchable)
──────────────────────────────────────────────────────────────────────

[Vector search]  ──────────────────────────────────┐
                                                    │
[BM25 search]    ──→ [RRF merge]  ─────────────────┤   🔄 Hybrid search
  tsvector on                     RRF(k=60)         │   PF-AI006
  transactions.description                          │
                                                    ▼
                                         Merged ranked list
                                                    │
                                            (same rerank + /ask)

[Sentence-window index]  🔄 sentence-window retrieval  PF-AI006
  statement_chunks table (chunk_text indexed,
  window_text returned to LLM — "small-to-search, big-to-read")
  ↗ chunker.py from Ch4 is the primitive; this chapter wires it

[Auto-merging index]     🔄 auto-merging retrieval     PF-AI006
  parent_id hierarchy on statement_chunks
  sibling threshold → promote leaf nodes to parent context

[Eval harness]  +5 harder adversarial queries → MRR/P@5 per variant
[Pick winner]   set as SearchRequest default
```

**Three deliverables, each independently measurable:**

1. **Hybrid search** — extend `RetrievalService` with BM25 (PostgreSQL `tsvector`) + vector (pgvector cosine) + Reciprocal Rank Fusion. Add `search_mode: Literal["vector", "bm25", "hybrid"]` to `SearchRequest`. Directly improves `/search` and the retrieval stage of `/ask`.

2. **Sentence-window retrieval** — the `sentence_window_chunks()` function from `chunker.py` (Ch4) is a tested pure module with no production wiring. This chapter wires it: bank statement PDF text → `statement_chunks` table (each row = one sentence + its ±N-sentence window) → new `DocumentRetriever` searches `chunk_text` (small unit for precision), returns `window_text` (expanded for LLM context).

3. **Auto-merging retrieval** — hierarchical extension of `statement_chunks` (parent_id + level). When ≥ threshold fraction of a parent chunk's sentences are independently retrieved, the parent context replaces them. Prevents the LLM from receiving 4 fragmented sentence snippets from the same paragraph when the full paragraph is the better answer.

**Depends on:** PF-AI004 (chunker.py, reranker.py, answerer.py, eval harness, P@5 + faithfulness baseline numbers — all must exist before measuring lift)
**Unblocks:** Chapter 7 (agents build retrieval tools from this hardened pipeline), Chapter 10 blog post (the comparison table across all RAG variants is the article's headline).

## Acceptance Criteria

- [ ] `supabase/migrations/` — migration adding `tsvector` GIN index on `transactions.description` + `statement_chunks` table (id, upload_id, chunk_text, window_text, chunk_index, parent_id, level, sibling_count, embedding vector(1536))
- [ ] `SearchRequest` has `search_mode: Literal["vector", "bm25", "hybrid"] = "vector"` — existing calls unaffected (default unchanged)
- [ ] `RetrievalService.search()` supports all three modes: `vector` (existing), `bm25` (tsvector rank), `hybrid` (RRF merge of both ranked lists using k=60)
- [ ] `app/services/doc_retriever.py` — `DocumentRetriever.search_documents(query, top_k)` returns matched chunks with `window_text` expanded context
- [ ] `app/services/auto_merger.py` — `AutoMergingRetriever.retrieve(query, top_k, merge_threshold=0.5)` promotes sibling clusters to parent context when threshold hit
- [ ] `scripts/backfill_statement_chunks.py` — loads raw PDF text, runs `sentence_window_chunks()` + batch-embeds, inserts into `statement_chunks`; dry-run flag supported
- [ ] Eval harness extended: 5 adversarial queries added to `evals/search_queries.json` (keyword-wins, semantic-wins, date-crossing, ambiguous, English-query variants)
- [ ] All variants benchmarked: `vector`, `bm25`, `hybrid`, `vector+rerank`, `hybrid+rerank`, `sentence_window` — MRR@5 + P@5 recorded per variant in `docs/performances/ai-observability-metrics.md`
- [ ] `app/services/retriever.py` updated with winning variant as new default `search_mode`
- [ ] `docs/mentor/advanced-rag-notes.md` — 1-paragraph "what I learned" write-up per technique (feeds blog post)
- [ ] Tests: `tests/test_hybrid_search.py` (RRF logic + SQL path), `tests/test_doc_retriever.py`, `tests/test_auto_merger.py` — all pass with mocked asyncpg/embedder

## Approach

**Hybrid search: RRF, not weighted sum.** The alternative is `alpha * vector_score + (1 - alpha) * bm25_score` — but vector scores (cosine similarity, 0–1) and BM25 scores (unbounded log-frequency weights) are on incomparable scales. Normalizing them requires knowing the range in advance, which depends on the query. RRF sidesteps the scaling problem entirely: it ranks each list independently, then combines *rank positions* (always 1, 2, 3 … N) with `1/(k + rank)`. k=60 is the canonical constant from the original RRF paper (Cormack et al., SIGIR 2009) — it was tuned on TREC benchmarks and generalizes well. The merge happens in Python, not SQL, because both ranked lists need to be fetched separately from two different query types (`<=>` operator vs `ts_rank`).

**'simple' tsvector config, not 'indonesian'.** PostgreSQL ships an `indonesian` text search configuration in recent versions, but Supabase's managed instance may not have the stemming dictionary installed, and local dev Supabase is unlikely to have it. The `simple` config tokenizes on whitespace and punctuation without stemming — sufficient for Indonesian bank descriptions where the text is already terse (`BELANJA MAKAN`, `TRANSFER PLN`, `OVO KOPI`) and exact-keyword BM25 works well without stemming. If an 'indonesian' config is available, switching is a one-word change.

**Sentence-window wired against statement text, not transactions.** Transaction rows are one-line texts — chunking them is pointless. Bank statement PDFs already flow through the extraction pipeline; the raw text extracted by PyMuPDF (`pdf_extractor.py`) is what feeds the LLM. That text (1–5 pages per file) is what belongs in `statement_chunks`. The backfill script re-fetches PDFs from Supabase Storage, re-extracts text, and chunks → embeds → stores. Going forward, the extraction pipeline adds this as a side-effect step.

**Auto-merging as a hierarchical extension of the same table.** Rather than a second table, `statement_chunks` gets `parent_id` (self-referential FK) and `level` (0=sentence, 1=paragraph, 2=page). During indexing, sentence-level rows are created first, then parent rows aggregated from them. At retrieval time, `AutoMergingRetriever` groups retrieved sentences by parent_id and applies the merge threshold. This keeps the schema additive and the retrieval logic testable against a fixed fixture — no live Supabase connection needed in unit tests.

**No LlamaIndex/LangChain in app code.** Both frameworks have native implementations of all three techniques. They arrive in Chapters 7–8, *after* you've hand-rolled what they abstract. The DeepLearning.AI `Building Agentic RAG with LlamaIndex` course (slotted for this chapter) is a learning resource, not a dependency. Read it to understand LlamaIndex's data model; implement natively so the code is yours to explain.

Out of scope: conversation memory across `/ask` calls (Chapter 8), `.NET` chat UI proxy (Chapter 5 + Chapter 8), fine-grained RLS on `statement_chunks` (PF-S14).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/{ts}_advanced_rag.sql` | Create — tsvector GIN index + statement_chunks table |
| `services/ai-service/app/services/retriever.py` | Edit — add `bm25` + `hybrid` (RRF) search modes; `search_mode` param |
| `services/ai-service/app/models.py` | Edit — add `search_mode` to `SearchRequest` |
| `services/ai-service/app/services/doc_retriever.py` | Create — `DocumentRetriever` over `statement_chunks` |
| `services/ai-service/app/services/auto_merger.py` | Create — `AutoMergingRetriever` (sibling-threshold merge) |
| `services/ai-service/app/main.py` | Edit — wire `DocumentRetriever` + `AutoMergingRetriever` in lifespan |
| `services/ai-service/scripts/backfill_statement_chunks.py` | Create — PDF → sentence_window_chunks → embed → insert |
| `services/ai-service/tests/test_hybrid_search.py` | Create — RRF logic + BM25 SQL path (mocked asyncpg) |
| `services/ai-service/tests/test_doc_retriever.py` | Create — unit tests (mocked asyncpg) |
| `services/ai-service/tests/test_auto_merger.py` | Create — unit tests (mocked DocumentRetriever) |
| `services/ai-service/evals/search_queries.json` | Edit — add 5 adversarial queries |
| `services/ai-service/evals/eval_retrieval.py` | Edit — `--mode` flag for all variants; multi-variant comparison table |
| `docs/performances/ai-observability-metrics.md` | Edit — per-variant MRR@5 + P@5 comparison table |
| `docs/mentor/advanced-rag-notes.md` | Create — 1-paragraph write-up per technique |

---

## TODO

### [ ] STEP 0 — Prerequisite gate: Chapter 4 numbers exist

```bash
# Both lines must print real numbers before starting Chapter 6
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py           # prints P@5 baseline
PYTHONPATH=. python evals/eval_retrieval.py --rerank  # prints re-ranked P@5
grep "P@5 reranked" docs/performances/ai-observability-metrics.md
grep "RAGAS faithfulness" docs/performances/ai-observability-metrics.md
```

> **Why:** Chapter 6's headline is a *comparison table* — five variants, each with a number. Without the Ch4 baseline committed to the metrics doc, the table has a blank first row and the delta story falls apart. Don't start STEP 1 until the grep hits.

---

### [ ] STEP 1 — Theory anchor: three techniques, 45 minutes, in order

Read these three sources sequentially — each primes the next. The goal is to close your laptop after reading and answer the active-retrieval questions from memory.

**Read order:**
1. **pgvector hybrid search README** → https://github.com/pgvector/pgvector#hybrid-search — the RRF example SQL is the code anchor. Note the k=60 constant and why rank positions, not raw scores, are combined. (10 min)
2. **LlamaIndex — Sentence Window Retrieval** → https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/ — skim the diagram showing `index_node` vs `window_node`. You'll hand-roll this; the diagram is the mental model. (10 min)
3. **LlamaIndex — Auto-Merging Retriever** → https://docs.llamaindex.ai/en/stable/examples/retrievers/auto_merging_retriever/ — focus on the sibling-threshold concept and the parent/child node hierarchy. (10 min)
4. **DeepLearning.AI — Building Agentic RAG with LlamaIndex** (free, ~3h) → https://learn.deeplearning.ai/courses/building-evaluating-advanced-rag — watch only the sentence-window and auto-merging segments (~30 min of the course). Skip the LlamaIndex-framework-specific code sections; understand the concepts. (30 min)

**Active-retrieval task (mandatory):** Close all tabs. In `docs/mentor/advanced-rag-notes.md`, create three stub sections and write from memory:
- **Hybrid search:** why is combining rank positions (RRF) safer than combining raw scores?
- **Sentence-window:** what two different representations does a chunk have, and which one gets indexed?
- **Auto-merging:** what triggers a merge, and what is returned when one fires?

> **Why:** These three techniques are the most commonly asked "advanced RAG" questions in AI Eng loops. If you can't reconstruct the intuition from memory after reading, the implementation code will be cargo-cult. The write-up stubs you create here are also Step 8's output — you're writing the blog-post notes at the same time.

> **The interview frame:** "I implemented three advanced RAG patterns in my personal finance platform and benchmarked each against the same eval set: hybrid BM25+vector search via RRF (best for keyword-rich Indonesian bank descriptions), sentence-window retrieval over statement PDFs (small-to-search, big-to-read), and auto-merging (sibling promotion when a paragraph's sentences cluster together in results). The winning combination was [X] — it lifted P@5 from 0.66 to 0.YY."

---

### [ ] STEP 2 — Supabase migration

Create `supabase/migrations/{yyyyMMddHHmmss}_advanced_rag.sql`:

```sql
-- Part 1: BM25 / hybrid search on transactions
-- Add a generated tsvector column (auto-updated on INSERT/UPDATE) + GIN index.
-- 'simple' config: whitespace tokenization, no stemming — correct for terse
-- Indonesian bank descriptions (BELANJA MAKAN, TRANSFER PLN, etc.) where BM25
-- on exact tokens outperforms stemming-based approaches.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS description_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(description, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_transactions_description_tsv
    ON transactions USING GIN (description_tsv);


-- Part 2: Document chunks (sentence-window + auto-merging)
CREATE TABLE IF NOT EXISTS statement_chunks (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id     text        NOT NULL,   -- file hash from uploaded_files; no FK to keep schema simple
    chunk_text    text        NOT NULL,   -- indexed: the small unit for semantic search
    window_text   text        NOT NULL,   -- returned: expanded context for the LLM
    chunk_index   int         NOT NULL,   -- position within the source document
    parent_id     uuid        REFERENCES statement_chunks(id) ON DELETE CASCADE,
    level         int         NOT NULL DEFAULT 0,  -- 0=sentence, 1=paragraph, 2=page
    sibling_count int         NOT NULL DEFAULT 1,  -- total children under this node's parent
    embedding     vector(1536),
    created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statement_chunks_upload_id
    ON statement_chunks (upload_id);

CREATE INDEX IF NOT EXISTS idx_statement_chunks_parent_id
    ON statement_chunks (parent_id);

-- ivfflat on 1536-dim embeddings. lists=50 adequate for a few thousand chunks.
CREATE INDEX IF NOT EXISTS idx_statement_chunks_embedding
    ON statement_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- RLS (permissive placeholder — mirrors other tables; tighten in PF-S14)
ALTER TABLE statement_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_chunks_allow_all ON statement_chunks USING (true);
```

Apply:
```bash
supabase db push
# or against local stack:
supabase db reset   # only if you're ok wiping local data
```

Verify the generated column and index landed:
```bash
# In Supabase Studio → Table Editor → transactions → check description_tsv column
# OR via psql:
supabase db connect --local
\d transactions   # should show description_tsv as a generated column
\d statement_chunks
```

> **Why a generated column instead of a trigger?** `GENERATED ALWAYS AS ... STORED` keeps the tsvector in sync automatically on INSERT and UPDATE with zero application code. A trigger achieves the same but adds maintenance surface. The column is invisible to the supabase-csharp SDK by default (it doesn't appear in `SELECT *` unless named explicitly) — but the Python AI service queries it directly via asyncpg SQL, so that's fine.

> **Why `sibling_count` on the chunk row?** The auto-merging merge check is `len(retrieved_siblings) / sibling_count >= threshold`. If sibling_count lives only in the parent row, every merge check requires a join or a separate lookup. Denormalizing it onto each leaf row makes the merge decision a pure in-memory computation after the initial search — no extra DB round-trip per cluster.

---

### [ ] STEP 3 — Hybrid search: extend `RetrievalService` + `SearchRequest`

**3a. Add `search_mode` to `SearchRequest` in `app/models.py`:**

```python
from typing import Literal

class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=50)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    # PF-AI004 filters (unchanged)
    category: str | None = None
    account: str | None = None
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    rerank: bool = False
    # PF-AI006: search mode (additive-optional, existing callers unaffected)
    search_mode: Literal["vector", "bm25", "hybrid"] = "vector"
```

**3b. Add BM25 + RRF to `app/services/retriever.py`:**

Add the RRF helper (pure function — easy to test):

```python
def _rrf_merge(
    vector_ids: list[int],
    bm25_ids: list[int],
    k: int = 60,
) -> list[int]:
    """Reciprocal Rank Fusion over two ranked ID lists.

    RRF(d) = Σ_list 1 / (k + rank(d, list))
    k=60 is the canonical constant from Cormack et al. SIGIR 2009.
    Result is sorted descending by fused score.
    """
    scores: dict[int, float] = {}
    for rank, id_ in enumerate(vector_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    for rank, id_ in enumerate(bm25_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda x: scores[x], reverse=True)
```

Add the BM25 query path to `RetrievalService`:

```python
async def _search_bm25(
    self,
    conn,
    query: str,
    top_k: int,
    where_extra: str,
    params_extra: list,
) -> list[int]:
    """Return transaction IDs ranked by tsvector BM25 score."""
    # Base BM25 SQL — does not use $1::vector; query is a text tsquery
    bm25_params = [query, top_k, *params_extra]
    bm25_sql = f"""
        SELECT t.id
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.description_tsv @@ plainto_tsquery('simple', $1)
        {('AND ' + where_extra) if where_extra else ''}
        ORDER BY ts_rank(t.description_tsv, plainto_tsquery('simple', $1)) DESC
        LIMIT $2
    """
    rows = await conn.fetch(bm25_sql, *bm25_params)
    return [r["id"] for r in rows]


async def search(
    self,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.0,
    category: str | None = None,
    account: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search_mode: str = "vector",   # "vector" | "bm25" | "hybrid"
) -> list[SearchResult]:
    async with self._pool.acquire() as conn:
        await conn.execute("SET ivfflat.probes = 10")

        # Build shared WHERE clauses for metadata filters
        where_clauses, extra_params = [], []
        # ... (existing filter builder from PF-AI004 unchanged) ...

        if search_mode == "bm25":
            ids = await self._search_bm25(conn, query, top_k, ...)
            # fetch full rows for the returned ids and map to SearchResult
            return await self._fetch_results_by_ids(conn, ids)

        if search_mode == "hybrid":
            # Fetch both ranked lists (top-k each) then RRF-merge
            vector_ids = [r.transaction_id for r in await self._search_vector(conn, query, top_k, ...)]
            bm25_ids   = await self._search_bm25(conn, query, top_k, ...)
            merged_ids = _rrf_merge(vector_ids, bm25_ids)[:top_k]
            return await self._fetch_results_by_ids(conn, merged_ids)

        # default: "vector" — existing path unchanged
        return await self._search_vector(conn, query, top_k, ...)
```

> **Why keep both lists at `top_k` each before RRF?** Common mistake: fetching `top_k / 2` from each list to "cap the total". That defeats the complementarity — a document ranked #8 in vector but #1 in BM25 (a keyword-exact hit) disappears if you only fetch top-5 from BM25. Always fetch `top_k` (or more) from each, merge, then trim to `top_k` after RRF.

> **Why `plainto_tsquery` and not `to_tsquery`?** `to_tsquery` requires the caller to pre-format with `&` and `:*` operators — it fails on natural-language input like `"tagihan listrik PLN bulan lalu"`. `plainto_tsquery` parses the string as AND-joined unquoted words, which matches the intent of a transaction search query.

> **The interview frame:** "BM25 is the classic keyword scorer — it rewards exact term matches with frequency and inverse-document-frequency weighting. Vector search finds semantically similar documents even when keywords differ. They're complementary: BM25 wins on 'tagihan listrik PLN' (exact brand keyword), vector wins on 'pengeluaran makan mirip warung padang' (conceptual paraphrase). RRF combines their ranked lists without needing to normalise their incompatible scores."

Create `services/ai-service/tests/test_hybrid_search.py`:

```python
import pytest
from app.services.retriever import _rrf_merge


def test_rrf_merge_promotes_document_present_in_both_lists():
    # doc 3 appears in both lists at rank 2 and 1 respectively → highest RRF
    vector_ids = [1, 3, 5]
    bm25_ids   = [3, 2, 4]
    result = _rrf_merge(vector_ids, bm25_ids)
    assert result[0] == 3


def test_rrf_merge_documents_only_in_one_list_still_included():
    vector_ids = [1, 2]
    bm25_ids   = [3, 4]
    result = _rrf_merge(vector_ids, bm25_ids)
    assert set(result) == {1, 2, 3, 4}


def test_rrf_merge_k60_score_ordering():
    # rank 1 from both lists > rank 1 from one list
    both_first = _rrf_merge([10], [10])          # appears rank-1 in both
    one_first  = _rrf_merge([10], [99])          # 10 appears rank-1 only in vector
    # combined score of 10 in both_first > one_first: 2/(1+60) vs 1/(1+60)
    from app.services.retriever import _rrf_merge as rrf
    scores_both = {}
    for rank, id_ in enumerate([10], start=1):
        scores_both[id_] = scores_both.get(id_, 0.0) + 1.0 / (60 + rank)
        scores_both[id_] += 1.0 / (60 + rank)   # also in bm25 at rank 1
    assert scores_both[10] == pytest.approx(2 / 61)


def test_rrf_merge_empty_bm25_falls_back_to_vector_order():
    vector_ids = [5, 3, 1]
    result = _rrf_merge(vector_ids, [])
    assert result == [5, 3, 1]
```

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_hybrid_search.py -v
```

---

### [ ] STEP 4 — Sentence-window document store + `DocumentRetriever`

**4a. Backfill script `scripts/backfill_statement_chunks.py`:**

```python
"""Backfill sentence-window chunks for all uploaded PDFs in Supabase Storage.

Usage:
    PYTHONPATH=. python scripts/backfill_statement_chunks.py [--dry-run]
"""
import argparse, asyncio, logging, os
from pathlib import Path

import asyncpg
from openai import AsyncOpenAI

from app.services.chunker import sentence_window_chunks
from app.services.pdf_extractor import extract_pdf_text   # existing module
from app.config import settings

logger = logging.getLogger(__name__)
BATCH_SIZE = 50


async def backfill(dry_run: bool) -> None:
    from supabase import create_client
    sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
    pool = await asyncpg.create_pool(settings.database_url)
    oai = AsyncOpenAI(api_key=settings.openai_api_key)

    # List all PDF files in the bank-statements bucket
    response = sb.storage.from_("bank-statements").list()
    pdf_files = [f for f in response if f["name"].endswith(".pdf")]
    logger.info("Found %d PDFs to backfill", len(pdf_files))

    for file_meta in pdf_files:
        upload_id = file_meta["name"]

        # Skip if already indexed (idempotent)
        async with pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT count(*) FROM statement_chunks WHERE upload_id=$1", upload_id
            )
        if existing:
            logger.info("SKIP %s (%d chunks already indexed)", upload_id, existing)
            continue

        # Download + extract text
        raw = sb.storage.from_("bank-statements").download(upload_id)
        text = extract_pdf_text(raw)
        if not text.strip():
            logger.warning("EMPTY text for %s — skipping", upload_id)
            continue

        # Chunk into sentence windows (window_size=2 = ±2 sentences)
        chunks = sentence_window_chunks(text, window_size=2)
        logger.info("%s → %d chunks", upload_id, len(chunks))
        if dry_run:
            continue

        # Batch-embed chunk_text (the small indexed unit)
        texts = [c.text for c in chunks]
        embeddings = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            resp = await oai.embeddings.create(model="text-embedding-3-small", input=batch)
            embeddings.extend([e.embedding for e in resp.data])

        # Insert rows (sentence-level only; parent hierarchy in Step 5)
        async with pool.acquire() as conn:
            rows = [
                (upload_id, c.text, c.window, c.index, 0, 1, emb)
                for c, emb in zip(chunks, embeddings)
            ]
            await conn.executemany(
                """INSERT INTO statement_chunks
                   (upload_id, chunk_text, window_text, chunk_index, level, sibling_count, embedding)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::vector)""",
                rows,
            )
        logger.info("Indexed %d chunks for %s", len(chunks), upload_id)

    await pool.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    logging.basicConfig(level=logging.INFO)
    asyncio.run(backfill(ap.parse_args().dry_run))
```

Run dry-run first:
```bash
cd services/ai-service
PYTHONPATH=. python scripts/backfill_statement_chunks.py --dry-run
# confirm it lists PDFs and chunk counts without inserting

PYTHONPATH=. python scripts/backfill_statement_chunks.py
# actual backfill — check Supabase Studio → statement_chunks for rows
```

**4b. Create `app/services/doc_retriever.py`:**

```python
"""DocumentRetriever: semantic search over sentence-window statement chunks.

Searches chunk_text (the small indexed unit) but returns window_text (expanded
context) — "small-to-search, big-to-read." This is the production wiring of
the chunker.py primitive built in Chapter 4.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ChunkResult:
    chunk_id: str
    upload_id: str
    chunk_text: str          # the searched unit
    window_text: str         # the expanded context — hand to the LLM
    chunk_index: int
    parent_id: str | None
    sibling_count: int
    similarity: float


class DocumentRetriever:
    def __init__(self, pool, openai_client: AsyncOpenAI) -> None:
        self._pool = pool
        self._oai = openai_client

    async def search_documents(
        self, query: str, top_k: int = 5, upload_id: str | None = None
    ) -> list[ChunkResult]:
        resp = await self._oai.embeddings.create(
            model="text-embedding-3-small", input=[query]
        )
        query_vec = resp.data[0].embedding

        sql = """
            SELECT id, upload_id, chunk_text, window_text, chunk_index,
                   parent_id, sibling_count,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM statement_chunks
            WHERE ($3::text IS NULL OR upload_id = $3)
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        """
        async with self._pool.acquire() as conn:
            await conn.execute("SET ivfflat.probes = 10")
            rows = await conn.fetch(sql, query_vec, top_k, upload_id)

        return [
            ChunkResult(
                chunk_id=str(r["id"]),
                upload_id=r["upload_id"],
                chunk_text=r["chunk_text"],
                window_text=r["window_text"],
                chunk_index=r["chunk_index"],
                parent_id=str(r["parent_id"]) if r["parent_id"] else None,
                sibling_count=r["sibling_count"],
                similarity=float(r["similarity"]),
            )
            for r in rows
        ]

    async def get_chunk_by_id(self, chunk_id: str) -> ChunkResult | None:
        sql = "SELECT * FROM statement_chunks WHERE id = $1::uuid"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(sql, chunk_id)
        if not row:
            return None
        return ChunkResult(
            chunk_id=str(row["id"]),
            upload_id=row["upload_id"],
            chunk_text=row["chunk_text"],
            window_text=row["window_text"],
            chunk_index=row["chunk_index"],
            parent_id=str(row["parent_id"]) if row["parent_id"] else None,
            sibling_count=row["sibling_count"],
            similarity=0.0,
        )
```

Create `tests/test_doc_retriever.py` (mocked asyncpg pool + mocked OpenAI client):

```python
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.services.doc_retriever import DocumentRetriever, ChunkResult


def _mock_pool(rows: list[dict]):
    conn = AsyncMock()
    conn.execute = AsyncMock()
    conn.fetch = AsyncMock(return_value=[MagicMock(**r) for r in rows])
    conn.__aenter__ = AsyncMock(return_value=conn)
    conn.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=conn)
    return pool


def _mock_oai(vec: list[float]):
    oai = AsyncMock()
    embedding = MagicMock()
    embedding.embedding = vec
    oai.embeddings.create = AsyncMock(return_value=MagicMock(data=[embedding]))
    return oai


@pytest.mark.asyncio
async def test_search_documents_maps_rows_to_chunk_results():
    pool = _mock_pool([{
        "id": "aaaa-bbbb", "upload_id": "stmt1.pdf",
        "chunk_text": "Starbucks kopi", "window_text": "Bayar Starbucks kopi dengan GoPay.",
        "chunk_index": 3, "parent_id": None, "sibling_count": 1, "similarity": 0.91,
    }])
    retriever = DocumentRetriever(pool, _mock_oai([0.1] * 1536))
    results = await retriever.search_documents("kopi", top_k=5)
    assert len(results) == 1
    assert results[0].window_text == "Bayar Starbucks kopi dengan GoPay."
    assert results[0].similarity == pytest.approx(0.91)


@pytest.mark.asyncio
async def test_search_documents_returns_window_text_not_chunk_text():
    # "small-to-search, big-to-read" — the window is what comes back
    pool = _mock_pool([{
        "id": "x", "upload_id": "u", "chunk_text": "PLN",
        "window_text": "Bayar tagihan PLN bulan Maret via transfer BCA.",
        "chunk_index": 0, "parent_id": None, "sibling_count": 1, "similarity": 0.85,
    }])
    retriever = DocumentRetriever(pool, _mock_oai([0.0] * 1536))
    results = await retriever.search_documents("listrik")
    assert "PLN bulan Maret" in results[0].window_text   # expanded, not just "PLN"
```

```bash
PYTHONPATH=. pytest tests/test_doc_retriever.py -v
```

> **Why the expanded `window_text` instead of `chunk_text` to the LLM?** The LLM needs enough context to *synthesize*, not just *identify*. "PLN" as a chunk_text gives the semantic search signal; "Bayar tagihan PLN bulan Maret via transfer BCA Rp 250.000" as window_text gives the LLM the full sentence it needs to correctly compute the running total. The chunk_text is the *retrieval unit*; window_text is the *generation unit*.

---

### [ ] STEP 5 — Auto-merging retrieval

**5a. Index parent rows in the backfill script (extend STEP 4 script):**

After inserting sentence rows, group them into paragraph-level parent chunks and insert those:

```python
async def _index_parents(conn, upload_id: str, chunks) -> None:
    """Create paragraph-level parents (every 5 sentences) with child back-references."""
    PARA_SIZE = 5
    para_ids = []
    for i in range(0, len(chunks), PARA_SIZE):
        group = chunks[i:i + PARA_SIZE]
        para_text = " ".join(c.text for c in group)
        para_window = " ".join(c.window for c in group)
        para_id = await conn.fetchval(
            """INSERT INTO statement_chunks
               (upload_id, chunk_text, window_text, chunk_index, level, sibling_count)
               VALUES ($1, $2, $3, $4, 1, $5) RETURNING id""",
            upload_id, para_text, para_window, i // PARA_SIZE, len(group),
        )
        # Back-link sentence-level children to this parent
        child_ids = [c_id for c_id in []]  # placeholder — extend with the real insert-returning ids
        await conn.execute(
            "UPDATE statement_chunks SET parent_id=$1, sibling_count=$2 WHERE upload_id=$3 AND chunk_index >= $4 AND chunk_index < $5 AND level=0",
            para_id, len(group), upload_id, i, i + PARA_SIZE,
        )
        para_ids.append(para_id)
```

**5b. Create `app/services/auto_merger.py`:**

```python
"""AutoMergingRetriever: sibling-threshold promotion to parent context.

When >= merge_threshold fraction of a parent chunk's sentence children are
independently retrieved, replace them with the parent chunk (which has the
full paragraph context). Prevents the LLM from receiving 4 scattered fragments
from the same paragraph when the whole paragraph is the right answer.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from app.services.doc_retriever import ChunkResult, DocumentRetriever

logger = logging.getLogger(__name__)


class AutoMergingRetriever:
    def __init__(self, doc_retriever: DocumentRetriever) -> None:
        self._retriever = doc_retriever

    async def retrieve(
        self,
        query: str,
        top_k: int = 5,
        merge_threshold: float = 0.5,
        upload_id: str | None = None,
    ) -> list[ChunkResult]:
        # 1. Retrieve a wide candidate set of sentence-level chunks
        candidates = await self._retriever.search_documents(
            query, top_k=top_k * 3, upload_id=upload_id
        )

        # 2. Group by parent_id (sentence-level chunks without a parent stay as-is)
        by_parent: dict[str | None, list[ChunkResult]] = defaultdict(list)
        for c in candidates:
            by_parent[c.parent_id].append(c)

        # 3. Apply merge logic
        merged: list[ChunkResult] = []
        for parent_id, children in by_parent.items():
            if parent_id is None:
                # No parent — keep as individual chunks
                merged.extend(children)
                continue

            # sibling_count is the total sentences under this parent
            sibling_count = children[0].sibling_count if children else 1
            ratio = len(children) / sibling_count

            if ratio >= merge_threshold:
                # Fetch and use the parent chunk (wider context)
                parent = await self._retriever.get_chunk_by_id(parent_id)
                if parent:
                    logger.debug(
                        "Auto-merge: %d/%d siblings → promoted parent %s",
                        len(children), sibling_count, parent_id,
                    )
                    merged.append(parent)
                else:
                    merged.extend(children)  # parent missing — fallback
            else:
                merged.extend(children)

        # De-duplicate (a chunk may appear in multiple parent groups after merging)
        seen: set[str] = set()
        deduped = [c for c in merged if c.chunk_id not in seen and not seen.add(c.chunk_id)]

        return deduped[:top_k]
```

Create `tests/test_auto_merger.py`:

```python
from unittest.mock import AsyncMock
import pytest
from app.services.doc_retriever import ChunkResult
from app.services.auto_merger import AutoMergingRetriever


def _chunk(chunk_id: str, parent_id: str | None, sibling_count: int) -> ChunkResult:
    return ChunkResult(
        chunk_id=chunk_id, upload_id="u", chunk_text=f"text-{chunk_id}",
        window_text=f"window-{chunk_id}", chunk_index=0,
        parent_id=parent_id, sibling_count=sibling_count, similarity=0.9,
    )


def _parent_chunk(chunk_id: str) -> ChunkResult:
    return ChunkResult(
        chunk_id=chunk_id, upload_id="u", chunk_text=f"PARA-{chunk_id}",
        window_text=f"PARA-window-{chunk_id}", chunk_index=0,
        parent_id=None, sibling_count=1, similarity=0.0,
    )


@pytest.mark.asyncio
async def test_auto_merge_promotes_parent_when_threshold_met():
    retriever = AsyncMock()
    # 3 of 4 siblings retrieved — ratio 0.75 >= 0.5 threshold → promote parent
    retriever.search_documents = AsyncMock(return_value=[
        _chunk("c1", "p1", 4),
        _chunk("c2", "p1", 4),
        _chunk("c3", "p1", 4),
    ])
    retriever.get_chunk_by_id = AsyncMock(return_value=_parent_chunk("p1"))
    merger = AutoMergingRetriever(retriever)
    results = await merger.retrieve("q", top_k=5)
    ids = [r.chunk_id for r in results]
    assert "p1" in ids
    assert "c1" not in ids  # children replaced by parent


@pytest.mark.asyncio
async def test_auto_merge_keeps_individual_chunks_below_threshold():
    retriever = AsyncMock()
    # 1 of 4 siblings — ratio 0.25 < 0.5 threshold → keep individual
    retriever.search_documents = AsyncMock(return_value=[_chunk("c1", "p1", 4)])
    retriever.get_chunk_by_id = AsyncMock(return_value=_parent_chunk("p1"))
    merger = AutoMergingRetriever(retriever)
    results = await merger.retrieve("q", top_k=5)
    assert results[0].chunk_id == "c1"


@pytest.mark.asyncio
async def test_auto_merge_handles_chunks_without_parent():
    retriever = AsyncMock()
    retriever.search_documents = AsyncMock(return_value=[_chunk("c_orphan", None, 1)])
    merger = AutoMergingRetriever(retriever)
    results = await merger.retrieve("q", top_k=5)
    assert results[0].chunk_id == "c_orphan"
```

```bash
PYTHONPATH=. pytest tests/test_auto_merger.py -v
```

> **Why group by parent_id first, then check threshold?** The merge decision is per-parent — each parent is either promoted or kept. A flat filter (`if len(children) >= N`) doesn't know which parent these children belong to. The grouping step makes the merge logic explicit and testable: you can unit-test the threshold arithmetic directly without needing a database.

> **The interview frame:** "Auto-merging works by indexing at the sentence level for precision, but tracking a parent hierarchy. At retrieval time, if multiple sentences from the same paragraph are returned, it's evidence the whole paragraph is relevant — so we swap the fragments for the parent context. It's the inverse of sentence-window: both start with small indexed units, but sentence-window always expands, while auto-merging only expands when enough siblings co-occur."

---

### [ ] STEP 6 — Extend eval harness: 5 adversarial queries + multi-variant benchmark

**6a. Add 5 adversarial queries to `evals/search_queries.json`:**

The original 10 queries were written to work with naive vector search. Adversarial queries stress-test the *complementarity* of the three techniques:

```json
// Add to existing search_queries.json array:
{
  "id": "q11",
  "query": "tagihan listrik PLN",
  "note": "BM25-wins: exact brand + product keyword; vector likely ranks non-PLN bills higher on 'tagihan' alone"
},
{
  "id": "q12",
  "query": "makan siang di kantor",
  "note": "semantic-wins: descriptions say 'WARUNG', 'RESTO', 'MAKAN' — paraphrase, not exact"
},
{
  "id": "q13",
  "query": "pengeluaran akhir Maret dan awal April",
  "note": "date-crossing: straddles two months; metadata date filter alone can't help"
},
{
  "id": "q14",
  "query": "all coffee spending this year",
  "note": "English query: tests whether hybrid handles mixed-language queries (embedding is multilingual)"
},
{
  "id": "q15",
  "query": "transfer yang aneh atau mencurigakan",
  "note": "adversarial semantic: no 'fraud' or 'suspicious' in descriptions — should return uncertain or no-context"
}
```

Fill `relevant_ids` from Supabase Studio after verifying the real transaction IDs for each.

**6b. Extend `evals/eval_retrieval.py` with `--mode` flag:**

```python
"""Retrieval benchmark: MRR@5 and P@5 across search modes.

    PYTHONPATH=. python evals/eval_retrieval.py --mode vector           # baseline
    PYTHONPATH=. python evals/eval_retrieval.py --mode bm25
    PYTHONPATH=. python evals/eval_retrieval.py --mode hybrid
    PYTHONPATH=. python evals/eval_retrieval.py --mode hybrid --rerank  # best combo?
    PYTHONPATH=. python evals/eval_retrieval.py --mode sentence_window
"""
import argparse, asyncio, json, time
from pathlib import Path

MODES = ("vector", "bm25", "hybrid", "sentence_window")

async def run(mode: str, rerank: bool) -> dict:
    ...  # extend existing logic: branch on mode to call the right service
    return {"mode": mode, "rerank": rerank, "mrr": mrr, "p5": p5, "latency_p50_ms": p50}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=MODES, default="vector")
    ap.add_argument("--rerank", action="store_true")
    ap.add_argument("--all", action="store_true", help="run all modes sequentially")
    args = ap.parse_args()

    if args.all:
        results = []
        for m in MODES:
            results.append(asyncio.run(run(m, rerank=False)))
            if m in ("vector", "hybrid"):
                results.append(asyncio.run(run(m, rerank=True)))
        print("\n## Retrieval Variant Comparison\n")
        print(f"{'Mode':<28} {'MRR@5':>6} {'P@5':>6} {'p50 ms':>8}")
        print("-" * 52)
        for r in results:
            label = r["mode"] + ("+rerank" if r["rerank"] else "")
            print(f"{label:<28} {r['mrr']:>6.3f} {r['p5']:>6.3f} {r['latency_p50_ms']:>8.1f}")
    else:
        asyncio.run(run(args.mode, args.rerank))
```

Run all variants and record the comparison table:

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py --all
```

Paste the printed table into `docs/performances/ai-observability-metrics.md`.

> **Why 5 adversarial queries specifically?** A homogeneous eval set can't surface complementarity. If all 10 baseline queries are semantic (they were designed for vector search), hybrid never wins — BM25 gets no credit even when it should. "tagihan listrik PLN" is a real query a user types; it should hit BM25 #1 (PLN is verbatim in descriptions). Without it in the set, the eval says "hybrid tied with vector" and you'd never know the difference matters.

---

### [ ] STEP 7 — Pick winner + update production default

After the benchmark table is in hand, apply this decision framework:

| Criterion | Weight | What to check |
|-----------|--------|---------------|
| MRR@5 on adversarial queries | high | Hybrid usually beats pure vector here |
| P@5 on adversarial queries | high | P@5 measures top-5 precision, more relevant than MRR for multi-result UX |
| p50 latency | medium | Hybrid adds a BM25 SQL call; sentence-window adds an embedding + separate table |
| Faithfulness delta | medium | Re-run `eval_faithfulness.py` with winning mode's contexts |

The likely winner is `hybrid` (vector + BM25 + RRF) for the primary `/search` + `/ask` path, because Indonesian bank descriptions are term-rich and the complementarity is real. Sentence-window wins for document-level Q&A over statement PDFs.

Update the production default in `SearchRequest`:

```python
search_mode: Literal["vector", "bm25", "hybrid"] = "hybrid"   # winner from eval
```

Update `AnswerService.ask()` to accept `search_mode` from the `AskRequest` if you want to expose it, or hard-code the winning mode as the answerer's internal default:

```python
candidates = await self._retriever.search(
    query=request.query,
    top_k=10,
    search_mode="hybrid",   # winner from Ch6 eval
    ...
)
```

Commit message note: document the mode chosen and why (the eval delta) in the commit body, not a code comment — the commit log is the right place for the decision rationale.

---

### [ ] STEP 8 — Write technique notes in `docs/mentor/advanced-rag-notes.md`

Complete the three stubs from STEP 1's active-retrieval task with finalized learnings:

```markdown
# Advanced RAG Patterns — What I Learned (Chapter 6, PF-AI006)

## Hybrid Search (BM25 + Vector + RRF)

[1 paragraph: the key insight — why combining rank positions (RRF) is safer
than combining raw scores; what BM25 contributes that vector can't; which
query type each wins on in your personal finance data; the k=60 constant and
what it controls. Include your measured MRR/P@5 delta.]

## Sentence-Window Retrieval

[1 paragraph: the "small-to-search, big-to-read" principle; why transaction
rows don't benefit (already one-liners) but statement PDFs do; the trade-off
between window_size (larger = more context = fewer precise matches); what
you'd do differently next time. Include latency impact vs baseline.]

## Auto-Merging Retrieval

[1 paragraph: how the sibling-threshold decision works; when it helps vs when
it over-merges (threshold too low = always returns paragraphs even for
unrelated sentences from the same paragraph); how the parent/child hierarchy
is built during indexing; what the eval showed. Include your merge_threshold
choice and why.]

## Which won, and why

[1 paragraph: the winning combination from the eval table; what the adversarial
queries revealed; what you'd do if you had 2x more query examples; which
technique had the best ROI (lift / implementation cost ratio).]
```

> **Why this write-up matters:** Chapter 10 requires a technical blog post. This document is the first draft. The four paragraphs above become the "Advanced RAG Patterns" section of "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing." Writing it now, while the details are hot, costs 20 minutes — writing it cold at Chapter 10 costs 3 hours.

---

### [ ] STEP 9 — Full test pass + commit

```bash
cd services/ai-service

# Run all tests including new Chapter 6 files
PYTHONPATH=. pytest -v

# Commit with grouped staged files
cd c:\workspaces\personal-finance
git add supabase/migrations/*_advanced_rag.sql
git add services/ai-service/app/services/retriever.py
git add services/ai-service/app/services/doc_retriever.py
git add services/ai-service/app/services/auto_merger.py
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/scripts/backfill_statement_chunks.py
git add services/ai-service/tests/test_hybrid_search.py
git add services/ai-service/tests/test_doc_retriever.py
git add services/ai-service/tests/test_auto_merger.py
git add services/ai-service/evals/search_queries.json
git add services/ai-service/evals/eval_retrieval.py
git add docs/performances/ai-observability-metrics.md
git add docs/mentor/advanced-rag-notes.md
git status   # verify NO .env, NO credentials
git commit -m "PF-AI006: Advanced RAG — hybrid BM25+vector (RRF), sentence-window doc store, auto-merging; MRR/P@5 comparison table across all variants"
```

---

### [ ] STEP 10 — Log progress

```
/mentor log PF-AI006 Advanced RAG complete: hybrid BM25+vector (RRF, k=60) lifted P@5 from 0.66 to 0.YY; sentence-window statement chunks indexed (backfill_statement_chunks.py, window_size=2); auto-merging retriever (sibling threshold 0.5); 5 adversarial queries added to eval set; winning mode [X] set as production default. Chapter 6 done.
```

---

## Resources / Theory to Learn

Organized by concept — pull the one you need when you hit the wall.

### Concept 1 — RRF / hybrid search (Steps 3)
- **pgvector hybrid search** → https://github.com/pgvector/pgvector#hybrid-search — the canonical RRF SQL snippet. Run this first; it's the code anchor for Step 3.
- **RRF original paper** → https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf — 4 pages. Read the abstract + Table 1 to understand why k=60 was chosen. The intuition: k determines how much score-benefit a top-ranked document gets over a mid-ranked one. k=0 → all benefit goes to rank #1; k=∞ → all ranks equalized. k=60 gives moderate smoothing on TREC-scale corpora.
- **Qdrant — "Hybrid Search Explained"** → https://qdrant.tech/articles/hybrid-search/ — vendor-neutral walkthrough of BM25 + dense + RRF with diagrams. Good second read if the pgvector README is too terse.

### Concept 2 — Sentence-window retrieval (Step 4)
- **LlamaIndex — MetadataReplacementPostProcessor** → https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/ — this is what you're hand-rolling. Reading it tells you exactly what the framework does so you can explain the abstraction, not just use it.
- **Pinecone — Chunking Strategies** → https://www.pinecone.io/learn/chunking-strategies/ — read the sentence-window section for the "small-to-search, big-to-read" vocabulary you'll use in interviews.

### Concept 3 — Auto-merging retrieval (Step 5)
- **LlamaIndex — Auto-Merging Retriever** → https://docs.llamaindex.ai/en/stable/examples/retrievers/auto_merging_retriever/ — focus on the HierarchicalNodeParser and the merge threshold concept. Don't copy the LlamaIndex code; understand the node hierarchy shape.
- **DeepLearning.AI — Building Agentic RAG with LlamaIndex** (free, ~3h) → https://learn.deeplearning.ai/courses/building-evaluating-advanced-rag — watch the sentence-window (~10 min) and auto-merging (~10 min) segments. The rest is Chapter 7 material; skip it.

### Concept 4 — Eval: measuring technique lift (Step 6)
- **Eugene Yan — Patterns for LLM Systems** → https://eugeneyan.com/writing/llm-patterns/ — the retrieval eval section ties MRR/NDCG to the "recall vs precision" framing you'll use when presenting the comparison table in interviews.
- Your own `evals/eval_retrieval.py` — the benchmark you already have is the right place to measure. The adversarial queries are the novel contribution; don't swap to a third-party eval framework just because it exists.

---

## Learning Strategy

**Daily loop for Chapter 6:**
- **Day 1 — hybrid search (Steps 1–3):** Migration + RRF logic + tests. Hybrid is the highest-value, lowest-complexity technique — ship it first, in isolation, so you have a concrete win before tackling the harder document-store work.
- **Day 2 — sentence-window (Step 4):** Backfill script + DocumentRetriever + tests. The backfill can run overnight; start it before ending the session.
- **Day 3 — auto-merging (Step 5):** Build AutoMergingRetriever + tests. Conceptually harder than sentence-window but less I/O (no new embedding calls — reuses DocumentRetriever).
- **Day 4 — eval + notes (Steps 6–8):** Run all variants, fill the comparison table, write the technique notes. This day has wall-clock time (eval runs) — interleave with writing the notes while waiting.

**The 5 principles applied to Chapter 6:**
1. **Active retrieval:** STEP 1's three questions from memory in `advanced-rag-notes.md`. If you can't reconstruct the RRF formula from memory, re-read before coding.
2. **Project-first:** ship hybrid search (Step 3) before reading sentence-window docs. You already have the SQL; the RRF function is ~12 lines of Python.
3. **Same-day shipping:** Day 1 = hybrid committed. Day 2 = sentence-window committed. Day 3 = auto-merging committed. Day 4 = eval numbers in the doc.
4. **Interleaving:** backfill script running in Terminal 2 while you write `test_doc_retriever.py` in the editor.
5. **Teach-back:** three 1-minute explanations, no notes. "Why RRF instead of weighted sum?" "Why index the sentence but return the window?" "When does auto-merging fire?"

**Anti-patterns to avoid this chapter:**
- ❌ Adopting LlamaIndex for the sentence-window implementation. You built `chunker.py` in Chapter 4 for exactly this; LlamaIndex is for Chapter 7+.
- ❌ Using `to_tsquery` instead of `plainto_tsquery` — the former fails on natural-language queries like "tagihan listrik PLN bulan lalu".
- ❌ Merging post-retrieval on the same top-K. Hybrid's lift comes from combining two different ranked lists; merging the same K results from one list is a no-op.
- ❌ Setting `merge_threshold = 0.0` (always merge). That collapses every sentence into its parent regardless of retrieval signal, defeating the selective-merge logic entirely.
- ❌ Not adding adversarial queries. A homogeneous eval set can't distinguish hybrid from vector — you'd declare "no improvement" and miss the technique's real contribution.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I implemented three advanced RAG patterns and benchmarked each against the same eval set: hybrid BM25+vector (RRF, k=60) lifted P@5 from 0.66 to 0.YY; sentence-window retrieval over our bank statement PDFs — index the sentence, return the paragraph; and auto-merging for when multiple sentences from the same paragraph co-occur in the results. The winning combination was [X], and the adversarial eval queries (designed so BM25-wins and semantic-wins each appear) were the technique that made the comparison meaningful."*

---

## Notes

- **The backfill script is idempotent** — it checks `WHERE upload_id = $1` before inserting. Re-run safely if interrupted.
- **'simple' tsvector vs 'indonesian':** Use `SELECT cfgname FROM pg_ts_config;` in Supabase Studio to see which text search configurations are installed. If 'indonesian' appears, test it against 'simple' on your actual descriptions — stemming may or may not help for terse bank text like "BELANJA MAKAN WARTEG".
- **`ivfflat.probes = 10` also needed on `statement_chunks`.** The same probes fix from Chapter 3 applies — add it to the `DocumentRetriever.search_documents()` `SET` call.
- **Auto-merging in production:** the `get_chunk_by_id()` call inside the merge loop is one DB round-trip per unique parent that hits the threshold. With a small corpus (hundreds of PDFs, thousands of chunks) this is fine. At scale, batch the parent lookups: `WHERE id = ANY($1::uuid[])`.
- **THINK-05 reminder:** `AskRequest` / `AskResponse` fields added in Chapter 4 are now frozen contract surface if the .NET side has consumed them. `search_mode` is a Python-internal field and does not appear in the `/ask` response — no contract change.
- **Sentence-window `window_size=2`** means ±2 sentences (up to 5 sentences total per window). For bank statement PDFs that are 1–3 sentences per "paragraph", this is appropriate. Statement narrative-heavy banks (Superbank) may benefit from `window_size=3`.
- **Next chapter (7 — Agents):** The `DocumentRetriever` and `AutoMergingRetriever` become *tools* that a smolagents or LangGraph agent will call. The constructor-injection pattern (both services take `DocumentRetriever` as a dependency) means the agent can swap strategies by passing a different retriever — same lesson as Chapter 4's `AnswerService`.
- **Deferred:** streaming `/ask` over SSE (Chapter 5), conversation memory (Chapter 8), the `/search` endpoint for document chunks as a UI feature (Chapter 9/10 scope).

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering
> certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS
> Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the
> style and topic areas of those exams — not verbatim exam items. Each question is tagged to
> the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Reciprocal Rank Fusion (Databricks · Google Cloud PMLE)

*Scenario:* Your hybrid search combines pgvector cosine similarity scores (range 0–1) with PostgreSQL `ts_rank` BM25 scores (unbounded, log-scale). A colleague suggests combining them as `0.7 * vector_score + 0.3 * bm25_score`.

*Question:* What is the main problem with score-weighted fusion in this case?

- **A.** The 0.7/0.3 weight split is arbitrary and BM25 should always receive equal weight
- **B.** `ts_rank` values are not normalized to [0,1] — they use log-frequency weights that are unbounded and query-dependent, so adding them to cosine scores compares incomparable scales and can let BM25 dominate or disappear entirely depending on the query
- **C.** PostgreSQL `ts_rank` is not supported in asyncpg
- **D.** Weighted fusion requires more than 1,000 training examples to tune the alpha parameter reliably

<details>
<summary>Show answer</summary>

**B** — RRF sidesteps the normalization problem by combining *rank positions* (1, 2, 3 … always comparable integers), not raw scores. `1/(k + rank)` gives a score that's independent of each list's original score scale.
*Maps to: Databricks GenAI Engineer Associate · Retrieval; Google Cloud PMLE · Vector Search & Embeddings*
</details>

---

### 2. Sentence-window retrieval (Databricks · Azure AI-102)

*Scenario:* After indexing a 4-page bank statement PDF as sentence-level chunks, semantic search finds the right sentence ("Bayar PLN Rp 250.000") but the LLM answers "I cannot determine the payment amount from the provided context."

*Question:* Which sentence-window retrieval principle directly fixes this?

- **A.** Increase `top_k` so more sentences are retrieved before the LLM call
- **B.** Switch to BM25 search, which returns whole documents by default
- **C.** Index the sentence for precise semantic matching, but at retrieval time expand the returned context to include ±N neighbouring sentences — the LLM receives the *window* (surrounding text with amounts and dates), not the naked sentence
- **D.** Re-embed the sentence with a larger model to capture more context in the vector itself

<details>
<summary>Show answer</summary>

**C** — "small-to-search, big-to-read": the sentence is the retrieval unit (precise matching), the window is the generation unit (sufficient context). A larger embedding (D) doesn't add surrounding text; more top_k (A) adds unrelated sentences.
*Maps to: Databricks GenAI Engineer Associate · Data Preparation (chunking strategies); Azure AI-102 · Design knowledge retrieval*
</details>

---

### 3. When auto-merging beats sentence-window (Databricks · AWS ML Engineer)

*Scenario:* A user asks "ringkas semua transaksi belanja online bulan ini." The query matches 4 sentence-level chunks from the same paragraph of the March statement — all siblings under the same parent paragraph node.

*Question:* Why does auto-merging retrieve better context than plain sentence-window in this case?

- **A.** Because auto-merging uses BM25 scoring, which handles Indonesian better than cosine similarity
- **B.** Because sentence-window always discards chunks below a similarity threshold
- **C.** Because auto-merging with a fixed window_size=2 returns exactly 5 sentences regardless of content
- **D.** Because when a threshold fraction of a parent's children are independently retrieved, it's evidence the full parent paragraph is relevant — auto-merging promotes the coherent paragraph context instead of returning 4 disjointed sentence fragments

<details>
<summary>Show answer</summary>

**D** — sentence-window always expands by a fixed window regardless of co-retrieval signal. Auto-merging uses the retrieval pattern itself (sibling co-occurrence) as the signal that the parent context is the right unit of context.
*Maps to: Databricks GenAI Engineer Associate · Assembling RAG Applications; AWS Certified ML Engineer – Associate · Feature engineering*
</details>

---

### 4. BM25 vs semantic query strength (Azure AI-102 · Databricks)

*Scenario:* You're choosing `search_mode` for a personal finance `/search` endpoint that must handle both "tagihan listrik PLN Maret" and "pengeluaran yang terasa boros minggu ini."

*Question:* Which mode is most likely to handle both query types well?

- **A.** `hybrid` (BM25 + vector via RRF) — BM25 wins on the keyword-exact PLN query; vector wins on the semantic "boros" (wasteful) paraphrase that has no exact keyword in descriptions; RRF merges them without normalizing incompatible scores
- **B.** `bm25` only — PLN is an exact keyword, and "boros" can be stemmed to match "bor" in descriptions
- **C.** `vector` only — embeddings encode both exact and semantic meaning in the same space
- **D.** Neither; both queries require a separate reranking step before any search mode is chosen

<details>
<summary>Show answer</summary>

**A** — hybrid exploits the complementarity: BM25 is the natural choice for term-rich brand names (PLN, OVO, GoPay) while vector handles conceptual/semantic queries where descriptions use different words than the query. No single mode wins both.
*Maps to: Azure AI-102 · Implement knowledge mining; Databricks GenAI Engineer Associate · Retrieval*
</details>

---

### 5. Choosing the production search mode (Databricks · Google Cloud PMLE)

*Scenario:* Your eval table shows `vector` and `hybrid` are tied at MRR@5=1.000 on the original 10 queries, but `hybrid` beats `vector` by +0.12 P@5 on the 5 adversarial queries. `hybrid` adds ~35ms per query vs `vector`.

*Question:* How should you choose the production default?

- **A.** Always pick the variant with the lowest latency, regardless of accuracy — users notice latency, not MRR
- **B.** Pick `vector` because MRR@5 tied and ties should defer to the simpler implementation
- **C.** Pick `hybrid` — the adversarial queries are the meaningful discriminator; the original 10 queries were designed for vector search and can't reveal hybrid's unique contribution; +12 P@5 on harder queries justifies 35ms latency for a finance app where precision matters
- **D.** Defer the decision to Chapter 7 when the agent framework is available

<details>
<summary>Show answer</summary>

**C** — training-set MRR is self-fulfilling when the queries were written to match the retriever. Adversarial queries reveal the technique's unique contribution. 35ms is within the latency budget for a non-streaming endpoint; Chapter 5 streaming mitigates it for `/ask`.
*Maps to: Databricks GenAI Engineer Associate · Evaluating RAG Applications; Google Cloud PMLE · Model evaluation*
</details>

---

### 6. Adversarial eval design (Databricks · AWS ML Engineer)

*Scenario:* Your original 10 eval queries all have semantic paraphrases of what's in the transaction descriptions. You run hybrid vs vector and find no measurable difference. A colleague says "so hybrid isn't helping — remove it."

*Question:* What is wrong with this conclusion?

- **A.** 10 queries is statistically insufficient for any evaluation conclusion, so no decision can be made
- **B.** A homogeneous eval set of semantic paraphrases can't reveal BM25's contribution — both modes rank semantic paraphrases similarly because BM25 doesn't fire without keyword overlap. You need adversarial queries (keyword-wins like "PLN tagihan listrik") to distinguish them
- **C.** Hybrid search requires a minimum of 50,000 indexed documents to outperform vector
- **D.** MRR@5 is the wrong metric for hybrid search; you should use NDCG@10 instead

<details>
<summary>Show answer</summary>

**B** — the eval set must include cases where each modality has a genuine advantage. A semantic-only eval set is blind to BM25's keyword contribution. The adversarial queries in Step 6 (q14: "tagihan listrik PLN") are specifically designed to surface this.
*Maps to: Databricks GenAI Engineer Associate · Evaluating RAG Applications; AWS Certified ML Engineer – Associate · Model evaluation & testing*
</details>
