# PF-AI004 — RAG Phase 2: Chunking, Re-ranking, Generation

> **Learning Phase:** Phase 1 · Chapter 4 of 12 · Day ~14 of 90
> **Status:** To Do
> **Started:** 2026-06-10
> **Planned from branch:** main
> **Pivot goal:** Turn the toy into something defensible. Naive top-K retrieval is the demo version of RAG — hiring managers ask about chunking strategy, re-ranking, and grounded synthesis. After this chapter, `POST /ask {"query": "berapa pengeluaran makan bulan Maret?"}` returns a correct, *cited* answer, and you can quote two deltas: "re-ranking moved MRR@5 from 0.XX to 0.YY" and "RAGAS faithfulness on my generated answers is 0.ZZ."

## Objective

PF-AI003 shipped the first half of the RAG pipeline: `transaction_embeddings` (pgvector), `EmbeddingService`, `RetrievalService`, `/embed-transactions` + `/search`, and an MRR@5 harness. Retrieval *works* but is naive: cosine top-K with no quality refinement, no filtering, and no generation step — the user gets raw transaction rows, not answers.

The diagram below shows the full target-state pipeline. Steps marked ✅ Phase 1 are already shipped (PF-AI003); steps marked 🔄 Phase 2 are what this chapter builds:

```
INDEXING SIDE                     QUERY SIDE (POST /ask, real-time)
────────────────────              ────────────────────────────────────────────────

Transactions (DB rows)            User Query
      │                           "berapa pengeluaran makan Maret?"
      ▼                                       │
  [Chunker]            🔄 Phase 2             ▼
  fixed_size_chunks()  PF-AI004  ┌──────────────────────────────────────────┐
  sentence_window()    tested,   │  1. Embed Query                          │  ✅ Phase 1
      │                Ch6 wires │     text-embedding-3-small (OpenAI)      │  PF-AI003
      ▼                          └──────────────────────┬───────────────────┘
  [Embed Chunks]       ✅ Phase 1                       │
  text-embedding-3-    PF-AI003                         ▼
  small (batched,                ┌──────────────────────────────────────────┐
  Langfuse traced)               │  2. Vector Search                        │  ✅ Phase 1
      │                          │     pgvector cosine (ivfflat, probes=10) │  PF-AI003
      ▼                          │     → top-10 candidates                  │
  [transaction_        ✅ Phase 1└──────────────────────┬───────────────────┘
   embeddings table]   PF-AI003                         │
  pgvector (ivfflat)                                    ▼
                                 ┌──────────────────────────────────────────┐
                                 │  3. Metadata Filter                      │  🔄 Phase 2
                                 │     WHERE category / account             │  PF-AI004
                                 │          date_from / date_to             │
                                 │     (SQL WHERE — not post-filter)        │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  4. Re-rank                              │  🔄 Phase 2
                                 │     FlashRank cross-encoder (~34 MB CPU) │  PF-AI004
                                 │     top-10 → top-3 (cross-encoded score) │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  5. LLM Synthesis                        │  🔄 Phase 2
                                 │     ProviderFactory (Gemini / Anthropic) │  PF-AI004
                                 │     top-3 contexts → grounded answer     │
                                 │     + [n] inline citations               │
                                 │     hallucination guard: drop bad ids    │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  POST /ask Response                      │
                                 │  { answer, citations[], confident,       │
                                 │    model, retrieval_ms, generation_ms }  │
                                 └──────────────────────────────────────────┘
```

This task builds the second half — **re-ranking and grounded generation**, plus the chunking foundations Chapter 6 will build on:

1. **Chunking module** — `app/services/chunker.py` with two strategies (fixed-size with overlap, sentence-window) + unit tests. Transactions are single short rows, so chunking is learned and tested against real statement *fixture text* now; production chunked retrieval lands in Chapter 6 (sentence-window retrieval).
2. **Re-ranker** — `app/services/reranker.py` wrapping FlashRank (local cross-encoder, free, no API key). Top-10 retrieved → top-K re-ranked.
3. **Metadata filtering** — optional `category`, `account`, `date_from`, `date_to` on `SearchRequest`, compiled to parametrized SQL WHERE clauses in `RetrievalService`.
4. **Grounded synthesis** — `app/services/answerer.py`: retrieve top-10 → re-rank to top-3 → `LlmProvider.generate_json` (existing Gemini/Anthropic factory) → answer with citations. Exposed as `POST /ask`.
5. **Measure the lift** — extend `evals/eval_retrieval.py` with `--rerank`; record the MRR@5 delta vs the Chapter 3 baseline.
6. **RAGAS faithfulness** — `evals/eval_faithfulness.py` scores 5 generated answers for groundedness against their retrieved contexts.

**Depends on:** PF-AI003 (retriever, embeddings, MRR harness — the baseline number must exist before measuring lift; finish the Chapter 3 eval gate first).
**Unblocks:** Chapter 5 (stream `/ask` tokens over SSE), Chapter 6 (advanced retrieval variants measured with this same harness).

## Acceptance Criteria

- [ ] `app/services/chunker.py` — `fixed_size_chunks(text, chunk_size, overlap)` + `sentence_window_chunks(text, window_size)`; both covered by unit tests in `tests/test_chunker.py` (≥ 6 tests), demonstrated against one real eval fixture statement text
- [ ] `app/services/reranker.py` — `RerankerService.rerank(query, results, top_k)` re-orders `SearchResult` lists via FlashRank cross-encoder, runs off the event loop (`asyncio.to_thread`), unit-tested with a mocked ranker
- [ ] `SearchRequest` accepts optional `category`, `account`, `date_from`, `date_to`, `rerank` — `RetrievalService.search()` compiles them to parametrized WHERE clauses (no string interpolation of values)
- [ ] `POST /ask` — accepts `{query, top_k, filters...}`, returns `{answer, citations[], model, retrieval_ms, generation_ms}`; answer text references citations as `[1]`, `[2]`; LLM failures return 502 (never 200-with-empty per ai-service rules)
- [ ] Demo question works end-to-end: a food-spending question in Indonesian returns a correct IDR total with cited transactions
- [ ] `evals/eval_retrieval.py --rerank` runs retrieve-top-10 → rerank → MRR@5; the baseline vs re-ranked delta is recorded in `docs/performances/ai-observability-metrics.md`
- [ ] `evals/eval_faithfulness.py` — RAGAS `Faithfulness` on 5 generated answers; mean score recorded (target ≥ 0.80)
- [ ] `tests/test_reranker.py` + `tests/test_answerer.py` pass (mocked FlashRank / mocked provider — no real API calls in tests)
- [ ] `pyproject.toml` updated: `flashrank` in dependencies; `ragas` + `langchain-openai` in the `dev` extra (eval-only)
- [ ] Langfuse traces exist for the `/ask` generation step (cost + latency visible, same pattern as extraction)

## Approach

**FlashRank local, not Cohere Rerank — for Chapter 4.** Both are cross-encoders; the concept ("bi-encoder retrieves fast, cross-encoder re-scores accurately") is identical. FlashRank runs locally (~34 MB MiniLM model, CPU, no API key, no rate limit), which keeps the eval harness deterministic and free to re-run. Cohere's trial tier is rate-limited (10 calls/min) — fine for production-ish traffic, hostile to iterative benchmarking. `RerankerService` is a thin seam: swapping to Cohere later is a one-class change, and articulating that tradeoff is itself interview content.

