# Mentor Progress Log

**Pivot goal:** Backend Engineer → AI Engineering / Backend AI Engineering
**Started:** 2026-05-30
**Target:** 90 days to interview-ready

## Baseline (Day 0)

- AI/LLM: Anthropic tool_use, Gemini JSON mode, multi-provider factory, PyMuPDF (40-60% token reduction), three-tier dedup, OTel on AI services
- Backend: 10+ years C#/.NET, Python FastAPI (secondary), distributed systems, event-driven, multi-cloud
- Missing: agentic frameworks, RAG depth, LLM eval, AI observability, streaming, Python-primary positioning

## Phase 1 Task Checklist (Days 1–30)

### Week 1: AI Observability + Real Metrics
- [ ] Add Langfuse to personal-finance AI service
- [ ] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [ ] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate
- [ ] Extract p50/p95 latency and average cost-per-doc
- [ ] Document 3 concrete numbers in article-digest.md

### Week 2: LLM Evaluation Framework
- [ ] Create services/ai-service/evals/ directory
- [ ] Collect 20 real (anonymized) bank statement samples
- [ ] Write expected output JSON for each (ground truth)
- [ ] Build eval_extraction.py: runs both providers, computes accuracy per field
- [ ] Run benchmark: Gemini 2.5 Flash vs Claude Sonnet 4.6
- [ ] Write findings as a table in docs/eval-results.md

### Week 3: RAG — Embeddings + Retrieval
- [ ] Choose embedding model (text-embedding-3-small or nomic-embed-text)
- [ ] Embed transactions on insert
- [ ] Backfill embeddings for existing rows
- [ ] Build retrieval endpoint: pgvector cosine similarity top-K
- [ ] Measure MRR or NDCG on 10 handwritten test queries

### Week 4: RAG — Chunking, Re-ranking, Generation
- [ ] Apply chunking strategy (fixed-size with overlap, sentence-window)
- [ ] Add re-ranker (Cohere Rerank or FlashRank)
- [ ] Build LLM synthesis step with citations
- [ ] Add metadata filtering (account, date range, category)
- [ ] Re-run Week 3 MRR test, measure lift from reranking
- [ ] First demo-able RAG endpoint: POST /ask

## Phase 2 Task Checklist (Days 31–60)

### Week 5: Streaming + Production UX
- [ ] Implement SSE streaming in FastAPI for chat endpoint
- [ ] Wire RAG /ask endpoint to stream tokens
- [ ] Replace polling-based upload status with Supabase Realtime
- [ ] Build minimal React chat UI on /chat route

### Week 6: Advanced RAG Patterns
- [ ] Implement sentence-window retrieval
- [ ] Implement auto-merging retrieval
- [ ] Add hybrid search (pgvector + full-text)
- [ ] Run eval harness on all variants, document MRR deltas

### Week 7: First Agent — smolagents
- [ ] Complete relevant Hugging Face Agents Course units
- [ ] Build Transaction Categorizer Agent with smolagents
- [ ] Wire as optional endpoint in AI service
- [ ] Log tool calls to Langfuse — traces become demo material

### Week 8: LangGraph — State, Routing, Multi-Step
- [ ] Complete LangGraph quickstart
- [ ] Design Financial Health Advisor agent (state + tools + graph)
- [ ] Implement with error handling and conversation memory
- [ ] Write 5 test scenarios with expected behavior

## Phase 3 Task Checklist (Days 61–90)

### Week 9: Model Context Protocol (MCP)
- [ ] Complete Anthropic MCP quickstart
- [ ] Complete Anthropic Academy MCP Series
- [ ] Build personal-finance MCP server (4 tools)
- [ ] Test from Claude Desktop or another MCP client

### Week 10: Public Presence + Certification
- [ ] Write and publish technical blog post
- [ ] Record 3-minute demo Loom
- [ ] Choose and pass one cert (Databricks GenAI Eng Assoc or Azure AI-102)
- [ ] Update LinkedIn headline and About
- [ ] Update cv.md and article-digest.md with new metrics

### Week 11: Interview Prep
- [ ] Write 5 STAR+R stories
- [ ] Prepare 3 deep-dive explanations (5-min each)
- [ ] Record and review Loom for each explanation
- [ ] Prep common AI Eng screen Q&A answers

