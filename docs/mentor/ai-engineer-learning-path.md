# The Generative AI Engineer Learning Path — Final (Personalized)

> **Status:** Personalized for Rikky's pivot from Senior Backend (.NET) → AI Engineer.
> **Horizon:** originally 12 chapters over ~90 days (started 2026-05-26). **Re-baselined 2026-10-17 at Day ~144**: the day count no longer drives the plan; the [remaining schedule](#remaining-schedule-re-baselined-2026-10-17) does. Chapters 1–9.75 (Application, Specialization and Production Hardening layers) are the critical path. Foundations is a skim; Chapters 10–12 are positioning/apply; the Fine-Tuning layer is deferred.
> **Chapter numbers are the single cross-doc coordinate** — they line up with the execution task file and `docs/mentor/progress.md`. This doc's sections are *named layers*, not numbered phases, to avoid colliding with the execution track's 30-day "Phase 1/2/3" blocks.
> **Implementation vehicle:** Personal Finance Platform (`C:\workspaces\personal-finance`). Every concept ships as a real feature — no toy scripts, no next-day deferral.
> **Companion doc:** Use-case mapping (which feature in Personal Finance proves each concept) lives in the Personal Finance repo, not here. This doc stays curriculum-only.

## How to read this doc

This is a **syllabus, not a reading list.** Study it top to bottom.

- Each phase opens with a **Helicopter View** — where the phase is going and why.
- Then a **Learning Order**: topics numbered in dependency sequence. *This is the path.* Learn topic 1 before topic 2, and so on.
- Each topic carries its own **resource(s)** — the course or docs that teach *that* topic.
- **Plan or materi?** A topic that builds something in the project gets a **plan** (`plans/<status>/learning/PF-AIxxx-*.md`): steps, acceptance criteria, a quiz, and a status that moves. A topic you only need to understand gets **materi**, a topic doc in [what-ai-engineering-build/](topics/): explanation, exercises and a self-check, with no status. The last column of the Topic Index links whichever one the topic has. The Indonesian `-id` companion of a plan stays next to that plan.

**Resources are references attached to a topic — not a sequence of their own.** This is the key thing the old version got wrong. One platform course can cover several topics (the Google Cloud vector-search course covers embeddings → RAG → hybrid search in a single course), and some topics — observability, evals — aren't taught by *any* single course, only by tool docs. So a flat "platform curriculums" list always looks like it jumps around: it's ordered by *resource*, not by *learning step*. The numbered Learning Order below is the real order. When in doubt, follow the numbers, not the course catalog.

Synthesized from the curriculums of DeepLearning.AI, Coursera (IBM, AWS), Microsoft, Hugging Face, Anthropic, and Google Cloud. The industry consensus structures AI Engineering into foundational APIs → application layer → specialization → production. Because of the senior backend background, the early phases move fast; the middle phases are where the real signal is built.

---

## Topic Index — full study order (scan this first)

The entire path on one screen. Follow the numbers. The build + positioning layers are the active spine; the Fine-Tuning layer is deferred. `Status` reflects the execution track (`docs/mentor/progress.md`); it stays canonical for detail — this column is just the frontier at a glance. URLs for every resource live in the companion task file `.agents/skills/mentor/learning-path.md`, under each chapter's **Resources**.

| # | Chapter | Status | Topic | Why it sits here | Primary resource | Plan |
|---|---------|--------|-------|------------------|------------------|------|
| — | skim | — | LLM API mechanics + structured output (tool_use / JSON mode) | Already on CV — skim for gaps only | Anthropic Academy: *Building with the Claude API* | materi: [llm-api-structured-output](topics/02-llm-api-structured-output.md) |
| — | skim | — | **Context engineering** + prompt caching (was "prompt engineering") | Everything that goes into an LLM call, not just the prompt text. Mostly already practiced — name it, write it down | Anthropic Academy · Anthropic: *Effective context engineering for AI agents* | materi: [context-engineering-prompt-caching](topics/04-context-engineering-prompt-caching.md) (two small tasks inside) |
| 24 | skim | ⏳ | **LLM fundamentals + the fine-tuning answer**: tokenization, attention, KV cache, temperature and top-p, context window, and when you would fine-tune instead of prompting or RAG | One weak fundamental can sink a strong interview. Concept depth only, no fine-tuning project. Do it before Ch11 | Karpathy: *Intro to Large Language Models* · Chip Huyen: *AI Engineering* (foundation models chapter) | materi: [llm-fundamentals](topics/01-llm-fundamentals.md) · [fine-tuned-llms](topics/08-fine-tuned-llms.md) |
| 1 | Ch1 | ✅ | **AI observability** (tracing, cost, latency) | Measure *before* you build, so every later topic produces a quotable number | Langfuse docs | [PF-AI001](../../plans/done/learning/PF-AI001-ai-observability.md) |
| 2 | Ch2 | ✅ | **LLM eval harness** (golden sets, accuracy, faithfulness) | "How do you know it's correct?" — must exist before you can claim any RAG number | RAGAS docs · Promptfoo docs | [PF-AI002](../../plans/done/learning/PF-AI002-llm-evaluation-framework.md) |
| 3 | Ch3 | ✅ | **Embeddings + vector search** | The retrieval foundation everything in RAG stands on | Google Cloud Skills Boost: *Vector Search and Embeddings* | [PF-AI003](../../plans/done/learning/PF-AI003-rag-embeddings-retrieval.md) · [PF-AI003b](../../plans/done/learning/PF-AI003b-embedding-provider-toggle.md) |
| 4 | Ch3–4 | ✅ | **RAG core**: chunk → retrieve → re-rank → grounded generation | The #1 applied AI-Eng skill | Coursera (LlamaIndex): *RAG with LlamaIndex* · NVIDIA: *Building RAG Agents with LLMs* | [PF-AI004](../../plans/done/learning/PF-AI004-rag-reranking-generation.md) |
| 5 | Ch5 | ✅ 🔄 | **Streaming (SSE)** — plus the answer-accuracy addendum (PF-AI005-PART2, in progress) | Production UX; cheap once RAG works | FastAPI docs (`StreamingResponse` / `sse-starlette`) | [PF-AI005](../../plans/done/learning/PF-AI005-streaming-sse-todo.md) · [PART2](../../plans/in-progress/learning/PF-AI005-PART2-answer-accuracy-todo.md) |
| 6 | Ch6 | ✅ | **Advanced RAG**: hybrid search (shipped and measured; vector won). Sentence-window + auto-merging deferred (PF-AI006-PART2) | Squeeze accuracy; measure the lift on P@5 + faithfulness (MRR is already saturated) | Google Cloud / LlamaIndex courses (advanced sections) | [PF-AI006](../../plans/done/learning/PF-AI006-advanced-rag-patterns-todo.md) · [PART2 (cancelled)](../../plans/cancelled/learning/PF-AI006-PART2-sentence-window-automerging-todo.md) |
| 7 | Ch7 | 🔄 | **Tool-calling agents** (smolagents) — code shipped, smoke gate at 2 of 5 | Smallest agent surface — grok the Thought-Action-Observation loop first | Hugging Face: *Agents Course* | [PF-AI007](../../plans/in-progress/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) |
| 8 | Ch8 | ✅ | **Stateful orchestration** (LangGraph) | State, routing, memory, error handling — "industrial smolagents" | LangGraph docs · Coursera (IBM): *RAG & Agentic AI* | [PF-AI008](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md) |
| 9 | Ch8 | 🔄 | **Agent evaluation** — scenarios written, **never run** (deferred at PF-AI008 close) | Tool-call accuracy + trajectory — closes the "how do you eval an agent?" gap | RAGAS · HF Agents Course (eval units) | [PF-AI008](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md) · [PF-AI010](../../plans/done/learning/PF-AI010-categorization-eval-harness-todo.md) |
| 12 | Ch9.5 | ✅ | **AI security + guardrails**: prompt injection, PII masking, input/output guards, threat model (PF-AI011) | AI chat runs on real data with no guard; guardrails appear in AI Eng JDs. **Runs before Ch9** | OWASP Top 10 for LLM Applications · Langfuse docs | [PF-AI011](../../plans/done/learning/PF-AI011-ai-security-governance-todo.md) |
| 10 | Ch9 | ✅ | **Model Context Protocol (MCP)** (PF-AI009) — server shipped; `get_pyramid_scores` route fix is a follow-up | Interop frontier signal; server + client | Anthropic Academy: *The MCP Series* | [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) |
| 11 | Ch9 | ⏳ | Multi-agent over MCP (stretch), run as a measured single-agent vs orchestrator-worker comparison | Orchestration over a standard protocol, and a "when not to use multi-agent" answer with numbers. Required only if you target Agentic titles | Anthropic *MCP Series* | [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) (stretch) |
| 15 | Ch9 | ⏳ | **Tool design**: descriptions, typed schemas, errors the model can recover from, how many tools to expose. Done as a tool-selection pass on the four MCP tools | The model only sees the tool description, and mocked tests can't tell you it picked the wrong tool | Anthropic: *Writing effective tools for AI agents* · Anthropic *MCP Series* | [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) (section G2) |
| 16 | Ch9 | ⏳ | **Human-in-the-loop**: a LangGraph `interrupt` that asks for approval before the categorizer agent writes, plus a read-only vs write split for MCP tools | An agent that writes to real data needs a point where you say yes or no | LangGraph docs (human-in-the-loop) | _no plan yet_ (follow-up to PF-AI009) |
| 18 | Ch9 | ⏳ | **Feedback loop**: record the category the AI suggested vs the one you kept, turn disagreements into eval rows, thumbs up or down on `/ask`, one synthetic eval set | Evals that grow from real use are what Applied AI roles ask for most. The approval step in topic 16 is the feedback event, so both ship together | Eugene Yan: *Patterns for Building LLM-based Systems* (data flywheel) · Langfuse docs (scores) | _no plan yet_ (same plan as topic 16) |
| 13 | Ch9.75 | ⏳ | **Deployment + LLMOps**: public URL, auth, rate limits, budget alert, response cache, cost write-up (PF-AI012) | Turns "deployed" from a claim into a fact; cost control is a hiring signal | Azure Container Apps docs · GitHub Actions docs | [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) |
| 14 | Ch9.75 | ⏳ | **Evals in CI**: a small, cheap eval subset as a blocking CI gate | Eval engineering is the most-cited AI Eng skill; turns one-off evals into regression protection | Promptfoo CI docs · the Chapter 2 harness | [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) · [PF-142](../../plans/done/PF-142-ci-workflow-existing-gates-todo.md) |
| 19 | Ch9.75 | ⏳ | **Cost and latency engineering**: time to first token, per-step latency, model routing, fallback on a quota error, cost per query, a "1M queries a day" estimate | Cost awareness is a hiring signal on its own, and the October quota block is the failure a fallback fixes | Langfuse cost dashboards · Chip Huyen: *Building a Generative AI Platform* | [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) (to be added) |
| 20 | Ch9.75 | ⏳ | **Model upgrade gated by evals**: run the extraction and categorization evals on a newer model and decide by accuracy, cost and latency | A new model is a regression risk until the eval set says otherwise | the Chapter 2 harness · topic 14 | [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) (to be added) |
| 17 | Ch10 | ⏳ | **Agent-design write-ups**: harness engineering, memory architecture, orchestration patterns, one page each | All three are already built or practiced here but never named. The named version is the interview answer | Anthropic: *Building effective agents* · *Effective context engineering for AI agents* | _no plan yet_ (writing task) |
| — | Ch10 | ⏳ | Public presence + certification, plus an "AI engineering in this repo" case-study page | Make the work findable in five minutes; add the credential if ROI is there | Databricks GenAI Eng Associate / Azure AI-102 | — |
| — | Ch11 | ⏳ | Interview prep (STAR stories + deep-dives + AI-specific behavioral answers) | Translate the build into interview-ready narratives | self-authored — see task file | — |
| 21 | Ch11 | ⏳ | **AI system design practice**: six timed designs, 45 minutes each, out loud and recorded | It is its own round at senior level, judged on trade-offs, failure modes, cost, evaluation and safety | Chip Huyen: *Building a Generative AI Platform* · field guide `interview/questions/04-ai-system-design.md` | _no plan yet_ (practice) |
| 22 | Ch11 | ⏳ | **Timed greenfield take-homes**: two four-hour builds from scratch, eval harness first, each with a README of decisions and a 5-minute video | Every chapter so far was built inside a large repo over days. This tests the four-hour version, and leaves two small repos a reviewer can read quickly | field guide `interview/questions/06-home-assignments.md` | _no plan yet_ (practice) |
| 23 | Ch11 | 🔄 | **Python live coding without AI tools**: two 45-minute sessions a week, **starting now** | The slowest gap to close. Most Python here was written with AI in the loop, and some live rounds ban AI tools | field guide `interview/questions/02-coding.md` | _no plan yet_ (background habit) |
| — | Ch12 | ⏳ | Active applications | Ship applications like code — deliberate, not spam | career-ops — handled separately | — |
| ⏸ | — | ⏸ | Fine-tuning / training-side MLOps | Deferred to month 4+ unless a JD demands it | see the Fine-Tuning layer below | — |

> **Topic numbers vs run order.** Topics 12–14 were added on 2026-10-17, so their numbers are higher than their position. The run order is the table order: Ch7/agent-eval close-out → **Ch9.5** → Ch9 → Ch9.75 → Ch10–12. Ch9.5 jumps ahead of Ch9 because chat went live on real transactions on 2026-10-16 with no injection or PII guard. Topics 15–17 were added on 2026-10-24 after checking the path against a list of ten agentic AI concepts (see [Concept coverage check](#concept-coverage-check-2026-10-24)). They add no new chapters: 15 and 16 ride inside Ch9, and 17 is writing for Ch10. Topics 18–24 were added on 2026-11-10 from the [field guide gap analysis](field-guide-gap-analysis-2026-11-09.md) (see [Field guide check](#field-guide-check-2026-11-10)). They add no chapters either: 18 ships with 16, 19 and 20 ride inside PF-AI012, 21–23 are interview practice in Ch11, and 24 is a two-evening skim. Topic 23 is the exception to run order: it runs in the background from now.

---

## Foundations & API Engineering — Skim (pre-Chapter 1)

**Status:** ✅ Largely covered already (Tier 2 reached). Retain for context and gap-skim only.

The mechanics of talking to an LLM programmatically. You've already shipped most of this — tool_use extraction, Gemini JSON mode, the multi-provider factory. Treat the order below as a **checklist to skim**, not a study block: one evening, fill the gaps, move on.

### Learning Order (skim, top to bottom)

**1. LLM API mechanics + structured output** — tokenization, context-window management, `tool_use` / JSON mode, multimodal inputs.
✅ Already on CV: Anthropic `tool_use` structured extraction, Gemini JSON mode, multi-provider factory, PyMuPDF token reduction, temperature=0.0 with `stop_reason == max_tokens` as a hard error.
→ *Resources:* **Anthropic Academy** — *Building with the Claude API* · **OpenAI Academy / Quickstart** — text generation, streaming, function calling.

**2. Context engineering** (the successor framing to "prompt engineering") — designing *everything* that goes into an LLM call: system prompt, few-shot examples, retrieved context, tool definitions, memory, metadata, and what gets left out. Prompt wording is now one part of it.
✅ Mostly practiced already, just not named: RAG context formatting with citations (Ch4), the advisor's tool schemas and checkpointer memory (Ch8), owner-scoped memory per user (PF-S15). The remaining work is writing it up: one page on how this project decides what enters the context window, and why. That page is an interview answer.
→ *Resources:* **Anthropic** — *Effective context engineering for AI agents* (engineering blog) · **DeepLearning.AI** — *Generative AI for Software Development*.

**3. Prompt caching + cost mechanics** — Anthropic prompt caching, function-calling parity across providers. ≤ 1 evening.
→ *Resource:* **Anthropic Academy** — *Building with the Claude API* (caching section).

**24. LLM fundamentals + the fine-tuning answer** — *added 2026-11-10. Two evenings, before Chapter 11.*
The first three items cover how to call a model. This one covers how the model works, at the depth of a conversation: tokenization, attention and the transformer at a high level, the KV cache, temperature and top-p, and what the context window limits. Interviewers ask these as quick checks, and a weak answer can undo a strong project round.
The second evening is one page answering "when would you fine-tune instead of prompting or using RAG?" with this project as the example. Indonesian bank-description categorization is the natural candidate, along with the reasons it has not been needed so far. No fine-tuning project: 85% of AI-first roles have none in their responsibilities.
→ *Resources:* **Andrej Karpathy** — *Intro to Large Language Models* · **Chip Huyen** — *AI Engineering* (foundation models chapter) · field guide `interview/questions/01-theory.md` for the question list.

### Key skills
API setup, system-prompt design, few-shot formatting, multimodal inputs (text, image, audio), and a conversation-level account of how an LLM works.

---

## The Application Layer (RAG, Evals & Observability) — Chapters 1–6

**Status:** ✅ Chapters 1–6 shipped and measured (as of 2026-10-17). One open addendum: PF-AI005-PART2 (numeric answer accuracy). Its questions were rewritten for the 2026 data, and the eval is waiting on LLM quota.

You're going to give an LLM access to your own data (RAG) **and** instrument the whole loop so every claim is a measured number. The order is forced by one rule: **install the measuring tools before the thing you measure.** So observability and the eval harness come first (a few hours each), then RAG is built on top — which means every chapter of RAG work produces a quotable metric ("extraction costs $X/doc at Yms p95", "faithfulness scores 0.90 on cited answers", "hybrid search lifted P@5 from X to Y") instead of a vibe.

The layer title says *"RAG, Evals & Observability"* because **RAG is the most important skill** — but you *build* it last of the three. Title order ≠ build order. (Basic retrieval *can* start in Chapter 1 for momentum — just don't quote RAG numbers before the eval exists.)

### Learning Order (study top to bottom)

**1. AI-specific observability** — *Chapter 1, ~1–2h, do this first.*
Tracing every LLM call: input/output tokens, cost estimate, latency p50/p95, model, error flag — plus prompt versioning. This is the measuring tape. Nothing after this is worth doing until you can see the numbers.
→ *Resource:* **Langfuse docs + examples** — tracing, prompt management, dataset-based evals.
→ *Plan:* [PF-AI001](../../plans/done/learning/PF-AI001-ai-observability.md)

**2. LLM evaluation harness** — *Chapter 2.*
Golden sets, regression tests, field-level accuracy, and faithfulness/relevance scoring. This is the answer to the top-3 interview question *"how do you know your extraction is correct?"* Everything downstream (RAG, advanced RAG, agents) is graded by this harness, so it has to exist before you can claim any improvement.
→ *Resources:* **RAGAS docs** — faithfulness, answer relevancy, context precision/recall · **Promptfoo docs** — prompt regression + A/B evaluation.
→ *Plan:* [PF-AI002](../../plans/done/learning/PF-AI002-llm-evaluation-framework.md)

**3. Text embeddings + vector databases** — *Chapter 3.*
What an embedding is, how semantic similarity works, and how a vector DB (pgvector, FAISS, ChromaDB) stores and queries them. This is the foundation the entire RAG topic stands on — you cannot retrieve before you can embed and index.
→ *Resource:* **Google Cloud Skills Boost** — *Vector Search and Embeddings*.
> Its own table of contents: Introduction → Vector search basics → Encode with embeddings → Index and search → Vertex AI Vector Search → RAG and grounded agent → Hybrid search → Summary. **Note:** this single course also covers topics #4 and #6 below — it does **not** cover observability or evals. That's why #1–#2 are taught by tool docs, not by this course. (If you only do one platform course in this layer, it's this one.)
→ *Plan:* [PF-AI003](../../plans/done/learning/PF-AI003-rag-embeddings-retrieval.md) · [PF-AI003b](../../plans/done/learning/PF-AI003b-embedding-provider-toggle.md)

**4. RAG core: chunk → retrieve → re-rank → grounded generation** — *Chapters 3–4.*
The end-to-end pipeline: chunking strategies, top-K retrieval, re-ranking the candidates, then grounded synthesis with citations and metadata filtering (account, date range, category). The #1 applied AI-Engineering skill in current JDs.
→ *Resources:* **Coursera (Activeloop / LlamaIndex)** — *Retrieval Augmented Generation with LlamaIndex* · **NVIDIA** — *Building RAG Agents with LLMs*.
→ *Plan:* [PF-AI004](../../plans/done/learning/PF-AI004-rag-reranking-generation.md)

**5. Streaming responses (SSE)** — *Chapter 5.*
Server-sent events / async generators so the answer renders token-by-token. A production-UX *pattern*, not a feature — and cheap to add once RAG works. Same chapter: swap polling status for event-driven updates (Supabase Realtime).
→ *Resource:* **FastAPI docs** — `StreamingResponse` / `sse-starlette`.
→ *Plan:* [PF-AI005](../../plans/done/learning/PF-AI005-streaming-sse-todo.md) · [PART2](../../plans/in-progress/learning/PF-AI005-PART2-answer-accuracy-todo.md)

**6. Advanced RAG: hybrid search, sentence-window, auto-merging** — *Chapter 6.*
Three accuracy techniques, each benchmarked with the harness from #2 — but **not on MRR@5.** The Chapter-3 baseline is already saturated at 1.000, so there is no MRR headroom to show. The real levers, straight from the Chapter 3–4 findings:
- **P@5** (0.657 baseline) — still has room; this is the metric hybrid search should move.
- **Faithfulness on superlative/aggregation questions** — "biggest expense in March" scored 0.50 because semantic top-K can't do MAX. Metadata filtering + a wider retrieval window is the fix to measure.
- **A rerank rematch** — the English-only FlashRank `ms-marco` model *demoted* correct Indonesian results (negative delta on `gaji bulanan`); swapping in FlashRank's multilingual model is the retry to benchmark.
→ *Plan:* [PF-AI006](../../plans/done/learning/PF-AI006-advanced-rag-patterns-todo.md) · [PART2 (cancelled)](../../plans/cancelled/learning/PF-AI006-PART2-sentence-window-automerging-todo.md)

Hybrid search (pgvector + Postgres `tsvector`) directly targets the terse bank-code misses (listrik, streaming, Mansek). Ship the winner by the numbers, not by which sounds most impressive. Keep RAGAS faithfulness in the loop as the second axis.

**Result (PF-AI006, done):** the chapter was re-scoped to hybrid search only. Hybrid BM25 + RRF **lost** to pure vector search (MRR@5 0.750 vs 0.771), so the default stays `vector`. A measured "the fancy option lost" result is a strong interview story. Sentence-window and auto-merging moved to PF-AI006-PART2, deferred until there is a product decision on statement-level Q&A.
→ *Resources:* the advanced sections of the **Google Cloud** and **LlamaIndex** courses above; hybrid search = pgvector + Postgres `tsvector`.

### Key skills (what you can claim after the Application layer)
- End-to-end RAG pipelines: chunking, embedding, retrieval, re-ranking, generation.
- Eval suites (golden sets, regression tests, faithfulness/relevance scoring).
- Tracing every LLM call (latency, cost, prompt/response, tool invocations).
- SSE / async generators for streaming UX.
- Serving with FastAPI. *Deployment* to a public URL is not claimable yet; it arrives in Chapter 9.75.

### Suggested cadence
- **Chapters 1–2** — Topics #1–#2: Langfuse + eval harness (Promptfoo / RAGAS basics).
- **Chapters 3–4** — Topics #3–#4: embeddings + pgvector retrieval + chunking + re-ranking.
- **Chapter 5** — Topic #5: streaming SSE + Realtime.
- **Chapter 6** — Topic #6: advanced RAG (hybrid, sentence-window, auto-merging) + faithfulness eval.

---

## The Specialization Layer (Agents & Orchestration) — Chapters 7–9

**Status:** 🎯 Critical path — Chapters 7–9. The Tier 3 → Tier 4 jump. As of 2026-10-17: Ch8 ✅. Ch7 🔄 (code shipped, smoke test 2 of 5). Agent evaluation (#9) is 🔄 and **has never run**. Ch9 MCP ⏳ runs after Ch9.5.

Move from reactive apps (answer a question) to agentic apps (take an action). The order is smallest-surface-first: tool-calling loops in smolagents (grok the Thought→Action→Observation cycle in a day), then LangGraph as "industrial smolagents" (state, routing, memory), then how to *evaluate* an agent, then MCP to expose your tools over a standard protocol. Everything you build here is logged to the Langfuse you installed in Chapter 1 — the traces are your demo material.

### Learning Order (study top to bottom)

**7. Tool-calling agents (smolagents)** — *Chapter 7.*
The Thought-Action-Observation loop on the smallest possible API surface. Build one agent with 2–3 tools and a visible reasoning trace before touching anything heavier.
Also decide how the loop ends: a maximum number of steps, a stop condition, and what the agent does when a tool keeps failing. Add these to the smoke test so a stuck agent fails loudly instead of burning quota.
→ *Resource:* **Hugging Face** — *Agents Course* (smolagents units).
→ *Plan:* [PF-AI007](../../plans/in-progress/learning/PF-AI007-tool-calling-agents-smolagents-todo.md)

**8. Stateful orchestration (LangGraph)** — *Chapter 8.*
State machines for multi-step workflows: a state object, conditional routing, checkpointer memory, and tool-failure fallback nodes. LangGraph is the dominant framework in current JDs — learn it as "smolagents with a real state graph."
→ *Resources:* **LangGraph official docs + tutorials** — state graphs, checkpointing, human-in-the-loop · **Coursera (IBM)** — *RAG and Agentic AI Professional Certificate* (LangGraph, CrewAI, MCP clients/servers).
→ *Plan:* [PF-AI008](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md)

**9. Agent evaluation** — *Chapter 8.*
Beyond extraction accuracy: tool-call accuracy (right tool, right args?) and a trajectory check over fixture scenarios, logged to Langfuse. This is the answer to *"how do you eval an agent?"* — a question most candidates can't answer. Reuses the Chapter-2 harness.
> **Open debt (2026-10-17):** PF-AI008 closed with the five scenarios in `evals/advisor_scenarios.json` written but never run, and the PF-AI007 smoke test sits at 2 of 5. Until both run, this topic is not claimable. Both need about one day of paid LLM quota (see Execution Rule 7). Add two realistic rows (e.g. `GOFOOD JKT`, `PLN PREPAID`) so the smoke test proves categorization, not string matching.
→ *Resources:* the Chapter-2 eval harness + **RAGAS**; **HF Agents Course** evaluation units.
→ *Plan:* [PF-AI008](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md) · [PF-AI010](../../plans/done/learning/PF-AI010-categorization-eval-harness-todo.md)

**10. Model Context Protocol (MCP)** — *Chapter 9.*
Anthropic's tool/agent interop standard, adopted across the industry. Build a server that exposes your domain tools, then connect a client (Claude Desktop). Server up first, spec later.
→ *Resources:* **Anthropic Academy** — *The MCP Series* and *Introduction to Agent Skills* · MCP quickstart + Python SDK.
→ *Plan:* [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md)

**11. Multi-agent over MCP (stretch)** — *Chapter 9 stretch.*
Wire one LangGraph tool to call the MCP server; a second sub-agent handles the MCP interaction. Multi-agent orchestration over a standard protocol — the interop boundary is explicit and inspectable in Langfuse.
Run it as a comparison, not a showcase (added 2026-11-10): the same advisor scenarios through the single agent and through the orchestrator-worker version, compared on answer quality, tokens and latency. The result is a "when not to use multi-agent" answer with numbers. It stays a stretch for Applied AI roles and becomes required only if you target Agentic titles, where multi-agent systems appear in about a quarter of postings.
→ *Resource:* **Anthropic** — *The MCP Series*.
→ *Plan:* [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) (stretch)

**15. Tool design** — *Chapter 9, added 2026-10-24 (PF-AI009 review checklist, section G2).*
The model never sees your code. It sees the tool name, the description and the parameter schema, and picks a tool from those alone. Mocked tests prove the wiring but can't show that the model chose the right tool. So do one pass on the four MCP tools, from the model's side: connect a client, ask the four demo questions, and check which tool it chose and which arguments it passed. Then rewrite whatever misled it. Three things to check on each tool: the description says when to use it and when not to; the parameters are named and typed (already done in PF-AI009); and an error tells the model what to do next, instead of a bare status code. Also ask whether four tools is the right number or whether two overlap.
→ *Resources:* **Anthropic** — *Writing effective tools for AI agents* (engineering blog) · MCP Inspector for testing a server without a client.
→ *Plan:* [PF-AI009](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) (section G2)

**16. Human-in-the-loop** — *Chapter 9, added 2026-10-24. Runs after the MCP server works.*
Today no agent in this project asks before acting. The categorizer agent can propose a category, so the first approval point goes there: a LangGraph `interrupt` before the write, so you see the suggestion with its confidence and reasoning, then accept, edit or reject it. The checkpointer from Chapter 8 already holds the paused state. The same chapter decides the split for MCP tools: the four existing tools are read-only and stay that way, and any future write tool needs an approval step on the client side. The point to be able to explain: where an approval is worth its friction (writes, money moving, hard to undo) and where it only slows things down (reads).
Also make the categorizer's write safe to retry (added 2026-11-10). A resumed or repeated run must not write the same category twice or overwrite a newer manual edit. This is the answer to the interview question about tool retries and idempotency.
→ *Resources:* **LangGraph docs** — human-in-the-loop and `interrupt` · the Chapter 8 checkpointer.
→ *Plan:* _no plan yet_ (follow-up to PF-AI009)

**18. Feedback loop from real use into the eval set** — *Chapter 9, added 2026-11-10. Ships with topic 16, about 2 days.*
Every eval set in this repo was written by hand, so the evals only know the cases you thought of. Meanwhile the upload preview already shows AI-suggested categories and lets you change them, and that correction is thrown away on submit. Keep it. On submit, record each AI-suggested row as description, suggested category, final category, model and prompt version. A small script turns the disagreements into new rows for `evals/categorize_cases.json` and re-runs the categorization eval. The approval step from topic 16 produces the same event (accept, edit or reject), which is why the two ship together.
Three smaller pieces belong here. Add a thumbs up or down on `/ask` answers that writes a Langfuse score. Generate one synthetic eval set for the categorizer with an LLM, review it by hand, and compare what it catches against the hand-written set. And since one user can't support an A/B test, use a shadow run instead: replay logged inputs through a candidate prompt and compare.
The point to be able to explain: explicit feedback (a thumb) is rare and biased, implicit feedback (the user changed the category) is frequent and honest, and both need a path back into the eval set.
→ *Resources:* **Eugene Yan** — *Patterns for Building LLM-based Systems & Products* (the data flywheel) · **Langfuse docs** — scores and user feedback · the Chapter 2 harness.
→ *Plan:* _no plan yet_ (same plan as topic 16)

### Key skills
Building specialists/sub-agents, state machines for long-running workflows, MCP servers/clients, frameworks (LangGraph, CrewAI, AutoGen, smolagents), agent observability and replay, tool design, approval points for agent writes, retry-safe agent writes, feedback capture that feeds the eval set.

### Suggested cadence
- **Chapters 7–8** — Topics #7–#9: smolagents → LangGraph → agent eval. First agent shipped.
- **Chapter 9** — Topics #10–#11: MCP server exposing domain tools, then the 2-agent + MCP workflow.

---

## The Production Hardening Layer (Security, Deployment, Evals in CI) — Chapters 9.5–9.75

**Status:** 🎯 Critical path, added 2026-10-17. Ch9.5 ✅ (PF-AI011, merged 2026-10-21). Ch9.75 ⏳ (PF-AI012, depends on PF-AI011).

Until now everything ran locally, and you were the only user. This layer covers what changes when an AI system faces untrusted input and a public network. It was missing from the original path because guardrails had been filed under "deferred MLOps". That was the wrong shelf. Current AI Engineer job posts list guardrails, cost control and continuous evaluation as core skills, not specializations. The order follows the same "measure first" rule as Chapters 1–2: attack your own system before you build defences, deploy before you optimize cost, and gate on evals before you call it production.

### Learning Order (study top to bottom)

**12. AI security + guardrails** — *Chapter 9.5 (PF-AI011). Runs before Chapter 9.*
Red-team your own `/ask` and categorizer agent first, then add defences. Direct and indirect prompt injection (a poisoned transfer memo retrieved by RAG), spotlighting retrieved data so the model treats it as data, input and output guards that also work on streamed answers, PII masking (NIK, phone, account, email) before text reaches the LLM, and a threat-model doc. The target is to block at least 80% of attacks, reported separately on held-out attacks, with zero false alarms on 20 normal Indonesian queries.
Why it jumps ahead of MCP: AI chat went live on real transactions on 2026-10-16, and an MCP server would add another untrusted entry point. Secure the existing surface before opening a new one.
→ *Resources:* **OWASP Top 10 for LLM Applications** · Langfuse docs (tagging flagged requests) · sequence diagrams in `docs/architecture/sequences/diagram-ai-security-governance-sequence.html`.
→ *Plan:* [PF-AI011](../../plans/done/learning/PF-AI011-ai-security-governance-todo.md)

**13. Deployment + LLMOps** — *Chapter 9.75 (PF-AI012).*
The AI service on a public URL (Azure Container Apps, ACR, GitHub Actions deploy, Supabase Cloud with anonymized data), protected by an API key, rate limits and a budget alert. Add a TTL response cache and write a one-page cost breakdown. This is what turns "I built it" into "I run it".
→ *Resources:* **Azure Container Apps** docs · **GitHub Actions** docs · Langfuse cost dashboards.
→ *Plan:* [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md)

**14. Evals in CI** — *Chapter 9.75, alongside the deploy pipeline.*
A small, cheap eval subset (a few extraction fixtures, a few RAG questions, a few injection attacks) that runs as a blocking gate in the existing PF-142 CI workflow, with a strict call budget. One-off evals prove a number once. A CI eval stops a regression from merging.
→ *Resources:* **Promptfoo** CI integration docs · the Chapter 2 harness · `.github/workflows/ci.yml`.
→ *Plan:* [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) · [PF-142](../../plans/done/PF-142-ci-workflow-existing-gates-todo.md)

**19. Cost and latency engineering** — *Chapter 9.75, added 2026-11-10. Inside PF-AI012, about 1.5 days.*
Topic 13 adds a cache and a cost page. This topic makes cost and speed something you measured and changed. Measure time to first token and per-step latency on `/ask/stream` and the advisor, so you know which step is slow before touching anything. Route categorization to the cheapest model that still passes its eval, and keep the stronger model for advice. Add a fallback to the second provider when the first returns a quota error: today the chat path stops on that error, and in October the same cap blocked three evals at once. Finish with a cost-per-query table and a back-of-envelope estimate for one million queries a day.
→ *Resources:* Langfuse cost dashboards · **Chip Huyen** — *Building a Generative AI Platform* (routing, caching, fallbacks) · the Chapter 5 streaming endpoint.
→ *Plan:* [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) (steps to be added)

**20. Model upgrade gated by evals** — *Chapter 9.75, added 2026-11-10. With topic 14, about half a day plus quota.*
A new model version is a regression risk until your own eval set says otherwise. Moving the advisor to a newer Gemini model is already an open PF-S15 follow-up, so use it: run the extraction and categorization evals on the old and new model, compare accuracy, cost and latency, and decide by the numbers. Write down the decision either way.
→ *Resources:* the Chapter 2 harness · the CI eval subset from topic 14.
→ *Plan:* [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) (steps to be added)

### Key skills
Prompt-injection defence, PII handling for LLM inputs, threat modeling for AI systems, deploying and securing an AI service, cost and rate controls, eval-gated CI, latency measurement, model routing and provider fallback, eval-gated model upgrades.

---

## Advanced Fine-Tuning & Generative MLOps (Production AI) — Deferred

**Status:** ⏸️ Deferred to month 4+. Retained for context — none of the target Staff/Senior AI Engineer roles in the current pipeline (Grafana, GitLab, Datadog, Anthropic, Intercom) require fine-tuning or SageMaker. Revisit only if a specific role demands it.

The lifecycle of deploying, scaling, evaluating, and fine-tuning models securely in the cloud. There's no Learning Order here on purpose — it's parked. Treat the list below as a *map of what exists* so you can spin one topic up fast if a JD asks for it.

### Deferred topics (reference only, not scheduled)
- **Core concepts:** LLM lifecycle, Parameter-Efficient Fine-Tuning (LoRA, QLoRA), model alignment (RLHF, DPO), evaluation frameworks at scale (lm-eval-harness), drift/bias detection.
- **Key skills:** Fine-tuning open-source models, drift/bias detection, training pipelines.
- *Moved out on 2026-10-17:* guardrails, cost/latency optimization and CI/CD for AI pipelines are now active work in the Production Hardening layer (Chapters 9.5–9.75). Only the training side stays deferred.
- **Resources (reference only):**
  - **AWS** — *Certified Machine Learning Engineer – Associate* and *Generative AI Developer – Professional* (SageMaker pipelines, Amazon Bedrock, enterprise guardrails). *Skip unless targeting AWS-shop roles.*
  - **DeepLearning.AI** — *Generative AI with Large Language Models* (transformer mechanics, full fine-tuning lifecycle).
  - **Hugging Face** — *LLM Course* (Transformers, Datasets, TRL).

### Chapters 10–12 (instead of starting this layer): Positioning & proof
- **Publish one blog post now, not at Chapter 10.** As of 2026-10-17, 2 drafts have sat since 2026-06-24 and nothing is published. Ship the eval-harness post in parallel with Chapter 9.5. The full blog post + demo video come after Chapter 9.75.
- **Agent-design write-ups (topic 17).** One page each on harness engineering, memory architecture and orchestration patterns. They describe what is already built, so this is writing, not study.
  - *Harness engineering:* the instructions, tools, context and rules an agent runs inside. The evidence is in this repo: `.claude/rules`, the skills, the `ai/` folder, the loop engine and its deny list.
  - *Memory architecture:* short-term (the checkpointer), long-term (owner-scoped memory per user, PF-S15) and the knowledge base (the transaction embeddings), and what writes to each.
  - *Orchestration patterns:* a short comparison of orchestrator-worker, sequential, parallel and handoff, and which one the Advisor and the 2-agent MCP demo actually use.
  - These feed the full blog post below.
- **AI case-study page in this repo (added 2026-11-10, about half a day).** A reviewer will not find the AI work quickly inside a five-module product. One page fixes that: problem, user, input, output, demo, architecture, tests, evaluation numbers and limitations, with links to the eval results, plus a 60-second pitch. Include one before-and-after example of a prompt changed because of an eval result. Report the guardrail hold-out result honestly: the pattern scanner blocked 0 of 4 held-out attacks, why pattern guards fail on unseen attacks, and what you would add next.
- Blog post + demo video on the RAG + Agent + security system shipped in Chapters 1–9.75.
- CV update with new proof points.
- Certification, if ROI is there (Databricks GenAI Engineer Associate or Azure AI-102). C#/.NET shows up in 13% of Agentic postings, which favours AI-102 if those teams are the target.
- Apply to roles in the pipeline (Datadog, Grafana, Anthropic, GitLab, Intercom).

### Chapter 11: interview practice (topics 21–23, added 2026-11-10)

Chapter 11 so far translated this project into stories. These three topics practice the rounds that a project can't cover.

**21. AI system design practice.** Six timed designs, 45 minutes each, spoken out loud and recorded: a document Q&A system at 10M documents, a chat assistant at 1M daily users (cost), a multi-step agent workflow (email or scheduling), a pipeline that processes 10K uploaded payslips and IDs a month (close to this project), cross-conversation memory, and policy-violation detection. Use the same five steps each time: frame the problem, sketch the architecture, deep dive (RAG, tools, memory, evaluation, safety), trade-offs and failure modes, then a summary with risks. The mistakes to avoid: no eval or monitoring plan, ignoring cost, putting control flow in prompts, and choosing agents because they are exciting.
→ *Resources:* **Chip Huyen** — *Building a Generative AI Platform* · two case studies first (Doctolib's agent graph, Uber's GenAI Gateway) · field guide `interview/questions/04-ai-system-design.md`.

**22. Timed greenfield take-homes.** Two mock take-homes, four hours each, built from an empty folder. One agentic (for example an inbox-triage agent with a human approval step) and one applied (a policy-document RAG with mandatory citations, a refusal path, and a 7-question eval across answerable, partly answerable and unanswerable). Start each with the eval harness. End each with a README of decisions and trade-offs and a 5-minute video, then defend it out loud: the defence round often counts for more than the code. Both become small public repos.
→ *Resource:* field guide `interview/questions/06-home-assignments.md` (official company challenges).

**23. Python live coding without AI tools.** Two 45-minute sessions a week, starting now and running in the background of every other chapter. Implementation problems built in levels (a KV store with TTL, a rate limiter, an LRU cache, a simple crawler), plus a short list of Python depth questions: the GIL, asyncio, concurrency vs parallelism. No AI tools during the session. Coordinate with any DSA practice already running for other interviews.
→ *Resource:* field guide `interview/questions/02-coding.md`.

**AI-specific behavioral answers.** Prepare three alongside the STAR stories: how you stay current, a recent AI development that caught your attention, and an AI solution that failed. The third is already in this repo twice (hybrid search losing to vector search, and the guardrail hold-out result).

---

## Concept coverage check (2026-10-24)

The path was checked against a list of ten agentic AI concepts ("10 Essential Agentic AI Concepts to Know in 2026"). Four were covered, three partly, and three were missing as named topics. This table shows where each one lives now.

| Concept | Where it lives | State |
|---|---|---|
| Harness engineering | Topic 17 write-up, built in this repo | ⏳ write-up |
| Loop engineering | Topic 7 (stop conditions added) | ⏳ add to smoke test |
| Context engineering | Skim section, topic 2 | ✅ one-page write-up still open |
| Tool design | Topic 15 | ⏳ |
| Memory architecture | Topic 8 (checkpointer) + topic 17 write-up | 🟡 practiced, not written |
| Orchestration patterns | Topics 8 and 11 + topic 17 write-up | 🟡 |
| Guardrails & permissions | Topic 12 (Ch9.5). Permissions: RLS and the signed owner token (PF-S15) | ✅ |
| Evals for agents | Topic 9 | 🔄 scenarios never run |
| Human-in-the-loop | Topic 16 | ⏳ |
| Observability & tracing | Topic 1 | ✅ |

---

## Field guide check (2026-11-10)

The path was checked against the AI Engineering Field Guide (job postings, interview reports and take-home repos), with Applied AI Engineer as the first target and Agentic AI Engineer as the second. The full analysis and the market numbers are in [field-guide-gap-analysis-2026-11-09.md](field-guide-gap-analysis-2026-11-09.md). This table shows where each gap lives now.

| Gap | Where it lives | State |
|---|---|---|
| Feedback loop from real use into the eval set | Topic 18 (Ch9, with topic 16) | ⏳ |
| Synthetic eval data | Topic 18 | ⏳ |
| Cost and latency engineering | Topic 19 (Ch9.75) | ⏳ |
| Model upgrades gated by evals | Topic 20 (Ch9.75) | ⏳ |
| AI system design round | Topic 21 (Ch11) | ⏳ |
| Timed greenfield take-home | Topic 22 (Ch11) | ⏳ |
| Python live coding without AI tools | Topic 23 (background, from now) | 🔄 |
| LLM fundamentals and the fine-tuning answer | Topic 24 (skim) | ⏳ |
| Agent evaluation | Topic 9, still the first thing to close | 🔄 scenarios never run |
| Multi-agent, measured | Topic 11 (stretch, required for Agentic titles) | ⏳ |
| Agent reliability (retries, idempotency) | Topics 7 and 16 | ⏳ |
| Public proof | Ch10 case-study page and the first published post | ⏳ |
| Prompt change driven by an eval | Ch10 case-study page | ⏳ write-up |
| AI-specific behavioral answers | Ch11 | ⏳ |

Still skipped on purpose: fine-tuning projects, PyTorch and training-side MLOps, more agent frameworks, AWS and Kubernetes depth, voice and realtime, and Forward Deployed roles (mostly customer-facing, which conflicts with the remote, async-first target).

---

## Execution Rules

1. **Follow the Learning Order, not the resource catalog.** The numbered topics are the path. Courses are references attached to a step — a single course may span several topics, and some topics live only in tool docs.
2. **One concept → one Personal Finance commit, same day.** No deferral, no toy scripts.
3. **The Foundations layer is a skim, not a study block.** Use it as a reference map; don't sit through the courses.
4. **The Application, Specialization and Production Hardening layers (Chapters 1–9.75) are non-negotiable.** They close every critical gap (RAG, evals, observability, agents, MCP, security, deployment).
5. **The Fine-Tuning layer stays on the shelf** until a target JD demands it. Don't burn weeks on an AWS ML cert for roles that don't ask for it.
6. **Use-case mapping lives in Personal Finance**, not in this doc. Each layer gets a "what we built and why" page in that repo, with links back to the commits and the curriculum item that motivated them.
7. **Budget the LLM calls.** A curriculum built on measured numbers can't run on a free tier of 20 requests a day. In October 2026 that cap blocked three evals at once. Keep a small paid budget (Gemini billing or an Anthropic key) with a hard spend alert, and size every eval run in calls before starting it.
8. **Re-audit a plan before executing it if the platform changed after it was written.** PF-AI011 was written before auth landed, and would have broken if run as written. Check the plan's date against the last platform change (auth, schema, provider) first.
9. **A chapter isn't done until its live gate ran.** Mocked tests prove wiring. Only a live run proves the claim. Close a chapter with its live gate deferred only explicitly, and keep that gate visible in the Topic Index (as with agent evaluation, #9).

---

## Remaining schedule (re-baselined 2026-10-17)

The original 90-day clock ran out at Day 90 (~2026-08-24). This replaces it. The targets are planning estimates, not commitments, and should be revised at each weekly review.

| Order | Chapter | Work | Plan | Target finish |
|---|---|---|---|---|
| 1 | Ch7 + #9 | Close the smoke test (5 of 5) and run the five agent scenarios; finish the PF-AI005-PART2 numeric eval | PF-AI007, PF-AI008 follow-up, PF-AI005-PART2 | 2026-10-24 |
| 2 | Ch9.5 | AI security + guardrails | PF-AI011 (Done 2026-10-21) | 2026-11-07 |
| — | Ch10 (early) | Publish the eval-harness blog post, in parallel | `docs/ideas/blogs/` | 2026-11-07 |
| 3 | Ch9 | MCP server + client, with the tool-design pass (#15), the human-in-the-loop approval step on the categorizer agent with a retry-safe write (#16), and the feedback loop (#18). Multi-agent stays a stretch | PF-AI009 (checklist section G2) + one follow-up plan for #16 and #18 | 2026-11-28 |
| 4 | Ch9.75 | Deployment + LLMOps + evals in CI, with cost and latency engineering (#19) and the eval-gated model upgrade (#20) | PF-AI012 | 2026-12-12 |
| 5 | Ch10–11 | Case-study page, full blog + demo (with the three agent-design write-ups, #17), certification decision, STAR stories and behavioral answers, LLM fundamentals (#24), six system designs (#21), two take-homes (#22) | — | 2027-01-09 |
| 6 | Ch12 | Active applications | career-ops | from 2027-01 |
| background | Ch11 | Python live coding without AI tools (#23), two 45-minute sessions a week | — | from 2026-11-10 |

Dates for rows 3–6 moved on 2026-11-10 to absorb topics 18–24 (about four build days and roughly twenty hours of interview practice). Row 1 is past its target and is still the first thing to close.
