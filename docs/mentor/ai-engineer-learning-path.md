# The Generative AI Engineer Learning Path — Final (Personalized)

> **Status:** Personalized for Rikky's pivot from Senior Backend (.NET) → AI Engineer.
> **Horizon:** 12 active weeks (Phases 2–3 are the critical path). Phase 1 is retained for context but mostly already covered. Phase 4 is deferred.
> **Implementation vehicle:** Personal Finance Platform (`C:\workspaces\personal-finance`). Every concept ships as a real feature — no toy scripts, no next-day deferral.
> **Companion doc:** Use-case mapping (which feature in Personal Finance proves each concept) lives in the Personal Finance repo, not here. This doc stays curriculum-only.

## How to read this doc

This is a **syllabus, not a reading list.** Study it top to bottom.

- Each phase opens with a **Helicopter View** — where the phase is going and why.
- Then a **Learning Order**: topics numbered in dependency sequence. *This is the path.* Learn topic 1 before topic 2, and so on.
- Each topic carries its own **resource(s)** — the course or docs that teach *that* topic.

**Resources are references attached to a topic — not a sequence of their own.** This is the key thing the old version got wrong. One platform course can cover several topics (the Google Cloud vector-search course covers embeddings → RAG → hybrid search in a single course), and some topics — observability, evals — aren't taught by *any* single course, only by tool docs. So a flat "platform curriculums" list always looks like it jumps around: it's ordered by *resource*, not by *learning step*. The numbered Learning Order below is the real order. When in doubt, follow the numbers, not the course catalog.

Synthesized from the curriculums of DeepLearning.AI, Coursera (IBM, AWS), Microsoft, Hugging Face, Anthropic, and Google Cloud. The industry consensus structures AI Engineering into foundational APIs → application layer → specialization → production. Because of the senior backend background, the early phases move fast; the middle phases are where the real signal is built.

---

## Topic Index — full study order (scan this first)

The entire path on one screen. Follow the numbers. Phases 1→3 are the active spine; Phase 4 is deferred. URLs for every resource live in the companion task file `.agents/skills/mentor/learning-path.md`, under each week's **Resources**.

| # | Phase · Week | Topic | Why it sits here | Primary resource |
|---|--------------|-------|------------------|------------------|
| — | P1 · skim | LLM API mechanics + structured output (tool_use / JSON mode) | Already on CV — skim for gaps only | Anthropic Academy: *Building with the Claude API* |
| — | P1 · skim | Prompt engineering + prompt caching | One-evening polish | Anthropic Academy · OpenAI Quickstart |
| 1 | P2 · W1 | **AI observability** (tracing, cost, latency) | Measure *before* you build, so every later topic produces a quotable number | Langfuse docs |
| 2 | P2 · W2 | **LLM eval harness** (golden sets, accuracy, faithfulness) | "How do you know it's correct?" — must exist before you can claim any RAG number | RAGAS docs · Promptfoo docs |
| 3 | P2 · W3 | **Embeddings + vector search** | The retrieval foundation everything in RAG stands on | Google Cloud Skills Boost: *Vector Search and Embeddings* |
| 4 | P2 · W3–4 | **RAG core**: chunk → retrieve → re-rank → grounded generation | The #1 applied AI-Eng skill | Coursera (LlamaIndex): *RAG with LlamaIndex* · NVIDIA: *Building RAG Agents with LLMs* |
| 5 | P2 · W5 | **Streaming (SSE)** | Production UX; cheap once RAG works | FastAPI docs (`StreamingResponse` / `sse-starlette`) |
| 6 | P2 · W6 | **Advanced RAG**: hybrid search, sentence-window, auto-merging | Squeeze accuracy; measure the lift with the harness from #2 | Google Cloud / LlamaIndex courses (advanced sections) |
| 7 | P3 · W7 | **Tool-calling agents** (smolagents) | Smallest agent surface — grok the Thought-Action-Observation loop first | Hugging Face: *Agents Course* |
| 8 | P3 · W8 | **Stateful orchestration** (LangGraph) | State, routing, memory, error handling — "industrial smolagents" | LangGraph docs · Coursera (IBM): *RAG & Agentic AI* |
| 9 | P3 · W8 | **Agent evaluation** | Tool-call accuracy + trajectory — closes the "how do you eval an agent?" gap | RAGAS · HF Agents Course (eval units) |
| 10 | P3 · W9 | **Model Context Protocol (MCP)** | Interop frontier signal; server + client | Anthropic Academy: *The MCP Series* |
| 11 | P3 · W9–10 | Multi-agent over MCP (stretch) | Orchestration over a standard protocol | Anthropic *MCP Series* |
| ⏸ | P4 | Fine-tuning / MLOps / guardrails-at-scale | Deferred to month 4+ unless a JD demands it | (see Phase 4) |