**Synthesis reuses the existing provider abstraction — no new LLM client.** `ProviderFactory.create(settings)` already gives you Gemini (JSON mode) or Anthropic (`tool_use`), both with Langfuse tracing wired in (PF-AI001). The `/ask` answerer calls `provider.generate_json(system_prompt, user_prompt, schema)` with an answer-with-citations schema. Zero new provider code; the whole RAG read path stays observable for free.

**Chunking is built and tested now, deployed later.** Transaction rows are one-line texts — chunking them is meaningless. The honest scoping: implement both strategies as a pure, tested module against real statement fixture text (the PDFs you already have in `evals/fixtures/` are multi-page documents), and wire chunked *retrieval* in Chapter 6 where sentence-window retrieval is the explicit task. Building it now means Chapter 6 starts with a tested primitive instead of a blank file.

**Metadata filtering is SQL, not post-filtering.** Filtering after vector search silently shrinks your result set below `top_k` (retrieve 10, filter to 2). Filtering *in* the SQL WHERE clause keeps `LIMIT top_k` meaningful and pushes work to Postgres where the indexes are.

Out of scope: streaming the answer (Chapter 5), hybrid BM25 + vector search and chunked-corpus retrieval (Chapter 6), conversation memory (Chapter 8). Don't add them now.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/services/chunker.py` | Create — fixed-size + sentence-window chunking strategies |
| `services/ai-service/app/services/reranker.py` | Create — `RerankerService` (FlashRank cross-encoder) |
| `services/ai-service/app/services/answerer.py` | Create — `AnswerService` (retrieve → rerank → grounded synthesis) |
| `services/ai-service/app/services/retriever.py` | Edit — optional metadata filters compiled to WHERE clauses |
| `services/ai-service/app/models.py` | Edit — extend `SearchRequest`; add `AskRequest`, `Citation`, `AskResponse` |
| `services/ai-service/app/main.py` | Edit — add `POST /ask`; wire reranker + answerer in lifespan |
| `services/ai-service/pyproject.toml` | Edit — add `flashrank`; dev extra: `ragas`, `langchain-openai` |
| `services/ai-service/tests/test_chunker.py` | Create — unit tests for both strategies |
| `services/ai-service/tests/test_reranker.py` | Create — unit tests (mocked FlashRank) |
| `services/ai-service/tests/test_answerer.py` | Create — unit tests (mocked retriever/reranker/provider) |
| `services/ai-service/evals/eval_retrieval.py` | Edit — `--rerank` flag + baseline/reranked delta table |
| `services/ai-service/evals/eval_faithfulness.py` | Create — RAGAS faithfulness on 5 generated answers |
| `services/ai-service/evals/ask_questions.json` | Create — 5 eval questions with expected-answer notes |
| `docs/performances/ai-observability-metrics.md` | Edit — MRR delta, faithfulness score, /ask latency split |

---

## TODO

### [ ] STEP 0 — Prerequisite gate: Chapter 3 baseline number exists

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py   # must print a real MRR@5 — not run on placeholder IDs
```

> **Why:** This entire chapter's headline deliverable is a *delta* — "re-ranking improved P@5 from 0.66 to 0.YY." Without the Chapter 3 baseline recorded first, there is nothing to measure lift against. Do not start Step 1 until `docs/performances/ai-observability-metrics.md` has the baseline numbers.

> **Note (2026-06-13):** The original Chapter 3 baseline was 0.476 MRR@5 — this was a corrupted metric caused by IVFFlat `probes=1` (default) only searching 1 of 100 clusters. Fixed by adding `SET ivfflat.probes = 10` in `RetrievalService.search()`. Real baseline after fix: **MRR@5 = 1.000, P@5 = 0.66**. The re-ranking lift story therefore shifts from MRR to P@5 — MRR is already maxed. The probes bug is itself a debugging story worth keeping for interviews ("I found that our retrieval baseline was corrupted by an IVFFlat misconfiguration — after fixing it, MRR jumped from 0.476 to 1.000").

---

### [ ] STEP 1 — Learn: the re-ranking mental model (theory anchor, 45 min)

The one genuine pre-read of the chapter. The wall here is understanding *why a second model improves results the first model already ranked*.

**Read (in this order):**
1. Sentence-Transformers — *Retrieve & Re-Rank* → https://sbert.net/examples/applications/retrieve_rerank/README.html (the bi-encoder vs cross-encoder diagram — 15 min)
2. FlashRank README → https://github.com/PrithivirajDamodaran/FlashRank (skim the model table + usage — 10 min)
3. Cohere — *Rerank* overview → https://docs.cohere.com/docs/rerank-overview (read for the hosted-alternative framing only — 10 min)

**Active-retrieval task (do NOT skip):** Close all tabs. Append to `evals/README.md` a section `## Re-ranking mental model (written from memory)`:
- Why can't the bi-encoder (embedding) score be as accurate as the cross-encoder score? (hint: when does each model see query and document *together*?)
- Why is the standard pattern "retrieve 10 with the fast model, re-rank with the slow model" instead of cross-encoding the whole table?
- What does "ms-marco" in the model name refer to, and why does that matter for *your* Indonesian-language transactions?

> **Why theory first, just this once?** The non-obvious insight is architectural: a bi-encoder embeds query and document *independently* — it can only compare two pre-computed points. A cross-encoder reads the query and document *in one forward pass*, attending across both — far more accurate, but it can't be pre-computed, so it's too slow to score every row. Retrieval is therefore a funnel: cheap-and-broad (pgvector top-10) → expensive-and-narrow (cross-encoder top-3). If you skip this, the reranker is a magic black box and the interview answer falls apart.

> **The interview frame:** "My retrieval is a two-stage funnel: pgvector cosine search retrieves the top-10 candidates with a bi-encoder embedding, then a local cross-encoder (FlashRank MiniLM) re-scores those 10 by reading query and document together, and the top-3 feed generation. Re-ranking moved my MRR@5 from 0.XX to 0.YY at ~Zms added latency, with no extra API cost because the cross-encoder runs locally."

---

### [ ] STEP 2 — Build `app/services/chunker.py` (pure module, no I/O)

Create `services/ai-service/app/services/chunker.py`:

```python
"""Chunking strategies for longer-form documents (statement narratives, notes).

Pure functions — no I/O, no model calls. Production chunked retrieval is
wired in Chapter 6; this module is the tested primitive it will build on.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Chunk:
    text: str               # the core chunk content
    index: int              # position in the source document
    window: str = ""        # expanded context (sentence-window only)
    meta: dict = field(default_factory=dict)


def fixed_size_chunks(text: str, chunk_size: int = 500, overlap: int = 100) -> list[Chunk]:
    """Split text into character chunks of `chunk_size` with `overlap` carried between chunks.

    Overlap prevents a fact that straddles a boundary from being lost to both chunks.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    text = text.strip()
    if not text:
        return []

    chunks: list[Chunk] = []
    step = chunk_size - overlap
    for i, start in enumerate(range(0, len(text), step)):
        piece = text[start:start + chunk_size]
        if not piece.strip():
            break
        chunks.append(Chunk(text=piece, index=i))
        if start + chunk_size >= len(text):
            break
    return chunks


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


def sentence_window_chunks(text: str, window_size: int = 1) -> list[Chunk]:
    """One chunk per sentence; `window` carries ±window_size neighbouring sentences.

    Index/search on the small `text` (precise matching); hand the LLM the larger
    `window` (enough context to be useful). Small-to-search, big-to-read.
    """
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    chunks: list[Chunk] = []
    for i, sentence in enumerate(sentences):
        lo = max(0, i - window_size)
        hi = min(len(sentences), i + window_size + 1)
        chunks.append(Chunk(text=sentence, index=i, window=" ".join(sentences[lo:hi])))
    return chunks
```

