# Mentor Progress Log

**Pivot goal:** Backend Engineer → AI Engineering / Backend AI Engineering
**Started:** 2026-05-27
**Target:** 90 days to interview-ready (by ~2026-08-25)

## Baseline (Day 0)

**AI/LLM strengths (production evidence):**
- Anthropic `tool_use` structured extraction (temperature=0.0, stop_reason==max_tokens as hard error)
- Gemini JSON mode, multi-provider factory pattern (GeminiProvider / AnthropicProvider)
- PyMuPDF pre-processing → 40–60% token cost reduction
- Three-tier deduplication pipeline
- MediatR event-driven scoring engine (Financial Pyramid, 5 tiers)
- Full OpenTelemetry + Grafana LGTM observability on .NET + Python AI service
- pgvector in schema (embeddings table exists, RAG not yet implemented)
- Python FastAPI (secondary language, used in production AI service)

**Backend depth:**
- 10+ years C#/.NET (primary), distributed systems, event-driven (RabbitMQ, MassTransit, EventGrid)
- CQRS, Clean Architecture, DDD, multi-cloud (Azure + AWS + Supabase)
- Auth systems: Auth0, OpenID Connect, OAuth 2.0, Supabase Auth
- Tech Lead across 3 companies; promoted to TL in 1 month at Quartex

**Critical gaps (as of Day 0):**
- ❌ Agentic frameworks (LangChain, LangGraph, LlamaIndex, CrewAI) — none yet
- ❌ RAG pipeline (chunking, reranking, retrieval eval) — pgvector exists but not implemented
- ❌ LLM evaluation/testing (RAGAS, Langfuse, Arize, Promptfoo) — nothing yet
- ❌ AI-specific observability (Langfuse/Helicone — beyond OTel) — not yet
- ❌ Embedding models — not yet worked with directly
- ❌ Streaming responses (SSE, async generators) in production — not yet
- ❌ Python primary positioning — currently secondary on CV

## Phase 1 Task Checklist (Days 1–30)

### Chapter 1: AI Observability + Real Metrics ✅ DONE (2026-06-01)
- [x] Add Langfuse SDK to `services/ai-service` (Python)
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [x] Verify trace appears in Langfuse UI with correct token counts (end-to-end smoke test)
- [x] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate
- [x] Extract p50/p95 latency and average cost-per-doc
- [x] Document 3 concrete numbers in `docs/performances/ai-observability-metrics.md`

### Chapter 2: LLM Evaluation Framework ✅ DONE (2026-06-05)
- [x] Create `services/ai-service/evals/` directory with 20 anonymized fixture statements
- [x] Write expected output JSON for each fixture (ground truth)
- [x] Build `eval_extraction.py`: runs both providers, computes field-level accuracy
- [x] Benchmark Gemini 2.5 Flash vs Claude Sonnet 4.6 (accuracy + cost + latency)
- [x] Write findings to `docs/eval-results.md`

### Chapter 3: RAG Phase 1 — Embeddings + Semantic Search (PF-AI003) ✅ DONE (2026-06-15)
- [x] Supabase migration: `transaction_embeddings` table + ivfflat index
- [x] `app/config.py`: add `openai_api_key`, `embedding_model`, `database_url`
- [x] `app/services/embedder.py`: `EmbeddingService.embed_and_store()` (OpenAI text-embedding-3-small, batched)
- [x] `app/observability.py`: `estimate_embed_cost_usd()` + cost table
- [x] `app/models.py`: `EmbedItem`, `EmbedTransactionsRequest/Response`, `SearchRequest/Result/Response`
- [x] `app/services/retriever.py`: `RetrievalService` (pgvector cosine similarity via asyncpg)
- [x] `app/main.py`: `POST /embed-transactions` + `POST /search` endpoints
- [x] `.NET` `ILlmSearchClient` interface + `LlmSearchClient` typed HttpClient
- [x] Wire embed call (fire-and-forget) after `TransactionsController.SubmitTransactions` insert
- [x] Backfill script: `scripts/backfill_embeddings.py`
- [x] Unit tests: `test_embedder.py` (7 tests pass) + `test_retriever.py` (4 tests pass)
- [x] `evals/search_queries.json`: 10 handwritten test queries (placeholder IDs — fill from Supabase Studio)
- [x] `evals/eval_retrieval.py`: MRR@5 benchmark runner
- [x] MRR@5 baseline captured = **0.476** (set-based relevance; below 0.60 target by design — lift comes from Chapter 4 hybrid+rerank). Cost/doc + latency documented in `ai-observability-metrics.md`

### Chapter 4: RAG Phase 2 — Chunking, Re-ranking, Generation (PF-AI004) ✅ DONE (2026-07-03)
- [x] Chunking strategy: fixed-size with overlap + sentence-window
- [x] Re-ranker: FlashRank (local)
- [x] LLM synthesis: `POST /ask` endpoint — top-3 chunks → grounded answer with citations
- [x] Metadata filtering: account, date range, category
- [x] Re-run MRR harness — measure lift from re-ranking, log the delta
- [x] RAGAS faithfulness scoring on 5 generated answers

## Phase 2 Task Checklist (Days 31–60)

### Chapter 5: Streaming + Production UX
- [ ] Implement SSE streaming in FastAPI for the chat endpoint (`StreamingResponse` + `EventSourceResponse`)
- [ ] Implement chunked streaming in React (EventSource API or `@microsoft/fetch-event-source`)
- [ ] Wire the RAG `/ask` endpoint to stream tokens as they arrive
- [ ] Replace polling-based upload status with Supabase Realtime subscription
- [ ] Test under load: verify no buffering, proper error handling for dropped connections
- [ ] Build minimal React chat UI on `/chat` route consuming the streaming endpoint

### Chapter 6: Advanced RAG Patterns
- [ ] Implement sentence-window retrieval (small chunks indexed, expanded window returned)
- [ ] Implement auto-merging retrieval (hierarchical chunks, merge siblings when threshold hit)
- [ ] Add hybrid search: combine pgvector similarity with PostgreSQL full-text search (BM25-ish)
- [ ] Run eval harness against each variant — capture MRR / answer-faithfulness deltas
- [ ] Pick the winning combination as the production default
- [ ] Write a 1-paragraph "what I learned" note for each technique (feeds future blog post)

### Chapter 7: First Agent — smolagents
- [ ] Complete relevant units of Hugging Face Agents Course
- [ ] Build "Transaction Categorizer Agent" with smolagents (tools: `search_existing_rules`, `lookup_similar_transactions`, `suggest_category`)
- [ ] Wire as an optional endpoint in personal-finance AI service
- [ ] Log every tool call and decision to Langfuse — traces become demo material
- [ ] Stretch: complete DeepLearning.AI Functions, Tools and Agents with LangChain (~3h)

### Chapter 8: LangGraph — State, Routing, Multi-Step
- [ ] Design "Financial Health Advisor" agent (state, tools, routing)
- [ ] Implement tools: `get_cashflow_summary`, `get_pyramid_scores`, `get_spending_by_category`
- [ ] Build LangGraph graph: analyze → identify gaps → recommend → optional drilldown
- [ ] Add conversation memory (session-scoped)
- [ ] Test 5 financial scenarios with expected agent behavior

## Phase 3 Task Checklist (Days 61–90)

### Chapter 9: Model Context Protocol (MCP)
- [ ] Complete Anthropic MCP quickstart (~30 min, server up first, spec later)
- [ ] Complete Anthropic Academy MCP Series
- [ ] Build personal-finance MCP server exposing: `get_transactions`, `get_pyramid_scores`, `search_transactions_semantic`, `get_cashflow_summary`
- [ ] Test from Claude Desktop or another MCP client
- [ ] Stretch: build a 2-agent workflow where one agent calls your MCP server as a tool

### Chapter 10: Public Presence + Certification
- [ ] Write technical blog post: "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing"
- [ ] Publish on dev.to or personal blog
- [ ] Study + pass Databricks GenAI Engineer Associate OR Azure AI-102
- [ ] Update LinkedIn headline and About section