---

## Phase 1 — Generative AI Foundations & API Engineering

**Status:** ✅ Largely covered already (Tier 2 reached). Retain for context and gap-skim only.

### Helicopter View

The mechanics of talking to an LLM programmatically. You've already shipped most of this — tool_use extraction, Gemini JSON mode, the multi-provider factory. Treat the order below as a **checklist to skim**, not a study block: one evening, fill the gaps, move on.

### Learning Order (skim, top to bottom)

**1. LLM API mechanics + structured output** — tokenization, context-window management, `tool_use` / JSON mode, multimodal inputs.
✅ Already on CV: Anthropic `tool_use` structured extraction, Gemini JSON mode, multi-provider factory, PyMuPDF token reduction, temperature=0.0 with `stop_reason == max_tokens` as a hard error.
→ *Resources:* **Anthropic Academy** — *Building with the Claude API* · **OpenAI Academy / Quickstart** — text generation, streaming, function calling.

**2. Prompt engineering** — system-prompt design, few-shot formatting, XML-tag structuring. Skim for the XML patterns you haven't formalized yet.
→ *Resource:* **DeepLearning.AI** — *Generative AI for Software Development* (configuration-driven development, LLMs as pair-programming partners).

**3. Prompt caching + cost mechanics** — Anthropic prompt caching, function-calling parity across providers. ≤ 1 evening.
→ *Resource:* **Anthropic Academy** — *Building with the Claude API* (caching section).

### Key skills
API setup, system-prompt design, few-shot formatting, multimodal inputs (text, image, audio).

---

## Phase 2 — The Application Layer (RAG, Evals & Observability)

**Status:** 🎯 Critical path. Weeks 1–6. This is where most production work happens and where the biggest gaps are.

### Helicopter View

You're going to give an LLM access to your own data (RAG) **and** instrument the whole loop so every claim is a measured number. The order is forced by one rule: **install the measuring tools before the thing you measure.** So observability and the eval harness come first (a few hours each), then RAG is built on top — which means every week of RAG work produces a quotable metric ("reranking lifted MRR from X to Y", "extraction costs $X/doc at Yms p95") instead of a vibe.

