# PF-AI013 — Agent-Design Write-Ups (Harness Engineering, Memory Architecture, Orchestration Patterns)

> **Learning Phase:** Phase 3 · Chapter 13 · topic 17 of the learning path
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Depends on:** nothing hard. Topics 11 (multi-agent) and 16 (human-in-the-loop) are not built; the pages say so and get a one-line update when those land.
> **Board objective:** Three one-page write-ups that name the agent design already built here, so each becomes a ready interview answer backed by real code and numbers.
> **Pivot goal:** Harness engineering, memory architecture and orchestration patterns are all built or practiced in this repo but never named. The named version is the interview answer.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [📌 Notes](#-notes)
- [📝 Knowledge Check](#-knowledge-check)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

---

# 📖 Introduction

## High level — what is this?

A writing task, not a build. Three pages, one concept each, every claim tied to a file in this repo.

| Concept | Plain definition | Where it already exists here |
|---|---|---|
| **Harness engineering** | Everything around the model that is not the model: limits, timeouts, error paths, permissions, guardrails, tracing, and the rules a coding agent works under. | Advisor call cap and fallback node, categorizer step cap, guardrails, the signed owner token, Langfuse tracing; for the coding agent: `.claude/rules/`, skills, the plan-complete hook, `.claude/loop.json` with its separate verifier. |
| **Memory architecture** | What an agent remembers, for how long, keyed by what, and what it forgets. | The advisor's LangGraph checkpointer keyed by owner plus session; pgvector transaction embeddings; category rules; the coding agent's `MEMORY.md` and plan files. |
| **Orchestration patterns** | How model calls are arranged: a fixed chain, a router, a loop that picks its own tools, or several agents. | The `/ask` query planner (routing), retrieve → rerank → answer (chaining), the advisor and the categorizer (tool loops), the loop's verifier (evaluator). Orchestrator-worker is not built. |

## 📚 Resources / Theory to Learn

- Anthropic: *Building effective agents* — the workflow vs agent split and the five workflow patterns. This is the vocabulary for the orchestration page.
- Anthropic: *Effective context engineering for AI agents* — context as a budget, compaction, note-taking, sub-agents. This is the vocabulary for the memory page.
- [docs/mentor/topics/06-ai-agents-and-agentic-workflows.md](../../../docs/mentor/topics/06-ai-agents-and-agentic-workflows.md) — Part 3 ("What actually goes wrong") is the source for real failures.
- [docs/mentor/topics/04-context-engineering-prompt-caching.md](../../../docs/mentor/topics/04-context-engineering-prompt-caching.md) — the sibling write-up on context; link to it, do not repeat it.

## 🧠 Learning Strategy

Evidence before prose. A page that says "the advisor has memory" is weaker than one that says "memory is an in-process `MemorySaver` keyed `owner:session`, lost on restart, and here is what I would replace it with". The second one survives a follow-up question. So the order is: read the two articles for the names, collect facts from the code, then write.

---

# 🔧 Implementation

## 🎯 Objective

Produce three one-page topic docs that name and explain the agent design already in this repo, each ending in a 60-second spoken answer. They close the three "write-up" rows in the concept coverage check and feed the Chapter 13 case-study page and the Chapter 14 interview prep.

## ✅ Acceptance Criteria

- [ ] Three pages exist in `docs/mentor/topics/`: `agent-design-harness-engineering.md`, `agent-design-memory-architecture.md`, `agent-design-orchestration-patterns.md`.
- [ ] Each page follows the topic-doc rule in `ai/learn/style.md`: `## What it is` opens with a plain two-sentence definition, then a real artifact from this codebase.
- [ ] Each page is 450–650 words above its `## Evidence` heading (one printed page).
- [ ] Every factual claim about this repo has a row in the page's Evidence table pointing at a file that exists; no row cites a secret, a key or real transaction text.
- [ ] Each page states plainly what is not built (persistent checkpointer, history trimming, orchestrator-worker, human-in-the-loop) instead of implying it exists.
- [ ] Each page names at least one real failure from this project and one thing to change next.
- [ ] Each page ends its body with `## The 60-second answer`, and the owner has said all three aloud from memory, timed, and rewritten them in their own words.
- [ ] The learning path (row 17 and the concept coverage table), `docs/mentor/README.md` and `docs/mentor/progress.md` reflect the finished write-ups.

## 🧭 Approach

Evidence first, fixed skeleton. Collect verified facts from `services/ai-service/app/agents/`, `app/services/` and `.claude/` before writing a sentence, then write each page to the same skeleton so the three read as a set. The executor drafts; the owner does the recall test and rewrites the spoken answers, because a page the owner cannot say aloud has not done its job. Out of scope: any code change, the context-engineering write-up (topic 04 task 1), the Chapter 13 case-study page, an Indonesian `-id` companion (the pages themselves are the learning material), and publishing.

## 📂 Affected Files

| File | Change |
|------|--------|
| `docs/mentor/topics/agent-design-harness-engineering.md` | Create — one-page write-up |
| `docs/mentor/topics/agent-design-memory-architecture.md` | Create — one-page write-up |
| `docs/mentor/topics/agent-design-orchestration-patterns.md` | Create — one-page write-up |
| `docs/mentor/ai-engineer-learning-path.md` | Edit — row 17 status and link; concept coverage rows for harness, memory, orchestration |
| `docs/mentor/README.md` | Edit — chapter map row for PF-AI013 and links to the three pages |
| `docs/mentor/progress.md` | Edit — log entry for the session(s) |
| `docs/INDEX.md` | Edit — only if it lists individual topic docs |

---

## 📋 TODO

### [ ] STEP 0 — Theory gate: read the two articles (1h, owner)

Read *Building effective agents* and *Effective context engineering for AI agents*. While reading, write down from memory afterwards:

- the difference between a workflow and an agent, in one sentence;
- the five workflow patterns (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer);
- three ways to keep a long-running agent inside its context budget (compaction, structured notes, sub-agents).

> **Why:** the pages must use the names an interviewer uses. Without the vocabulary, the evidence in STEP 1 has nothing to hang on.
> **Check:** you can list the five patterns without looking.

---

### [ ] STEP 1 — Collect the evidence from the code

Run these from the repo root and keep the output open while writing. Confirm each "expected" fact; if one is no longer true, the page uses what the code says today.

```bash
# Harness: limits, timeouts, error paths
grep -n "MAX_MODEL_CALLS\|MODEL_TIMEOUT_SECONDS\|GRAPH_RECURSION_LIMIT\|MAX_RETRIES" services/ai-service/app/agents/chat_model_factory.py
grep -n "advisor_call_limit\|advisor_tool_error\|advisor_provider_error\|handle_tool_errors" services/ai-service/app/agents/financial_advisor.py
grep -n "max_steps\|AgentRateLimitedError\|mask_pii" services/ai-service/app/agents/categorizer_agent.py
grep -n "^class \|^def \|^async def " services/ai-service/app/services/guardrails.py services/ai-service/app/owner.py
grep -n "verifier\|budget" .claude/loop.json
ls .claude/rules .claude/hooks .claude/skills

# Memory: what is stored, keyed by what
grep -n "MemorySaver\|checkpointer" services/ai-service/app/agents/financial_advisor.py
grep -n "thread_id" services/ai-service/app/services/advisor.py
cat services/ai-service/app/agents/state.py
grep -rn "trim_messages\|summar" services/ai-service/app/agents/ || echo "no trimming or summarization in the agent code"
grep -n "session\|history" services/ai-service/app/services/answerer.py | head -20

# Orchestration: chain, router, loops
grep -n "^class \|def " services/ai-service/app/services/query_planner.py
grep -n "add_node\|add_edge\|add_conditional_edges" services/ai-service/app/agents/financial_advisor.py
grep -n "planner\|aggregator\|rerank\|retriever" services/ai-service/app/main.py | head -30
```

Expected facts as of 2026-11-14 (verify, do not copy blindly):

| Fact | Where |
|---|---|
| Advisor stops after 4 model calls, 30 s per call, recursion limit `2 * 4 + 3 = 11` | `app/agents/chat_model_factory.py` |
| Three named error states route to a `fallback` node that also closes unanswered tool calls so saved history stays valid | `app/agents/financial_advisor.py` |
| A hit on the recursion limit is caught and the saved turn is finished through the fallback | `app/services/advisor.py` |
| Categorizer agent is capped at `max_steps=3`, masks PII, and raises a distinct error when the provider quota is exhausted | `app/agents/categorizer_agent.py` |
| Advisor memory is an in-process `MemorySaver`, keyed `"{owner_id}:{session_id}"` | `financial_advisor.py`, `advisor.py` |
| No trimming or summarization of advisor history | grep returns nothing |
| Advisor graph is `agent ⇄ tools`, with `fallback` and `END` as exits | `financial_advisor.py` |
| `/ask` routes a question through a query planner to SQL aggregation or retrieval | `app/services/query_planner.py`, `aggregator.py`, `main.py` |
| The loop runs a separate verifier against acceptance criteria | `.claude/loop.json` |

Also pull real failures from topic 06 Part 3, the PF-AI008 plan notes (Gemini 3 tool round trip, quota block), the PF-AI009 result (7/8 direct attacks blocked, 0/4 hold-out) and PF-AI006 (hybrid search lost to vector, MRR@5 0.750 vs 0.771). Use only failures recorded in the repo.

> **Why:** the style guide requires every hook to carry a verified fact about this repo. Collecting first also surfaces the honest gaps (memory lost on restart, no trimming), which are the best material on each page.
> **Check:** every row in the table above is confirmed or corrected, and you have at least one recorded failure per page.

---

### [ ] STEP 2 — Create the three pages from one skeleton

Create each file with this skeleton, replacing the bracketed parts. Keep the headings and their order identical across the three pages.

```markdown
# [Harness Engineering | Memory Architecture | Orchestration Patterns]

> One-page write-up for learning-path topic 17 (PF-AI013). Written [YYYY-MM-DD].
> Sources: Anthropic, *Building effective agents* and *Effective context engineering for AI agents*.
> Sibling pages: [harness](agent-design-harness-engineering.md) · [memory](agent-design-memory-architecture.md) · [orchestration](agent-design-orchestration-patterns.md)

## What it is

[Two sentences: a plain definition. Then one real artifact from this codebase, by file. Then one sentence on why it matters.]

### What it's used for

| Job in this project | Mechanism | Where |
|---|---|---|
| [...] | [...] | [file] |

## How it works here

[One or two short paragraphs. Numbers and names from STEP 1.]

## What went wrong, and what changed

[Only failures that really happened in this repo, with the fix or the decision.]

## What I would change next

[One to three items. Unbuilt things are named as unbuilt.]

## The 60-second answer

[About 130 words, written to be spoken. Definition, one concrete example with a number, one trade-off, one next step.]

## Evidence

| Claim | File |
|---|---|
| [...] | [repo-relative path] |
```

> **Why:** one skeleton makes the three pages a set, puts the definition first as `ai/learn/style.md` requires for topic docs, and keeps the evidence out of the word budget.
> **Check:** `ls docs/mentor/topics/agent-design-*.md` lists three files.

---

### [ ] STEP 3 — Write the harness engineering page

Content to cover, in the skeleton's order:

- **Definition:** the harness is everything around the model that decides what it may do, how long it may run, what happens when it fails, and what gets recorded.
- **Two harnesses in this repo.** The runtime one around the product's agents: model-call cap, per-call timeout, recursion limit, named error states with a fallback node, tool errors that stop the loop instead of being re-read by the model, the categorizer step cap, PII masking, the injection scanner and output guard, the signed 60-second owner token with RLS, Langfuse tracing on every node. The development one around the coding agent: rules that load by file path, skills, the plan-complete hook, isolated worktrees, and a verifier that is a separate agent from the one that did the work.
- **Failures:** pick from the Gemini quota block that stalled three chapters' evals, the advisor tool round trip on Gemini 3, the guardrail hold-out result (0 of 4).
- **Next:** the human approval step before the categorizer writes (topic 16), retries that are safe to repeat, evals in CI (PF-AI012).

> **Why:** interviewers ask "how do you stop an agent from running away or doing damage?" The answer is a list of limits with numbers, and this repo has them.
> **Check:** the page names the call cap, the timeout and the step cap with their actual values, and each appears in the Evidence table.

---

### [ ] STEP 4 — Write the memory architecture page

Content to cover:

- **Definition:** memory is what an agent can read that it did not receive in the current request, sorted by how long it lives and what it is keyed by.
- **The layers here**, as the "used for" table: within one request (graph state: messages, model-call counter, error); across turns in a session (the checkpointer, keyed owner plus session, so another user's session id opens an empty thread); long-lived knowledge about the user's history (transaction embeddings in pgvector, read by similarity search); learned behaviour (category rules); and, for the coding agent, `MEMORY.md` and the plan files. Confirm in STEP 1 whether `/ask` keeps any history and state what you find.
- **The honest limits:** `MemorySaver` lives in the process, so a restart or a second worker loses the conversation; nothing trims or summarizes history, so a long session grows without bound.
- **Failure:** the PF-S15 isolation work, where memory had to be re-keyed by owner so sessions could not cross users; the fallback that pairs unanswered tool calls so a saved thread is still valid on the next turn.
- **Next:** a Postgres checkpointer, a history cap or summary, and a decision on whether the advisor needs cross-session memory at all.

> **Why:** "the agent has memory" is a claim; "it is keyed owner plus session, in process, with no trimming, and here is the replacement" is an architecture answer.
> **Check:** the page says in plain words that advisor memory does not survive a restart.

---

### [ ] STEP 5 — Write the orchestration patterns page

Content to cover:

- **Definition:** orchestration is how model calls are arranged. A workflow follows a path written in code; an agent chooses its own next step in a loop.
- **Pattern map** as the "used for" table, one row per pattern with "built", "partly" or "not built":

| Pattern | Here |
|---|---|
| Prompt chaining | retrieve → rerank → answer → follow-up suggestions on `/ask` |
| Routing | the query planner sending a question to SQL aggregation or retrieval |
| Tool loop (single agent) | the advisor (LangGraph) and the categorizer (smolagents) |
| Evaluator | the loop's separate verifier, in the development harness, not the product |
| Parallelization | verify in the code; say "not built" if absent |
| Orchestrator-workers | not built (topic 11, stretch) |

- **The rule used to choose:** the simplest arrangement that passes the eval. Routing was added to `/ask` because retrieval alone invented totals (PF-AI005-PART2); the categorizer agent did not replace the rule-based upload pipeline.
- **Failure:** the fabricated February total that led to routing; hybrid search losing to plain vector search when measured.
- **Next:** the measured single-agent vs orchestrator-worker comparison (topic 11), so "when not to use multi-agent" has numbers.

> **Why:** the common interview trap is describing everything as "an agent". Showing which parts are fixed workflows and why is the stronger answer.
> **Check:** every pattern row carries built, partly or not built, and no unbuilt pattern is described in the present tense.

---

### [ ] STEP 6 — Length and link check

```bash
for f in docs/mentor/topics/agent-design-*.md; do
  echo "$f: $(sed '/^## Evidence/,$d' "$f" | wc -w) words"
done
grep -o "](\([^)#]*\)" docs/mentor/topics/agent-design-*.md | sort -u
grep -n -i "api[_-]\?key\|secret\|eyJ" docs/mentor/topics/agent-design-*.md || echo "no secrets"
```

Cut until each page is between 450 and 650 words. Open each linked path once to confirm it exists.

> **Why:** "one page each" is the deliverable. A page that runs long stops being an answer and becomes a chapter.
> **Check:** three word counts inside 450–650, every link resolves, and the last command prints `no secrets`.

---

### [ ] STEP 7 — Recall test and rewrite (owner, 45 min)

For each page: close it, start a timer, and say the 60-second answer aloud. Record yourself once. Then reopen the page and rewrite the `## The 60-second answer` section in the words you actually used, fixing anything you got wrong.

> **Why:** the pages are drafted from the code; the interview answer has to come out of your mouth. Rewriting in your own words is the step that turns a document into a skill.
> **Check:** three answers, each between 45 and 90 seconds, and each page's final section is in your wording.

---

### [ ] STEP 8 — Update the learning records

- `docs/mentor/ai-engineer-learning-path.md`: row 17 status to ✅ and its last cell to the PF-AI013 plan link; in the concept coverage table set Harness engineering, Memory architecture and Orchestration patterns to ✅ with links to the pages.
- `docs/mentor/README.md`: add the PF-AI013 row to the chapter map.
- `docs/mentor/progress.md`: log only what was done in the session.
- `docs/INDEX.md`: add the three pages if it lists topic docs individually.
- Move this plan to `plans/done/learning/`, then regenerate the board:

```bash
node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write
```

> **Why:** the learning path is where the next session decides what to do. A finished write-up that still shows ⏳ gets planned twice.
> **Check:** `grep -n "PF-AI013" docs/mentor/ai-engineer-learning-path.md docs/mentor/README.md plans/BOARD.md` returns a hit in each file.

---

## 📌 Notes

- Facts in STEP 1 were read from the code on 2026-11-14. Topic 16 (human-in-the-loop) and topic 11 (multi-agent) will change the harness and orchestration pages; update the "not built" lines when they ship.
- The context-engineering one-pager (topic 04, task 1) is a separate small task. Link to topic 04 from the memory page and do not duplicate it.
- These pages are inputs to the Chapter 13 case-study page and to the Chapter 14 STAR stories. Keep them factual; the storytelling happens there.
- No Concept Map or Experiments section: nothing new is being built, so there is nothing to experiment on.

---

# 📝 Knowledge Check

1. The advisor hits its model-call cap in the middle of a batch of tool calls. What does the fallback node do, and why does it matter for the next turn?
2. Two users send the same `session_id`. What happens, and which line makes it so?
3. The AI service restarts. What does the advisor remember? What would you change to fix that?
4. Is `/ask` a workflow or an agent? Is the advisor? Give the one-sentence test you used.
5. Name one pattern from *Building effective agents* that is not built here and say what evidence would justify building it.

---

# 🧾 Owner Review Checklist

- [ ] Each page fits on one printed page.
- [ ] I can point to the file behind any claim when asked.
- [ ] Nothing unbuilt is described as built.
- [ ] I said all three 60-second answers aloud from memory and rewrote them in my own words.
- [ ] Learning path row 17 and the three concept-coverage rows show ✅.

---

## Execution Notes

Model: **Sonnet 5.5** · Effort: **high**. Docs only, but every sentence is a factual claim about the code, so the executor must read before it writes.
Before you start: do STEP 0 (reading) yourself. STEP 7 is also yours; the executor stops after STEP 6 and leaves STEP 8 for after your recall test.

```
/execute plans/in-progress/learning/PF-AI013-agent-design-writeups-todo.md
```

### Stop and ask if

- A fact in the STEP 1 table no longer matches the code in a way that changes a page's main point (for example, the checkpointer is already persistent).
- A page cannot reach one recorded failure without inventing one.
