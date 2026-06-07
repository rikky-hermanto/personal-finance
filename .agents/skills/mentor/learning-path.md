# AI Engineering Pivot — 30/60/90 Day Learning Path

**Goal:** Backend Engineer → AI Engineering / Backend AI Engineering
**Target companies:** Async-first fully remote (Grafana, Supabase, GitLab, PostHog, WorkOS, 1Password archetype)
**Primary proof point:** Personal Finance Platform (`C:\workspaces\personal-finance`)

**Companion docs (read together):**
- [`docs/mentor/ai-engineer-learning-path.md`](../../../../docs/mentor/ai-engineer-learning-path.md) — Curriculum reference (phases, platforms, courses, cadence)
- [`docs/ai-engineer-learning-tips.md`](../../../../docs/ai-engineer-learning-tips.md) — Daily loop, retrieval/interleaving protocol, anti-patterns

**This file = task-level breakdown.** It's *what to ship today*. The curriculum doc is *what am I learning and why*. The tips doc is *how to study without wasting time*.

---

## Why This Order

The sequencing is deliberate, and was finalized 2026-05-28 against the compiled curriculum:

1. **Observability first** — you can't quote numbers you haven't measured. Numbers unlock every other story.
2. **Eval second** — "how do you know your extraction is correct?" is a top-3 interview question. Need a real answer with a real harness.
3. **RAG third** — pgvector is already in your schema. RAG is the #1 applied skill in current AI Eng JDs and the foundation agents will build on.
4. **Streaming fourth** — production UX pattern; cheap to add once RAG works.
5. **Agents + MCP fifth** — frameworks make sense only after you have a real retrieval system to wrap. smolagents before LangGraph (smaller surface), MCP after LangGraph.
6. **Public proof sixth** — a blog post with your benchmark numbers is worth more than a cert alone.
7. **Certification last** — signal booster, not the foundation. Never cert-first.

**Fine-tuning, LoRA/QLoRA, SageMaker, RLHF** → deferred to month 4+. Not in this 12-week plan. Revisit only if a specific JD demands it.

---

## Daily Operating Mode (from ai-engineer-learning-tips.md)

- **3.5 focused hours/day**, not 8. Quality > quantity. Diminishing returns after 4h.
- **Project-first:** open the Personal Finance feature you're about to ship. Pull theory only when you hit the wall.
- **Same-day shipping:** learn → implement → commit, all in one day. No next-day deferral.
- **Active retrieval:** after each video segment, close the tab and write what you learned from memory.
- **Interleave phases:** morning RAG, afternoon agent work. Better transfer than blocked practice.
- **Sunday metric:** "what can I say in an interview today that I couldn't say last Sunday?"

---

## Phase 1 — Foundation + RAG (Days 1–30)

### Chapter 1: AI Observability + Real Metrics
**Theme:** You can't quote numbers you haven't measured.

**Why it matters:** Every AI Eng interview asks "how do you monitor your LLM in production?" You have OTel — but no AI-specific layer. Adding Langfuse gives you: per-call cost, latency, prompt versioning, accuracy trending. After this chapter, you can quote: "extraction costs $0.0X per document, p95 latency is Xms."

