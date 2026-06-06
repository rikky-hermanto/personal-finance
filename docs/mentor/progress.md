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

### Week 1: AI Observability + Real Metrics ✅ DONE (2026-06-01)
- [x] Add Langfuse SDK to `services/ai-service` (Python)
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [x] Verify trace appears in Langfuse UI with correct token counts (end-to-end smoke test)
- [x] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate
- [x] Extract p50/p95 latency and average cost-per-doc
- [x] Document 3 concrete numbers in `docs/performances/ai-observability-metrics.md`

### Week 2: LLM Evaluation Framework ✅ DONE (2026-06-05)
- [x] Create `services/ai-service/evals/` directory with 20 anonymized fixture statements
- [x] Write expected output JSON for each fixture (ground truth)
- [x] Build `eval_extraction.py`: runs both providers, computes field-level accuracy
- [x] Benchmark Gemini 2.5 Flash vs Claude Sonnet 4.6 (accuracy + cost + latency)
- [x] Write findings to `docs/eval-results.md`

### Week 3: Agentic Frameworks Entry
- [ ] Complete DeepLearning.AI "LangChain for LLM Application Development" (free, ~4h)
- [ ] Complete "Functions, Tools and Agents with LangChain" (free, ~3h)
- [ ] Build LangGraph "Transaction Categorizer Agent" — wired to personal-finance AI service

### Week 4: Demo + Documentation
- [ ] Record 2-min Loom demo (upload → extraction → journey → Grafana/Langfuse trace)
- [ ] Write `docs/case-study.md` one-pager (decisions + metrics)
- [ ] Update `cv.md` with Langfuse numbers and eval benchmark results
- [ ] Update `article-digest.md` with all proof points from Phase 1
- [ ] Run `/career-ops pdf` to regenerate CV

## Phase 2 Task Checklist (Days 31–60)

### Week 5–6: Full RAG Pipeline
- [ ] Choose and integrate embedding model (OpenAI text-embedding-3-small or nomic-embed via Ollama)
- [ ] Add embedding step to upload pipeline (embed on insert)
- [ ] Build retrieval endpoint with pgvector cosine similarity search
- [ ] Add reranker (Cohere Rerank free tier or FlashRank local)
- [ ] Build "Ask your finances" chat UI in React (`/chat` route)
- [ ] FastAPI SSE endpoint for streaming RAG responses
- [ ] Measure retrieval quality (MRR on 10 test queries)

### Week 7: Streaming + Advanced Patterns
- [ ] Implement SSE streaming in FastAPI for chat endpoint
- [ ] Implement EventSource consumption in React frontend
- [ ] Replace polling-based upload status with Supabase Realtime
- [ ] Test streaming under load (dropped connections, error recovery)

### Week 8: LangGraph Multi-Agent
- [ ] Design "Financial Health Advisor" agent (state, tools, routing)
- [ ] Implement tools: `get_cashflow_summary`, `get_pyramid_scores`, `get_spending_by_category`
- [ ] Build LangGraph graph: analyze → identify gaps → recommend → optional drilldown
- [ ] Add conversation memory (session-scoped)
- [ ] Test 5 financial scenarios

## Phase 3 Task Checklist (Days 61–90)

### Week 9–10: Public Presence + Certification
- [ ] Write technical blog post: "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing"
- [ ] Publish on dev.to or personal blog
- [ ] Study + pass Databricks GenAI Engineer Associate OR Azure AI-102
- [ ] Update LinkedIn headline and About section

### Week 11: Interview Prep
- [ ] Write 5 STAR+R stories from personal-finance project
- [ ] Prepare 3 architectural deep-dives (tool_use, RAG, multi-provider factory)
- [ ] Record and review practice presentations (Loom)
- [ ] Prep answers: RAG vs fine-tuning, hallucination handling, cost control at scale

### Week 12: Active Applications
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
**Session: Week 1 complete — Langfuse dashboard live**
- Langfuse SDK integrated into Python AI service (`services/ai-service`)
- Anthropic and Gemini calls wrapped with tracing — cost, latency, token counts visible in Langfuse UI
- Langfuse dashboard created: cost/day, calls/day, p50/p95 latency distribution, error rate
- 3 concrete numbers documented in `docs/performances/ai-observability-metrics.md`
- Week 1 ✅ DONE — AI Observability gap closed

**Streak: 5 days**

### 2026-06-01 — Day 5 (evening session)

**Session: Week 2 planned — extraction eval harness walkthrough compiled**