Create `services/ai-service/tests/test_chunker.py`:

```python
import pytest
from app.services.chunker import Chunk, fixed_size_chunks, sentence_window_chunks


def test_fixed_size_respects_chunk_size():
    chunks = fixed_size_chunks("a" * 1200, chunk_size=500, overlap=100)
    assert all(len(c.text) <= 500 for c in chunks)


def test_fixed_size_overlap_carries_content():
    text = "0123456789" * 30  # 300 chars
    chunks = fixed_size_chunks(text, chunk_size=100, overlap=20)
    # tail of chunk N == head of chunk N+1
    assert chunks[0].text[-20:] == chunks[1].text[:20]


def test_fixed_size_empty_text_returns_empty():
    assert fixed_size_chunks("   ") == []


def test_fixed_size_rejects_overlap_gte_size():
    with pytest.raises(ValueError):
        fixed_size_chunks("abc", chunk_size=100, overlap=100)


def test_sentence_window_core_is_single_sentence():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert chunks[1].text == "Second sentence."


def test_sentence_window_includes_neighbours():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert "First sentence." in chunks[1].window
    assert "Third sentence." in chunks[1].window


def test_sentence_window_edges_clamp():
    text = "One. Two. Three."
    chunks = sentence_window_chunks(text, window_size=2)
    assert chunks[0].window == "One. Two. Three."  # no negative index wraparound
```

Then demonstrate on a real fixture: in a scratch run, load one statement fixture text from `evals/fixtures/`, chunk it both ways, and eyeball the output (`python -c` one-liner is fine — no committed artifact needed).

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_chunker.py -v
```

> **Why a pure module with no retrieval wiring?** Transactions are one-line rows — chunking them is a no-op. The artifacts that *do* need chunking (multi-page statement narratives) get retrieval in Chapter 6 (sentence-window retrieval is that chapter's first task). Building the tested primitive now means Chapter 6 starts from green tests, and you learn the two canonical strategies while the RAG context is hot. This honors the same-day-shipping rule without inventing fake production wiring.

> **The interview frame:** "Fixed-size with overlap is the baseline — overlap prevents boundary facts from being lost to both chunks. Sentence-window is the refinement: index small units for precise matching, but return the expanded window so the LLM gets enough context. Small-to-search, big-to-read."

---

### [ ] STEP 3 — Add FlashRank + build `app/services/reranker.py`

Add to `pyproject.toml` dependencies:

```toml
    "flashrank>=0.2",
```

```bash
cd services/ai-service && pip install flashrank
```

Create `services/ai-service/app/services/reranker.py`:

```python
"""RerankerService: cross-encoder re-ranking over retrieved transactions.

FlashRank runs a local MiniLM cross-encoder on CPU — no API key, no rate
limit, deterministic. Swappable for Cohere Rerank later: this class is the seam.
"""
from __future__ import annotations

import asyncio
import logging

from flashrank import Ranker, RerankRequest

from app.models import SearchResult

logger = logging.getLogger(__name__)

# ms-marco-MiniLM-L-12-v2: ~34MB, best quality/size balance in FlashRank's table.
# Downloaded once to cache_dir on first use.
_MODEL_NAME = "ms-marco-MiniLM-L-12-v2"


class RerankerService:
    def __init__(self, cache_dir: str = "/tmp/flashrank") -> None:
        self._ranker = Ranker(model_name=_MODEL_NAME, cache_dir=cache_dir)

    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int = 3
    ) -> list[SearchResult]:
        """Re-score retrieved results with the cross-encoder; return top_k by new score."""
        if not results:
            return []

        passages = [
            {
                "id": r.transaction_id,
                # Same enrichment shape as the embedded search_text: give the
                # cross-encoder the same semantic signal the bi-encoder had.
                "text": f"{r.description} | {r.wallet} | {r.date} | {r.flow}",
            }
            for r in results
        ]
        request = RerankRequest(query=query, passages=passages)

        # FlashRank is synchronous CPU inference — run off the event loop so a
        # 50ms model call doesn't block every other request in the service.
        ranked = await asyncio.to_thread(self._ranker.rerank, request)

        by_id = {r.transaction_id: r for r in results}
        reranked = [by_id[p["id"]] for p in ranked if p["id"] in by_id]
        return reranked[:top_k]
```

Create `services/ai-service/tests/test_reranker.py`:

```python
from unittest.mock import MagicMock, patch
import pytest
from app.models import SearchResult


def _result(tid: int, desc: str) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=desc,
        date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
    )


@pytest.fixture
def mock_ranker():
    with patch("app.services.reranker.Ranker") as mock_cls:
        instance = MagicMock()
        mock_cls.return_value = instance
        yield instance


@pytest.mark.asyncio
async def test_rerank_reorders_by_cross_encoder_score(mock_ranker):
    from app.services.reranker import RerankerService
    # Cross-encoder says tx 2 beats tx 1, reversing the retrieval order
    mock_ranker.rerank.return_value = [
        {"id": 2, "text": "...", "score": 0.99},
        {"id": 1, "text": "...", "score": 0.40},
    ]
    service = RerankerService()
    results = await service.rerank("kopi", [_result(1, "TRANSFER"), _result(2, "STARBUCKS")], top_k=2)
    assert [r.transaction_id for r in results] == [2, 1]


@pytest.mark.asyncio
async def test_rerank_truncates_to_top_k(mock_ranker):
    from app.services.reranker import RerankerService
    mock_ranker.rerank.return_value = [
        {"id": i, "text": "...", "score": 1.0 - i / 10} for i in range(1, 6)
    ]
    service = RerankerService()
    results = await service.rerank("q", [_result(i, f"tx{i}") for i in range(1, 6)], top_k=3)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_rerank_empty_input_returns_empty(mock_ranker):
    from app.services.reranker import RerankerService
    service = RerankerService()
    assert await service.rerank("q", [], top_k=3) == []
