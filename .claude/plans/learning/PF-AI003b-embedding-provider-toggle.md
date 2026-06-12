# PF-AI003b — Embedding Provider Toggle (OpenAI ⇄ Gemini)

> **Learning Phase:** Phase 1 · Week 3 of 12 · Addendum to PF-AI003
> **Status:** IN PROGRESS
> **Started:** 2026-06-12
> **Parent plan:** [PF-AI003-rag-embeddings-retrieval.md](PF-AI003-rag-embeddings-retrieval.md)

## Objective

PF-AI003 built the RAG pipeline hardwired to OpenAI `text-embedding-3-small`. The owner now has
only a `GEMINI_API_KEY`, so the pipeline cannot run. This task adds an explicit provider toggle
(`EMBEDDING_PROVIDER=openai|gemini`) that mirrors the existing `AI_PROVIDER` pattern, so either
provider can generate the 1536-dim vectors stored in `transaction_embeddings`.

## Decision Note — Embedding Is Infrastructure, Not BYOK

**Embedding is invisible server-side infrastructure.** End users never choose an embedding
provider — they never even know one exists. This is the opposite of LLM generation (where BYOK
model selection will eventually be a product feature). Embedding provider selection is an operator
decision made once at deployment, not a user-facing setting.

**One vector store = one embedding model.** Vectors from different models live in incompatible
geometric spaces — comparing an OpenAI embedding against a Gemini embedding gives meaningless
cosine distances. The `model` column in `transaction_embeddings` is an audit trail, not a
selector. Switching provider means re-embedding every transaction with the new model (backfill).

**Switching provider = destructive action.** The backfill script handles the one human decision
point: it detects model-mismatch rows, prints a warning listing how many embeddings will be
replaced, and requires interactive confirmation (`[y/N]`) before proceeding. `--yes` skips for
non-interactive use. Re-embed cost is ≈ $0 (Gemini free tier; OpenAI ~$0.01 for 5k rows).

**`ON CONFLICT (transaction_id) DO UPDATE` is the correct upsert semantic.** Switching provider
clears old vectors row-by-row as backfill runs. No schema migration needed — `vector(1536)` is
preserved because both providers are constrained to 1536 dims.

## Acceptance Criteria

- [ ] `EMBEDDING_PROVIDER=gemini` works end-to-end: backfill runs, `POST /search` returns results
- [ ] `EMBEDDING_PROVIDER=openai` continues to work as before
- [ ] `app/providers/embedding_base.py` — `EmbeddingProvider` Protocol (`embed_documents`, `embed_query`, `model`)
- [ ] `app/providers/openai_embedding.py` — `OpenAIEmbeddingProvider` (moved from `embedder.py`)
- [ ] `app/providers/gemini_embedding.py` — `GeminiEmbeddingProvider` (gemini-embedding-001, 1536 dims, normalized, task_type asymmetry)
- [ ] `app/providers/embedding_factory.py` — `create_embedding_provider(settings)` function
- [ ] `app/config.py` — `embedding_provider: Literal["openai", "gemini"] = "gemini"`, `embedding_model: str = ""` (empty = per-provider default), `validate_embedding_provider_key()` warns but does not crash
- [ ] `app/observability.py` — Gemini embed pricing (free tier = 0.0), span renamed "embed-batch", provider+model metadata
- [ ] `app/services/embedder.py` — depends only on `EmbeddingProvider` protocol; no openai import
- [ ] `app/services/retriever.py` — depends only on `EmbeddingProvider` protocol; SQL adds `WHERE te.model = <active model>` guard
- [ ] `scripts/backfill_embeddings.py` — detects model-mismatch rows, prints destructive warning, requires `[y/N]` or `--yes`; `--dry-run` reports both missing + to-be-replaced counts
- [ ] `app/main.py` — instantiates embedding provider via factory, passes to both services
- [ ] `services/ai-service/.env.example` — `EMBEDDING_PROVIDER` documented
- [ ] All existing tests updated to mock `EmbeddingProvider` abstraction (not openai SDK)
- [ ] New tests: factory toggle, Gemini vector normalization, retriever SQL model filter, backfill confirmation paths
- [ ] `evals/eval_retrieval.py` — prints active provider + model in output header
- [ ] `docs/rag-embeddings-howto.md` — updated prerequisites, arch diagram, "Switching providers" section
- [ ] `pytest` passes (all tests green)

## Approach

**Mirror the existing LLM provider pattern exactly.** `ProviderFactory.create(settings)` is the
reference. `create_embedding_provider(settings)` does the same: reads `settings.embedding_provider`,
constructs the right implementation, returns it behind the `EmbeddingProvider` protocol.