### Week 12: Active Applications
- [ ] Run /career-ops scan targeting AI Engineering roles
- [ ] Evaluate each with /career-ops offer (apply 4.0+ only)
- [ ] Send 5-10 high-fit applications
- [ ] Engage in AI Eng communities (Latent Space Discord, AI Engineer Foundation)

---

## Activity Log

<!-- Append entries below. Format: ### YYYY-MM-DD -->

### 2026-05-30 — Day 1

**Session: Pivot kickoff + PF-AI001 Langfuse integration (Steps 1–8)**

- Initialized 90-day pivot: created `mentor/progress.md`, confirmed 12-week task breakdown in `mentor/learning-path.md`
- Signed up for Langfuse Cloud free tier, created "personal-finance" project, obtained API key pair
- Added `langfuse>=3.0,<4.0` to `services/ai-service/pyproject.toml`
- Added `langfuse_public_key`, `langfuse_secret_key`, `langfuse_host` to `app/config.py` (pydantic-settings auto-reads env vars)
- Created `app/observability.py`: Langfuse singleton (disabled gracefully when keys absent), Gemini + Anthropic cost tables, `estimate_cost_usd()` helper
- Wrapped `GeminiProvider.extract_structured()` and `generate_json()` with `langfuse.start_observation(as_type="generation")` — logs input/output tokens and cost_usd per call
- Wrapped `AnthropicProvider.extract_structured()` and `generate_json()` with same pattern — `_generation_ended` guard prevents double-end on max_tokens / missing tool_block paths
- Added `langfuse.flush()` to FastAPI lifespan shutdown hook in `app/main.py`
- Updated `services/ai-service/.env.example` with Langfuse env var template
- Created `services/ai-service/docs/langfuse-integration.md` — architecture rationale and key v3 API notes

**Week 1 checklist progress:**
- [x] Add Langfuse to personal-finance AI service
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [ ] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate ← tomorrow
- [ ] Extract p50/p95 latency and average cost-per-doc ← tomorrow
- [ ] Document 3 concrete numbers in article-digest.md ← tomorrow

**Retros (blockers & surprises):**
- **Langfuse v3 API: `start_generation()` removed:** Expected `langfuse.start_generation(...)` to work — it's deprecated in v3. → **Fix:** Use `langfuse.start_observation(as_type="generation", ...)` which returns the same `LangfuseGeneration` object. The docs for v3 are sparse; found the correct API via `inspect.signature()` on the class.
- **`end()` accepts only `end_time`:** Tried passing `output=`, `usage_details=`, `cost_details=` directly to `end()` — got `TypeError`. → **Fix:** All span data goes through `update()` first, then call `end()` with no arguments. The split `update() → end()` pattern is unintuitive but required in v3.
- **`usage` dict renamed, `unit` key removed:** The old `usage={"input": N, "output": N, "unit": "TOKENS"}` no longer works. → **Fix:** Use `usage_details={"input": N, "output": N}` (no `unit`) and a separate `cost_details={"usd": X}` field. Langfuse uses `cost_details` for dashboard cost aggregation — not `metadata`.
- **`enabled` → `tracing_enabled` constructor param:** Tried `Langfuse(..., enabled=False)` to disable when keys are empty — silently ignored. → **Fix:** The correct param is `tracing_enabled=bool(...)`. Found via `inspect.signature(Langfuse.__init__)`.
- **Double-end guard in AnthropicProvider:** The max_tokens and missing tool_block branches call `update()+end()` before re-raising. The outer `except` catches those raises too and would call `end()` again → `LangfuseError`. → **Fix:** `_generation_ended = False` boolean flag, set to `True` after every `end()` call; outer except checks it before calling `end()`.

**Remaining for tomorrow (Steps 9–14):**
- Smoke test: run one extraction, verify trace appears in Langfuse UI
- Upload a real bank statement, capture extraction trace (cost + latency)
- Build Langfuse dashboard (4 charts: cost/day, calls/day, latency distribution, error rate)
- Document 3 concrete numbers in `docs/ai-observability-metrics.md`
- Commit all changes

**Streak: 1 day**