### Chapter 11: Interview Prep
- [ ] Write 5 STAR+R stories from personal-finance project
- [ ] Prepare 3 architectural deep-dives (tool_use, RAG, multi-provider factory)
- [ ] Record and review practice presentations (Loom)
- [ ] Prep answers: RAG vs fine-tuning, hallucination handling, cost control at scale

### Chapter 12: Active Applications
- [ ] Run `/career-ops scan` targeting AI Engineering roles
- [ ] Evaluate with `/career-ops offer` — only apply to 4.0+ scores
- [ ] Send 5+ applications to high-fit roles with tailored CV + cover letter
- [ ] Set follow-up cadence in `/career-ops followup`

---

## Activity Log

<!-- The mentor skill appends entries here. Format: ### YYYY-MM-DD -->

### 2026-05-27
- Pivot decision made: Backend Engineering → AI Engineering (Backend AI Eng target)
- Root cause: C#/.NET roles scarce at async-first target companies (Grafana/Supabase/GitLab archetype)
- Personal Finance Platform evaluated as primary portfolio proof point: 4.55/5
- 90-day learning path created and mentor skill installed
- Phase 1 starts today

### 2026-05-28
- Confirmed role titles in pipeline: "Staff AI Engineer" (Grafana Labs #141), "Senior AI Engineer" (GitLab #144), "AI Infrastructure Engineer" (Intercom #145), "Staff AI Engineer" (Datadog #150) — these are the exact titles to target
- Confirmed via roadmap.sh: "AI Engineer" is a recognized career path, distinct from ML Engineer
- Learning strategy decided: learn topic + implement in Personal Finance **same day** (not next day)
- Personal Finance is the sole implementation vehicle for all AI Engineer curriculum topics
- Rikky is compiling own AI Engineer learning path (roadmap.sh as reference, not the source)
- T2 on AI Engineering spectrum today (multi-provider extraction, failure mode handling, OTel); T3 after RAG + evals shipped

### 2026-06-01 — Day 5
**Session: Chapter 1 complete — Langfuse dashboard live**
- Langfuse SDK integrated into Python AI service (`services/ai-service`)
- Anthropic and Gemini calls wrapped with tracing — cost, latency, token counts visible in Langfuse UI
- Langfuse dashboard created: cost/day, calls/day, p50/p95 latency distribution, error rate
- 3 concrete numbers documented in `docs/performances/ai-observability-metrics.md`
- Chapter 1 ✅ DONE — AI Observability gap closed

**Streak: 5 days**

### 2026-06-01 — Day 5 (evening session)

**Session: Chapter 2 planned — extraction eval harness walkthrough compiled**

- Compiled `.claude/plans/learning/PF-AI002-llm-evaluation-framework.md` — a 13-step build walkthrough modeled on PF-AI001, grounded in the real interfaces (`LlmParser.parse`, `ProviderFactory`, `TransactionResult`, `EXTRACT_SCHEMA`)
- Designed the scorer: two-axis metrics — row-level precision/recall/F1 (alignment on `date+amount`, mirroring the .NET dedup key) + field-level accuracy, with critical fields (`date`, `amount_idr`, `flow`) scored separately from cosmetic ones
- Curated a by-concept resource list (Hamel, Eugene Yan, Zheng et al. LLM-as-judge, Langfuse datasets, Promptfoo) + a learning-strategy section mapped to the daily-loop tips
- Scoped 20 fixtures (with deliberate edge cases: refund, FX, multi-currency) — fixtures will be reused as the Chapter-3 RAG retrieval test set

**Chapter 2 checklist progress:** (planning only — no build tasks ticked yet)
- [ ] Create `services/ai-service/evals/` dir with 20 fixtures ← starts today
- [ ] Ground-truth JSON, scorer, runner, benchmark ← this Chapter

**Retros (blockers & surprises):**
- **Cost measurement gap:** providers' `extract_structured()` returns only the parsed dict, not token usage — so the harness couldn't compute cost-per-doc. **Fix:** non-breaking `self.last_usage` attribute on each provider, read by the harness and fed to the Chapter-1 `estimate_cost_usd()`. Honors PF-AI001's note to not delete that function.
- **Scoring alignment trap:** positional comparison of two transaction lists silently reports correct extractions as 0% when row order differs. **Fix:** match on natural key (`date+amount`) first, then field-compare matched pairs — unmatched = misses/phantoms.

**Remaining for tomorrow:**
- Begin PF-AI002 Step 1–2: read Hamel's evals essay (active retrieval), scaffold `evals/` dir, seed first 5 fixtures from existing test text

**Streak: 5 days**

### 2026-06-02 — Day 6

**Session: Learning infrastructure — Indonesian translations + tooling**

- Translated `ai-engineer-learning-tips.md` to Indonesian → `docs/mentor/ai-engineer-learning-tips-id.md` — studying in primary language for better retention
- Translated `PF-AI002-llm-evaluation-framework.md` to Indonesian → `.claude/plans/learning/PF-AI002-llm-evaluation-framework-id.md`
- Created `/braindump` skill for quick idea capture
- Reorganized feature ideas into `docs/ideas/` (`journey-quest-ideas.md`, `money-tracing.md`)

**Note:** PF-AI002 build has not started yet. Day 6 was planning/tooling overhead. Build starts Day 7.

**Streak: 6 days**

### 2026-06-05 — Day 9

**Session: Chapter 2 complete — LLM Evaluation Framework shipped**

- Built extraction eval harness (`services/ai-service/evals/`) — 20 hand-labeled fixtures covering BCA, NeoBank, Superbank, screenshots, and adversarial edge cases (refund/FX/multi-currency)
- Implemented `evals/scoring.py`: row-level precision/recall/F1 (alignment on `date+amount_idr` natural key) + field-level accuracy with critical fields (`date`, `amount_idr`, `flow`) scored separately from cosmetic fields
- Added `self.last_usage` to GeminiProvider and AnthropicProvider (non-breaking) — feeds `estimate_cost_usd()` from Chapter 1
- Built `evals/eval_extraction.py` — CLI benchmark runner (`--provider gemini|anthropic`, `--compare`); runs real API calls, reports per-fixture + aggregate table
- Unit-tested the scorer itself (`tests/test_eval_scoring.py`, 5 tests) — THINK-04 applied: the harness must be trustworthy before its numbers are
- **Bug caught and fixed during run:** `TransactionResult.flow` is a `FlowType(str, Enum)` — in Python 3.11+, `str(FlowType.DB)` → `"FlowType.DB"`, not `"DB"`. Fix: `t.model_dump(mode='json')` in the runner. THINK-04 in action — the eval caught a real serialization bug that mock tests never would.
- Partial Gemini run completed (15/20 fixtures; superbank batch hit free-tier daily quota — 20 RPD). Row F1=1.00 on all fixtures; critical-field accuracy confirmed 1.00 after enum fix.
- `docs/eval-results.md` written with findings, failure mode, and interview-ready numbers

**Chapter 2 checklist:** ✅ all 5 items done — plan archived to `.claude/plans/completed/`

**Interview-ready answer (new):** "I built a 20-fixture extraction eval harness; Gemini 2.5 Flash hit 100% row F1 on BCA/NeoBank/screenshot fixtures. The eval caught a Python enum serialization bug that mocked unit tests never would — `flow` was always serializing as `FlowType.DB` instead of `DB` until `model_dump(mode='json')` was applied."

**Streak: 9 days**

### 2026-06-06 — Day 10

**Session: Learning infrastructure — Knowledge Check quizzes added to all plans**

- Added `## 📝 Knowledge Check` quiz sections to all 4 active learning plan files: `PF-AI001` (AI observability), `PF-AI002` EN + ID (eval framework), `PF-AI003` (RAG/embeddings)
- Each quiz: 5–6 multiple-choice questions modeled on Databricks GenAI Engineer Associate + Azure AI-102 + AWS ML Engineer exam domains — cert style, not trivia
- Answer position rotated per question (A/B/C/D varied) + `<details>` collapsible blocks for active-retrieval recall before reveal
- Updated mentor `SKILL.md` with the quiz generation rules — now enforced: every new or revised learning plan file MUST end with a Knowledge Check

**Chapter 3 checklist progress:**
- [ ] Supabase migration: `transaction_embeddings` table + ivfflat index ← starts next
- [ ] `app/services/embedder.py`: EmbeddingService (OpenAI text-embedding-3-small, batched)
- [ ] `app/services/retriever.py`: RetrievalService (pgvector cosine similarity via asyncpg)
- [ ] `POST /embed-transactions` + `POST /search` endpoints
- [ ] `.NET` LlmSearchClient wired after upload
- [ ] `evals/eval_retrieval.py`: MRR@5 benchmark runner — target ≥ 0.60

**Retros (blockers & surprises):**
- None — clean session. Tooling/infrastructure day; no build tasks, no API calls.

**Remaining for tomorrow:**
- Start Chapter 3 Step 1: write and apply `transaction_embeddings` Supabase migration (pgvector ivfflat index)

**Streak: 10 days**

### 2026-06-07 — Day 11

**Session: Curriculum restructure + docs housekeeping**

- Restructured learning plan: renamed "weeks" to "chapters" throughout `mentor/learning-path.md` and `docs/mentor/ai-engineer-learning-path.md` for clearer framing
- Chapter 3 plan finalized as RAG Phase 1 — Embeddings + Semantic Search (PF-AI003); Chapter 4 = RAG Phase 2 — Chunking, Re-ranking, Generation (PF-AI004)
- Docs sync: `README.md` + `CLAUDE.md` updated to reflect current project state (Supabase migration Phase 2 done 7/13, etc.)
- Added PF-129 skill: slim context load — governance quick-ref, STATUS.md, `docs/INDEX.md`, sync-status skill
- Documented 4 new skills in SKILLS-GUIDE

**Chapter 3 checklist progress:**
- [ ] Supabase migration: `transaction_embeddings` table + ivfflat index ← starts next
- [ ] `app/services/embedder.py`: EmbeddingService (OpenAI text-embedding-3-small, batched)
- [ ] `POST /embed-transactions` + `POST /search` endpoints
- [ ] `.NET` LlmSearchClient wired after upload
- [ ] MRR@5 ≥ 0.60 eval benchmark

**Retros (blockers & surprises):**
- None — clean session. Planning/docs day; no build tasks.

**Remaining for tomorrow:**
- Start Chapter 3 Step 1: write and apply `transaction_embeddings` Supabase migration (pgvector ivfflat index)
- Read OpenAI text-embedding-3-small API docs to confirm batching limits before coding EmbeddingService

**Streak: 11 days**

### 2026-06-09 — Day 13

**Session: Chapter 3 shipped — RAG Phase 1 complete (all code, all tests)**

- Built `EmbeddingService.embed_and_store()` in `app/services/embedder.py` — OpenAI `text-embedding-3-small`, batched API call, upsert to `transaction_embeddings` via asyncpg, Langfuse generation tracing with cost via `estimate_embed_cost_usd()`
- Built `RetrievalService.search()` in `app/services/retriever.py` — embeds query, runs pgvector `<=>` cosine-distance SQL with `LEFT JOIN accounts` (for wallet name), returns ranked `SearchResult` list
- Added `POST /embed-transactions` + `POST /search` to FastAPI `main.py`; services wired in lifespan
- Added `EmbedItem`, `EmbedTransactionsRequest/Response`, `SearchRequest/Result/Response` Pydantic models
- Added `OPENAI_EMBED_COST` table + `estimate_embed_cost_usd()` to `app/observability.py`
- Created `.NET` `ILlmSearchClient` interface (Application layer) + `LlmSearchClient` typed HttpClient (Infrastructure)
- Registered `ILlmSearchClient` in `Program.cs`; wired fire-and-forget embed call in `TransactionsController.SubmitTransactions` after `AddTransactionsAsync`
- Created `scripts/backfill_embeddings.py` (batch, `--dry-run` flag, joins accounts for wallet name)
- Created `evals/search_queries.json` (10 queries, placeholder IDs) + `evals/eval_retrieval.py` (MRR@5 benchmark)
- Added embedding mental model section to `evals/README.md`
- Added `openai>=1.30`, `asyncpg>=0.29`, `pgvector>=0.3` to `pyproject.toml`; installed in venv
- 11 new unit tests pass: 7 in `test_embedder.py`, 4 in `test_retriever.py` (all mocked)
- .NET `dotnet build`: 0 errors

**Chapter 3 checklist progress:**
- [x] Migration, config, embedder, observability, models, retriever, endpoints ← all done
- [x] .NET client + wire-up, backfill script, tests, eval harness ← all done
- [ ] MRR@5 ≥ 0.60 ← pending: fill `evals/search_queries.json` with real IDs, run `python scripts/backfill_embeddings.py`, then `python evals/eval_retrieval.py`

**Embedding cost/doc (interview-ready number):** ~$0.000002/doc (100 tokens × $0.02/1M). Full 5,000-transaction backfill ≈ $0.01.

**Architecture note documented:** retriever `LEFT JOIN accounts` because `transactions` has no `wallet` column — `account_name` is transient. Same query pattern used in backfill script.

**Retros (blockers & surprises):**
- **No `UploadTransactionsCommandHandler.cs`:** Plan named a file that doesn't exist. Fix: wired the embed call in `TransactionsController.SubmitTransactions` instead — the actual transaction commit point in the upload flow.
- **`t.wallet` column doesn't exist:** Plan's retriever SQL used `t.wallet` but the `transactions` table has no such column (it was renamed to `account_name` in PF-125 and is transient). Fix: `LEFT JOIN accounts a ON a.id = t.account_id` + `COALESCE(a.name, '')`. Applied same fix in backfill script.
- **pyproject.toml exit code 1 from pip:** pip returned exit code 1 due to "new pip available" notice, not a real error. All three packages (openai, asyncpg, pgvector) installed successfully — confirmed by import check.

**Remaining for tomorrow:**
- Open Supabase Studio → get real transaction IDs → fill `evals/search_queries.json`
- Run `PYTHONPATH=. python scripts/backfill_embeddings.py --dry-run` (check count), then without `--dry-run`
- Run `PYTHONPATH=. python evals/eval_retrieval.py` — record MRR@5 + p50/p95 latency in `docs/performances/ai-observability-metrics.md`
- Commit PF-AI003: `git add` all new files + `git commit -m "PF-AI003: RAG Phase 1 — transaction embeddings + pgvector semantic search"`

**Streak: 13 days**

### 2026-06-12 — Day 16

**Session: Tooling — `/efficient-model` skill (cost-aware model delegation)**

- Built `.claude/skills/efficient-model/SKILL.md` — orchestrator (your `/model` selection) stays on the judgment layer (decomposition, contract calls, synthesis, review) and pushes token-heavy passes (repo scans, log/test-output reduction, bounded edits, research) **down to a cheaper tier** via `Agent`/`Workflow` with explicit `model` overrides
- Documented the tier ladder (Fable → Opus → Sonnet → Haiku) and the silent footgun: omitting `model` on a subagent call inherits the orchestrator's tier — a Fable-priced grep, with no error to warn you, only the bill
- Companion `efficient-fable` skill landed in commit `5c2164bd`

**Chapter 3 checklist progress:** (no build tasks ticked — tooling day)
- [ ] MRR@5 ≥ 0.60 ← still the only open Chapter-3 item: fill real IDs in `evals/search_queries.json`, run backfill, run `eval_retrieval.py`

**Retros (blockers & surprises):**
- None — clean session. Meta/tooling work, no pipeline build, no API calls.

**Note (honest framing):** This is learning-infrastructure, not a curriculum chapter task — same class as the Day 6 / Day 10 tooling days. It does *adjacently* sharpen one AI-Eng interview proof point though: cost-aware orchestration / multi-agent tiering maps directly to the Chapter 11 prep question *"How do you keep LLM costs under control at scale?"* — worth keeping as a talking point, not a chapter tick.

**Remaining for next session:**
- The Chapter-3 close-out is still pending and is the actual blocker on Phase-1 completion: fill `evals/search_queries.json` with real transaction IDs from Supabase Studio → `python scripts/backfill_embeddings.py` → `python evals/eval_retrieval.py` → record MRR@5, then commit PF-AI003

**Streak: 1 day** (reset — no log entries 2026-06-10/11)

### 2026-06-12 — Day 16 (evening)

**Session: Chapter 3 — embedding backfill run + completed**

- Ran `scripts/backfill_embeddings.py` to completion — existing transactions now embedded and stored in `transaction_embeddings`. The retrieval layer finally has real vectors to search against (was empty until now).

**Chapter 3 checklist progress:**
- [x] Backfill embeddings for existing rows ← done this session
- [ ] MRR@5 ≥ 0.60 ← **only remaining item**: needs `evals/search_queries.json` populated with real IDs, then `python evals/eval_retrieval.py`

**Retros (blockers & surprises):**
- **First MRR@5 run = 0.000 — but it's a fake-ground-truth artifact, not a retrieval failure (THINK-04 catch).** `evals/search_queries.json` still had placeholder `expected_top5_ids` (every `note` said "Replace IDs with real transaction IDs"). Retrieval was actually returning plausible real IDs with sane latency — the answer key was the broken part. **Fix:** recorded the run as INVALID in `ai-observability-metrics.md`, kept the valid search-latency numbers, deferred the real MRR baseline until ground truth is built from SQL (`WHERE description ILIKE '%...%'`) rather than guessed IDs.
- **Lesson logged for interviews:** an eval is only as trustworthy as its ground truth; a green/red number from a fabricated answer key is worse than no number. Build ground truth independently of the system under test to avoid pooling bias.

**Valid numbers captured (search latency):** p50 ~870ms, p95 ~2400ms (tail = cold start: first OpenAI embed + asyncpg connect), warm ~630–870ms.

**Remaining for next session (the real Chapter-3 close-out):**
- Build REAL ground truth: for each of the 7 queries, SQL-find genuinely matching transaction IDs in Supabase Studio → replace placeholders in `evals/search_queries.json`
- Re-run `PYTHONPATH=. python evals/eval_retrieval.py` → record the *real* MRR@5 in `docs/performances/ai-observability-metrics.md`
- Commit PF-AI003

**Streak: 1 day**

### 2026-06-12 — Day 16 (late session)

**Session: Chapter 3 CLOSED — eval redesigned to set-based relevance, real baseline captured**

- **Self-correction logged (THINK-04, twice):** earlier I called the MRR=0.00 a "fake ground truth / placeholder IDs" problem. Verified directly against the DB (4,467 txns, all embedded) — **the hand-labeled IDs were real and relevant** (`24561`=Listrik, Mansek IDs=real brokerage transfers, kontrakan IDs=real rent). The placeholder diagnosis was wrong. Rikky was right to push back before I blamed the harness.
- **Real root cause found:** exact-ID MRR is the wrong eval design for a corpus with many near-duplicate transactions (36 Electricity, 317 Groceries, 32 Salary). Retrieval returns *valid* matches that aren't the exact labeled IDs → scored as misses. Classic incomplete/sparse relevance-judgment failure mode.
- **Fix shipped:** rewrote `evals/eval_retrieval.py` to **set-based relevance** — each query's relevant set is rule-defined (`category` ∪ `description ILIKE`), resolved against the live DB. Rewrote `evals/search_queries.json` to the new rule format (uses the real `category` column: Electricity/Salary/Groceries/Stock/Entertainment). Metrics now: Hit@5, MRR@5, P@5.
- **Real baseline:** **MRR@5 = 0.476, Hit@5 = 0.57, P@5 = 0.26** (naive dense, `text-embedding-3-small`, no rerank/hybrid). Below the 0.60 target by design — the gap is the Chapter-4 story.
- **Diagnostic gold:** groceries = perfect 1.00 (well-described merchants); listrik / streaming / Mansek = 0.00 (terse one-word descriptions + opaque bank transfer codes). That failure profile is the precise argument for hybrid keyword+vector search in Chapter 4.
- Search latency (real): p50 ~640ms, p95 ~1900ms (cold start), warm ~420–730ms.
- Cleaned up two throwaway diagnostic scripts (not committed).

**Chapter 3 checklist:** ✅ all items done — RAG Phase 1 complete (code + tests + real retrieval baseline).

**Retros (blockers & surprises):**
- **I jumped to a wrong root cause and stated it with confidence.** The `note: "Replace IDs..."` text was stale but the IDs themselves were real — I anchored on the note, not the data. **Fix:** queried the DB before concluding. Lesson: when an eval reads zero, verify the ground truth *against the source of truth*, don't infer it from a comment. (Ironically this is the same THINK-04 discipline, applied to my own reasoning.)
- **Interview-ready answer (new):** "My first retrieval eval read 0.00. I checked the ground truth against the DB before touching the model — the labels were real. The actual bug was the eval *design*: exact-ID matching on a corpus full of near-duplicates. I switched to set-based relevance (rule-defined relevant sets) and got an honest 0.48 baseline, with a failure profile — terse bank codes miss, well-described merchants hit — that directly justified hybrid search."

**Remaining for next session:**
- Commit PF-AI003 (RAG Phase 1 + set-based eval): `git add` new/changed files → commit
- Start Chapter 4 (PF-AI004): hybrid search (pgvector + tsvector BM25) is the highest-leverage first move — it targets the exact 0.00 queries (listrik, streaming, Mansek)

**Streak: 1 day**

### 2026-06-15 — Day 19

**Session: PF-AI003b — Embedding Provider Toggle (OpenAI ⇄ Gemini)**

- Built `EmbeddingProvider` Protocol abstraction (`app/providers/embedding_base.py`) — mirrors the existing `LlmProvider` pattern exactly
- Created `OpenAIEmbeddingProvider` (moved from `embedder.py`) + `GeminiEmbeddingProvider` (`gemini-embedding-001`, `output_dimensionality=1536`, L2 normalization, task_type asymmetry)
- Created `embedding_factory.py` — `create_embedding_provider(settings)` mirrors `ProviderFactory.create(settings)`
- Updated `app/config.py`: `embedding_provider: Literal["openai", "gemini"] = "gemini"`, `validate_embedding_provider_key()` warns but does not crash
- Updated `app/observability.py`: Gemini embed cost (free tier = 0.0), span renamed `"embed-batch"`, provider+model metadata in every span
- Rewrote `embedder.py` + `retriever.py` to depend only on `EmbeddingProvider` protocol (no openai import)
- Retriever SQL adds `AND te.model = $4` guard — prevents stale cross-model vectors from polluting results during a provider switch
- Rewrote `backfill_embeddings.py`: detects model-mismatch rows, prints destructive warning with count, prompts `[y/N]` interactively; `--yes` skips for non-interactive use
- Updated `main.py` to instantiate provider via factory, pass single instance to both services
- Updated all existing tests to mock `EmbeddingProvider` protocol (not openai SDK); added `test_embedding_providers.py` covering factory toggle, Gemini L2 normalization, retriever model filter, backfill confirmation paths
- `pytest` green — all tests pass
- Updated `docs/rag-embeddings-howto.md`: prerequisites, arch diagram, "Switching providers" section
- Updated chores `SKILL.md`: learning plans (PF-AIxxx) **never** move to `completed/` — update `Status: Done` in place only

**Chapter 3 checklist:** ✅ all items done (PF-AI003 + PF-AI003b complete)

**Interview-ready answers (new):**
- "The embedding layer uses an abstract `EmbeddingProvider` protocol — same factory pattern as the LLM providers. Switching OpenAI ↔ Gemini is a single env var change plus a backfill run."
- "Gemini's `output_dimensionality` flag returns truncated but un-normalized vectors — L2 normalization is required before storing for cosine similarity to work correctly."
- "I use asymmetric task types: `RETRIEVAL_DOCUMENT` for indexing, `RETRIEVAL_QUERY` at query time. OpenAI doesn't support task types so it's symmetric — both models' handling is documented in the provider implementation."
- "The retriever has a `WHERE te.model = <active_model>` guard. During a provider switch, old vectors from the previous model are geometrically incompatible — without the guard, they'd silently poison cosine scores."

**Note:** This is an infrastructure fix (owner only has `GEMINI_API_KEY`), not a curriculum chapter task — same class as Day 6/10/12 tooling days. The design decisions (protocol abstraction, factory, mixed-state guard) are directly interview-relevant: they map to the "how do you keep the AI pipeline modular and cost-controlled?" question.

**Retros (blockers & surprises):**
- None — clean session. Straightforward port of the existing LLM provider pattern to the embedding layer.

**Remaining for next session:**
- Start Chapter 4 (PF-AI004): hybrid search (pgvector + tsvector BM25) is the highest-leverage first move — targets the exact 0.00 queries (terse bank codes: listrik, streaming, Mansek)

**Streak: 1 day** (reset — no log entries 2026-06-13/14)

### 2026-06-17 — Day 21

**Session: Chapter 4 (PF-AI004) — code shipped: chunker, FlashRank reranker, grounded /ask**

- Built `app/services/chunker.py` — `fixed_size_chunks()` (char-window + overlap) and `sentence_window_chunks()` (sentence-level index, ±N neighbour window); 7 unit tests pass; demoed against the real `bca_01.txt` fixture (3 fixed-size chunks, 15 sentence-window chunks)
- Built `app/services/reranker.py` — `RerankerService` wraps FlashRank's `ms-marco-MiniLM-L-12-v2` cross-encoder, runs off the event loop via `asyncio.to_thread`; 3 unit tests pass (mocked at the `Ranker` boundary)
- Extended `SearchRequest` + `RetrievalService.search()` (`app/services/retriever.py`) with optional `category`/`account`/`date_from`/`date_to` filters compiled to parametrized SQL `WHERE` clauses (never string-interpolated) — preserves the existing `te.model = $4` cross-model guard; 4 new tests added to `test_retriever.py` (8/8 pass)
- Built `app/services/answerer.py` — `AnswerService.ask()`: retrieve top-10 (filtered) → FlashRank rerank to top-K → `LlmProvider.generate_json()` synthesis with a grounding system prompt → citation hallucination guard (drops any `cited_transaction_ids` not actually in the retrieved context, logs a warning); 3 unit tests pass (all three collaborators mocked)
- Wired `POST /ask` in `main.py` (502 on failure, never 200-with-empty per the AI-service error contract) + `/search` now supports `rerank=true` (widens fetch to top-10, reranks down to `top_k`)
- Added `AskRequest`/`Citation`/`AskResponse` models; added `flashrank` to core deps, `ragas`+`langchain-openai` to the `dev` extra in `pyproject.toml`
- Extended `evals/eval_retrieval.py` with a `--rerank` flag (retrieve-10 → FlashRank → top-5) and created `evals/eval_faithfulness.py` + `evals/ask_questions.json` (5 questions incl. one adversarial no-data case) for RAGAS faithfulness scoring
- Added the Step-1 "Re-ranking mental model" section to `evals/README.md` (bi-encoder vs cross-encoder, funnel width, ms-marco language bias) — written from memory per the active-retrieval rule
- All 16 new tests pass; full `pytest` suite green except one pre-existing unrelated failure (`test_merchant_suggester.py::test_is_pii_keyword[REK123456-True]`, not touched this session)

**Chapter 4 checklist progress:**
- [x] Chunking strategy: fixed-size with overlap + sentence-window
- [x] Re-ranker: FlashRank (local)
- [x] LLM synthesis: `POST /ask` endpoint — top-K contexts → grounded answer with citations
- [x] Metadata filtering: account, date range, category
- [ ] Re-run MRR/P@5 harness with `--rerank` and log the real delta ← blocked this session, see Retros
- [ ] RAGAS faithfulness scoring on 5 generated answers ← blocked this session, see Retros

**Retros (blockers & surprises):**
- **Two real infra walls, both genuine — not skipped, not faked.** (1) Local Supabase/Postgres isn't reachable in this execution environment — Docker Desktop's service is stopped and `net start com.docker.service` returns Access Denied (no admin rights here), so `eval_retrieval.py --rerank`, the `/ask` curl smoke test, and `eval_faithfulness.py` all fail at the DB-connect step (confirmed: `ConnectionRefusedError`). (2) `ragas` cannot be `pip install`ed on this Windows box — its hard dependency `scikit-network` ships no prebuilt wheel for Python 3.14/win_amd64 and needs the MSVC C++ Build Tools to compile from source, which aren't installed. **Fix:** documented both gaps explicitly in `docs/performances/ai-observability-metrics.md` instead of writing placeholder numbers — table cells say "not measured" with the reason, not "0" or silently omitted.
- **Got one real (non-mocked) data point anyway.** Ran `RerankerService.rerank("makan", ...)` for real against three hand-picked candidates — FlashRank's English-trained `ms-marco-MiniLM-L-12-v2` ranked `"MAKANAN TERNAK SAPI BERKAH"` (cattle feed) **above** `"GOFOOD GEPREK BENSU GADING"` (food delivery), confirming the exact language-bias risk the plan's Step 5 anticipated. Logged in `evals/README.md` and the metrics doc as real evidence, not speculation — useful even without the full DB-backed eval.
- **FlashRank itself installs and runs cleanly** (model download ~22MB, no network restriction) — only `ragas`'s native-compile dependency is blocked, not all of Step 10's tooling.

**Remaining for next session (the real Chapter-4 close-out):**
- Get Supabase running locally (`docker compose`/`supabase start` on a machine with Docker available) → run `PYTHONPATH=. python evals/eval_retrieval.py` then `--rerank` → record the real P@5 baseline-vs-reranked delta
- Either install MSVC Build Tools (or run on a non-Windows box / WSL) to get `ragas` installed, or hand-roll the claim-decompose-and-verify faithfulness check the way the plan's C# port describes → run `eval_faithfulness.py` → record mean faithfulness
- Once both numbers exist, fill in `docs/performances/ai-observability-metrics.md` and close Chapter 4

**Streak: 1 day** (reset — no log entries 2026-06-16)

### 2026-06-24 — Day 28

**Session: Gap acknowledged — context-switch to a side project, now re-focusing**

- No pivot work 2026-06-18 → 2026-06-23. Cause was a deliberate context switch, not a technical block: time went to another project (content creation), not AI Engineering.
- Re-committing to the pivot as the focus. Next session resumes the Chapter 4 close-out.

**Chapter 4 checklist status (unchanged since Day 21):**
- [x] Chunker, FlashRank reranker, grounded `POST /ask`, metadata filtering — all shipped + tested
- [ ] Re-run MRR/P@5 with `--rerank`, log the delta ← still blocked on local Postgres availability
- [ ] RAGAS faithfulness on 5 answers ← still blocked on `ragas` install (MSVC) — or hand-roll the claim-decompose check

**Retros (blockers & surprises):**
- **6 days off the pivot — root cause was attention split across projects, not the infra walls.** Honest framing: the Day-21 Docker/ragas walls are still there, but they were *not* the reason this week stalled — the side project (content creation) was. **Fix:** name it plainly and timebox the return — one focused unblock session closes Chapter 4 and Phase 1.

**Remaining for next session (the real Chapter-4 close-out):**
- Get Postgres reachable (WSL / `supabase start` on a Docker-capable box) → `PYTHONPATH=. python evals/eval_retrieval.py` then `--rerank` → record the P@5 baseline-vs-reranked delta
- Install MSVC Build Tools (or run on WSL/non-Windows) for `ragas`, or hand-roll the claim-decompose-and-verify faithfulness check → run `eval_faithfulness.py` → record mean faithfulness
- Fill `docs/performances/ai-observability-metrics.md` with both numbers → close Chapter 4 → Phase 1 complete

**Streak: 1 day** (reset — no log entries 2026-06-18 → 2026-06-23)

### 2026-06-23 — Day 27

**Session: Chapter 4 — live rerank eval + Supabase baseline reconfirmed** *(logged retroactively 2026-07-03 — see Day 37 note)*

- Local Supabase stack started (`supabase start`) — the Docker blocker from Day 21 was environmental, not permanent
- Re-ran `PYTHONPATH=. python evals/eval_retrieval.py` against real data: confirmed baseline **MRR@5 = 1.000, P@5 = 0.657** (the earlier 0.476 MRR from Day 16 was the IVFFlat `probes=1` bug — fixed by `SET ivfflat.probes = 10` in `RetrievalService.search()`)
- Ran `eval_retrieval.py --rerank` live (retrieve top-10 → FlashRank `ms-marco-MiniLM-L-12-v2` → top-5): **P@5 dropped to 0.600 (delta -0.057), MRR@5 dropped to 0.857** — a negative re-ranking result
- Diagnosed the negative delta, not just reported it (THINK-04): the `gaji bulanan salary income` query collapsed from MRR=1.00 to 0.00 — `ms-marco` is trained on English MS MARCO passages and doesn't recognize Indonesian financial vocabulary, so the English-only cross-encoder overrode an already-correct multilingual bi-encoder ranking

**Chapter 4 checklist progress:**
- [x] Re-run MRR/P@5 harness with `--rerank` and log the real delta ← done this session

**Retros (blockers & surprises):**
- **A negative re-ranking result, and that's the better interview story.** "I measured a negative delta and diagnosed it — the cross-encoder was English-only, overriding a multilingual bi-encoder that was already correct" beats a clean +0.1 lift. Next lever (not yet tried): FlashRank's multilingual model.

**Remaining for next session:**
- STEP 10: RAGAS faithfulness on 5 generated answers — still blocked on `ragas` install (MSVC Build Tools)
- STEP 9: `/ask` curl smoke test + Langfuse trace confirmation

**Streak: 1 day** (gap 2026-06-18 → 2026-06-22 unlogged; this session done same-day, logged late)

### 2026-07-01 — Day 35

**Session: Chapter 4 — RAGAS faithfulness measured live, 3 real bugs fixed** *(logged retroactively 2026-07-03 — see Day 37 note)*

- Re-diagnosed the Day-21 "ragas needs MSVC Build Tools" blocker — **that diagnosis was wrong.** Real causes: (1) unbounded `ragas>=0.2` pin resolved to `ragas 0.4.x` + `langchain 1.x`, mutually incompatible (ragas 0.4.3 imports `ChatVertexAI` from a path deleted in langchain 1.x) — fixed by pinning `ragas>=0.2,<0.3` + `langchain-openai>=0.2,<0.3` + `langchain-community>=0.3,<0.4`; (2) the venv itself was corrupted — ~11 packages had Python-3.14 `.pyd` binaries installed into a Python-3.11 venv from a prior mistargeted pip run, fixed by force-reinstalling each as cp311
- Ran `evals/eval_faithfulness.py` live — RAGAS `Faithfulness` metric, gpt-4o-mini judge (cross-provider vs. Gemini generator, avoids self-preference bias), over `ask_questions.json`'s 5 questions against 4,467 real embedded transactions
- **Mean faithfulness = 0.900** (target ≥ 0.80) — food-Maret-2025 1.00, last-PLN-payment 1.00, kopi-Maret-2025 correct refusal 1.00, biggest-expense-Maret-2025 0.50 (real finding — superlative/aggregation questions are a known RAG weakness, semantic top-3 ≠ actual max), sewa-2031 adversarial canary correctly refused 1.00
- The live run surfaced 3 real bugs mocked unit tests couldn't catch: (1) **marker-vs-id citation bug** — LLM put the `[2]` context marker into `cited_transaction_ids` instead of the real `id=24561`, hallucination guard dropped every citation → fixed by disambiguating `SYSTEM_PROMPT` in `answerer.py`; (2) **asyncpg date-binding bug** — `retriever.py` passed date strings to a `$n::date` param, asyncpg's date codec needs `datetime.date` → fixed with `date.fromisoformat()`; (3) **fixture year mismatch** — `ask_questions.json` asked about March 2026 (0 rows, data runs 2024-01→2026-01) → retargeted to March 2025

**Chapter 4 checklist progress:**
- [x] RAGAS faithfulness scoring on 5 generated answers ← done this session

**Retros (blockers & surprises):**
- **Wrong diagnosis corrected before it cost more time (THINK-04).** The MSVC Build Tools theory from Day 21 was never re-verified — running the actual install surfaced the real cause (unbounded dep pin + polluted venv) in minutes. Lesson: an unverified blocker diagnosis is just a guess wearing a lab coat; re-test it before building a workaround around it.
- **Interview-ready answer (new):** "My RAGAS faithfulness eval hit 0.90 on 5 real generated answers, but getting there caught 3 production bugs a mocked test suite never would — a citation-marker/id mixup, an asyncpg date-type mismatch, and a stale fixture year. Live evals aren't just a score; they're a bug-finding tool."

**Remaining for next session:**
- STEP 9: `/ask` curl smoke test + Langfuse trace confirmation — last item before Chapter 4 closes
- Correct the metrics doc — the STEP 5 rerank delta was measured 2026-06-23 but never transcribed out of "not measured"

**Streak: 1 day** (this session done same-day, logged late — see Day 37 note)

### 2026-07-03 — Day 37

**Session: Chapter 4 CLOSED — `/ask` live-verified, Langfuse trace confirmed, Phase 1 complete**

- Ran `POST /ask` live against the running AI service (Supabase up, 4,467 embedded transactions) for all 5 questions in `ask_questions.json`: food-Maret-2025 → confident=true, correct Rp 77,200 across 2 cited transactions; last-PLN-payment → confident=true, correct row cited; kopi-Maret-2025 → confident=false (genuinely no strong match that month); biggest-expense-Maret-2025 → confident=true, correct max cited; sewa-2031 adversarial → confident=false, no invented number (canary passed)
- Queried the Langfuse public API directly (`GET /api/public/traces`, `GET /api/public/observations`) and confirmed `POST /ask` traces land with a nested `gemini-generate-json` GENERATION observation carrying `cost_usd`, token usage, and per-call latency — `AnswerService` → `provider.generate_json()` tracing works end-to-end with zero new code, exactly as designed
- Found the metrics doc had gone stale: the Day-27 rerank delta (P@5 0.657→0.600) was measured live but never transcribed out of "not measured" placeholders. Corrected `docs/performances/ai-observability-metrics.md` with the real numbers, the /ask retrieval_ms/generation_ms p50 (~887ms / ~2683ms, median of the 5 live calls above), and folded the Day-27 and Day-35 findings into the doc's narrative notes
- Updated the plan file (`PF-AI004-rag-reranking-generation.md`) — all 14 TODO steps and all 9 acceptance criteria now `[x]`, status header marked Done
- Moved `PF-AI004` from "In Progress" to "Done" on `.claude/plans/BOARD.md`

**Chapter 4 checklist:** ✅ all 6 items done — RAG Phase 2 complete (chunker, FlashRank reranker, metadata filtering, grounded `/ask`, rerank delta measured, RAGAS faithfulness measured)

**🎉 Phase 1 (Foundation + RAG) complete — Chapters 1–4 all done.**

**Retros (blockers & surprises):**
- **Logging debt, not work debt.** The Day-27 and Day-35 sessions in this log were written retroactively today — the actual work happened live on those dates (verified against timestamps in the plan file and Langfuse), but wasn't logged to `progress.md` until this session closed the loop. Lesson: log the same day work happens, even a one-line stub — "measured rerank delta, details in plan STEP 5" — beats reconstructing three sessions from artifacts a week later.
- **Interview-ready answer (new, the Chapter 4 closer):** "My RAG pipeline is a two-stage funnel — pgvector cosine top-10 into a local FlashRank cross-encoder — with a grounded `/ask` endpoint that answers only from cited transactions, drops hallucinated citation ids, and scores 0.90 RAGAS faithfulness with a cross-provider judge. The re-ranking delta was actually negative on my Indonesian-language corpus — I diagnosed it as an English-only cross-encoder overriding a correct multilingual bi-encoder ranking, which is a more interesting debugging story than a clean lift."

**Remaining for next session:**
- Chapter 5: Streaming + Production UX (SSE) — `/ask`'s `generation_ms` (~2.7s) dominates `retrieval_ms` (~0.9s) by ~3×, which is the direct justification for streaming the generation phase
- Optional stretch (not blocking Chapter 5): swap FlashRank's multilingual model and re-run `--rerank` to see if the Indonesian-query delta turns positive

**Streak: 1 day** (Days 27, 35, 37 all had real work; unlogged gaps remain 2026-06-18→22, 2026-06-24→2026-06-30, 2026-07-02)

### 2026-07-08 — Day 42

**Session: Chapter 5 PART 1 closed on the board; PART 2 (answer accuracy) queued**

- PF-AI005 PART 1 (SSE streaming, `/ask/stream`, ChatPage, Supabase Realtime on `transactions`) shipped 2026-07-06 — the plan file was already marked Done, but its BOARD row was still stranded in "To Do — AI Learning Track". Moved it to "Done (closed)" with a pointer to PART 2 as the follow-up.
- Confirmed the `-id.md` versi-belajar companion is study material, not a tracked task — stays in `learning/`, nothing to "close".
- PF-AI005 PART 2 plan authored: **Answer Accuracy — query routing + deterministic SQL aggregation + grounded streaming**. Motivated by a live UI test (2026-07-08) that caught the chat fabricating a February PLN total and denying April food spending exists — SQL shows 43 Food rows / Rp 2,309,954 in April 2024. Root cause is architectural: PART 1 answers every question by summing top-3 semantic matches, so aggregate questions get a sample, not a total. PART 2 routes aggregate intent to parametrized `SUM` (number comes from Postgres, never the model) and adds a post-stream citation guard. Sits in "In Progress" on the board.

**Chapter 5 checklist progress:**
- [x] PART 1 — SSE streaming, EventSource consumption, Realtime (shipped 2026-07-06)
- [ ] PART 2 — query routing + SQL aggregation + grounded streaming ← next build

**Retros (blockers & surprises):**
- **The failure is the curriculum.** The UI test lie ("fabricated an electricity bill", "denied April food data that has 43 rows") is a stronger interview story than any clean demo — "I caught my RAG system lying about money and redesigned the query path so it *can't*". Keep the screenshots for the STAR story + blog post.
- **Board hygiene beats status headers.** PART 1's plan said Done for two days while the BOARD said To Do — the single source of truth for "what's shipped" drifted. Close the board row the same day the plan flips to Done.

**Remaining for next session:**
- PART 2 STEP 0 — reproduce and pin the failure (SQL ground truth + the two failing curl calls) before touching code
- PART 2 STEP 1–2 — read the routing material, build `query_planner.py`

**Streak: 1 day**

### 2026-07-14 — Day 48

**Session: PART 2 live-verified in production use; real conversation-memory gap found and fed into Chapter 8**

- Live-tested the shipped chat (`/ask`) with two explicit-month questions — "hitung total pengeluaran makanan pada maret 2025" and "berapa gaji yg saya terima bulan maret 2025" — both returned figures matching the source spreadsheet exactly (Rp 3,711,560 / 45 txns and Rp 124,588,816 / 2 txns). This is the first live confirmation that PF-AI005 PART 2's SQL-routed aggregation works correctly outside of unit tests.
- **Real gap found in the same session:** a same-conversation follow-up — "berapa gaji yg saya terima bulan itu" ("that month") — silently summed *all-time* salary (Rp 1,524,580,890 / 32 txns) instead of resolving "bulan itu" back to Maret 2025. Root cause: `/ask` is stateless per call; the planner has no prior-turn context to resolve the pronoun against, so the date filter was silently dropped rather than erroring.
- Logged this as a concrete "real example" section in [PF-AI008-langgraph-financial-advisor.md](../../.claude/plans/learning/PF-AI008-langgraph-financial-advisor.md) (Chapter 8) — the exact transcript, root cause, and why it's specifically a Chapter 8 (conversation memory / `AdvisorState` + `MemorySaver`) problem and not a PART 2 patch.
- Attempted to close PART 2's remaining pending item (live numeric-accuracy eval, ≥9/10 target) — found and fixed a real bug in the harness itself: `eval_numeric_accuracy.py` crashed with `UnicodeEncodeError` on Windows (cp1252 console can't render the `✓`/`✗` markers) — fixed with `sys.stdout.reconfigure(encoding="utf-8")`.
- Re-ran and hit Gemini free-tier limits twice: first the 5 req/min cap (added a 60s inter-question throttle), then the **20 req/day** cap — already exhausted from live chat testing + the failed attempts. This is a genuine daily quota wall, not a bug; the eval could not be completed with Gemini today.
- Tried falling back to Anthropic (`AI_PROVIDER=anthropic`) — caught before spending anything: `ANTHROPIC_API_KEY` was commented out in `.env` (never actually set), so there was no credit to fall back on. Stopped the background run at the very first sleep, before any API call fired.
- Documented every config key's valid options as inline `# options: a | b` comments across [.env](../../services/ai-service/.env) and [.env.example](../../services/ai-service/.env.example) — a quick-reference guide covering `AI_PROVIDER`, `AI_MODEL` (per-provider, with $/1M pricing), `EMBEDDING_PROVIDER`/`EMBEDDING_MODEL`, `LOG_LEVEL`, `DATABASE_URL`, and the Langfuse host options. Also flagged explicitly that `OPENAI_API_KEY` in this service is embeddings-only — there is no OpenAI chat/completions provider wired in, so an OpenAI subscription cannot substitute for Gemini/Anthropic on `/ask`.
- Bundled in a real, unrelated bug fix found in the working tree: `JourneyAdvisorClient.cs` didn't handle Pydantic serializing `Decimal` fields as JSON strings — added `JsonNumberHandling.AllowReadingFromString` + 2 regression tests (`JourneyAdvisorClientTests.cs`); switched `Quest.estimated_score_gain` from `Decimal` to `float` on the Python side so it serializes as a JSON number in the first place.
- Committed and pushed: `d03fca99` — "PF-132: fix quest score-gain JSON serialization; harden numeric-accuracy eval".

