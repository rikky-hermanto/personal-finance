# The Generative AI Engineer Learning Path — Final (Personalized)

> **Status:** Personalized for Rikky's pivot from Senior Backend (.NET) → AI Engineer.
> **Horizon:** 12 active weeks (Phases 2–3 are the critical path). Phase 1 is retained for context but mostly already covered. Phase 4 is deferred.
> **Implementation vehicle:** Personal Finance Platform (`C:\workspaces\personal-finance`). Every concept ships as a real feature — no toy scripts, no next-day deferral.
> **Companion doc:** Use-case mapping (which feature in Personal Finance proves each concept) lives in the Personal Finance repo, not here. This doc stays curriculum-only.

Synthesized from the curriculums of DeepLearning.AI, Coursera (IBM, AWS), Microsoft, Hugging Face, Anthropic, and Google Cloud. The industry consensus structures AI Engineering into foundational APIs → application layer → specialization → production. Because of the senior backend background, the early phases move fast; the middle phases are where the real signal is built.

---

## Phase 1 — Generative AI Foundations & API Engineering

**Status:** ✅ Largely covered already (Tier 2 reached). Retain for context and gap-skim only.

Fundamental mechanics of LLMs and how to interface with them programmatically.

- **Core concepts:** Prompt engineering, in-context learning, tokenization, context window management, structured JSON outputs.
- **Key skills:** API setup, system prompt design, few-shot formatting, multimodal inputs (text, image, audio).
- **Already on CV:** Anthropic `tool_use` structured extraction, Gemini JSON mode, multi-provider factory pattern, PyMuPDF token reduction, temperature=0.0 with `stop_reason==max_tokens` as hard error.
- **Remaining skim (≤ 1 evening):** Anthropic prompt caching, XML-tag structuring patterns, function calling parity across providers.
- **Recommended platform curriculums:**
  - **Anthropic Academy:** *Building with the Claude API* — API calls, prompt caching, XML structuring.
  - **OpenAI Academy / Quickstart:** Text generation, streaming, function calling.
  - **DeepLearning.AI:** *Generative AI for Software Development* — configuration-driven development, LLMs as pair-programming partners.

---

## Phase 2 — The Application Layer (RAG, Evals & Observability)

**Status:** 🎯 Critical path. Weeks 1–6. This is where most production work happens and where the biggest gaps are.

Give LLMs access to external proprietary data without retraining, and instrument the whole loop so you can prove it works.

- **Core concepts:** Text embeddings, semantic search, hybrid search, vector databases (pgvector, FAISS, ChromaDB), chunking strategies, metadata filtering, **LLM evaluation harnesses**, **AI-specific observability**, streaming responses.
- **Key skills:**
  - End-to-end RAG pipelines: chunking, embedding, retrieval, re-ranking, generation.
  - Eval suites (golden sets, regression tests, faithfulness/relevance scoring).
  - Tracing every LLM call (latency, cost, prompt/response, tool invocations).
  - SSE / async generators for streaming UX.
  - Deploying with FastAPI / Flask / Gradio.
- **Recommended platform curriculums:**
  - **Google Cloud Skills Boost:** *Vector Search and Embeddings*.
  - **Coursera (Activeloop / LlamaIndex):** *Retrieval Augmented Generation with LlamaIndex* — sentence-window retrieval, auto-merging, advanced RAG.
  - **NVIDIA:** *Building RAG Agents with LLMs*.
  - **Langfuse docs + examples** — tracing, prompt management, dataset-based evals.
  - **RAGAS docs** — faithfulness, answer relevancy, context precision/recall.
  - **Promptfoo docs** — prompt regression testing and A/B prompt evaluation.

**Suggested cadence:**
- Weeks 1–2 — Langfuse + eval harness (Promptfoo / RAGAS basics).
- Weeks 3–4 — RAG: embeddings + pgvector retrieval + chunking.
- Weeks 5–6 — Streaming SSE + advanced RAG (sentence-window, hybrid search, re-ranking).

---

## Phase 3 — The Specialization Layer (Agents & Orchestration)

**Status:** 🎯 Critical path. Weeks 7–10. The Tier 3 → Tier 4 jump.

Transition from reactive apps (answering questions) to agentic apps (taking autonomous actions).

- **Core concepts:** Tool calling, reasoning and planning (Thought-Action-Observation loops), multi-agent orchestration, the **Model Context Protocol (MCP)**, conversation state, agent evaluation.
- **Key skills:** Building specialists/sub-agents, state machines for long-running workflows, MCP servers/clients, frameworks (LangGraph, CrewAI, AutoGen, smolagents), agent observability and replay.
- **Recommended platform curriculums:**
  - **Hugging Face:** *Agents Course* — building and evaluating agents with smolagents, LangGraph, LlamaIndex.
  - **Coursera (IBM):** *RAG and Agentic AI Professional Certificate* — up-to-date on LangGraph, CrewAI, MCP clients/servers.
  - **Anthropic Academy:** *The MCP Series* and *Introduction to Agent Skills*.
  - **LangGraph official docs + tutorials** — state graphs, checkpointing, human-in-the-loop.

**Suggested cadence:**
- Weeks 7–8 — Hugging Face Agents Course + LangGraph basics. First agent shipped.
- Weeks 9–10 — Anthropic MCP series + multi-agent orchestration. MCP server exposing domain tools; 2-agent workflow.

---

## Phase 4 — Advanced Fine-Tuning & Generative MLOps (Production AI)

**Status:** ⏸️ Deferred to month 4+. Retained for context — none of the target Staff/Senior AI Engineer roles in the current pipeline (Grafana, GitLab, Datadog, Anthropic, Intercom) require fine-tuning or SageMaker. Revisit only if a specific role demands it.

Lifecycle of deploying, scaling, evaluating, and fine-tuning models securely in the cloud.

- **Core concepts:** LLM lifecycle, Parameter-Efficient Fine-Tuning (LoRA, QLoRA), model alignment (RLHF, DPO), evaluation frameworks at scale (RAGAS, lm-eval-harness), observability, guardrails.
- **Key skills:** Fine-tuning open-source models, drift/bias detection, guardrail enforcement, latency/cost optimization, CI/CD for AI pipelines.
- **Recommended platform curriculums:**
  - **AWS:** *Certified Machine Learning Engineer - Associate* and *Generative AI Developer - Professional* — SageMaker pipelines, Amazon Bedrock, enterprise security guardrails. *(Skip unless targeting AWS-shop roles.)*
  - **DeepLearning.AI:** *Generative AI with Large Language Models* — deep mental model of transformer mechanics and the full fine-tuning lifecycle.
  - **Hugging Face:** *LLM Course* — open-source stack (Transformers, Datasets, TRL).

**Weeks 11–12 (instead of starting Phase 4):** Public artifact + applications.
- Blog post + demo video on the RAG + Agent system shipped in Phases 2–3.
- CV update with new proof points.
- Apply to roles in the pipeline (Datadog, Grafana, Anthropic, GitLab, Intercom).

---

## Execution Rules

1. **One concept → one Personal Finance commit, same day.** No deferral, no toy scripts.
2. **Phase 1 is a skim, not a study block.** Use it as a reference map; don't sit through the courses.
3. **Phase 2 + 3 are non-negotiable.** They close every critical gap (RAG, evals, observability, agents, MCP).
4. **Phase 4 stays on the shelf** until a target JD demands it. Don't burn weeks on AWS ML cert for roles that don't ask for it.
5. **Use-case mapping lives in Personal Finance**, not in this doc. Each phase gets a "what we built and why" page in that repo, with links back to the commits and the curriculum item that motivated them.
