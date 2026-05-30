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