**Chapter 5 (PF-AI005 PART 2) checklist progress:**
- [x] Live functional proof of SQL-routed aggregation accuracy (explicit-month queries) ← new this session, informal but real
- [x] Fixed `eval_numeric_accuracy.py` Windows encoding crash ← blocker resolved
- [ ] Formal numeric exact-match run (≥9/10 target) ← still blocked: Gemini daily quota exhausted, Anthropic key not actually set
- [ ] Fill real numbers into `ai-observability-metrics.md`, confirm Langfuse 2-GENERATION trace, re-run `eval_faithfulness.py` ← unchanged from Day 42, still pending

**Retros (blockers & surprises):**
- **Two consecutive false starts on "just use another provider," both caught before cost was incurred.** First assumed Anthropic credit existed because the env var line existed — it didn't (line was commented out, THINK-04 discipline: verify before acting, don't infer from a key's *presence* that it's *active*). Second: OpenAI credits can't substitute either — this service has no OpenAI LLM/chat provider, only OpenAI embeddings. Neither mistake cost anything; both were caught by checking before running, not after.
- **The live "bulan itu" bug is a stronger teaching example than a synthetic one** — it happened organically while sanity-checking PART 2, in Indonesian, on real screenshotted data, and maps precisely onto Chapter 8's `add_messages`/`MemorySaver` concepts already drafted. No fabricated scenario needed.
- **Logging debt pattern recurred** — the PF-132 fix + PART 2 shipping actually happened 2026-07-09/10 per the commit trail, but wasn't logged until today. Same lesson as the Day-37 retro: log same-day even a one-line stub.

