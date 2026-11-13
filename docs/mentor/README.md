# /mentor — AI Engineering Pivot Coach

Your daily structured guide for transitioning from Backend Engineering to AI Engineering within 90 days.

**Started:** 2026-05-27 · **Target:** ~2026-08-25

---

## Quick Start

Open any chat in this project and type:

```
/mentor
```

That's it. It reads your progress, figures out where you are in the 90-day plan, and tells you what to do today.

---

## Commands

| Command | When to use |
|---|---|
| `/mentor` | Every morning — get today's focus |
| `/mentor today` | Same as above |
| `/mentor log <what you did>` | Every time you finish something — keep the log alive |
| `/mentor status` | When you want the full picture — all phases, all tasks |
| `/mentor weekly` | Sunday night or Monday morning — review the last 7 days + plan the chapter remainder |
| `/mentor plan` | When you want to see the full 30/60/90 roadmap |
| `/mentor cert <name>` | Before buying any course or certification |
| `/mentor gap` | Re-assess how your skills stack up against AI Eng JDs |

---

## The 90-Day Plan (overview)

12 chapters across 3 phases. Chapters are paced by progress, not calendar weeks.

### Phase 1 — Foundation + RAG (Days 1–30)
| Chapter | Theme | Goal |
|---|---|---|
| 1 | AI Observability + Real Metrics | Add Langfuse; quote cost-per-doc and p95 latency |
| 2 | LLM Evaluation Framework | Build eval harness; benchmark Gemini vs Claude |
| 3 | RAG — Embeddings + Retrieval | pgvector semantic search with MRR@5 measured |
| 4 | RAG — Chunking, Re-ranking, Generation | `POST /ask` grounded answers with citations + measured MRR lift |

### Phase 2 — Streaming + Agents (Days 31–60)
| Chapter | Theme | Goal |
|---|---|---|
| 5 | Streaming + Production UX | SSE streaming end-to-end (FastAPI → React) |
| 6 | Advanced RAG Patterns | Sentence-window, auto-merging, hybrid search — measured winner |
| 7 | First Agent — smolagents | Transaction Categorizer Agent with Langfuse traces |
| 8 | LangGraph Multi-Agent | Financial Health Advisor agent with tool use |

### Phase 3 — MCP + Positioning + Apply (Days 61–90)
| Chapter | Theme | Goal |
|---|---|---|
| 9 | Model Context Protocol (MCP) | Personal-finance MCP server callable from Claude Desktop |
| 10 | Public Presence + Certification | Blog post live + Databricks or Azure AI-102 cert passed |
| 11 | Interview Prep | 5 STAR stories + 3 deep-dives rehearsed |
| 12 | Active Applications | 5+ high-fit applications sent |

Full detail: [`.agents/skills/mentor/learning-path.md`](../../.agents/skills/mentor/learning-path.md)

---

## Files

```
docs/mentor/
  README.md                      ← you are here (canonical mentor README)
  progress.md                    ← your live log — CANONICAL, the skill reads and writes this
  ai-engineer-learning-path.md   ← compiled curriculum reference (phases, topics, resources)
  ai-engineer-learning-tips.md   ← daily loop, retrieval/interleaving protocol, anti-patterns
  ai-engineer-learning-tips-id.md← Indonesian translation of the tips doc
  ai-engineering-usecase-map.md  ← AI engineering use-case map
  cert-path-*.md                 ← certification paths
  topics/                        ← topic docs (numbered in reading order: each builds on the ones before it)
    01-llm-fundamentals.md             ← tokens, attention, KV cache, sampling, context window
    02-llm-api-structured-output.md    ← API request/response, tool_use, JSON mode
    03-prompt-engineering.md           ← prompt iteration, testing, versioning
    04-context-engineering-prompt-caching.md ← what enters the context window, prompt caching
    05-rag-knowledge-retrieval.md      ← RAG: retrieval, re-ranking, grounded answers
    06-ai-agents-and-agentic-workflows.md ← tool-calling agents, orchestration
    07-model-serving-inference-pipelines.md ← model serving, inference pipelines
    08-fine-tuned-llms.md              ← when to fine-tune vs prompt vs RAG
    advanced-rag-notes.md              ← PF-AI006 measured results
  resources/                     ← shared glossary, interactive diagrams, run evidence (was plans/resources/learning)
  quizzes/                       ← one HTML quiz per chapter, plus the Anki deck
  images/                        ← reference pictures

.agents/skills/mentor/
  SKILL.md          ← skill brain (modes, rules, prompts)
  learning-path.md  ← chapter-by-chapter 30/60/90 day curriculum with resources

.claude/skills/mentor/
  SKILL.md          ← redirect (makes /mentor work in Claude Code)
  README.md         ← short pointer to this file

plans/<status>/learning/
  PF-AI00x-*.md     ← the learning plans (tickets) and their "-id" versi belajar, side by side
```

**Where each kind of file lives.** The plan is a ticket, so it moves between `plans/<status>/learning/` as its status changes. The Indonesian `-id` version stays in the same folder as the plan it translates and moves with it. Everything that outlives the ticket (glossary, diagrams, evidence, quizzes, topic docs) lives here in `docs/mentor/`.

## Chapter map

One row per learning plan. When a plan changes status folder, update its row here.