**Gemini quirk: output_dimensionality requires L2 normalization.** `gemini-embedding-001` defaults
to 3072 dims. When `output_dimensionality=1536` is requested (to match the existing vector column),
the API returns truncated but un-normalized vectors. Normalizing with L2 norm before storing ensures
cosine similarity works correctly. `OpenAIEmbeddingProvider` does not need normalization — OpenAI
normalizes internally.

**task_type asymmetry (Gemini).** For documents: `task_type="RETRIEVAL_DOCUMENT"`. For queries:
`task_type="RETRIEVAL_QUERY"`. OpenAI's `text-embedding-3-small` doesn't support task types —
documents and query use the same call. The asymmetry is meaningful for retrieval quality and is an
interview-ready design point: "I used asymmetric embeddings — documents and queries get different
task-type hints — which is the documented approach for retrieval use cases."

**Retriever model filter as mixed-state guard.** `WHERE te.model = <active_model>` ensures that
during a provider switch (backfill in progress), the retriever only searches vectors from the
active model. Without this guard, stale vectors from the old model would pollute results with
meaningless cross-model cosine distances.

**Backfill as the one human decision point.** The live `/embed-transactions` endpoint is
fire-and-forget with no confirmation — it always embeds with the active provider, overwriting
per-row. The backfill script is the only path where a human consciously switches providers, so
that's where the destructive warning lives.

## Affected Files

| File | Change |
|------|--------|
| `.claude/plans/learning/PF-AI003b-embedding-provider-toggle.md` | CREATE — this file |
| `services/ai-service/app/providers/embedding_base.py` | CREATE — `EmbeddingProvider` Protocol |
| `services/ai-service/app/providers/openai_embedding.py` | CREATE — `OpenAIEmbeddingProvider` |
| `services/ai-service/app/providers/gemini_embedding.py` | CREATE — `GeminiEmbeddingProvider` |
| `services/ai-service/app/providers/embedding_factory.py` | CREATE — `create_embedding_provider()` |
| `services/ai-service/app/config.py` | MODIFY — `embedding_provider`, model defaults, `validate_embedding_provider_key()` |
| `services/ai-service/app/observability.py` | MODIFY — Gemini embed cost, rename span, metadata |
| `services/ai-service/app/services/embedder.py` | MODIFY — inject `EmbeddingProvider`, remove openai import |
| `services/ai-service/app/services/retriever.py` | MODIFY — inject `EmbeddingProvider`, add model SQL filter |
| `services/ai-service/scripts/backfill_embeddings.py` | MODIFY — mismatch detection, confirmation, `--yes`, dry-run counts |
| `services/ai-service/app/main.py` | MODIFY — factory call, pass provider to services |
| `services/ai-service/.env.example` | MODIFY — `EMBEDDING_PROVIDER` |
| `services/ai-service/tests/test_embedder.py` | MODIFY — mock `EmbeddingProvider` instead of openai |
| `services/ai-service/tests/test_retriever.py` | MODIFY — mock `EmbeddingProvider`, add model filter test |
| `services/ai-service/tests/test_embedding_providers.py` | CREATE — factory, normalization, backfill tests |
| `services/ai-service/evals/eval_retrieval.py` | MODIFY — print provider + model in header |
| `services/ai-service/docs/rag-embeddings-howto.md` | MODIFY — prerequisites, switching providers section |
| `.kanban/BOARD.md` | MODIFY — add PF-AI003b |

---

## TODO

### [ ] STEP 1 — Plan file (this file)
Create this plan before touching any code.

---

### [ ] STEP 2 — Add PF-AI003b to BOARD.md (In Progress)

---

### [ ] STEP 3 — EmbeddingProvider abstraction + provider implementations

Create `app/providers/embedding_base.py`:
```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class EmbeddingProvider(Protocol):
    @property
    def model(self) -> str: ...
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_query(self, text: str) -> list[float]: ...
```

Create `app/providers/openai_embedding.py` — moves OpenAI logic from `embedder.py`.
Create `app/providers/gemini_embedding.py` — `gemini-embedding-001`, `output_dimensionality=1536`, L2 normalize, task_type asymmetry.
Create `app/providers/embedding_factory.py` — `create_embedding_provider(settings)`.

**C# equivalent:**
```csharp
// IEmbeddingProvider interface in Application/Interfaces/
public interface IEmbeddingProvider {
    string Model { get; }
    Task<IReadOnlyList<float[]>> EmbedDocumentsAsync(IReadOnlyList<string> texts, CancellationToken ct = default);
    Task<float[]> EmbedQueryAsync(string text, CancellationToken ct = default);
}
// Implementations: OpenAIEmbeddingProvider, GeminiEmbeddingProvider in Infrastructure/
// Factory: static EmbeddingProviderFactory.Create(IOptions<EmbeddingSettings>) in Infrastructure/
```