**Interview-ready answer (new):** "I live-tested my own RAG chat after shipping the SQL-routing fix and it nailed two explicit-month totals exactly — but a same-session follow-up using a pronoun ('that month') silently summed all-time data instead, because the planner is stateless per call. I turned that into the concrete motivating example for the next chapter: a LangGraph agent with checkpointed conversation state, so pronoun/reference resolution has something to resolve against."

**Remaining for next session:**
- Get a real path to the numeric-accuracy eval: wait for Gemini's daily quota reset, or set a genuinely funded `ANTHROPIC_API_KEY`/enable Gemini paid tier — then run `eval_numeric_accuracy.py` to completion
- Fill the real numbers into `ai-observability-metrics.md`, confirm Langfuse's 2-GENERATION-per-trace, re-run `eval_faithfulness.py`
- Update `PF-AI005-PART2-answer-accuracy-todo.md` checkboxes (STEP 0 baseline, STEP 7, STEP 8) once the above lands
- Start Chapter 8 (LangGraph) proper — the "bulan itu" example is now pre-loaded as the motivating case

**Streak: 1 day** (gap 2026-07-09 → 2026-07-13 unlogged; PF-132/PART 2 shipping work during that window logged retroactively above)

### 2026-07-14 — Day 48 (continued)

**Session: Chapter 8 sequencing correction; PART 2 eval retry confirmed the quota wall; deferred, moving to Chapter 6**