| Plan | Plan + versi belajar (`-id`) | Quiz | Diagram / topic doc |
|---|---|---|---|
| PF-AI001 AI observability | [plan](../../plans/done/learning/PF-AI001-ai-observability.md) | [quiz](quizzes/pf-ai001-ai-observability.html) | |
| PF-AI002 LLM evaluation | [plan](../../plans/done/learning/PF-AI002-llm-evaluation-framework.md) · [id](../../plans/done/learning/PF-AI002-llm-evaluation-framework-id.md) | [quiz](quizzes/pf-ai002-llm-evaluation-framework.html) | |
| PF-AI003 RAG embeddings + retrieval | [plan](../../plans/done/learning/PF-AI003-rag-embeddings-retrieval.md) · [003b toggle](../../plans/done/learning/PF-AI003b-embedding-provider-toggle.md) | [quiz](quizzes/pf-ai003-rag-embeddings-retrieval.html) | [topic 05](topics/05-rag-knowledge-retrieval.md) |
| PF-AI004 RAG re-ranking + generation | [plan](../../plans/done/learning/PF-AI004-rag-reranking-generation.md) · [id](../../plans/done/learning/PF-AI004-rag-reranking-generation-id.md) | [quiz](quizzes/pf-ai004-rag-reranking-generation.html) | [glossary](resources/glossary-rag-id.md) |
| PF-AI005 Streaming (SSE) | [plan](../../plans/done/learning/PF-AI005-streaming-sse-todo.md) · [id](../../plans/done/learning/PF-AI005-streaming-sse-todo-id.md) · [chat flow id](../../plans/done/learning/PF-AI005-chat-flow-diagram-id.md) | [quiz](quizzes/pf-ai005-streaming-sse.html) | |
| PF-AI005 Part 2 answer accuracy | [plan](../../plans/in-progress/learning/PF-AI005-PART2-answer-accuracy-todo.md) | [quiz](quizzes/pf-ai005-part2-answer-accuracy.html) | |
| PF-AI006 Advanced RAG patterns | [plan](../../plans/done/learning/PF-AI006-advanced-rag-patterns-todo.md) · [id](../../plans/done/learning/PF-AI006-advanced-rag-patterns-todo-id.md) · [id v2](../../plans/done/learning/PF-AI006-advanced-rag-patterns-todo-id-v2.md) | [quiz](quizzes/pf-ai006-advanced-rag-patterns.html) | [diagram](resources/diagram-pf-ai006-rag-patterns.html) · [notes](topics/advanced-rag-notes.md) |
| PF-AI007 Tool-calling agents | [plan](../../plans/in-progress/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) · [id](../../plans/in-progress/learning/PF-AI007-tool-calling-agents-smolagents-todo-id.md) | [quiz](quizzes/pf-ai007-tool-calling-agents-smolagents.html) | [diagram](resources/diagram-pf-ai007-agent-loop.html) · [topic 06](topics/06-ai-agents-and-agentic-workflows.md) |
| PF-AI008 LangGraph advisor | [plan](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md) · [id](../../plans/done/learning/PF-AI008-langgraph-financial-advisor-id.md) | [quiz](quizzes/pf-ai008-langgraph-financial-advisor.html) | [diagram](resources/PF-AI008-langgraph-advisor-diagram.html) · [evidence](resources/evidence/) |
| PF-AI009 MCP server | [plan](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo.md) · [id](../../plans/done/learning/PF-AI009-mcp-personal-finance-server-todo-id.md) | [quiz](quizzes/pf-ai009-mcp-personal-finance-server.html) | |
| PF-AI010 Categorization eval harness | [plan](../../plans/done/learning/PF-AI010-categorization-eval-harness-todo.md) | | |
| PF-AI011 AI security + governance | [plan](../../plans/done/learning/PF-AI011-ai-security-governance-todo.md) | [quiz](quizzes/pf-ai011-ai-security-governance.html) | [threat model](../operations/ai-threat-model.md) |
| PF-AI012 Deployment + LLMOps | [plan](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) | [quiz](quizzes/pf-ai012-deployment-llmops.html) | |

---

## The Progress Log

`docs/mentor/progress.md` is your source of truth. The skill reads it every time you run `/mentor` to figure out where you are and what's next.

**Keep it alive by logging regularly:**

```
/mentor log finished Langfuse integration — cost tracking live, p95 latency 1.2s
/mentor log completed eval harness: 92% accuracy on Gemini, 89% on Claude, Gemini 38% cheaper
/mentor log recorded Loom demo and published to YouTube (unlisted)
```

The more you log, the smarter the daily focus gets. If you go silent for a few days, `/mentor today` will notice and recalibrate.

---

## Why This Skill Exists

After scanning JDs at target companies (Grafana, Supabase, GitLab, PostHog, WorkOS, 1Password), C#/.NET backend roles are nearly absent. These companies run Python, Go, and Rust. Waiting for a C# role at an async-first company is not a viable strategy.

The pivot is: **Backend Engineer (C#/.NET) → AI Engineering / Backend AI Engineering** — using the Personal Finance Platform as the primary proof point and closing specific gaps (agentic frameworks, RAG, LLM eval, AI observability) in a deliberate 90-day sequence.

The skill was built to give daily structure so the pivot doesn't get lost in day-to-day work.

---

## Canonical Progress Location

`docs/mentor/progress.md` in **this project (personal-finance)** is the canonical progress log — always. Run `/mentor` and `/mentor log` from here; the skill never reads or writes progress anywhere else.

Any sync to the `career-ops` project is handled separately and is out of scope for this skill.

---

## Certification Guide (summary)

**Free first — always:**
- DeepLearning.AI short courses (LangChain, LangGraph, RAG) — slotted across Chapters 6–8, ~10h total

**Pick one paid cert (Chapter 10):**
- **Databricks GenAI Engineer Associate** (~$200) — highest signal for AI Eng roles
- **Azure AI Engineer Associate AI-102** (~$165) — good if targeting Azure-stack companies; builds on your existing Azure background

**Skip:**
- AWS ML Specialty, generic cloud certs, long ML specializations — wrong signal for this pivot

Full cert evaluation: `/mentor cert <name>` for any specific cert you're considering.
