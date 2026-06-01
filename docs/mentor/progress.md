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

### Week 2: LLM Evaluation Framework
- [ ] Create `services/ai-service/evals/` directory with 20 anonymized fixture statements
- [ ] Write expected output JSON for each fixture (ground truth)
- [ ] Build `eval_extraction.py`: runs both providers, computes field-level accuracy
- [ ] Benchmark Gemini 2.5 Flash vs Claude Sonnet 4.6 (accuracy + cost + latency)
- [ ] Write findings to `docs/eval-results.md`

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