---

### [ ] STEP 4 — Update app/config.py

Add:
- `embedding_provider: Literal["openai", "gemini"] = "gemini"`
- `embedding_model: str = ""` (empty = use per-provider default; preserves explicit overrides)
- `validate_embedding_provider_key()` — warns on missing key for active embedding provider

---

### [ ] STEP 5 — Update app/observability.py

Add:
- `GEMINI_EMBED_COST = {"gemini-embedding-001": 0.0}` (free tier)
- Merge into `EMBED_COST` dict checked by `estimate_embed_cost_usd()`
- Span rename: `"openai-embed-batch"` → `"embed-batch"`
- Add `metadata={"provider": provider, "model": model}` to span

---

### [ ] STEP 6 — Rewrite embedder.py and retriever.py

`EmbeddingService(provider: EmbeddingProvider)`:
- Replace `openai.AsyncOpenAI` calls with `provider.embed_documents(texts)`
- `self._model = provider.model` for DB insert and logging

`RetrievalService(provider: EmbeddingProvider)`:
- Replace `openai.AsyncOpenAI` call with `provider.embed_query(query)`
- SQL adds `AND te.model = $4` param (active model as mixed-state guard)

---

### [ ] STEP 7 — Rewrite backfill_embeddings.py

New logic:
1. Query missing transactions (no embedding row)
2. Query model-mismatch transactions (embedding exists but `te.model != active_model`)
3. If `--dry-run`: print both counts, exit
4. If mismatch rows exist and `--yes` not set: print destructive warning, prompt `[y/N]`
5. Embed all (missing + mismatch) using active provider

---

### [ ] STEP 8 — Update main.py

```python
from app.providers.embedding_factory import create_embedding_provider

@asynccontextmanager
async def lifespan(app):
    ...
    embed_provider = create_embedding_provider(settings)
    app.state.embedder = EmbeddingService(provider=embed_provider)
    app.state.retriever = RetrievalService(provider=embed_provider)
    logger.info("... | embedding_provider=%s | embedding_model=%s",
                settings.embedding_provider, embed_provider.model)
```

---

### [ ] STEP 9 — Update .env.example

Add `EMBEDDING_PROVIDER=gemini` block.

---

### [ ] STEP 10 — Update tests

Update `test_embedder.py` and `test_retriever.py` to mock `EmbeddingProvider` (not openai SDK).
Create `test_embedding_providers.py`:
- Factory returns correct class per `embedding_provider` config
- GeminiEmbeddingProvider normalizes vectors (mock Gemini client)
- Retriever SQL includes `te.model` filter
- Backfill `--dry-run` prints both counts, no embedding called
- Backfill confirmation path: mocked `input("y")` → proceeds
- Backfill `--yes` skips confirmation → proceeds without prompt

---

### [ ] STEP 11 — Update evals/eval_retrieval.py

Print header line before the results table:
```
Provider: gemini | Model: gemini-embedding-001
```

---

### [ ] STEP 12 — Update docs/rag-embeddings-howto.md

- Prerequisites table: replace `OPENAI_API_KEY` row with `EMBEDDING_PROVIDER + matching key` row
- Architecture diagram: update model references
- Add "Switching providers" section: EMBEDDING_PROVIDER → backfill (confirm warning) → re-run eval
- Troubleshooting: add rows for missing key per provider

---

### [ ] STEP 13 — Run pytest

```bash
cd services/ai-service && pytest
```
All tests must be green before committing.

---

### [ ] STEP 14 — Mark BOARD.md Done and commit

---

## Resources

- [Gemini embedding API docs](https://ai.google.dev/gemini-api/docs/embeddings)
- [task_type values for Gemini](https://ai.google.dev/api/embeddings#v1beta.TaskType)
- [Cosine similarity and normalization](https://en.wikipedia.org/wiki/Cosine_similarity)
- [PF-AI003 parent plan](PF-AI003-rag-embeddings-retrieval.md)

## Knowledge Check

After completing this task, you should be able to answer:
1. Why can't you mix vectors from different embedding models in a single pgvector search?
2. Why does the Gemini API require L2 normalization when `output_dimensionality` is non-default?
3. What is `task_type` asymmetry, and why does it improve retrieval quality?
4. Why does the live `/embed-transactions` endpoint need no confirmation, but the backfill script does?
5. What happens to search results during the transition window after switching providers (before backfill completes)?