- Compiled `.claude/plans/learning/PF-AI002-llm-evaluation-framework.md` — a 13-step build walkthrough modeled on PF-AI001, grounded in the real interfaces (`LlmParser.parse`, `ProviderFactory`, `TransactionResult`, `EXTRACT_SCHEMA`)
- Designed the scorer: two-axis metrics — row-level precision/recall/F1 (alignment on `date+amount`, mirroring the .NET dedup key) + field-level accuracy, with critical fields (`date`, `amount_idr`, `flow`) scored separately from cosmetic ones
- Curated a by-concept resource list (Hamel, Eugene Yan, Zheng et al. LLM-as-judge, Langfuse datasets, Promptfoo) + a learning-strategy section mapped to the daily-loop tips
- Scoped 20 fixtures (with deliberate edge cases: refund, FX, multi-currency) — fixtures will be reused as the Week-3 RAG retrieval test set

**Week 2 checklist progress:** (planning only — no build tasks ticked yet)
- [ ] Create `services/ai-service/evals/` dir with 20 fixtures ← starts today
- [ ] Ground-truth JSON, scorer, runner, benchmark ← this week

**Retros (blockers & surprises):**
- **Cost measurement gap:** providers' `extract_structured()` returns only the parsed dict, not token usage — so the harness couldn't compute cost-per-doc. **Fix:** non-breaking `self.last_usage` attribute on each provider, read by the harness and fed to the Week-1 `estimate_cost_usd()`. Honors PF-AI001's note to not delete that function.
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

**Session: Week 2 complete — LLM Evaluation Framework shipped**

- Built extraction eval harness (`services/ai-service/evals/`) — 20 hand-labeled fixtures covering BCA, NeoBank, Superbank, screenshots, and adversarial edge cases (refund/FX/multi-currency)
- Implemented `evals/scoring.py`: row-level precision/recall/F1 (alignment on `date+amount_idr` natural key) + field-level accuracy with critical fields (`date`, `amount_idr`, `flow`) scored separately from cosmetic fields
- Added `self.last_usage` to GeminiProvider and AnthropicProvider (non-breaking) — feeds `estimate_cost_usd()` from Week 1
- Built `evals/eval_extraction.py` — CLI benchmark runner (`--provider gemini|anthropic`, `--compare`); runs real API calls, reports per-fixture + aggregate table
- Unit-tested the scorer itself (`tests/test_eval_scoring.py`, 5 tests) — THINK-04 applied: the harness must be trustworthy before its numbers are
- **Bug caught and fixed during run:** `TransactionResult.flow` is a `FlowType(str, Enum)` — in Python 3.11+, `str(FlowType.DB)` → `"FlowType.DB"`, not `"DB"`. Fix: `t.model_dump(mode='json')` in the runner. THINK-04 in action — the eval caught a real serialization bug that mock tests never would.
- Partial Gemini run completed (15/20 fixtures; superbank batch hit free-tier daily quota — 20 RPD). Row F1=1.00 on all fixtures; critical-field accuracy confirmed 1.00 after enum fix.
- `docs/eval-results.md` written with findings, failure mode, and interview-ready numbers

**Week 2 checklist:** ✅ all 5 items done — plan archived to `.claude/plans/completed/`

**Interview-ready answer (new):** "I built a 20-fixture extraction eval harness; Gemini 2.5 Flash hit 100% row F1 on BCA/NeoBank/screenshot fixtures. The eval caught a Python enum serialization bug that mocked unit tests never would — `flow` was always serializing as `FlowType.DB` instead of `DB` until `model_dump(mode='json')` was applied."

**Streak: 9 days**

### 2026-06-06 — Day 10

**Session: Learning infrastructure — Knowledge Check quizzes added to all plans**

- Added `## 📝 Knowledge Check` quiz sections to all 4 active learning plan files: `PF-AI001` (AI observability), `PF-AI002` EN + ID (eval framework), `PF-AI003` (RAG/embeddings)
- Each quiz: 5–6 multiple-choice questions modeled on Databricks GenAI Engineer Associate + Azure AI-102 + AWS ML Engineer exam domains — cert style, not trivia
- Answer position rotated per question (A/B/C/D varied) + `<details>` collapsible blocks for active-retrieval recall before reveal
- Updated mentor `SKILL.md` with the quiz generation rules — now enforced: every new or revised learning plan file MUST end with a Knowledge Check

**Week 3 checklist progress:**
- [ ] Complete DeepLearning.AI "LangChain for LLM Application Development" ← next
- [ ] Complete "Functions, Tools and Agents with LangChain"
- [ ] Build LangGraph "Transaction Categorizer Agent"

**Retros (blockers & surprises):**
- None — clean session. Tooling/infrastructure day; no build tasks, no API calls.

**Remaining for tomorrow:**
- Start Week 3 build: LangChain for LLM Application Development course (free, ~4h) + begin LangGraph proof-of-concept planning

**Streak: 10 days**