The phase title says *"RAG, Evals & Observability"* because **RAG is the most important skill** — but you *build* it last of the three. Title order ≠ build order. (Basic retrieval *can* start in Week 1 for momentum — just don't quote RAG numbers before the eval exists.)

### Learning Order (study top to bottom)

**1. AI-specific observability** — *Week 1, ~1–2h, do this first.*
Tracing every LLM call: input/output tokens, cost estimate, latency p50/p95, model, error flag — plus prompt versioning. This is the measuring tape. Nothing after this is worth doing until you can see the numbers.
→ *Resource:* **Langfuse docs + examples** — tracing, prompt management, dataset-based evals.

**2. LLM evaluation harness** — *Week 2.*
Golden sets, regression tests, field-level accuracy, and faithfulness/relevance scoring. This is the answer to the top-3 interview question *"how do you know your extraction is correct?"* Everything downstream (RAG, advanced RAG, agents) is graded by this harness, so it has to exist before you can claim any improvement.
→ *Resources:* **RAGAS docs** — faithfulness, answer relevancy, context precision/recall · **Promptfoo docs** — prompt regression + A/B evaluation.

**3. Text embeddings + vector databases** — *Week 3.*
What an embedding is, how semantic similarity works, and how a vector DB (pgvector, FAISS, ChromaDB) stores and queries them. This is the foundation the entire RAG topic stands on — you cannot retrieve before you can embed and index.
→ *Resource:* **Google Cloud Skills Boost** — *Vector Search and Embeddings*.
> Its own table of contents: Introduction → Vector search basics → Encode with embeddings → Index and search → Vertex AI Vector Search → RAG and grounded agent → Hybrid search → Summary. **Note:** this single course also covers topics #4 and #6 below — it does **not** cover observability or evals. That's why #1–#2 are taught by tool docs, not by this course. (If you only do one platform course in Phase 2, it's this one.)

**4. RAG core: chunk → retrieve → re-rank → grounded generation** — *Weeks 3–4.*
The end-to-end pipeline: chunking strategies, top-K retrieval, re-ranking the candidates, then grounded synthesis with citations and metadata filtering (account, date range, category). The #1 applied AI-Engineering skill in current JDs.
→ *Resources:* **Coursera (Activeloop / LlamaIndex)** — *Retrieval Augmented Generation with LlamaIndex* · **NVIDIA** — *Building RAG Agents with LLMs*.

**5. Streaming responses (SSE)** — *Week 5.*
Server-sent events / async generators so the answer renders token-by-token. A production-UX *pattern*, not a feature — and cheap to add once RAG works. Same week: swap polling status for event-driven updates (Supabase Realtime).
→ *Resource:* **FastAPI docs** — `StreamingResponse` / `sse-starlette`.

**6. Advanced RAG: hybrid search, sentence-window, auto-merging** — *Week 6.*
Three accuracy techniques, each benchmarked against the Week-3 MRR baseline using the harness from #2. Ship the winner by the numbers, not by which sounds most impressive. Add RAGAS faithfulness scoring here too.
→ *Resources:* the advanced sections of the **Google Cloud** and **LlamaIndex** courses above; hybrid search = pgvector + Postgres `tsvector`.

### Key skills (what you can claim after Phase 2)
- End-to-end RAG pipelines: chunking, embedding, retrieval, re-ranking, generation.
- Eval suites (golden sets, regression tests, faithfulness/relevance scoring).
- Tracing every LLM call (latency, cost, prompt/response, tool invocations).
- SSE / async generators for streaming UX.
- Deploying with FastAPI / Flask / Gradio.

### Suggested cadence
- **Weeks 1–2** — Topics #1–#2: Langfuse + eval harness (Promptfoo / RAGAS basics).
- **Weeks 3–4** — Topics #3–#4: embeddings + pgvector retrieval + chunking + re-ranking.
- **Week 5** — Topic #5: streaming SSE + Realtime.
- **Week 6** — Topic #6: advanced RAG (hybrid, sentence-window, auto-merging) + faithfulness eval.

---

## Phase 3 — The Specialization Layer (Agents & Orchestration)

**Status:** 🎯 Critical path. Weeks 7–10. The Tier 3 → Tier 4 jump.

### Helicopter View

Move from reactive apps (answer a question) to agentic apps (take an action). The order is smallest-surface-first: tool-calling loops in smolagents (grok the Thought→Action→Observation cycle in a day), then LangGraph as "industrial smolagents" (state, routing, memory), then how to *evaluate* an agent, then MCP to expose your tools over a standard protocol. Everything you build here is logged to the Langfuse you installed in Phase 2 — the traces are your demo material.

### Learning Order (study top to bottom)

**7. Tool-calling agents (smolagents)** — *Week 7.*
The Thought-Action-Observation loop on the smallest possible API surface. Build one agent with 2–3 tools and a visible reasoning trace before touching anything heavier.
→ *Resource:* **Hugging Face** — *Agents Course* (smolagents units).

**8. Stateful orchestration (LangGraph)** — *Week 8.*
State machines for multi-step workflows: a state object, conditional routing, checkpointer memory, and tool-failure fallback nodes. LangGraph is the dominant framework in current JDs — learn it as "smolagents with a real state graph."
→ *Resources:* **LangGraph official docs + tutorials** — state graphs, checkpointing, human-in-the-loop · **Coursera (IBM)** — *RAG and Agentic AI Professional Certificate* (LangGraph, CrewAI, MCP clients/servers).

**9. Agent evaluation** — *Week 8.*
Beyond extraction accuracy: tool-call accuracy (right tool, right args?) and a trajectory check over fixture scenarios, logged to Langfuse. This is the answer to *"how do you eval an agent?"* — a question most candidates can't answer. Reuses the Week-2 harness.
→ *Resources:* the Week-2 eval harness + **RAGAS**; **HF Agents Course** evaluation units.

**10. Model Context Protocol (MCP)** — *Week 9.*
Anthropic's tool/agent interop standard, adopted across the industry. Build a server that exposes your domain tools, then connect a client (Claude Desktop). Server up first, spec later.
→ *Resources:* **Anthropic Academy** — *The MCP Series* and *Introduction to Agent Skills* · MCP quickstart + Python SDK.

**11. Multi-agent over MCP (stretch)** — *Weeks 9–10.*
Wire one LangGraph tool to call the MCP server; a second sub-agent handles the MCP interaction. Multi-agent orchestration over a standard protocol — the interop boundary is explicit and inspectable in Langfuse.
→ *Resource:* **Anthropic** — *The MCP Series*.

### Key skills
Building specialists/sub-agents, state machines for long-running workflows, MCP servers/clients, frameworks (LangGraph, CrewAI, AutoGen, smolagents), agent observability and replay.

### Suggested cadence
- **Weeks 7–8** — Topics #7–#9: smolagents → LangGraph → agent eval. First agent shipped.
- **Weeks 9–10** — Topics #10–#11: MCP server exposing domain tools, then the 2-agent + MCP workflow.

---

## Phase 4 — Advanced Fine-Tuning & Generative MLOps (Production AI)

**Status:** ⏸️ Deferred to month 4+. Retained for context — none of the target Staff/Senior AI Engineer roles in the current pipeline (Grafana, GitLab, Datadog, Anthropic, Intercom) require fine-tuning or SageMaker. Revisit only if a specific role demands it.

### Helicopter View

The lifecycle of deploying, scaling, evaluating, and fine-tuning models securely in the cloud. There's no Learning Order here on purpose — it's parked. Treat the list below as a *map of what exists* so you can spin one topic up fast if a JD asks for it.

### Deferred topics (reference only, not scheduled)
- **Core concepts:** LLM lifecycle, Parameter-Efficient Fine-Tuning (LoRA, QLoRA), model alignment (RLHF, DPO), evaluation frameworks at scale (RAGAS, lm-eval-harness), observability, guardrails.
- **Key skills:** Fine-tuning open-source models, drift/bias detection, guardrail enforcement, latency/cost optimization, CI/CD for AI pipelines.
- **Resources (reference only):**
  - **AWS** — *Certified Machine Learning Engineer – Associate* and *Generative AI Developer – Professional* (SageMaker pipelines, Amazon Bedrock, enterprise guardrails). *Skip unless targeting AWS-shop roles.*
  - **DeepLearning.AI** — *Generative AI with Large Language Models* (transformer mechanics, full fine-tuning lifecycle).
  - **Hugging Face** — *LLM Course* (Transformers, Datasets, TRL).

### Weeks 11–12 (instead of starting Phase 4): Positioning & proof
- Blog post + demo video on the RAG + Agent system shipped in Phases 2–3.
- CV update with new proof points.
- Certification, if ROI is there (Databricks GenAI Engineer Associate or Azure AI-102).
- Apply to roles in the pipeline (Datadog, Grafana, Anthropic, GitLab, Intercom).

---

## Execution Rules

1. **Follow the Learning Order, not the resource catalog.** The numbered topics are the path. Courses are references attached to a step — a single course may span several topics, and some topics live only in tool docs.
2. **One concept → one Personal Finance commit, same day.** No deferral, no toy scripts.
3. **Phase 1 is a skim, not a study block.** Use it as a reference map; don't sit through the courses.
4. **Phase 2 + 3 are non-negotiable.** They close every critical gap (RAG, evals, observability, agents, MCP).
5. **Phase 4 stays on the shelf** until a target JD demands it. Don't burn weeks on an AWS ML cert for roles that don't ask for it.
6. **Use-case mapping lives in Personal Finance**, not in this doc. Each phase gets a "what we built and why" page in that repo, with links back to the commits and the curriculum item that motivated them.