**Tasks:**
- Add [Langfuse](https://langfuse.com) SDK to `services/ai-service` (Python) — 1-2 hours
- Wrap existing Anthropic and Gemini calls with Langfuse tracing
- Create a Langfuse dashboard showing: cost/day, calls/day, latency distribution, error rate
- Extract p50/p95 latency and average cost-per-doc from OTel + Langfuse
- Document 3 concrete numbers in `article-digest.md`

**Definition of done:** You can say "my extraction pipeline costs $X per document and runs in Xms p95" with a dashboard screenshot to back it up.

**Resources:**
- Langfuse Python SDK: https://langfuse.com/docs/sdk/python
- Langfuse self-hosted (Docker): works with your existing Docker Compose setup
- OTel + Langfuse integration: https://langfuse.com/docs/opentelemetry

---

### Chapter 2: LLM Evaluation Framework
**Theme:** Know your accuracy. Own your benchmark.

**Why it matters:** "How do you know your extraction is correct?" is a top-3 AI Eng interview question. Right now the answer is "we check manually." After this chapter, the answer is "we have an eval harness with 20 fixtures, measured at 92% field-level accuracy, with Gemini 38% cheaper on structured extraction workloads."

**Tasks:**
- Create `services/ai-service/evals/` directory
- Collect 20 real (anonymized) bank statement samples — CSV, PDF, screenshot variants
- Write expected output JSON for each (ground truth)
- Build `eval_extraction.py`: runs both providers on all fixtures, computes accuracy per field
- Capture: field-level accuracy %, cost per doc, latency per doc, error rate
- Run benchmark: Gemini 2.5 Flash vs Claude Sonnet 4.6
- Write findings as a table in `docs/eval-results.md`
- Stretch: integrate Promptfoo or RAGAS for repeatable regression runs

**Definition of done:** `python eval_extraction.py` runs cleanly, outputs a benchmark table, numbers are documented.

**Resources:**
- Custom eval is actually *better* for interviews (you designed it)
- Promptfoo: https://www.promptfoo.dev
- RAGAS (preps you for Phase 1 RAG eval): https://docs.ragas.io

---

### Chapter 3: RAG — Embeddings + Retrieval
**Theme:** Turn the database into a retrieval engine.

**Why it matters:** RAG is the #1 applied AI skill in the market. pgvector is already in your schema — this is build, not research. After this chapter, semantic search over your own transactions works end-to-end.

**Tasks:**
- Choose embedding model: `text-embedding-3-small` (OpenAI, ~$0.02/1M tokens) or `nomic-embed-text` (Ollama, free/local)
- Embed transactions on insert: add embedding step to the upload pipeline
- Backfill embeddings for existing rows
- Build retrieval endpoint: pgvector cosine similarity search on the `embeddings` table (top-K)
- Write 10 handwritten test queries with expected matches
- Measure: MRR or NDCG on the test set, log it in your eval harness

**Definition of done:** `POST /search { "query": "coffee shops in March" }` returns the right transactions ranked by similarity, with MRR captured.

**Resources:**
- pgvector Python: https://github.com/pgvector/pgvector-python
- Google Cloud Skills Boost: *Vector Search and Embeddings*
- Coursera (Activeloop/LlamaIndex): *Retrieval Augmented Generation with LlamaIndex*

---

### Chapter 4: RAG — Chunking, Re-ranking, Generation
**Theme:** Make retrieval *good*, not just *working*.

**Why it matters:** Naive top-K is the toy version. Hiring managers ask about chunking strategy, re-ranking, and grounded synthesis. This chapter turns the toy into something defensible.

**Tasks:**
- Apply chunking strategy to longer-form artifacts (e.g., statement narratives, notes): fixed-size with overlap, then sentence-window
- Add a re-ranker: Cohere Rerank API (free tier) or FlashRank (local, free) — top-10 retrieved → top-3 reranked
- Build LLM synthesis step: pass top-3 chunks + question → grounded answer with citations
- Add metadata filtering (account, date range, category)
- Re-run the Chapter 3 MRR test — measure the lift from reranking. Document the delta.
- First demo-able RAG endpoint: `POST /ask`

**Definition of done:** Ask "how much did I spend on food in March?" → correct, cited answer. MRR improvement from reranking is measured and logged.

**Resources:**
- Cohere Rerank free tier: https://cohere.com/rerank
- FlashRank (local): https://github.com/PrithivirajDamodaran/FlashRank
- NVIDIA: *Building RAG Agents with LLMs*

---

## Phase 2 — Streaming + Agents (Days 31–60)

### Chapter 5: Streaming + Production UX
**Theme:** Token-by-token streaming. The pattern every AI product needs.

**Why it matters:** Every modern AI product streams. Knowing how to implement SSE in FastAPI + consume in React is a concrete technical differentiator. Also replaces your current polling-based upload status with a real improvement.

**Tasks:**
- Implement SSE streaming in FastAPI for the chat endpoint (`StreamingResponse` + `EventSourceResponse`)
- Implement chunked streaming in React (EventSource API or `@microsoft/fetch-event-source`)
- Wire the RAG `/ask` endpoint to stream tokens as they arrive
- Replace polling-based upload status with Supabase Realtime subscription
- Test under load: verify no buffering, proper error handling for dropped connections
- Build minimal React chat UI on `/chat` route consuming the streaming endpoint

**Definition of done:** Chat streams token-by-token in the UI. Upload status updates in real-time without polling.

**Resources:**
- FastAPI SSE: https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse
- `sse-starlette`: https://github.com/sysid/sse-starlette
- Supabase Realtime Python: https://supabase.com/docs/guides/realtime

---

### Chapter 6: Advanced RAG Patterns
**Theme:** Sentence-window, auto-merging, hybrid search. The patterns that actually move accuracy.

**Why it matters:** "What advanced RAG techniques have you used?" comes up in every serious AI Eng loop. After this chapter you can name three, with measured impact on your own fixtures.

**Tasks:**
- Implement **sentence-window retrieval** (small chunks indexed, expanded window returned)
- Implement **auto-merging retrieval** (hierarchical chunks, merge siblings when threshold hit)
- Add **hybrid search**: combine pgvector similarity with PostgreSQL full-text search (BM25-ish)
- Run eval harness against each variant — capture MRR / answer-faithfulness deltas
- Pick the winning combination as the production default
- Write a 1-paragraph "what I learned" note for each technique (feeds future blog post)

**Definition of done:** Eval harness shows the chosen advanced-RAG variant beats naive top-K by a measurable margin, with numbers committed to the repo.

**Resources:**
- LlamaIndex sentence-window: https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/
- LlamaIndex auto-merging: https://docs.llamaindex.ai/en/stable/examples/retrievers/auto_merging_retriever/
- Hybrid search with pgvector + tsvector: https://github.com/pgvector/pgvector#hybrid-search

---

### Chapter 7: First Agent — Hugging Face Course + smolagents
**Theme:** Grok the agent concept on the smallest possible API surface.

**Why it matters:** "Agentic systems" is the hardest gap to close on paper. Start with smolagents — you'll grok tool-use loops in one day, then learn LangGraph as "industrial smolagents."

**Tasks:**
- Complete relevant units of Hugging Face *Agents Course*: https://huggingface.co/learn/agents-course
- Build a "Transaction Categorizer Agent" with smolagents:
  - Input: uncategorized transaction description
  - Tools: `search_existing_rules`, `lookup_similar_transactions`, `suggest_category`
  - Output: suggested category + confidence + reasoning trace
- Wire as an optional endpoint in personal-finance AI service
- Log every tool call and decision to Langfuse — your traces become demo material
- Stretch: complete DeepLearning.AI *Functions, Tools and Agents with LangChain* (free, ~3h)

**Definition of done:** Agent runs end-to-end on 5 test transactions, traces are visible in Langfuse, reasoning is inspectable.

**Resources:**
- Hugging Face Agents Course: https://huggingface.co/learn/agents-course
- smolagents docs: https://huggingface.co/docs/smolagents
- DeepLearning.AI free: https://learn.deeplearning.ai (filter "free")

---

### Chapter 8: LangGraph — State, Routing, Multi-Step
**Theme:** Build the "Financial Health Advisor." Handle state. Handle failures.

**Why it matters:** LangGraph is the dominant agent framework in current JDs. After this chapter, you have a multi-step agent with tool use, conditional routing, state management, and error handling. That's a real AI Eng credential.

**Tasks:**
- Complete LangGraph quickstart: https://langchain-ai.github.io/langgraph/tutorials/introduction/
- Design "Financial Health Advisor" agent:
  - State: user's pyramid scores, recent transactions, conversation history
  - Tools: `get_cashflow_summary`, `get_pyramid_scores`, `get_spending_by_category`, `get_investment_summary`
  - Graph: analyze → identify gaps → generate recommendations → optionally drill down
- Implement with LangGraph, wired to personal-finance data layer
- Add error handling: tool failures route to a fallback, not a crash
- Implement conversation memory within a session (LangGraph checkpointer)
- Write 5 test scenarios with expected agent behavior

**Definition of done:** Agent correctly responds to "I want to improve my financial health, where should I start?" with a personalized, tool-grounded, multi-step recommendation.

**Resources:**
- LangGraph quickstart: https://langchain-ai.github.io/langgraph/tutorials/introduction/
- LangGraph: Multi-Agent Workflows (DeepLearning.AI, free, 3h)
- Coursera (IBM): *RAG and Agentic AI Professional Certificate*

---

## Phase 3 — MCP + Positioning + Apply (Days 61–90)

### Chapter 9: Model Context Protocol (MCP)
**Theme:** Ship an MCP server. Wire it to a client. Signal you live on the frontier.

**Why it matters:** MCP is Anthropic's tool/agent interop standard, adopted across the industry in 2025. Roles at Anthropic, Grafana, Datadog explicitly mention it. After this chapter, you have a personal-finance MCP server that Claude Desktop (or any MCP client) can call — a uniquely demonstrable artifact.

**Tasks:**
- Complete Anthropic MCP quickstart (~30 min, server up first, spec later)
- Complete Anthropic Academy *MCP Series*
- Build a personal-finance MCP server exposing:
  - `get_transactions` (with date/category filters)
  - `get_pyramid_scores`
  - `search_transactions_semantic` (uses your Chapter 3-4 RAG retriever)
  - `get_cashflow_summary`
- Test from Claude Desktop or another MCP client
- Stretch: build a 2-agent workflow where one agent calls your MCP server as a tool

**Definition of done:** Claude Desktop (or any MCP client) can connect to your server, list tools, and successfully invoke them against your real finance data.

**Resources:**
- Anthropic MCP quickstart: https://modelcontextprotocol.io/quickstart
- Anthropic MCP Series: https://anthropic.skilljar.com/
- MCP Python SDK: https://github.com/modelcontextprotocol/python-sdk

---

### Chapter 10: Public Presence + Certification
**Theme:** Make your work findable. Add the credential if ROI is there.

**Tasks:**
- Write and publish technical blog post:
  - Title: "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing"
  - Platform: dev.to (free, good SEO) or personal blog
  - Content: tool_use vs JSON mode decision, three-tier dedup, PyMuPDF cost optimization, eval results, RAG architecture, MCP server
  - Include: benchmark table (Gemini vs Claude, accuracy vs cost), architecture diagram
- Record a 3-minute demo Loom:
  - (0:00–0:30) Upload BCA PDF → transactions appear with categories
  - (0:30–1:00) Financial Journey page: pyramid scores, Living Garden
  - (1:00–1:30) Langfuse/Grafana trace: cost, latency, token count
  - (1:30–2:00) RAG chat: ask "how much on food in March?" → streamed answer
  - (2:00–2:30) Agent: "improve my financial health" → multi-step recommendation
  - (2:30–3:00) MCP server connected to Claude Desktop → tool calls live
- **Certification (choose one):**
  - **Databricks Generative AI Engineer Associate** (~$200, ~2 weeks): RAG, LLM eval, deployment, guardrails — highest signal for AI Eng roles
  - **Azure AI Engineer Associate (AI-102)** (~$165, ~2 weeks): Azure OpenAI, AI Search, Cognitive Services — best if targeting Azure-stack companies
- Update LinkedIn:
  - Headline: "Backend Engineer → AI Engineering | LLM Pipelines · RAG · Agentic Systems · MCP | Python · .NET"
  - About: lead with AI narrative, link blog + GitHub
- Update `cv.md` and `article-digest.md` with all new metrics and proof points
- Run `/career-ops pdf` to regenerate CV

**Definition of done:** Blog live and linked in GitHub. Demo Loom recorded and linked. Cert scheduled or passed. LinkedIn updated. CV regenerated.

---

### Chapter 11: Interview Prep
**Theme:** Translate the build into interview-ready stories.

**Tasks:**
- Write 5 STAR+R stories (use `/career-ops interview-prep`):
  1. tool_use vs JSON mode decision (architecture trade-off)
  2. Three-tier dedup design (reliability engineering)
  3. PyMuPDF cost optimization (cost-conscious AI engineering)
  4. RAG pipeline design (retrieval + reranking + eval lift)
  5. Agent + MCP system (orchestration + interop)
- Prepare 3 deep-dive explanations (5-min each):
  - "Explain your extraction pipeline"
  - "How do you evaluate LLM accuracy in production?"
  - "Walk me through your RAG and agent architecture"
- Practice: record yourself on Loom delivering each one. Watch back. Cut filler.
- Prep answers for common AI Eng screen questions:
  - "RAG vs fine-tuning — when do you use each?"
  - "How do you handle hallucinations in production?"
  - "How do you keep LLM costs under control at scale?"
  - "What's MCP and why does it matter?"

**Definition of done:** 5 stories written. 3 deep-dives rehearsed and timed under 5 min. Common Q&A answers prepared.

---

### Chapter 12: Active Applications
**Theme:** Ship applications like you ship code — deliberate, not spam.

**Tasks:**
- Run `/career-ops scan` targeting AI Engineering roles
- Filter for async-first / fully remote: Grafana, Supabase, PostHog, GitLab, WorkOS, 1Password, Planetscale, Neon, Turso, Qdrant, Weaviate, LangChain, Langfuse, Anthropic, Datadog, Intercom
- Evaluate each with `/career-ops offer` — apply only to 4.0+ scores
- Target: 5–10 high-fit applications, not 50 generic ones
- For each: tailored CV via `/career-ops pdf`, cover letter, LinkedIn outreach via `/career-ops contact`
- Engage in AI Eng communities: Latent Space Discord, AI Engineer Foundation, LangChain Discord
- Set follow-up cadence in `/career-ops followup`

**Definition of done:** 5+ applications sent to 4.0+ roles. Follow-up cadence active.

---

## Certification Guide

### Tier 1 — Do These (Free, High Signal)

| Course | Provider | Time | Slot |
|---|---|---|---|
| Hugging Face Agents Course | Hugging Face | ~6h | Chapter 7 |
| Functions, Tools and Agents with LangChain | DeepLearning.AI | 3h | Chapter 7 stretch |
| LangChain for LLM Application Development | DeepLearning.AI | 4h | Chapter 8 |
| LangGraph: Multi-Agent Workflows | DeepLearning.AI | 3h | Chapter 8 |
| Building Agentic RAG with LlamaIndex | DeepLearning.AI | 3h | Chapter 6 |
| Anthropic MCP Series | Anthropic Academy | ~4h | Chapter 9 |
| Generative AI with Large Language Models | Coursera/DeepLearning.AI | 16h | optional Phase 4 background |

### Tier 2 — Pick One (Paid, High Signal)

| Cert | Cost | Study | Signal | Best for |
|---|---|---|---|---|
| Databricks GenAI Engineer Associate | ~$200 | 2 weeks | ⭐⭐⭐ | AI Eng roles, data-forward companies |
| Azure AI Engineer Associate (AI-102) | ~$165 | 2 weeks | ⭐⭐⭐ | Azure-stack companies; builds on existing Azure depth |
| Google Cloud Professional ML Engineer | ~$200 | 3 weeks | ⭐⭐ | GCP-heavy companies |

### Tier 3 — Skip for This Pivot

| Cert | Why Skip |
|---|---|
| AWS ML Specialty | Traditional ML focus, not GenAI — wrong pivot signal |
| AWS ML Engineer Associate | AWS-shop signal; not aligned with async-first target archetype |
| Generic cloud certs (AWS SAA, AZ-900) | Already strong in cloud; zero marginal signal |
| Full ML specializations (fast.ai, Coursera ML Specialization) | 3-6 months; overkill for Backend AI Eng target |
| Fine-tuning / RLHF specializations | Defer to month 4+; not in current target JDs |

---

## Key Resources

### LLM Observability
- Langfuse (self-hosted): https://langfuse.com/docs/deployment/local
- Arize Phoenix (free, local): https://github.com/Arize-ai/phoenix
- Helicone: https://www.helicone.ai

### Eval
- RAGAS: https://docs.ragas.io
- Promptfoo: https://www.promptfoo.dev

### RAG
- pgvector Python: https://github.com/pgvector/pgvector-python
- Cohere Rerank: https://cohere.com/rerank
- FlashRank: https://github.com/PrithivirajDamodaran/FlashRank

### Agentic Frameworks
- smolagents: https://huggingface.co/docs/smolagents
- LangGraph: https://langchain-ai.github.io/langgraph/
- LlamaIndex: https://docs.llamaindex.ai
- CrewAI: https://docs.crewai.com
- Pydantic AI: https://ai.pydantic.dev (closest to your existing Pydantic v2 usage)

### MCP
- Spec + quickstart: https://modelcontextprotocol.io
- Python SDK: https://github.com/modelcontextprotocol/python-sdk

### Learning
- DeepLearning.AI free courses: https://learn.deeplearning.ai
- Hugging Face Learn: https://huggingface.co/learn
- Latent Space podcast: https://www.latent.space
- AI Engineer Foundation: https://www.ai.engineer

### Target companies to watch for AI Eng roles
Grafana Labs, Supabase, PostHog, GitLab, WorkOS, 1Password, Neon, Planetscale, Turso, Qdrant, Weaviate, Chroma, LangChain, Langfuse, Arize, Helicone, Braintrust, Weights & Biases, Modal, Fly.io, Render, Anthropic, Datadog, Intercom