```

```bash
PYTHONPATH=. pytest tests/test_reranker.py -v
```

> **Why `asyncio.to_thread`?** FlashRank is synchronous CPU inference. Called directly inside an `async def` endpoint, it blocks the event loop — *every* concurrent request to the service (extraction, search, health checks) stalls for the duration of the model call. `asyncio.to_thread` moves it to the default thread pool, the same fix you'd apply to any sync library in an async service. This is the Python twin of "don't block on `.Result` in ASP.NET Core."

**C# equivalent** (sync library in an async service):

```csharp
// FlashRank-in-async-Python maps to a CPU-bound sync call in ASP.NET Core:
//   Python: ranked = await asyncio.to_thread(self._ranker.rerank, request)
//   C#:     var ranked = await Task.Run(() => _ranker.Rerank(request), ct);
// Both push sync CPU work off the request-serving thread/event-loop.
// The anti-pattern in both worlds is calling it inline and blocking.
```

---

### [ ] STEP 4 — Metadata filtering in `RetrievalService` + `SearchRequest`

Extend `SearchRequest` in `app/models.py` (additive — THINK-05 safe):

```python
class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=50)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    # PF-AI004: optional metadata filters + rerank toggle
    category: str | None = None
    account: str | None = None
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    rerank: bool = False
```

Edit `RetrievalService.search()` in `app/services/retriever.py` to accept the filters and compile them into the SQL:

```python
    async def search(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.0,
        category: str | None = None,
        account: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[SearchResult]:
        # ... existing query embedding unchanged ...

        # Compile optional filters to parametrized WHERE clauses.
        # NEVER interpolate values into SQL — parameters only ($4, $5, ...).
        where = ["1 - (te.embedding <=> $1::vector) >= $3"]
        params: list = [query_vector, top_k, min_similarity]

        def add(clause: str, value) -> None:
            params.append(value)
            where.append(clause.format(n=len(params)))

        if category:
            add("t.category ILIKE ${n}", category)
        if account:
            add("a.name ILIKE ${n}", account)
        if date_from:
            add("t.date >= ${n}::date", date_from)
        if date_to:
            add("t.date <= ${n}::date", date_to)

        sql = f"""
            SELECT
                te.transaction_id,
                1 - (te.embedding <=> $1::vector) AS similarity,
                t.description,
                t.date::text AS date,
                t.amount_idr,
                t.flow,
                COALESCE(a.name, '') AS wallet
            FROM transaction_embeddings te
            JOIN transactions t ON t.id = te.transaction_id
            LEFT JOIN accounts a ON a.id = t.account_id
            WHERE {" AND ".join(where)}
            ORDER BY te.embedding <=> $1::vector
            LIMIT $2
            """
        rows = await conn.fetch(sql, *params)
        # ... existing row → SearchResult mapping unchanged ...
```

Update `/search` in `main.py` to pass the new fields through, and apply `rerank` when requested:

```python
@app.post("/search", response_model=SearchResponse)
async def search_transactions(request: SearchRequest) -> SearchResponse:
    fetch_k = max(request.top_k, 10) if request.rerank else request.top_k
    results = await app.state.retriever.search(
        query=request.query,
        top_k=fetch_k,
        min_similarity=request.min_similarity,
        category=request.category,
        account=request.account,
        date_from=request.date_from,
        date_to=request.date_to,
    )
    if request.rerank:
        results = await app.state.reranker.rerank(request.query, results, top_k=request.top_k)
    return SearchResponse(results=results, query=request.query, total_found=len(results))
```

Add 2–3 filter tests to `tests/test_retriever.py` (assert the generated SQL contains the clause and the parameter list lines up — mocked asyncpg, same pattern as the existing 4 tests).

> **Why filter in SQL instead of post-filtering the results?** Post-filtering retrieves top-10 *then* drops non-matching rows — a March-only query might come back with 1 result even though the table has 50 March food transactions, because the unfiltered top-10 was dominated by other months. Pushing filters into WHERE means pgvector ranks *within* the filtered set, so `LIMIT top_k` stays meaningful. This is "pre-filtering vs post-filtering" in vector-search terms — a standard interview probe.

> **Why `ILIKE` and a regex-validated date string?** Account/category names arrive from a UI dropdown eventually, but tolerate case differences today. Dates validate shape at the Pydantic boundary (`pattern=`) and cast in SQL (`::date`) — bad input fails with 422 at the edge, not a cryptic asyncpg error mid-query.

---

### [ ] STEP 5 — Re-run the MRR harness with re-ranking, record the delta

Extend `evals/eval_retrieval.py` with a `--rerank` flag:

```python
"""Retrieval benchmark: MRR@5, optionally with cross-encoder re-ranking.

    PYTHONPATH=. python evals/eval_retrieval.py            # baseline (Chapter 3)
    PYTHONPATH=. python evals/eval_retrieval.py --rerank   # retrieve 10 → rerank → top-5
"""
import argparse
# ... existing imports ...
from app.services.reranker import RerankerService

async def run(rerank: bool) -> None:
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    service = RetrievalService()
    reranker = RerankerService() if rerank else None

    rr_scores = []
    for q in queries:
        t0 = time.perf_counter()
        if reranker:
            candidates = await service.search(q["query"], top_k=10)   # wide funnel
            results = await reranker.rerank(q["query"], candidates, top_k=5)
        else:
            results = await service.search(q["query"], top_k=5)
        latency_ms = (time.perf_counter() - t0) * 1000
        # ... existing mrr_at_k scoring + table print unchanged ...

    mode = "reranked (10→5)" if rerank else "baseline (top-5)"
    print(f"\nMRR@5 [{mode}]: {mrr:.3f}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rerank", action="store_true")
    args = ap.parse_args()
    asyncio.run(run(args.rerank))
```

Run both modes back-to-back and record in `docs/performances/ai-observability-metrics.md`:

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py            # confirm baseline: MRR=1.000, P@5=0.66
PYTHONPATH=. python evals/eval_retrieval.py --rerank   # the new number
```

Record: baseline P@5, reranked P@5, the delta, and the added latency per query. Also record MRR for completeness, but **P@5 is the primary lift metric for this chapter** — MRR is already at 1.000 after the probes fix, so re-ranking cannot improve it further. The meaningful question is: "did the wider funnel (top-10) give the cross-encoder better candidates to select from, improving precision?"

> **Why retrieve 10 then rerank to 5 (not rerank the top-5)?** Re-ranking the same 5 documents can only re-*order* them — MRR@5 barely moves because nothing new enters the set. The lift comes from the wider funnel: a relevant transaction at retrieval rank 8 is invisible to the baseline but gets promoted into the top-5 by the cross-encoder. Funnel width is the lever; this is exactly the recall-vs-precision tradeoff the interviewer is fishing for.

> **If P@5 delta is ~0:** that's a *finding*, not a failure (THINK-04). Likely causes: (a) with 7 queries and MRR already perfect, P@5=0.66 may be close to ceiling for this query set — add 5 harder queries (ambiguous, multi-category) to create more room; (b) `ms-marco` models are English-trained and your queries are Indonesian — note the language mismatch, try a multilingual rerank model, and write the observation down. "My re-ranker underperformed on Indonesian queries because ms-marco is English-centric; here's how I diagnosed it" is a *better* interview story than a clean +0.1.

---

### [ ] STEP 6 — THINK-03 gate: justify the `/ask` extraction schema field-by-field

Before writing any `/ask` code, the `generate_json` schema gets the THINK-03 table (a wrong type here = silently corrupt answers):

| Field | JSON type | Example | Justification |
|-------|-----------|---------|---------------|
| `answer` | `string` | `"Pengeluaran makan bulan Maret: Rp 1.250.000 [1][2]"` | The user-facing grounded answer; `[n]` markers reference the citations list |
| `cited_transaction_ids` | `array[integer]` | `[42, 87]` | Integers matching `transactions.id` — `integer` not `string`, so .NET/frontend can join without parsing; the answerer validates each id exists in the provided context (hallucinated ids are dropped + logged) |
| `confident` | `boolean` | `true` | `false` when the context doesn't contain the answer — drives the "I don't have enough data" UX path instead of a fabricated total |

> **Why:** THINK-03 — a `string` amount or id in a tool/JSON schema corrupts silently: no compile error, no exception, just wrong joins downstream. Listing each field with its type and consumer *before* coding is the rule. `confident: boolean` exists because the grounding instruction alone ("say you don't know") produces prose the caller can't branch on — a boolean is machine-checkable.

---

### [ ] STEP 7 — Add `/ask` models to `app/models.py`

```python
# ── RAG Phase 2: Grounded Q&A ────────────────────────────────────────────────

class AskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=3, ge=1, le=10)        # contexts handed to the LLM
    category: str | None = None
    account: str | None = None
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class Citation(BaseModel):
    marker: int                # [1], [2] — position referenced in the answer text
    transaction_id: int
    date: str
    description: str
    amount_idr: float
    flow: str
    wallet: str


class AskResponse(BaseModel):
    answer: str
    confident: bool
    citations: list[Citation]
    model: str
    retrieval_ms: float
    generation_ms: float
```

> **Why `retrieval_ms` / `generation_ms` split in the response?** Chapter 5 streams this endpoint; knowing *where* the latency lives (retrieval ~100ms vs generation ~2s) is what justifies streaming the generation phase. Measuring the split now gives you the before/after story, and it's a free observability win in every demo.

---

### [ ] STEP 8 — Build `app/services/answerer.py` (the RAG read path)

Create `services/ai-service/app/services/answerer.py`:

```python
"""AnswerService: grounded Q&A over transactions.

Pipeline: retrieve top-10 (filtered) → cross-encoder rerank → top-3 context
→ LLM synthesis with citations via the existing provider abstraction.
"""
from __future__ import annotations

import logging
import time

from app.config import settings
from app.models import AskRequest, AskResponse, Citation, SearchResult
from app.providers.base import LlmProvider
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

logger = logging.getLogger(__name__)

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "cited_transaction_ids": {"type": "array", "items": {"type": "integer"}},
        "confident": {"type": "boolean"},
    },
    "required": ["answer", "cited_transaction_ids", "confident"],
}

SYSTEM_PROMPT = """You are a personal finance assistant answering questions about \
the user's own bank transactions. Answer ONLY from the numbered transactions \
provided as context. Rules:
- If the context does not contain the answer, say so and set confident=false. \
Never estimate or invent amounts.
- Reference transactions inline as [1], [2] matching their context numbers, and \
list their ids in cited_transaction_ids.
- Amounts are in IDR. Sum amounts yourself when the question asks for totals.
- Answer in the same language as the question (Indonesian or English)."""


def _format_context(results: list[SearchResult]) -> str:
    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"[{i}] id={r.transaction_id} | {r.date} | {r.description} | "
            f"{r.flow} | Rp {r.amount_idr:,.0f} | {r.wallet}"
        )
    return "\n".join(lines)


class AnswerService:
    def __init__(
        self,
        retriever: RetrievalService,
        reranker: RerankerService,
        provider: LlmProvider,
    ) -> None:
        self._retriever = retriever
        self._reranker = reranker
        self._provider = provider

    async def ask(self, request: AskRequest) -> AskResponse:
        # 1. Retrieve a wide candidate set (filtered), then rerank to top_k.
        t0 = time.perf_counter()
        candidates = await self._retriever.search(
            query=request.query,
            top_k=10,
            category=request.category,
            account=request.account,
            date_from=request.date_from,
            date_to=request.date_to,
        )
        contexts = await self._reranker.rerank(request.query, candidates, top_k=request.top_k)
        retrieval_ms = (time.perf_counter() - t0) * 1000

        if not contexts:
            return AskResponse(
                answer="Tidak ada transaksi yang cocok dengan pertanyaan ini.",
                confident=False, citations=[], model="none",
                retrieval_ms=retrieval_ms, generation_ms=0.0,
            )

        # 2. Grounded synthesis via the existing provider (Langfuse-traced).
        t1 = time.perf_counter()
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA)
        generation_ms = (time.perf_counter() - t1) * 1000

        # 3. Validate citations: drop ids the LLM invented (hallucination guard).
        by_id = {r.transaction_id: (i + 1, r) for i, r in enumerate(contexts)}
        citations = []
        for tid in raw.get("cited_transaction_ids", []):
            if tid in by_id:
                marker, r = by_id[tid]
                citations.append(Citation(
                    marker=marker, transaction_id=r.transaction_id, date=r.date,
                    description=r.description, amount_idr=r.amount_idr,
                    flow=r.flow, wallet=r.wallet,
                ))
            else:
                logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)

        return AskResponse(
            answer=raw["answer"],
            confident=bool(raw.get("confident", False)),
            citations=citations,
            model=settings.ai_model,
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
        )
```

Create `services/ai-service/tests/test_answerer.py` — mock all three collaborators (canonical AsyncMock pattern from `.claude/rules/ai-service.md`):

```python
from unittest.mock import AsyncMock
import pytest
from app.models import AskRequest, SearchResult
from app.services.answerer import AnswerService


def _result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=10000.0, flow="DB", wallet="BCA",
    )


def _service(provider_json: dict, contexts: list[SearchResult]) -> AnswerService:
    retriever = AsyncMock()
    retriever.search = AsyncMock(return_value=contexts)
    reranker = AsyncMock()
    reranker.rerank = AsyncMock(return_value=contexts)
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value=provider_json)
    return AnswerService(retriever, reranker, provider)


@pytest.mark.asyncio
async def test_ask_returns_grounded_answer_with_citations():
    service = _service(
        {"answer": "Total Rp 10.000 [1]", "cited_transaction_ids": [1], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="makan maret"))
    assert response.confident is True
    assert response.citations[0].transaction_id == 1
    assert response.citations[0].marker == 1


@pytest.mark.asyncio
async def test_ask_drops_hallucinated_citation_ids():
    service = _service(
        {"answer": "x [1]", "cited_transaction_ids": [1, 999], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="q"))
    assert [c.transaction_id for c in response.citations] == [1]   # 999 dropped


@pytest.mark.asyncio
async def test_ask_no_contexts_returns_not_confident_without_llm_call():
    service = _service({"answer": "", "cited_transaction_ids": [], "confident": False}, [])
    response = await service.ask(AskRequest(query="q"))
    assert response.confident is False
    service._provider.generate_json.assert_not_called()
```

```bash
PYTHONPATH=. pytest tests/test_answerer.py -v
```

> **Why constructor-injected collaborators (unlike PF-AI003's self-constructing services)?** `AnswerService` composes three things you'll want to swap independently: the retriever (Chapter 6 variants), the reranker (Cohere swap), the provider (Gemini ↔ Anthropic). Injection makes the unit tests trivial — no `patch()` gymnastics — and mirrors the .NET constructor-DI you already think in. This is also the shape LangGraph nodes will want in Chapter 8.

> **Why validate `cited_transaction_ids` against the context?** LLMs cite confidently and wrongly. An id not in the provided context is by definition fabricated — silently passing it through would render a clickable citation pointing at an unrelated (or nonexistent) transaction. Dropping + logging makes hallucination *visible* in Langfuse instead of shipping it to the UI. This guard is a one-liner that comes up in every "how do you handle hallucination?" interview.

---

### [ ] STEP 9 — Wire `POST /ask` in `app/main.py`

In the lifespan, after the existing embedder/retriever wiring:

```python
    app.state.reranker = RerankerService()
    app.state.answerer = AnswerService(
        retriever=app.state.retriever,
        reranker=app.state.reranker,
        provider=ProviderFactory.create(settings),
    )
```

Add the endpoint (error contract per `.claude/rules/ai-service.md` — LLM failure is 502, never 200-with-empty):

```python
@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    """Grounded Q&A over the user's transactions (retrieve → rerank → synthesize)."""
    try:
        return await app.state.answerer.ask(request)
    except Exception as exc:
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

Smoke test (service running, embeddings backfilled):

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "berapa pengeluaran makan bulan Maret?", "date_from": "2026-03-01", "date_to": "2026-03-31"}'
```

Verify: the answer contains a real IDR total, `[n]` markers, `citations` lists real transactions, and the Langfuse dashboard shows the generation with cost.

> **Why `502` and not `500` on LLM failure?** The error contract table in `.claude/rules/ai-service.md`: provider failures and malformed LLM output are upstream-dependency errors → 502, which the .NET API maps to a user-visible "AI temporarily unavailable" rather than a generic crash. Returning 200 with an empty answer is explicitly forbidden — it would poison any downstream caching/eval with fake successes.

---

### [ ] STEP 10 — Write `evals/ask_questions.json` + RAGAS faithfulness eval

Add eval-only dependencies to the `dev` extra in `pyproject.toml`:

```toml
dev = [
    # ... existing ...
    "ragas>=0.2",
    "langchain-openai>=0.2",   # RAGAS judge LLM wrapper — eval-only, never app code
]
```

```bash
pip install ragas langchain-openai
```

Create `evals/ask_questions.json` — 5 questions you can verify by hand against Supabase Studio:

```json
[
  {"query": "berapa total pengeluaran makan bulan Maret 2026?", "date_from": "2026-03-01", "date_to": "2026-03-31", "note": "verify sum by hand in Studio — Food & Dining DB rows in March"},
  {"query": "kapan terakhir kali bayar listrik PLN?", "note": "single-fact lookup — latest Bills & Utilities PLN row"},
  {"query": "berapa kali jajan kopi bulan ini?", "note": "count question — coffee transactions current month"},
  {"query": "what was my biggest expense in March?", "note": "max-amount question, English — tests language mirroring"},
  {"query": "berapa pengeluaran untuk sewa apartemen tahun 2031?", "note": "adversarial — no data; expect confident=false, no invented number"}
]
```

Create `services/ai-service/evals/eval_faithfulness.py`:

```python
"""RAGAS faithfulness on /ask answers: is every claim grounded in the retrieved context?

    PYTHONPATH=. python evals/eval_faithfulness.py
Requires OPENAI_API_KEY (judge model) — already configured for embeddings.
"""
import asyncio, json
from pathlib import Path

from langchain_openai import ChatOpenAI
from ragas import SingleTurnSample
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness

from app.config import settings
from app.models import AskRequest
from app.providers.factory import ProviderFactory
from app.services.answerer import AnswerService
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

QUESTIONS_FILE = Path(__file__).parent / "ask_questions.json"


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    answerer = AnswerService(RetrievalService(), RerankerService(), ProviderFactory.create(settings))
    judge = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini", temperature=0.0))
    metric = Faithfulness(llm=judge)

    scores = []
    for q in questions:
        request = AskRequest(
            query=q["query"],
            date_from=q.get("date_from"), date_to=q.get("date_to"),
        )
        response = await answerer.ask(request)
        contexts = [
            f"{c.date} | {c.description} | {c.flow} | Rp {c.amount_idr:,.0f} | {c.wallet}"
            for c in response.citations
        ] or ["(no context retrieved)"]

        sample = SingleTurnSample(
            user_input=q["query"],
            response=response.answer,
            retrieved_contexts=contexts,
        )
        score = await metric.single_turn_ascore(sample)
        scores.append(score)
        print(f"{q['query'][:60]:<62} faithfulness={score:.2f}  confident={response.confident}")

    print(f"\nMean faithfulness: {sum(scores) / len(scores):.3f}   (target ≥ 0.80)")


if __name__ == "__main__":
    asyncio.run(run())
```

Run and record the mean in `docs/performances/ai-observability-metrics.md`:

```bash
PYTHONPATH=. python evals/eval_faithfulness.py
```

> **Why RAGAS faithfulness specifically?** Faithfulness decomposes the generated answer into atomic claims and asks a judge LLM whether each claim is supported by the retrieved context — it measures *hallucination*, the failure mode users actually fear in a finance app ("the app told me a number that isn't in my data"). MRR measures the retriever; faithfulness measures the generator; together they cover the pipeline. Question 5 is the canary: a faithful system answers "no data" — a low score there means your grounding prompt is leaking.

> **Why a different judge model (gpt-4o-mini) than the generator (Gemini)?** Same-model-judging-itself inflates scores (self-preference bias — you read about this in Chapter 2's LLM-as-judge material). The OpenAI key already exists for embeddings, so the cross-provider judge is free to set up; 5 answers ≈ fractions of a cent.

---

### [ ] STEP 11 — Update the metrics doc

Append to `docs/performances/ai-observability-metrics.md`:

```markdown
## RAG Phase 2 (PF-AI004) — re-ranking + generation

| Metric | Value |
|--------|-------|
| MRR@5 baseline (Chapter 3, corrupted — ivfflat probes=1 bug) | 0.476 |
| MRR@5 after probes=10 fix (real Chapter 3 baseline) | 1.000 |
| P@5 baseline (top-5 cosine, probes=10) | 0.66 |
| P@5 reranked (top-10 → FlashRank → top-5) | 0.YY |
| P@5 re-ranking lift | +0.ZZ |
| MRR@5 reranked (expected: no change — already 1.000) | 1.000 |
| Re-rank latency added per query | ~XXms (local CPU, $0 cost) |
| /ask retrieval_ms (p50) | XXms |
| /ask generation_ms (p50) | X.Xs |
| RAGAS faithfulness (5 answers, gpt-4o-mini judge) | 0.XX |
```

> **Why:** These are the chapter's interview numbers. The Sunday-metric answer this chapter is: *"I added a local cross-encoder re-ranker that lifted MRR@5 by +0.ZZ at ~XXms and $0 per query, and a grounded `/ask` endpoint whose answers score 0.XX RAGAS faithfulness with a hallucinated-citation guard."* Without the doc entry, the numbers evaporate.

---

### [ ] STEP 12 — Full test pass + commit

```bash
cd services/ai-service && PYTHONPATH=. pytest -v          # all suites incl. new 3 files
cd c:\workspaces\personal-finance
git add services/ai-service/app/services/chunker.py
git add services/ai-service/app/services/reranker.py
git add services/ai-service/app/services/answerer.py
git add services/ai-service/app/services/retriever.py
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_chunker.py
git add services/ai-service/tests/test_reranker.py
git add services/ai-service/tests/test_answerer.py
git add services/ai-service/tests/test_retriever.py
git add services/ai-service/evals/eval_retrieval.py
git add services/ai-service/evals/eval_faithfulness.py
git add services/ai-service/evals/ask_questions.json
git add docs/performances/ai-observability-metrics.md
git status    # verify NO .env, NO credentials
git commit -m "PF-AI004: RAG Phase 2 — chunking, FlashRank re-ranking, grounded /ask with citations"
```

> **Why:** Same-day shipping rule — the chapter isn't done until it's committed with the eval numbers in the diff.

---

### [ ] STEP 13 — Log progress

```
/mentor log Built RAG Phase 2: chunker (fixed-size + sentence-window, tested), FlashRank re-ranker (MRR@5 0.XX → 0.YY, +0.ZZ lift), metadata-filtered retrieval, grounded POST /ask with citation validation (hallucinated ids dropped), RAGAS faithfulness 0.XX on 5 answers. Chapter 4 complete.
```

---

## Resources / Theory to Learn

Organized by concept — read the one tied to what you're building; skip the rest until you hit that wall.

### Concept 1 — Re-ranking / cross-encoders (Step 1 + 3)
- **Sentence-Transformers — *Retrieve & Re-Rank*** → https://sbert.net/examples/applications/retrieve_rerank/README.html — the canonical bi-encoder vs cross-encoder explanation with the funnel diagram. The Step 1 anchor.
- **FlashRank** → https://github.com/PrithivirajDamodaran/FlashRank — model table (TinyBERT 4MB → MiniLM 34MB → multilingual options), usage API. Note the multilingual model for the Indonesian-query contingency in Step 5.
- **Cohere Rerank docs** → https://docs.cohere.com/docs/rerank-overview — the hosted alternative; read to articulate the local-vs-hosted tradeoff, not to integrate.

### Concept 2 — Chunking strategies (Step 2)
- **Pinecone — *Chunking Strategies for LLM Applications*** → https://www.pinecone.io/learn/chunking-strategies/ — the standard survey: fixed-size, recursive, sentence-window, semantic. Read fixed-size + sentence-window sections only.
- **LlamaIndex — *Sentence Window Retrieval* concept docs** → https://docs.llamaindex.ai — skim for the "small-to-search, big-to-read" framing; you're hand-rolling what their `SentenceWindowNodeParser` does, which is precisely why you'll understand it better than framework users.

### Concept 3 — Grounded generation + citations (Steps 6–9)
- **Anthropic — *Reducing hallucinations*** → https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations — the grounding-prompt patterns (answer-only-from-context, explicit I-don't-know permission) used in the SYSTEM_PROMPT.
- **Lewis et al., *Retrieval-Augmented Generation*** (the original RAG paper, 2020) → https://arxiv.org/abs/2005.11401 — skim the abstract + architecture figure for interview vocabulary; don't read the training sections.

### Concept 4 — RAG evaluation (Steps 5 + 10)
- **RAGAS — *Faithfulness*** → https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/ — how the metric decomposes answers into claims. Read before running Step 10 so the score means something to you.
- **Eugene Yan — *Patterns for LLM Systems*** (evals section) → https://eugeneyan.com/writing/llm-patterns/ — ties Chapter 2's eval thinking to RAG-specific metrics; the retrieval-vs-generation split you're now measuring on both sides.

### Video (one segment, not a full course)
- **DeepLearning.AI — *Building and Evaluating Advanced RAG*** (free short course) → https://learn.deeplearning.ai/courses/building-evaluating-advanced-rag — the sentence-window + re-ranking segments (~30 min) are exactly this chapter; the rest is Chapter 6 material.

---

## Learning Strategy

**Daily loop for Chapter 4:**
- **Morning (90 min, deep block #1):** chunker + reranker (Steps 2–3). Stop when both test files are green.
- **Midday interleave (30 min):** while the FlashRank model downloads / tests run, skim the Chapter 5 SSE reading (FastAPI `StreamingResponse`). Warming context, not building.
- **Afternoon (90 min, deep block #2):** filters + `/ask` (Steps 4, 6–9). Stop when the curl smoke test returns a cited answer.
- **Next session:** evals (Steps 5, 10) + metrics + commit. Eval runs need wall-clock time — interleave with writing the metrics doc.

**The 5 principles applied to Chapter 4:**
1. **Active retrieval:** Step 1's three questions, written from memory into `evals/README.md`. If you can't explain why the cross-encoder sees query+document together, re-read before coding.
2. **Project-first:** the only pre-reads are Step 1 (re-ranking) and the THINK-03 schema gate (Step 6). Chunking/RAGAS docs are pull-when-stuck.
3. **Same-day shipping:** Steps 2–3 committed day 1; Steps 4–9 day 2; evals + numbers day 3. Three commits, not one mega-commit.
4. **Interleaving:** FlashRank model download, backfill confirmation, and eval runs all have wall time — write the next step's test file while they run.
5. **Teach-back:** the funnel sentence ("cheap-and-broad bi-encoder, expensive-and-narrow cross-encoder") and the hallucination-guard story are the two teach-backs. Say each out loud without notes.

**Anti-patterns to avoid this chapter:**
- ❌ Adopting LlamaIndex/LangChain "because re-ranking is built in." Frameworks arrive in Chapters 7–8, *after* you've hand-rolled what they abstract. (RAGAS pulling langchain into the dev extra is fine — it's eval tooling, not app architecture.)
- ❌ Re-ranking only the top-5. The lift comes from widening the funnel (retrieve 10) — re-ordering 5 items barely moves MRR@5.
- ❌ Calling FlashRank inline in the async endpoint. It's sync CPU inference — `asyncio.to_thread` or you stall the event loop for every concurrent request.
- ❌ Letting the LLM's `cited_transaction_ids` pass through unvalidated. Citation hallucination is the #1 trust-killer in a finance app; the guard is 5 lines.
- ❌ Tuning the grounding prompt by vibes. Question 5 in `ask_questions.json` (the no-data adversarial) is the regression test — if it ever returns a confident number, the prompt regressed.
- ❌ Returning 200 with an empty answer on LLM failure. The error contract says 502 — eval harnesses and .NET error mapping both depend on it.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I debugged a retrieval baseline that looked like 0.476 MRR — traced it to IVFFlat probes=1 only searching 1 of 100 clusters, fixed it in one line, real baseline was 1.000. Then I added a two-stage funnel — pgvector top-10 into a local FlashRank cross-encoder — which improved P@5 from 0.66 to 0.YY at zero API cost, and built a grounded `/ask` endpoint that answers from cited transactions only, drops hallucinated ids, and scores 0.XX RAGAS faithfulness with a cross-provider judge."* Every number comes from Steps 0, 5, 10, and 11.

---

## Notes

- **Chapter 3 gate first (Step 0).** The MRR@5 baseline from PF-AI003 must be a real number before this chapter starts — the re-ranking delta is the headline deliverable.
- **FlashRank model cache.** First `Ranker(...)` instantiation downloads ~34 MB to `cache_dir`. In Docker this re-downloads per container unless the dir is volume-mounted or baked into the image — fine for local dev, note it for the eventual Dockerfile touch-up (defer).
- **`ms-marco` models are English-trained.** Your queries are Indonesian. If the Step 5 delta disappoints, FlashRank's multilingual option (`miniReranker_arabic_v1` is *not* it — check the README table for the multilingual entry) or a language note in the metrics doc is the move. Either outcome is a documented finding (THINK-04).
- **`AnswerService` uses constructor injection** (unlike the self-constructing `EmbeddingService`/`RetrievalService` from PF-AI003). Deliberate: three swappable collaborators, trivial mocking, and the shape Chapter 8's LangGraph nodes will want. Don't retro-fit the older services now.
- **RAGAS pulls langchain into the venv.** Confined to the `dev` extra — it must never be imported from `app/` code. The app's only LLM surface remains `ProviderFactory`.
- **THINK-05 (frozen contract):** `SearchRequest`/`SearchResponse` changes are additive-optional only. `AskRequest`/`AskResponse`/`Citation` are *new* contract surface — when .NET grows an `/ask` proxy (Chapter 5, for the chat UI), the field names freeze; note it in `.claude/rules/ai-service.md` then.
- **`/ask` cost profile:** ~3 context transactions + a short question ≈ 500–800 input tokens to Gemini 2.5 Flash per ask — effectively free at personal volume; the Langfuse trace from PF-AI001 captures it without new code.
- **Next chapter (5 — Streaming):** `generation_ms` will dominate `retrieval_ms` by ~10–20×. That measured split is the justification for streaming `/ask` over SSE, and the `AnswerService` seam (provider call isolated in one place) is where the streaming variant plugs in.
- **Deferred:** hybrid BM25 + vector search (Chapter 6), chunked-corpus retrieval wiring (Chapter 6), conversation memory (Chapter 8), .NET `/ask` proxy + chat UI (Chapter 5), Cohere Rerank swap (only if FlashRank disappoints on Indonesian).

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Bi-encoder vs cross-encoder (Databricks · Google Cloud PMLE)

*Scenario:* Your pgvector search retrieves plausible-but-wrong transactions at rank 1–2, while the truly relevant ones sit at rank 6–9.

*Question:* Why does adding a cross-encoder re-ranker over the top-10 candidates improve final ranking quality compared to the embedding similarity alone?

- **A.** The cross-encoder uses a larger vector dimension, so its cosine scores are more precise
- **B.** The cross-encoder reads the query and each document together in one forward pass, modeling their interaction directly — unlike the bi-encoder, which embeds them independently and can only compare pre-computed points
- **C.** The cross-encoder caches results, so repeated queries get better over time
- **D.** Re-ranking removes duplicate documents, which is what lowers the ranking quality

<details>
<summary>Show answer</summary>

**B** — the cross-encoder attends across query and document jointly, capturing interactions a bi-encoder structurally cannot; that's also why it's too slow to score the whole table and only runs on the retrieved candidates.
*Maps to: Databricks GenAI Engineer Associate · Retrieval & re-ranking; Google Cloud PMLE · Vector Search & Embeddings*
</details>

### 2. Funnel width (Databricks · AWS ML Engineer)

*Scenario:* You add a re-ranker but apply it to the same top-5 the baseline already returned, and MRR@5 barely changes.

*Question:* What is the most likely explanation?

- **A.** The re-ranker model is broken and should be replaced
- **B.** MRR@5 cannot measure re-ranking improvements by design
- **C.** Re-ranking 5 candidates can only re-order that same set — the lift comes from retrieving a wider candidate pool (e.g., top-10) so relevant items *outside* the original top-5 can be promoted in
- **D.** The vector index needs to be rebuilt before re-ranking can take effect

<details>
<summary>Show answer</summary>

**C** — re-ranking is a re-*scoring* of the candidate set; if the relevant document never entered the set, no re-ordering can surface it. Widen retrieval, then re-rank down.
*Maps to: Databricks GenAI Engineer Associate · Assembling & Evaluating RAG; AWS Certified ML Engineer – Associate · Model evaluation & tuning*
</details>

### 3. Pre-filtering vs post-filtering (Azure AI-102 · Databricks)

*Scenario:* `/search` supports a March-only date filter. A colleague suggests retrieving the global top-10 by similarity, then dropping non-March rows in Python.

*Question:* What is the main problem with that post-filtering approach?

- **A.** Post-filtering is a security risk because dates are exposed to the application layer
- **B.** It returns too many results, increasing response size
- **C.** Python date comparison is slower than SQL date comparison
- **D.** The unfiltered top-10 may contain few or zero March rows, so the final result set silently shrinks below `top_k` even when many relevant March transactions exist — filtering must constrain the search, not trim its output

<details>
<summary>Show answer</summary>

**D** — pre-filtering (WHERE clause) makes the vector ranking happen *within* the filtered subset, keeping `LIMIT top_k` meaningful; post-filtering starves the result set.
*Maps to: Azure AI-102 · Implement knowledge mining / filtered vector queries (Azure AI Search); Databricks GenAI Engineer Associate · Retrieval*
</details>

### 4. Grounded generation (Databricks · Azure AI-102)

*Scenario:* Your `/ask` endpoint sometimes states a spending total even when no matching transactions were retrieved.

*Question:* Which combination most directly prevents fabricated answers from reaching the user?

- **A.** A system prompt that restricts answers to the provided context and permits "I don't know," a machine-checkable `confident` flag in the structured output, and validating that every cited id exists in the retrieved context
- **B.** Raising temperature so the model explores more phrasings before settling on an answer
- **C.** Increasing `top_k` so the model always has some context to answer from
- **D.** Switching from JSON mode to free-text output so the model isn't forced to fill fields

<details>
<summary>Show answer</summary>

**A** — grounding instructions + an explicit out ("I don't know"), a boolean the caller can branch on, and citation validation against the actual context form the layered guard; more context (C) actually *increases* the chance of a confident wrong answer when the data isn't there.
*Maps to: Databricks GenAI Engineer Associate · Application Development (guardrails); Azure AI-102 · Responsible AI / groundedness*
</details>

### 5. Chunking strategy choice (Databricks · Google Cloud PMLE)

*Scenario:* You index multi-page statement narratives. Searching small sentence-sized units matches precisely, but the LLM then receives fragments too short to answer from.

*Question:* Which strategy resolves this tension?

- **A.** Fixed-size chunks with zero overlap, sized to the LLM's full context window
- **B.** Embedding entire documents as single vectors so no context is ever lost
- **C.** Sentence-window chunking — index the individual sentence for precise matching, but return the sentence plus its ±N neighbours so the generator receives sufficient context ("small-to-search, big-to-read")
- **D.** Duplicating every chunk three times in the index to boost its retrieval probability

<details>
<summary>Show answer</summary>

**C** — sentence-window decouples the *retrieval unit* (small, precise) from the *generation unit* (expanded window); A and B each sacrifice one side of the tradeoff.
*Maps to: Databricks GenAI Engineer Associate · Data Preparation (chunking); Google Cloud PMLE · RAG data design*
</details>

### 6. Evaluating the generator, not just the retriever (Databricks · AWS ML Engineer)

*Scenario:* MRR@5 says retrieval is good, but you want a number for "does the generated answer only state things supported by the retrieved transactions?"

*Question:* The appropriate metric and setup is:

- **A.** BLEU score between the answer and the retrieved context strings
- **B.** RAGAS faithfulness — decompose the answer into claims and have a judge LLM verify each claim against the retrieved context; use a *different* model as judge than the generator to avoid self-preference bias
- **C.** Re-run MRR@5 on the generated answers instead of the retrieved ids
- **D.** Token-level perplexity of the answer under the generator model

<details>
<summary>Show answer</summary>

**B** — faithfulness is the claim-level groundedness metric for the generation stage (MRR covers retrieval), and a cross-provider judge avoids the self-evaluation inflation documented in LLM-as-judge literature.
*Maps to: Databricks GenAI Engineer Associate · Evaluating RAG Applications; AWS Certified ML Engineer – Associate · Model evaluation*
</details>