- Caught a sequencing error before it cost a session: this morning's "start Chapter 8 next" note skipped over [PF-AI008](../../.claude/plans/learning/PF-AI008-langgraph-financial-advisor.md)'s own STEP 0 — an explicit prerequisite gate on Chapter 7 (smolagents) being complete. Chapter 7 hasn't been started (every box in its checklist above is still unchecked). Verified [PF-AI006](../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md) (Chapter 6) is genuinely unblocked instead — its own gate only needs Chapter 4's numbers committed, which they have been since Day 37.
- Started Docker Desktop + local Supabase (both were down) and retried `eval_numeric_accuracy.py` live against Gemini. Failed again on question 1 (the narration call, after the query-planner call already succeeded) with `429 RESOURCE_EXHAUSTED` — `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 20/day on `gemini-2.5-flash`. Confirmed this is a fixed daily reset, not rolling from last use — a same-day retry was never going to work. Stopped after one failure instead of spending more of tomorrow's budget chasing it.
- **Decision:** deferring the formal numeric-accuracy eval and the rest of STEP 8 (Langfuse trace confirmation, faithfulness re-run, metrics doc fill-in) until subscribing to a paid tier (Gemini paid, or a funded `ANTHROPIC_API_KEY`). Noted on the plan file and BOARD.md so it doesn't read as an infra blocker anymore. Moving on to Chapter 6 in the meantime instead of waiting on it.
- Local Supabase + Docker left running — useful for Chapter 6 STEP 2's migration.

**Chapter 5 (PF-AI005 PART 2) checklist:** unchanged from this morning — 5/7 acceptance criteria done; the remaining 2 are now explicitly parked on a paid-tier subscription rather than "next session."

**Retros (blockers & surprises):**
- **Same Gemini daily-quota wall, third confirmation (Day 42, this morning, this retry).** Not a new bug — the actionable lesson is the pattern itself: a free-tier daily cap on a fixed clock, not a per-use rolling window. Made the deferral decision explicit this time instead of quietly re-attempting next session.

**Remaining for next session:**
- Chapter 6 (PF-AI006): STEP 0 gate check (already verified satisfied) → STEP 1 theory anchor → STEP 2 Supabase migration
- PART 2 close-out — parked until a paid-tier model subscription is active

**Streak: 1 day**

### 2026-07-24 — Day 59

**Session: Chapter 6 (PF-AI006) closed — hybrid search measured live and LOST to pure vector; default kept at `vector`** *(logged retroactively 2026-07-26)*

- Cleared the Day-? infra gap from the prior PF-AI006 pass: started Docker Desktop + local Supabase, applied `20260724000001_hybrid_search.sql` via `supabase db push`, and verified live via asyncpg that `description_tsv` (tsvector generated column) + `idx_transactions_description_tsv` (GIN) exist on `transactions`, with 4,467 transactions / 4,467 embeddings intact.
- Ran `PYTHONPATH=. python evals/eval_retrieval.py --all` against real data across all 5 variants. Result table (MRR@5 / P@5 / p50): **vector 0.771 / 0.533 / 726ms**, hybrid 0.750 / 0.467 / 689ms, vector+rerank 0.625 / 0.467 / 705ms, hybrid+rerank 0.558 / 0.483 / 746ms, bm25 0.433 / 0.333 / 137ms.
- **The chapter's assumption was falsified: hybrid (BM25 + RRF) underperforms pure vector on this corpus.** Diagnosed the mechanism from the per-query breakdown: the stored embedding text is `description | remarks | category | wallet`, so the `Electricity`/`Listrik` category tag already gives the embedding the exact-keyword signal BM25 was supposed to add — `tagihan listrik PLN` already scores P@5=1.00 on vector alone. RRF then *displaces* correct vector hits with BM25's noisier candidates on queries where BM25 has nothing real to contribute (`makan siang di kantor` dropped MRR 0.25 → 0.00; no keyword overlap with `WARUNG`/`RESTO`).
- **Reverted the earlier assumption-based wiring rather than shipping it:** `SearchRequest.search_mode` default returned to `"vector"`, and the `/ask` lookup path (`answerer.py`, `main.py::/ask/stream`) no longer forces `search_mode="hybrid"`. `bm25`/`hybrid` stay implemented and selectable — they're the right tool for a corpus where descriptions are the only signal, i.e. PART2's `statement_chunks`.
- **Real bug found only by the live run:** the first benchmark scored `bm25` at a flat 0.000 on every query. Cause was `plainto_tsquery`, which ANDs every query word — a 5-word natural-language question can never match a 2–4 word bank description in full. Fixed with `_to_or_tsquery()` in `retriever.py` (OR-join tokens, then `to_tsquery`); `ts_rank` still weights rows with more matched terms higher, which approximates real BM25 instead of a boolean AND filter. 3 new unit tests for the tokenizer.
- Wrote up the finding in [advanced-rag-notes.md](../../docs/mentor/advanced-rag-notes.md) and filled the real numbers into [ai-observability-metrics.md](../../docs/performances/ai-observability-metrics.md) (replacing the "pending" table). Updated [PF-AI006](../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md) — STEP 2, 6, 7, 9 flipped from `[!]` to `[x]` with live verification notes; status header now Done (hybrid-search scope).
- Full suite: **127 passed, 1 pre-existing unrelated failure** (`test_is_pii_keyword[REK123456-True]` in `test_merchant_suggester.py`, untouched by this ticket). Changes left uncommitted for review.

**Chapter 6 checklist progress:**
- [x] Hybrid search (pgvector + tsvector BM25 via RRF) implemented and live-benchmarked
- [x] Eval harness — MRR lift measured per variant, winner picked on numbers (`vector`)
- [ ] Sentence-window retrieval ← deferred to PF-AI006-PART2
- [ ] Auto-merging retrieval ← deferred to PF-AI006-PART2

**Retros (blockers & surprises):**
- **A negative result caught before it shipped.** The prior pass had already flipped the production default to `hybrid` on qualitative reasoning alone (the Chapter-3 PLN miss) because Docker was down and the eval couldn't run. Running it reversed the decision. Lesson: an unmeasured default is a hypothesis in production — if the eval can't run, don't flip the switch and write the justification anyway.
- **Mocked tests pass, real pipeline reveals the bug — third occurrence on record** (after the citation-marker/id mixup and the asyncpg date-binding bug). `test_hybrid_search.py` asserted SQL *shape* and was green while `bm25` returned zero rows for every real query. Shape assertions can't test match behavior; only real data can.
- **Interview-ready answer (new):** "I implemented hybrid BM25+vector search with RRF expecting an easy win on term-heavy Indonesian bank descriptions, benchmarked it against an eval set with adversarial queries built to expose complementarity, and measured the opposite — MRR@5 0.750 vs 0.771 for pure vector. The per-query breakdown showed why: my embedding text already concatenates the category tag, so BM25's exact-keyword contribution was redundant, and RRF's merge displaced vector hits that were already correct. I kept both modes selectable and left the default on vector. Adding a technique because the literature endorses it isn't the same as measuring whether your data needs it."

**Remaining for next session:**
- Commit the PF-AI006 working tree (10 files: retriever/models/answerer/main + tests + 3 docs + plan)
- Chapter 7 (PF-AI007 — smolagents Transaction Categorizer) is the next unblocked chapter; it also gates PF-AI008 (LangGraph), where the "bulan itu" conversation-memory bug is already pre-loaded as the motivating case
- Still parked on a paid model tier: PF-AI005-PART2's numeric-accuracy eval + STEP 8 metrics

**Streak: 1 day** (gap 2026-07-15 → 2026-07-23 unlogged; 2026-07-24 work logged 2026-07-26)
