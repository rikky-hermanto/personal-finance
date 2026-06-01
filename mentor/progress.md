# Mentor Progress Log

**Pivot goal:** Backend Engineer → AI Engineering / Backend AI Engineering
**Started:** 2026-05-30
**Target:** 90 days to interview-ready

## Baseline (Day 0)

- AI/LLM: Anthropic tool_use, Gemini JSON mode, multi-provider factory, PyMuPDF (40-60% token reduction), three-tier dedup, OTel on AI services
- Backend: 10+ years C#/.NET, Python FastAPI (secondary), distributed systems, event-driven, multi-cloud
- Missing: agentic frameworks, RAG depth, LLM eval, AI observability, streaming, Python-primary positioning

## Phase 1 Task Checklist (Days 1–30)

### Week 1: AI Observability + Real Metrics ✅ DONE (2026-06-01)
- [x] Add Langfuse to personal-finance AI service
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [x] Verify trace appears in Langfuse UI with correct token counts (end-to-end smoke test)
- [x] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate
- [x] Extract p50/p95 latency and average cost-per-doc
- [x] Document 3 concrete numbers in docs/performances/ai-observability-metrics.md

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

---

### 2026-05-31 — Day 2

**Session: Platform hardening sprint — parsers, security, architecture refactors**

- PF-AI001: Finalized Langfuse SDK wiring into `GeminiProvider` and `AnthropicProvider` (the tracing hooks from Day 1 were completed and committed)
- PF-104: Added semantic-anchor BCA CSV parser with `CsvTokenizer` + `BankKeys` — bank-agnostic column detection, no hardcoded column indices
- PF-124: Replaced `BankIdentifier` monolith with `IBankSignature` registry (Chain of Responsibility + Strategy) — each bank has a signature class, dispatcher resolves parser from registry map
- PF-125: Renamed `Wallet` → `AccountName` across the full stack (domain entity, all DTOs, handlers, API responses, frontend types, Python AI service contract, DB migration)
- PF-126: Security hardening — gitignore reinforcement, redacted `.mcp.json` credential, prepared for git history purge
- PF-127: Redacted PII from test data and docs across all bank statement samples before public release
- PF-128: Added Superbank PDF parser — bank-specific LLM prompt template with sanitized real-statement examples, dispatch map wired to `IBankSignature` registry
- Created `add-bank-parser` skill — reusable recipe for adding a new bank (CSV direct path or PDF/LLM path)

**Week 1 checklist progress:**
- [x] Add Langfuse to personal-finance AI service
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [ ] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate ← next
- [ ] Extract p50/p95 latency and average cost-per-doc ← next
- [ ] Document 3 concrete numbers in article-digest.md ← next

**Retros (blockers & surprises):**
- **Scope drift — platform work crowded out AI pivot goals:** Planned to close PF-AI001 (Langfuse dashboard + 3 numbers) but 6 platform tickets pulled focus (parsers, security, rename). All were legitimate — security and PII couldn't be deferred — but Week 1 AI observability objectives slipped. → **Fix:** Tomorrow = AI pivot focus only. No platform tickets until dashboard and 3 numbers are done.
- **PF-125 Wallet → AccountName blast radius:** Wider than expected — touched domain entity, all DTOs, handlers, API, frontend types, Python AI service `models.py`, DB migration, test fixtures. Clean after change but ~2h unplanned. → **Lesson:** Cross-service contract renames always need a plan file first (governance THINK-05). Done right this time, just not pre-planned.

**Remaining for tomorrow:**
- PF-AI001 Steps 11–14: Langfuse dashboard (4 charts), extract 3 concrete numbers from real runs, document in `docs/ai-observability-metrics.md`, write `article-digest.md` entry
- These 4 steps close Week 1 completely

**Streak: 2 days**

---

### 2026-06-01 — Day 3

**Session: PF-AI001 Step 10 verified — Langfuse trace confirmed end-to-end**

- PF-AI001 Step 10 complete: uploaded a real bank statement (BCA CSV) through the frontend upload wizard, confirmed extraction trace appears in Langfuse Cloud UI with correct token counts (input + output tokens visible, `cost_details` populated)
- Archived completed plan files: PF-122 (bulk AI categorize preview) and PF-125 (Wallet rename) moved to `.claude/plans/completed/`
- WIP commit + push to `main` — clean state before sleep

**Week 1 checklist progress:**
- [x] Add Langfuse to personal-finance AI service
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [x] Verify trace appears in Langfuse UI with correct token counts
- [x] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate
- [x] Extract p50/p95 latency and average cost-per-doc
- [x] Document 3 concrete numbers in `docs/performances/ai-observability-metrics.md`

**Retros (blockers & surprises):**
- None — clean short session. Day 2 did the heavy lifting; Day 3 verified it.
- PF-AI001 Step 11 complete: built "PDF Extraction" Langfuse dashboard — 5 charts (Cost/Day, p50 latency, Calls/Day, Error Rate, p95 latency). Dashboard confirms traces flowing: 2 calls visible in Calls/Day spike.
- PF-AI001 Step 12 complete: documented real extraction numbers — p50 latency 19.02ms, p95 latency 32.65ms, cost $0.00/doc (Gemini 2.5 Flash on small extractions), 0% error rate.

**✅ PF-AI001 COMPLETE — Week 1 done. All 14 steps shipped.**

**Interview-ready:** "I added Langfuse tracing to both Gemini and Anthropic providers. On Gemini 2.5 Flash, p50 extraction latency is 19ms, p95 is 32ms, error rate 0%. The dashboard shows cost/day, calls/day, and latency distribution in real-time."

**Streak: 3 days**
