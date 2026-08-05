# PF-AI007 — Chapter 7: First Agent — smolagents (Transaction Categorizer)

> **Learning Phase:** Phase 2 · Chapter 7 of 12 · Day ~37 of 90
> **Status:** In Progress — STEPs 0–6 and 9 done; STEP 7 (5-transaction smoke test) blocked at 1/5 on Gemini free-tier daily quota (20 req/day, exhausted) — see [progress.md](../../../docs/mentor/progress.md) 2026-08-05 (Day 71) entry
> **Started:** 2026-08-05
> **Planned from branch:** main
> **Pivot goal:** Close the single biggest gap on current AI Eng JDs. "Agentic systems" is the hard one to fake. smolagents is the minimum-surface entry: one LLM, a set of tools, a loop. Grok the ReAct loop here — the state machines, routing, and multi-agent patterns in Chapter 8 (LangGraph) make sense only after you've seen what they're abstracting. After this chapter you can say: "I built a tool-calling agent that categorizes transactions by iterating over rule-matching, semantic similarity search, and spending-pattern context — every tool call is traced in Langfuse."

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
  - [High level — what is this?](#high-level--what-is-this)
  - [What is an agent?](#what-is-an-agent)
  - [ToolCallingAgent vs CodeAgent](#toolcallingagent-vs-codeagent)
  - [The tool docstring is the schema](#the-tool-docstring-is-the-schema)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
    - [STEP 0 — Learn: the agent mental model (theory anchor, 60–90 min)](#--step-0--learn-the-agent-mental-model-theory-anchor-6090-min)
    - [STEP 1 — Install smolagents + litellm](#--step-1--install-smolagents--litellm)
    - [STEP 1b — Verify the smolagents API surface](#--step-1b--verify-the-smolagents-api-surface-5-min--do-not-skip)
    - [STEP 1c — Add `category` to `SearchResult`](#--step-1c--add-category-to-searchresult-blocks-tool-2)
    - [STEP 2 — Create the package structure + three tool files](#--step-2--create-the-package-structure--three-tool-files)
    - [STEP 3 — Build `CategorizerAgent` in `app/agents/categorizer_agent.py`](#--step-3--build-categorizeragent-in-appagentscategorizer_agentpy)
    - [STEP 4 — Wire OTel tracing (Langfuse auto-capture)](#--step-4--wire-otel-tracing-langfuse-auto-capture)
    - [STEP 5 — Add models + wire `POST /categorize-agent` in `main.py`](#--step-5--add-models--wire-post-categorize-agent-in-mainpy)
    - [STEP 6 — Write unit tests in `tests/test_categorizer_agent.py`](#--step-6--write-unit-tests-in-teststest_categorizer_agentpy)
    - [STEP 7 — Write + run the 5-transaction smoke test](#--step-7--write--run-the-5-transaction-smoke-test)
    - [STEP 8 — Stretch: DeepLearning.AI Functions, Tools and Agents with LangChain](#--step-8--stretch-deeplearningai-functions-tools-and-agents-with-langchain)
    - [STEP 9 — Full test pass + commit](#--step-9--full-test-pass--commit)
    - [STEP 10 — Log progress](#--step-10--log-progress)
  - [📌 Notes](#-notes)
  - [📚 Resources / Theory to Learn](#-resources--theory-to-learn)
  - [🧠 Learning Strategy](#-learning-strategy)
  - [📝 Knowledge Check](#-knowledge-check)

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

An **agent** is a loop, not a function. The existing categorizer sends a description to the LLM and
takes back whatever category it guesses. This chapter replaces that silent guess with a loop where
the LLM gathers evidence — it calls a tool, looks at what came back, decides what to do next, calls
another tool — and only answers once it has enough. Same inputs and outputs as `/categorize`, but
now the reasoning is visible: every tool call becomes a span you can open in Langfuse.

```
  transaction ───►┌──────────────────────────┐───► category + confidence
  (desc/wallet/    │   Agent = LLM + tools    │      + reasoning + trace
   amount)         │                          │
                   │   observe ◄──┐           │
                   │      │       │           │   loops up to 3× (ReAct):
                   │   reason      │ tool      │   rules → history → vocabulary
                   │      │       │ output    │
                   │      ▼       │           │
                   │    act ──────┘           │
                   │  (call a tool)           │
                   └──────────────────────────┘
```

## What is an agent?

**One LLM call.** The current LLM-fallback layer (Layer 4 of `categorizer.py`) sends the
description to the model and takes back a category. It works when the description is obvious —
"STARBUCKS COFFEE" → Food & Dining.

There's no record of *why* when it's wrong, though. The model never checked the 106 rules
or the user's past transactions — it guessed from the description string alone. Feed it
"GJ*GRAB CAR JAKARTA" and it might say "Shopping"; nothing shows what it considered or lets you
correct the reasoning.

**Give the model tools.** Instead of guessing, let the model call functions: search the
rules, look up similar past transactions. **Tool calling** = the LLM emits a structured request
("call `search_category_rules` with keyword='grab'"), your code runs it, and hands the result back
to the model.

One tool call usually isn't enough, though. Rules might return "No rules matched", so the
model needs to *see that result* and then decide to try similarity search instead. A single
request → response can't branch on what it just learned.

**The ReAct loop.** **ReAct** (Reason + Act) runs the model in a loop: it observes the
latest tool output, reasons about the next step, acts by calling another tool, observes again —
until it has enough evidence to produce a final answer. smolagents runs this loop for you.
*This is what the chapter ships.*

> **Teaser, not taught here:** Chapter 8's LangGraph turns this implicit loop into an explicit state
> graph with routing and retry nodes — the same loop, made inspectable and controllable.

▶ **Watch/read for this concept:** HF Agents Course Unit 1 → https://huggingface.co/learn/agents-course/unit1/introduction

## ToolCallingAgent vs CodeAgent

**`CodeAgent`.** smolagents' `CodeAgent` lets the LLM *write Python* to call tools —
maximally flexible, and genuinely clever for data-science notebooks.

The catch: in a web service that generated code runs on your server. Nothing stops the model —
or a prompt-injected transaction description — from emitting `os.system("rm -rf /")` and having it
execute. Flexibility becomes arbitrary code execution.

**`ToolCallingAgent`.** Constrain the model to emit **JSON tool calls** — the exact
`tool_use` shape already used throughout the extraction pipeline. The model can only invoke declared
tools with typed arguments; no arbitrary code path exists. *This is what the chapter ships.* The
bridge to what you already know: the `tool_use` primitive from PDF extraction is the same building
block the agent loop runs on — you're seeing where that primitive lives inside a reasoning loop.

▶ **Watch/read for this concept:** smolagents — Agent types → https://huggingface.co/docs/smolagents/en/conceptual_guides/react_and_code_agents

## The tool docstring is the schema

**A bare function.** Write `search_category_rules(keyword)` and register it as a tool.

Sounds sufficient — until the model decides *whether and when* to call a tool purely from its docstring — that
is the only description it sees. A vague docstring ("searches rules") gives it no basis to check
rules *before* similarity search, so it fires them in the wrong order and you get worse answers
with no obvious bug.

**Docstring as contract.** Write the docstring to state *when* to use the tool ("Use this
tool FIRST", "Use this when rules return No rules matched"), the argument meaning, and the return
shape. The docstring **is** the schema the LLM plans against. *This is what the chapter ships.*

▶ **Watch/read for this concept:** smolagents — Writing good tools → https://huggingface.co/docs/smolagents/en/tutorials/building_good_tools

# 🔧 Implementation

## 🎯 Objective

The existing 4-layer categorizer ([categorizer.py](../../../services/ai-service/app/services/categorizer.py), PF-103) runs silently: rule match → preset → history cache → LLM fallback. It's correct ~85% of the time but opaque — when it's wrong, there's no reasoning trace to debug, and nothing to demo in an interview.

The **Transaction Categorizer Agent** replaces the silent LLM-fallback layer with a smolagents `ToolCallingAgent`. Same inputs and outputs as the existing `/categorize` endpoint, but the agent:

1. Calls tools in a deliberate order to gather evidence
2. Reasons explicitly ("rules say 'coffee' → Dining, but similarity search shows 5 past transactions all in Food & Dining — I'll go with the more specific rule")
3. Emits a structured trace (tool names, arguments, responses, final answer) that Langfuse captures as a span per tool call

This is what "observable AI reasoning" looks like in a job interview demo.

```
                    Transaction Categorizer Agent — ONE loop, repeated ≤ 3× total
                    (the "3" is the step budget, NOT one try per tool — a rule
                     match can end everything after iteration 1)
                  ┌──────────────────────────────────────────────────────────┐
                  │   LLM: LiteLLM → Gemini 2.5 Flash (or Anthropic)         │
  Input:          │                                                          │
  description +   │   ┌──►[Observe]──►[Reason]──►[Act: pick ONE tool]──┐    │
  wallet + amount ─┼───┘                                                │    │
                  │   ▲                                                 │    │
                  │   └──────────────── tool's result ───────────────────┘    │
                  │        (fed back in; loop repeats OR LLM has enough        │
                  │         evidence already and exits to Final Answer)        │
                  └───────────────────────────┬──────────────────────────────┘
                                               │
                             each "Act" round picks exactly ONE of:
                  ┌────────────────────────────┼────────────────────────────┐
                  ▼                            ▼                            ▼
      ┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
      │ search_category_rules │  │ find_similar_trans    │  │ list_all_categories  │
      │ (keyword: str)        │  │ (description: str)    │  │ ()                   │
      │                       │  │                        │  │                      │
      │ → keyword-matches     │  │ → calls /search        │  │ → returns all known  │
      │   against 106 rules,  │  │   endpoint (pgvector   │  │   category names so  │
      │   returns rule +      │  │   RAG from PF-AI003)   │  │   agent constrains   │
      │   category pairs      │  │   → top-3 with their   │  │   final pick to      │
      │                       │  │   historical cats      │  │   valid vocabulary   │
      └───────────┬───────────┘  └───────────┬────────────┘  └───────────┬──────────┘
                  │                           │                          │
                  └─────────── only the ONE tool actually called ────────┘
                               returns here — the other two are simply
                               unused this round, not "failed"
                                               │
                           result flows back up into [Observe] ↑
                       (see diagram above — this is one cycle, not a fan-out)
                                               │
             Loop exits when either: max_steps=3 is reached, OR the LLM
             itself decides it has enough evidence to answer — whichever
             comes first. Then, once, outside the loop:

                            Final Answer (ToolCallingAgent):
                            {
                              "category": "Food & Dining",
                              "confidence": 0.9,
                              "reasoning": "Rule matched 'starbucks' → Food & Dining (Café);
                                             3 similar past transactions confirmed."
                            }
                                               │
                                   ┌───────────▼──────────────┐
                                   │  Langfuse trace           │
                                   │  Parent: /categorize-     │
                                   │  agent (span)             │
                                   │  ├─ search_category_rules │
                                   │  │  (span: input/output)  │
                                   │  ├─ find_similar_trans    │
                                   │  │  (span: input/output)  │
                                   │  └─ LLM completion (span) │
                                   └──────────────────────────┘
```

> **Why the original version was ambiguous:** a single fan-out arrow from `[Act: tool_call]` straight to all three tool boxes reads as "call all three every time" or worse, "try each one until it works" — neither is true. Only **one** tool is invoked per iteration, chosen by the LLM's `[Reason]` step; the loop cycles back through `[Observe]` before deciding whether to act again. The revised version routes the result back into the loop explicitly and labels the fan-out as a menu of choices, not parallel/sequential fallback branches.

**Walking the loop with a concrete example — `"GJ*GRAB CAR JAKARTA"`, wallet `BCA`, amount `45,000`:**

| Step | Observe (input to LLM) | Reason (LLM's decision) | Act (tool call) | Result fed back |
|------|------------------------|--------------------------|------------------|------------------|
| 1 | Task text only — nothing gathered yet | System prompt says rules first → try keyword `grab` | `search_category_rules(keyword="grab")` | `"No rules matched."` — the word "GRAB" alone isn't a rule pattern; `"gojek"`/`"grabcar"` might be but `"grab"` didn't hit |
| 2 | Rules came up empty → not enough evidence to answer yet | Prompt says: on empty/ambiguous rules, try similarity next | `find_similar_transactions(description="GJ*GRAB CAR JAKARTA")` | `"Similar past transactions:\n  [1] 'GJ*GRAB CAR SBY' — Transportation (Online) (similarity=0.94)\n  [2] 'GOJEK RIDE' — Transportation (Online) (similarity=0.81)\n  [3] 'GJ*GRABFOOD' — Food & Dining (similarity=0.62)"` |
| 3 | 2 of 3 similar transactions agree on `Transportation (Online)`; the third is a different Grab product (food, not ride) | Has enough evidence now — needs the exact valid category string before answering | `list_all_categories()` | `"Valid categories:\n  - Transportation (Online)\n  - Food & Dining\n  ..."` — confirms `Transportation (Online)` is a real category name, not a guess |
| — (final, no more tool calls — `max_steps=3` reached) | All 3 tool outputs in context | Synthesizes an answer *without* a 4th tool call, since the step budget is spent | — | LLM emits free text |

**Final text the LLM emits:**
```
CATEGORY: Transportation (Online)
CONFIDENCE: 0.7
REASONING: No direct rule matched 'grab', but 2 of 3 similar past transactions
(GJ*GRAB CAR SBY, GOJEK RIDE) were categorized Transportation (Online); the
GrabFood match was excluded as a different product line.
```

**What `_parse_result` does with it** ([categorizer_agent.py](../../../services/ai-service/app/agents/categorizer_agent.py)):
- `CATEGORY` → `"Transportation (Online)"` (present, exact match — kept as-is)
- `CONFIDENCE` → `_safe_float("0.7")` → `0.7` (0.7 = "history match" per the prompt's own confidence scale)
- `REASONING` → the sentence above, kept verbatim
- `tool_calls_count` → `3` (read from `agent.memory.steps`, not hardcoded)

**Contrast — the degraded case.** If step 2's similarity search had thrown (DB hiccup), the tool would have returned `"Similarity search unavailable."` instead of raising ([similarity.py:474-483](../../../services/ai-service/app/agents/tools/similarity.py#L474-L483)) — the loop keeps running, but the LLM now has only rules (empty) + vocabulary to reason from. It would likely land on `CATEGORY: Other`, `CONFIDENCE: 0.5`, with reasoning citing the missing evidence — the same shape `_parse_result` falls back to when the text is malformed, just arrived at *honestly* through the LLM's own words instead of the parser's defaults.

**Depends on:** PF-AI003 (pgvector + `/search` endpoint — `find_similar_transactions` calls it directly), PF-AI001 (Langfuse + OTel setup — traces hook into the existing OTLP pipeline).
**Unblocks:** Chapter 8 (LangGraph Financial Advisor — you'll understand exactly what LangGraph adds to this simpler loop), Chapter 9 (MCP server — `search_category_rules` becomes an MCP tool in that chapter).

## ✅ Acceptance Criteria

- [x] `pip install "smolagents[litellm]" litellm` succeeds; both added to `pyproject.toml` main deps
  > Verified: smolagents 1.26.0 + litellm 1.95.0 installed, both in `pyproject.toml`, `from smolagents import ToolCallingAgent, tool, LiteLLMModel` succeeds.
- [x] **smolagents API surface verified** (STEP 1b): `smolagents.__version__` recorded; `ToolCallingAgent.__init__` accepts an instructions/system-prompt argument; `smolagents.monitoring.instrument_smolagents` importable; the step-count attribute on the agent identified
  > Verified live against the installed version: version=1.26.0; `instructions=` confirmed accepted (via `MultiStepAgent.__init__`, inherited through `**kwargs`); `instrument_smolagents` is **NOT importable** in 1.26.0 (confirmed absent from package source, not just an import error) — used the plan's documented manual-span fallback instead; `agent.memory.steps` confirmed as the real step-count source on a constructed instance.
- [x] **`SearchResult` carries `category`** — `models.py` gains `category: str | None`; `retriever.py` selects `t.category` in `_search_vector` **and** `_fetch_results_by_ids`; existing `test_retriever.py` / `test_hybrid_search.py` still pass
  > Verified: both retriever paths edited; `pytest tests/test_retriever.py tests/test_hybrid_search.py` — 20/20 pass (required updating both files' `_make_mock_row()` fixtures to include the new `category` key — see STEP 1c note).
- [x] `app/agents/categorizer_agent.py` — `CategorizerAgent` wrapping a `ToolCallingAgent` with 3 tools; accepts `description`, `wallet`, `amount_idr`; returns `CategorizationResult(category, confidence, reasoning, tool_calls_count)` with `tool_calls_count` derived from the agent's own step log (never hardcoded)
  > Verified: unit tests assert `tool_calls_count` against a real populated `agent.memory.steps` mock; live run showed `tool_calls_count=5` (a real observed value, not hardcoded).
- [x] `app/agents/tools/category_rules.py` — `search_category_rules(keyword)` `@tool`; queries the rule snapshot loaded at startup from `SELECT keyword, category FROM category_rules`; returns matched rule + category pairs as string; returns "No rules matched." when empty
  > Verified live: local dev DB has 5 `category_rules` rows (not 106 — a much smaller dev dataset than the plan's docs describe elsewhere), tool correctly returned "No rules matched." for "salary" and real matches were exercised in unit tests.
- [x] `app/agents/tools/similarity.py` — `find_similar_transactions(description)` `@tool`; calls the in-process `RetrievalService` (pgvector RAG, PF-AI003) — no self-HTTP; returns top-3 descriptions **with their real historical categories**; returns a degradation string (not an exception) when search is unavailable
  > Verified live: local `transaction_embeddings` was empty at session start (prior DB reset wiped the PF-AI003 backfill) — ran `backfill_embeddings.py --yes` (24 txns) first, then the tool returned real similarity matches with real categories (e.g. "Salary" — Salary, similarity=0.62) in the live smoke test.
- [x] `app/agents/tools/categories.py` — `list_all_categories()` `@tool`; returns the **live** vocabulary snapshotted from `app.state.categories` at startup, with the hardcoded list used only as an empty-DB fallback
  > Verified live: returned the DB's real 5-category vocabulary (Bill, Emergency Fund, Food & Drinks, Loan, Salary), not the hardcoded fallback list.
- [x] `POST /categorize-agent` endpoint in `main.py` — accepts `CategorizeAgentRequest`; returns `CategorizeAgentResponse(category, confidence, reasoning, tool_calls_count)`; LLM failures return 502 (never 200-with-empty)
  > Verified live: real HTTP 200 response with correct fields for a real transaction; 502-on-exception path covered by `test_categorize_re_raises_on_agent_error` (re-raise confirmed) — the endpoint's own try/except → `HTTPException(502)` wrapping is code-reviewed, not independently curl-tested against a forced failure this session.
- [x] Langfuse traces: every `/categorize-agent` call produces ≥1 tool-call child span visible in the Langfuse dashboard (parent = agent run; children = individual tool calls)
  > Verified via the Langfuse public API (`GET /api/public/traces/{id}`) against a real call: `POST /categorize-agent` → `categorizer_agent_run` (AGENT) → 3 child TOOL spans, correctly nested by `parentObservationId`.
- [ ] `scripts/test_agent.py` — 5-transaction smoke test runs and prints category + confidence + reasoning + tool count for each; **each transaction's category exactly matches its expected label** (see STEP 7 table), and each `tool_calls_count` is ≥ 1
  > Not met: script runs correctly and 1/5 transactions completed with an exact category match (`tool_calls_count=5`, ≥1). Remaining 4/5 blocked by Gemini's free-tier daily quota (20 req/day, exhausted mid-run) — see STEP 7 note. Deferred until quota resets or a paid tier / funded Anthropic key exists.
- [x] `tests/test_categorizer_agent.py` — unit tests with mocked smolagents agent (no real LLM calls); covers: normal categorization, fallback to "Other" on empty output, non-numeric CONFIDENCE falls back to 0.5, 502-propagating exception re-raise
  > Verified: `pytest tests/test_categorizer_agent.py` — 5/5 pass.
- [x] HF Agents Course Units 1–2 read; active-retrieval notes written in [progress.md](../../../docs/mentor/progress.md)
  > Verification note: active-retrieval answers (ReAct loop, ToolCallingAgent vs CodeAgent, docstring-as-schema, why the loop repeats) written into the 2026-08-05 (Day 71) entry — technically accurate content produced this session. Whether the HF course pages themselves were separately read is not something this execution session can independently verify.

## 🧭 Approach

**ToolCallingAgent, not CodeAgent — and why this matters for production.**
smolagents has two agent types: `CodeAgent` (generates executable Python to call tools) and `ToolCallingAgent` (generates JSON tool calls — the same JSON format as OpenAI function calling and Anthropic `tool_use`). `CodeAgent` is clever but dangerous in a production web service — the generated code can include `os.system("rm -rf /")` and it will run. `ToolCallingAgent` constrains the LLM to structured tool invocations only, matching the `tool_use` pattern already used throughout the project. The architectural bridge: the "tool_use" primitive you learned in the extraction pipeline is the same building block the agent loop runs on. You're not learning something new — you're seeing where that primitive lives inside a reasoning loop.

**smolagents before LangGraph — deliberate sequencing.**
Chapter 8 is LangGraph: state graphs, conditional routing, multiple agents communicating over shared state. Before you can understand what LangGraph *adds*, you need to see the ReAct loop in its purest form. smolagents is a loop with one LLM and a tool list — that's all an "agent" is at its core. When you see LangGraph next, you'll recognize: "this is the same loop, but with explicit state, retry nodes, and a visual graph instead of implicit iteration." Understanding the primitive makes the abstraction stick.

**Three tools, not seven.**
More tools = more indirection = harder to debug when the agent makes a wrong choice. The three tools here cover the same ground as the 4-layer categorizer: rules first (Layer 1), history next (Layer 3), vocabulary last (so the agent's final category is constrained to known names). The 106 rules are already in the system — `search_category_rules` surfaces them as agent-callable evidence instead of a silent first-pass filter.

**LiteLLM as the provider wrapper.**
smolagents uses LiteLLM as its default provider backend, which means `LiteLLMModel(model_id="gemini/gemini-2.5-flash")` or `"anthropic/claude-sonnet-4-6"` both work with the keys already in `config.py`. Zero additional secret management.

**Langfuse traces via OTel hook.**
smolagents v1.9+ ships with OpenTelemetry instrumentation. One call to `instrument_smolagents()` at service startup pushes every agent run, tool call, and LLM completion to our OTLP endpoint (already configured for Langfuse in PF-AI001). Each tool call appears as a child span of the agent run — the trace tree is the demo artifact that makes "I built an observable agent" concrete and defensible.

## 📂 Affected Files

| File | Change |
|------|--------|
| [models.py](../../../services/ai-service/app/models.py) | Edit — add `category: str \| None` to `SearchResult` (STEP 1c) **and** add `CategorizeAgentRequest` / `CategorizeAgentResponse` (STEP 5) |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Edit — select `t.category` in `_search_vector` and `_fetch_results_by_ids`; pass it into `SearchResult` |
| [\_\_init\_\_.py](../../../services/ai-service/app/agents/__init__.py) (`app/agents/`) | Create — empty package |
| [categorizer_agent.py](../../../services/ai-service/app/agents/categorizer_agent.py) | Create — `CategorizerAgent` + `CategorizationResult` + `_parse_result` |
| [\_\_init\_\_.py](../../../services/ai-service/app/agents/tools/__init__.py) (`app/agents/tools/`) | Create — empty package |
| [category_rules.py](../../../services/ai-service/app/agents/tools/category_rules.py) | Create — `search_category_rules` `@tool` + `load_rules()` |
| [similarity.py](../../../services/ai-service/app/agents/tools/similarity.py) | Create — `find_similar_transactions` `@tool` + `configure(retriever)` |
| [categories.py](../../../services/ai-service/app/agents/tools/categories.py) | Create — `list_all_categories` `@tool` + `load_categories()` + `_FALLBACK_CATEGORIES` |
| [main.py](../../../services/ai-service/app/main.py) | Edit — add `_load_rules()`; wire agent + tool snapshots in lifespan; add `POST /categorize-agent`; call `instrument_smolagents()` |
| [pyproject.toml](../../../services/ai-service/pyproject.toml) | Edit — add `smolagents[litellm]`, `litellm` to main deps |
| [test_categorizer_agent.py](../../../services/ai-service/tests/test_categorizer_agent.py) | Create — unit tests (mocked ToolCallingAgent, no real LLM) |
| [test_agent.py](../../../services/ai-service/scripts/test_agent.py) | Create — 5-transaction smoke test via httpx |

## 📋 TODO

### [x] STEP 0 — Learn: the agent mental model (theory anchor, 60–90 min)

> **Done 2026-08-05.** Active-retrieval answers (ReAct loop, ToolCallingAgent vs CodeAgent security rationale, docstring-as-schema, why the loop repeats) written into [progress.md](../../../docs/mentor/progress.md) under the 2026-08-05 (Day 71) entry.

The Hugging Face Agents Course is the fastest way to grok the ReAct loop before building. Complete in this order:

1. **Unit 1 — What is an AI agent?** → https://huggingface.co/learn/agents-course/unit1/introduction
   - The Environment / Observe / Reason / Act loop
   - Why tool calling is not just "calling a function" — it's evidence collection inside an LLM reasoning loop
   - Estimated: 20 min reading + interactive demo

2. **Unit 2 — smolagents: Building your first agent** → https://huggingface.co/learn/agents-course/unit2/smolagents
   - `@tool` decorator, `ToolCallingAgent` vs `CodeAgent`, running the first example
   - Pay close attention to the *intermediate reasoning steps* printed during the run — that's the ReAct loop in action
   - Estimated: 25 min

3. **Skim Unit 3 intro only** — enough to see where multi-step reasoning goes; you'll revisit in Chapter 8.

**Active-retrieval task (mandatory — don't skip):** Close all tabs. In [progress.md](../../../docs/mentor/progress.md) under today's date, write from memory:
- What does ReAct stand for? What happens at each step (Observe, Reason, Act)?
- Why does `ToolCallingAgent` produce JSON tool calls instead of arbitrary Python? What's the security implication of the alternative?
- What is the difference between how a tool is *described* to the LLM (docstring) vs how it *executes* (Python function body)?
- Why does smolagents run the loop multiple times instead of stopping after the first tool call?

> **The interview frame:** "An AI agent is a loop: the LLM observes tool output, reasons about what to do next, and acts by calling another tool — until it has enough evidence to produce a final answer. ReAct is the standard framing: Reason → Act → Observe → repeat. smolagents runs this loop explicitly; LangGraph (Chapter 8) makes the loop a directed graph so you can add conditional routing, retry nodes, and parallel tool calls. I built the categorizer in smolagents first — so when I explain LangGraph, I can say exactly what it adds."

### [x] STEP 1 — Install smolagents + litellm

> **Done 2026-08-05.** Installed `smolagents[litellm]>=1.9` + `litellm>=1.50`, resolved to **smolagents 1.26.0** / litellm 1.95.0. Both added to `pyproject.toml` main deps. Smoke import confirmed OK. Note: litellm's install upgraded `openai` 1.109.1→2.53.0, which conflicts with `langchain-openai`'s `<2.0` pin (RAGAS eval-only, dev extra) — confirmed `langchain_openai` is never imported from `app/` or `tests/`, only from `evals/`, so this doesn't affect the app or test suite (verified: `test_embedder.py`/`test_embedding_providers.py` still 23/23 pass against openai v2).

Add to [pyproject.toml](../../../services/ai-service/pyproject.toml) main dependencies (runtime — not dev):

```toml
    "smolagents[litellm]>=1.9",
    "litellm>=1.50",
```

```bash
cd services/ai-service
pip install "smolagents[litellm]" litellm
```

Smoke-test the install:

```bash
python -c "from smolagents import ToolCallingAgent, tool, LiteLLMModel; print('smolagents OK')"
```

> **Why `smolagents[litellm]`?** The `[litellm]` extra bundles LiteLLM as smolagents' provider backend. Without it, smolagents defaults to OpenAI only. With it, `LiteLLMModel(model_id="gemini/gemini-2.5-flash")` and `"anthropic/claude-sonnet-4-6"` both work — the same keys already in `config.py`, zero extra setup.

### [x] STEP 1b — Verify the smolagents API surface (5 min — do NOT skip)

> **Done 2026-08-05 — and it caught a real divergence.** `smolagents.__version__` = 1.26.0. `ToolCallingAgent.__init__`'s own signature doesn't list `instructions`/`max_steps` directly — they're inherited via `**kwargs` from `MultiStepAgent.__init__`, confirmed present there and confirmed accepted end-to-end by actually constructing an instance. `agent.memory.steps` confirmed real and populated (instance-level, not class-level — `hasattr(ToolCallingAgent, "memory")` on the class is `False` by design, checked the instance instead). **`smolagents.monitoring.instrument_smolagents` does NOT exist in 1.26.0** — grepped the installed package source directly (zero opentelemetry/otel/instrument references anywhere in it), not just an import-name guess. This is newer than v1.9, so the plan's "upgrade if missing" branch didn't apply; used the plan's own documented fallback instead (STEP 4).

smolagents is pre-1.0-stable in spirit: constructor kwargs and the monitoring module move between minor releases. Three things this plan depends on must be confirmed against *your installed version* before you write agent code. Getting this wrong costs an hour of silent misbehaviour in STEP 3.

```bash
cd services/ai-service && python - <<'PY'
import inspect, smolagents
from smolagents import ToolCallingAgent
print("version:", smolagents.__version__)

# 1. How is the system prompt / strategy passed? Look for `instructions`,
#    `system_prompt`, or `prompt_templates` in the signature.
print("ctor params:", list(inspect.signature(ToolCallingAgent.__init__).parameters))

# 2. Is the OTel hook available?
try:
    from smolagents.monitoring import instrument_smolagents
    print("instrument_smolagents: OK")
except ImportError as e:
    print("instrument_smolagents: MISSING —", e)

# 3. Where does the run's step log live? (needed for tool_calls_count)
print("has .memory:", hasattr(ToolCallingAgent, "memory"))
PY
```

Record the three answers in [progress.md](../../../docs/mentor/progress.md). Then:

- **Strategy prompt** — use whichever kwarg the signature actually exposes in STEP 3. If none exists, prepend `_SYSTEM_PROMPT` to the task string instead.
- **`instrument_smolagents` missing** — you're on < 1.9; `pip install --upgrade smolagents`, or use the manual-span fallback described in STEP 4.
- **Step log** — this is the source for `tool_calls_count` in STEP 3.

> **Why a whole step for this?** `additional_args=` looks like it would carry a system prompt and it does not — it injects task *variables*. Passing the strategy there means the agent silently ignores your tool-ordering instructions, the tools fire in the wrong order, and nothing errors. That's the exact failure mode Knowledge Check #3 describes. Verifying the signature costs five minutes; debugging the symptom costs an evening.

### [x] STEP 1c — Add `category` to `SearchResult` (blocks Tool 2)

> **Done 2026-08-05.** `category: str | None = None` added to `SearchResult`; `t.category` selected in both `_search_vector()` and `_fetch_results_by_ids()`. Regression note beyond the plan's own text: adding the field broke the existing mocked-row fixtures in `test_retriever.py`/`test_hybrid_search.py` — `row["category"]` against a dict-backed `MagicMock.__getitem__` with no `"category"` key raises `KeyError`, since these tests never touch a real asyncpg `Record` (which does support safe `.get()`). Added `category` to both `_make_mock_row()` helpers rather than leave a real regression under an "unchanged" claim. `pytest tests/test_retriever.py tests/test_hybrid_search.py` — 20/20 pass.

`find_similar_transactions` exists to tell the agent *how the user categorized similar past transactions*. Today it cannot: [SearchResult](../../../services/ai-service/app/models.py) has `transaction_id, similarity, description, date, amount_idr, flow, wallet` — no category. Without this change the tool returns `unknown` for every row and the agent's second evidence source is dead weight.

**1. Extend the model** in [models.py](../../../services/ai-service/app/models.py):

```python
class SearchResult(BaseModel):
    transaction_id: int
    similarity: float          # 1 - cosine_distance (0..1, higher = more similar)
    description: str
    date: str                  # ISO 8601
    amount_idr: float
    flow: str
    wallet: str
    category: str | None = None   # PF-AI007: historical category — agent evidence
```

Optional (`| None = None`) is deliberate: it's additive, so every existing `/search` consumer and both existing test suites keep passing unchanged.

**2. Select it in both retriever paths** in [retriever.py](../../../services/ai-service/app/services/retriever.py). There are **two** places that build a `SearchResult` — miss the second and hybrid/BM25 search silently returns `None` categories:

- `_search_vector()` — add `t.category` to the SELECT list next to `t.flow`, then `category=row["category"]` in the `SearchResult(...)` construction
- `_fetch_results_by_ids()` — the same two edits (this is the path hybrid + BM25 modes use)

**3. Verify nothing regressed:**

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_retriever.py tests/test_hybrid_search.py -v
```

> **Why touch Chapter 3's code in Chapter 7?** Because the agent exposed a real gap: retrieval was built to answer "what did I spend on?" (Chapter 3–6), where the category was never needed in the result. An agent reasoning *about* categories needs it. This is the normal shape of agent work — the tools are usually fine, the data they surface is what's missing.

### [x] STEP 2 — Create the package structure + three tool files

> **Done 2026-08-05.** `app/agents/` + `app/agents/tools/` created with `__init__.py`. All 3 tools built as specified (`search_category_rules`, `find_similar_transactions`, `list_all_categories`), each additionally wrapped in a `langfuse.start_as_current_observation(as_type="tool", ...)` span (see STEP 4 — manual tracing fallback, since `instrument_smolagents()` isn't available on smolagents 1.26). Sanity-checked all 3 import and execute correctly standalone before wiring into the agent.

```bash
mkdir -p services/ai-service/app/agents/tools
touch services/ai-service/app/agents/__init__.py
touch services/ai-service/app/agents/tools/__init__.py
```

**Tool 1 — `search_category_rules`** ([category_rules.py](../../../services/ai-service/app/agents/tools/category_rules.py)):

```python
"""Tool: search existing category rules by keyword."""
from __future__ import annotations

from smolagents import tool

# Populated at service startup via load_rules() — same 106 rules the 4-layer
# categorizer uses. A snapshot is correct: rules change rarely, and a stale
# snapshot is better than a live DB call on every agent iteration.
_CATEGORY_RULES: dict[str, str] = {}

def load_rules(rules: dict[str, str]) -> None:
    """Called from main.py lifespan to populate the rules snapshot at startup."""
    global _CATEGORY_RULES
    _CATEGORY_RULES = {k.lower(): v for k, v in rules.items()}

@tool
def search_category_rules(keyword: str) -> str:
    """Search the category rule base for a keyword match. Use this tool FIRST.

    Rule matches are deterministic and zero-cost — always check rules before
    falling back to similarity search. Returns matching category names and the
    rule patterns that triggered them. Returns 'No rules matched.' when empty.

    Args:
        keyword: Single word or short phrase extracted from the transaction
                 description (e.g. 'starbucks', 'tokopedia', 'listrik', 'grab').
    """
    keyword = keyword.lower().strip()
    matches: list[tuple[str, str]] = [
        (pattern, category)
        for pattern, category in _CATEGORY_RULES.items()
        if keyword in pattern or pattern in keyword
    ]
    if not matches:
        return "No rules matched."
    lines = [f"  pattern='{p}' → category='{c}'" for p, c in matches[:5]]
    return "Matched rules:\n" + "\n".join(lines)
```

**C# equivalent** (Python `@tool` decorator + docstring-as-schema → a `[Description]`-annotated method the framework reflects over — e.g. Semantic Kernel's `[KernelFunction]`; module-level `dict` snapshot → `static IReadOnlyDictionary` behind a `Load` method):

```csharp
public static class CategoryRulesTool
{
    // Populated at startup — same 106 rules the 4-layer categorizer uses.
    private static IReadOnlyDictionary<string, string> _categoryRules =
        new Dictionary<string, string>();

    public static void LoadRules(IDictionary<string, string> rules) =>
        _categoryRules = rules.ToDictionary(kv => kv.Key.ToLowerInvariant(), kv => kv.Value);

    [KernelFunction("search_category_rules")]
    [Description("Search the category rule base for a keyword match. Use this tool FIRST. " +
                 "Returns matching category names and the rule patterns that triggered them. " +
                 "Returns 'No rules matched.' when empty.")]
    public static string SearchCategoryRules(
        [Description("Single word or short phrase from the transaction description")] string keyword)
    {
        keyword = keyword.ToLowerInvariant().Trim();
        var matches = _categoryRules
            .Where(kv => kv.Key.Contains(keyword) || keyword.Contains(kv.Key))
            .Take(5)
            .Select(kv => $"  pattern='{kv.Key}' → category='{kv.Value}'")
            .ToList();
        return matches.Count == 0
            ? "No rules matched."
            : "Matched rules:\n" + string.Join("\n", matches);
    }
}
```

> The `[Description]` attribute plays the exact role the Python docstring does — it's the only text the LLM sees when deciding whether to call the tool.

**Tool 2 — `find_similar_transactions`** ([similarity.py](../../../services/ai-service/app/agents/tools/similarity.py)):

```python
"""Tool: find semantically similar past transactions via the in-process RetrievalService."""
from __future__ import annotations

import asyncio
import logging

from smolagents import tool

logger = logging.getLogger(__name__)

# Set at startup from app.state.retriever — the SAME instance the /search and
# /ask endpoints use. No self-HTTP: calling our own port from inside our own
# process doubles serialization and couples the tool to its own liveness.
_RETRIEVER = None

def configure(retriever) -> None:
    global _RETRIEVER
    _RETRIEVER = retriever

@tool
def find_similar_transactions(description: str) -> str:
    """Find semantically similar past transactions and their historical categories.

    Searches the pgvector embedding index built in Chapter 3 (PF-AI003). Use this
    tool when rule matching returns 'No rules matched.' or when the matched category
    is ambiguous. Returns the 3 most similar past transactions with their categories.

    Args:
        description: The transaction description to search for similarities.
    """
    if _RETRIEVER is None:
        return "Similarity search unavailable."
    try:
        results = asyncio.run(_RETRIEVER.search(query=description, top_k=3))
    except Exception:
        # A tool must NEVER raise into the agent loop — one flaky DB call would
        # abort the whole run. Degrade to a string the LLM can reason about:
        # it still has rule evidence and can answer with lower confidence.
        logger.exception("similarity tool failed description=%r", description)
        return "Similarity search unavailable."

    if not results:
        return "No similar past transactions found."
    lines = [
        f"  [{i+1}] '{r.description}' — {r.category or 'uncategorized'} "
        f"(similarity={r.similarity:.2f})"
        for i, r in enumerate(results)
    ]
    return "Similar past transactions:\n" + "\n".join(lines)
```

> **Why return a string on failure instead of raising?** In a request/response service, an exception is the right signal — the caller needs to know. In an agent loop it is not: a raised tool error aborts the run and destroys the evidence the agent already gathered. `"Similarity search unavailable."` keeps the loop alive and lets the LLM fall back to rule evidence with lower confidence. **Tools degrade; the agent decides.** This is a genuinely different error-handling posture from the rest of the codebase, and it's worth noticing.

**C# equivalent** (module-level `_RETRIEVER` set at startup → injected `IRetrievalService`; `asyncio.run()` bridging sync→async → `.GetAwaiter().GetResult()` — the same "sync wrapper over an async call" compromise, with the same caveat):

```csharp
public static class SimilarityTool
{
    private static IRetrievalService? _retriever;

    public static void Configure(IRetrievalService retriever) => _retriever = retriever;

    [KernelFunction("find_similar_transactions")]
    [Description("Find semantically similar past transactions and their historical categories. " +
                 "Use this when rule matching returns 'No rules matched.' or the match is ambiguous.")]
    public static string FindSimilarTransactions(
        [Description("The transaction description to search for similarities")] string description)
    {
        if (_retriever is null) return "Similarity search unavailable.";
        try
        {
            // Framework calls tools synchronously — block on the async search,
            // same trade-off as asyncio.run() in the Python version.
            var results = _retriever.SearchAsync(description, topK: 3).GetAwaiter().GetResult();
            if (results.Count == 0) return "No similar past transactions found.";

            var lines = results.Select((r, i) =>
                $"  [{i + 1}] '{r.Description}' — {r.Category ?? "uncategorized"} (similarity={r.Similarity:F2})");
            return "Similar past transactions:
" + string.Join("
", lines);
        }
        catch (Exception)
        {
            // Degrade, never throw into the agent loop.
            return "Similarity search unavailable.";
        }
    }
}
```

> **Why `asyncio.run()` inside a sync tool?** smolagents calls `@tool` functions synchronously; `RetrievalService.search()` is async. `asyncio.run()` spins a fresh event loop for the call — the inverse of `asyncio.to_thread` (sync wrapping async, not async wrapping sync). This is safe **only because** the endpoint already dispatched the whole agent run to a worker thread via `asyncio.to_thread` (STEP 5), so no event loop is running on this thread. Call the tool from a thread that already has a running loop and `asyncio.run()` raises `RuntimeError`. That coupling between STEP 5 and this line is the subtle part — note it.

**Tool 3 — `list_all_categories`** ([categories.py](../../../services/ai-service/app/agents/tools/categories.py)):

The vocabulary must be the **live** one. The service already loads it at startup — [`_load_categories()`](../../../services/ai-service/app/main.py) does `SELECT DISTINCT category FROM transactions` and stores it in `app.state.categories` for the query planner. Reuse that; a hand-written list is a guess that will drift from the database, and an agent constrained to names that don't exist is worse than an unconstrained one.

```python
"""Tool: return the full known category vocabulary."""
from __future__ import annotations

from smolagents import tool

# Populated at startup from app.state.categories — the SAME vocabulary the
# query planner uses. The agent picks from this to avoid inventing names.
_CATEGORIES: list[str] = []

def load_categories(categories: list[str]) -> None:
    """Called from main.py lifespan. Falls back if the DB load returned nothing."""
    global _CATEGORIES
    _CATEGORIES = list(categories) if categories else list(_FALLBACK_CATEGORIES)

# Fallback ONLY — used when the DB is unreachable at startup or the transactions
# table is empty (fresh install). Never the primary source.
_FALLBACK_CATEGORIES = [
    "Food & Dining", "Food & Dining (Café)", "Food & Dining (Fast Food)",
    "Transportation", "Transportation (Online)", "Transportation (Fuel)",
    "Shopping", "Shopping (Online)", "Shopping (Groceries)",
    "Bills & Utilities", "Bills & Utilities (Electricity)", "Bills & Utilities (Internet)",
    "Entertainment", "Entertainment (Streaming)", "Entertainment (Gaming)",
    "Health & Medical", "Health & Medical (Pharmacy)",
    "Education", "Travel & Accommodation",
    "Personal Care", "Financial Services", "Investment", "Income",
    "Transfer", "ATM Withdrawal", "Other",
]

@tool
def list_all_categories() -> str:
    """Return the complete list of valid category names.

    Use this tool when you need to pick the most appropriate category from
    the system vocabulary. Your final CATEGORY must exactly match one of
    these names — do NOT invent category names. If uncertain, use 'Other'.
    """
    return "Valid categories:\n" + "\n".join(f"  - {c}" for c in _CATEGORIES)
```

**C# equivalent** (Python module-level `list` constant → `static readonly string[]`; generator expression → LINQ `Select` + `string.Join`):

```csharp
public static class CategoriesTool
{
    // Populated at startup from the live vocabulary; constrains the agent's
    // final pick to real names (prevents category hallucination).
    private static string[] _categories = [];

    public static void LoadCategories(IReadOnlyList<string> categories) =>
        _categories = categories.Count > 0 ? [.. categories] : FallbackCategories;

    // Fallback ONLY — DB unreachable at startup, or a fresh install.
    private static readonly string[] FallbackCategories =
    [
        "Food & Dining", "Transportation", "Shopping", "Bills & Utilities",
        // ... same list as the Python version ...
        "Transfer", "ATM Withdrawal", "Other",
    ];

    [KernelFunction("list_all_categories")]
    [Description("Return the complete list of valid category names. Your final CATEGORY must " +
                 "exactly match one of these names — do NOT invent category names.")]
    public static string ListAllCategories() =>
        "Valid categories:
" + string.Join("
", _categories.Select(c => $"  - {c}"));
}
```

> **Why a startup snapshot rather than a per-call DB query?** Two separate questions, two separate answers. *Where do the names come from?* The database — always; a hardcoded list drifts and the agent ends up constrained to categories that don't exist, which is worse than no constraint at all. *How often do we read it?* Once, at startup — a DB round trip on every agent iteration adds latency and connection churn for a vocabulary that changes maybe monthly. Snapshot-at-startup gets both: real data, zero per-call cost. The tradeoff is staleness until restart, which for category names is acceptable and easy to see in Langfuse when it isn't.

> **The tool docstring IS the schema description.** The LLM sees only what's written in the docstring when it decides whether to call a tool. Ambiguous docstrings produce ambiguous tool choice. Each docstring here explicitly states when to use the tool ("Use this tool FIRST", "Use this when rules return No rules matched") to steer the agent toward the intended call order.

### [x] STEP 3 — Build `CategorizerAgent` in `app/agents/categorizer_agent.py`

> **Done 2026-08-05, one deliberate deviation.** Built per spec (`instructions=` confirmed correct per STEP 1b, `max_steps=3`, `tool_calls_count` from `agent.memory.steps`, timeout=30 on the model). Deviation: `LiteLLMModel` is constructed with `api_key=settings.gemini_api_key` (or anthropic) passed explicitly, not left to ambient env vars — `pydantic-settings` reads `.env` into the `Settings` object but does not export those values into `os.environ`, so LiteLLM would find no key at all otherwise. Also wraps `categorize()` in a manual Langfuse `as_type="agent"` parent span (STEP 4 fallback). Confirmed importable and `_parse_result`/`_safe_float` behave per spec via a standalone check before writing tests.

```python
"""Transaction Categorizer Agent — smolagents ToolCallingAgent.

3 tools, ReAct loop (max_steps=3), LiteLLM provider (Gemini primary / Anthropic fallback).
Every tool call and LLM step is captured as a Langfuse child span via OTel instrumentation
wired in main.py lifespan.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from smolagents import LiteLLMModel, ToolCallingAgent

from app.agents.tools.categories import list_all_categories
from app.agents.tools.category_rules import search_category_rules
from app.agents.tools.similarity import find_similar_transactions
from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a personal finance transaction categorizer.
Given a bank transaction, use the available tools to determine the correct category.

Strategy — follow this order:
1. Call search_category_rules() with the key merchant/service word from the description.
2. If no rule matched OR the result is ambiguous, call find_similar_transactions()
   to see how the user categorized similar past transactions.
3. Call list_all_categories() to pick the exact category name from the valid vocabulary.
4. Return your final answer in EXACTLY this format (no other text):
   CATEGORY: <exact name from list_all_categories>
   CONFIDENCE: <0.0–1.0 — 1.0=rule matched, 0.7=history match, 0.5=inferred>
   REASONING: <1–2 sentences citing which tool gave you the answer>

CRITICAL: CATEGORY must exactly match one name from list_all_categories().
Never invent a category name. If truly uncertain, use 'Other'."""

@dataclass
class CategorizationResult:
    category: str
    confidence: float
    reasoning: str
    tool_calls_count: int

def _safe_float(value: str, default: float = 0.5) -> float:
    """LLMs emit 'CONFIDENCE: 0.9 (high)' often enough to matter."""
    try:
        return float(value.split()[0])
    except (ValueError, IndexError):
        return default

def _parse_result(raw: str, tool_calls_count: int = 0) -> CategorizationResult:
    """Parse the agent's final text into a structured result."""
    lines = {}
    for line in raw.strip().splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            lines[key.strip().upper()] = value.strip()
    return CategorizationResult(
        category=lines.get("CATEGORY", "Other"),
        confidence=_safe_float(lines.get("CONFIDENCE", "")),
        reasoning=lines.get("REASONING", raw[:200]),
        tool_calls_count=tool_calls_count,
    )

class CategorizerAgent:
    def __init__(self) -> None:
        if settings.ai_provider == "gemini":
            model_id = f"gemini/{settings.ai_model}"
        else:
            model_id = f"anthropic/{settings.ai_model}"
        model = LiteLLMModel(model_id=model_id)
        self._agent = ToolCallingAgent(
            tools=[search_category_rules, find_similar_transactions, list_all_categories],
            model=model,
            # The strategy prompt goes HERE — the kwarg name you confirmed in
            # STEP 1b (`instructions=` on current smolagents). NOT additional_args:
            # that carries task *variables* and would silently discard this.
            instructions=_SYSTEM_PROMPT,
            max_steps=3,         # cap: rules → history → vocabulary → done
            verbosity_level=1,   # log intermediate steps to stdout in dev
        )

    def categorize(
        self, description: str, wallet: str, amount_idr: float
    ) -> CategorizationResult:
        """Run the agent for one transaction. Synchronous — call via asyncio.to_thread."""
        task = (
            f"Categorize this bank transaction:\n"
            f"  Description: {description}\n"
            f"  Bank: {wallet}\n"
            f"  Amount (IDR): {amount_idr:,.0f}"
        )
        try:
            raw = self._agent.run(task)
            # Real step count from the agent's own memory — the attribute you
            # confirmed in STEP 1b. Never hardcode this: a field that is always
            # 0 is worse than no field, because it looks like a measurement.
            steps = getattr(self._agent, "memory", None)
            tool_calls = len(steps.steps) if steps is not None else 0
            result = _parse_result(str(raw), tool_calls_count=tool_calls)
            logger.info(
                "agent_categorized description=%r category=%r confidence=%s tool_calls=%d",
                description, result.category, result.confidence, result.tool_calls_count,
            )
            return result
        except Exception:
            logger.exception("agent categorization failed description=%r", description)
            raise
```

**C# equivalent** (no smolagents package exists in .NET — the nearest real equivalent is Semantic Kernel with `FunctionChoiceBehavior.Auto()`, which runs the same tool-calling loop; Python `@dataclass` → C# `record`; `_parse_result` → private static method; `logger.exception` → `ILogger.LogError(ex, ...)` per ERR-04):

```csharp
public record CategorizationResult(
    string Category, double Confidence, string Reasoning, int ToolCallsCount);

public class CategorizerAgent
{
    private readonly Kernel _kernel;
    private readonly ILogger<CategorizerAgent> _logger;

    private const string SystemPrompt = """
        You are a personal finance transaction categorizer.
        Strategy: 1. search_category_rules first. 2. find_similar_transactions if
        ambiguous. 3. list_all_categories to pick the exact name. Return EXACTLY:
        CATEGORY: <name> / CONFIDENCE: <0.0-1.0> / REASONING: <1-2 sentences>
        """;

    public CategorizerAgent(Kernel kernel, ILogger<CategorizerAgent> logger)
    {
        _kernel = kernel;   // tools registered as KernelFunctions at DI setup
        _logger = logger;
    }

    public async Task<CategorizationResult> CategorizeAsync(
        string description, string wallet, double amountIdr)
    {
        var task = $"Categorize this bank transaction:\n  Description: {description}\n" +
                   $"  Bank: {wallet}\n  Amount (IDR): {amountIdr:N0}";
        try
        {
            // FunctionChoiceBehavior.Auto() = the ReAct loop: the model calls
            // tools, observes results, repeats — SK caps iterations internally
            // (the max_steps analogue).
            var settings = new PromptExecutionSettings
                { FunctionChoiceBehavior = FunctionChoiceBehavior.Auto() };
            var result = await _kernel.InvokePromptAsync(
                $"{SystemPrompt}\n\n{task}", new(settings));
            var parsed = ParseResult(result.ToString());
            _logger.LogInformation(
                "agent_categorized description={Description} category={Category}",
                description, parsed.Category);
            return parsed;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "agent categorization failed description={Description}", description);
            throw;
        }
    }

    private static CategorizationResult ParseResult(string raw)
    {
        var lines = raw.Trim().Split('\n')
            .Where(l => l.Contains(':'))
            .Select(l => l.Split(':', 2))
            .ToDictionary(p => p[0].Trim().ToUpperInvariant(), p => p[1].Trim());
        return new CategorizationResult(
            Category: lines.GetValueOrDefault("CATEGORY", "Other"),
            Confidence: double.TryParse(lines.GetValueOrDefault("CONFIDENCE"), out var c) ? c : 0.5,
            Reasoning: lines.GetValueOrDefault("REASONING", raw[..Math.Min(200, raw.Length)]),
            ToolCallsCount: 0);
    }
}
```

> Note the async difference: SK's loop is natively `async Task` — no `asyncio.to_thread` bridge needed, because .NET's tool-calling stack doesn't have a sync-only `run()` like smolagents does.

> **Why `max_steps=3`?** The three tools are sequenced: rules → history → vocabulary. In practice 1–2 iterations suffice — rules match or they don't. `max_steps=3` caps runaway loops where the LLM keeps calling the same tool with different keywords. Chapter 8's LangGraph replaces this with explicit `END` routing nodes — you'll see exactly what that solves.

> **Notice the tension in `_parse_result`.** This chapter argues at length that structured tool calls beat free-text parsing — then parses the final answer with `str.partition(":")`. That's a real inconsistency, and worth sitting with rather than glossing over. The principled fix is a `final_answer` tool with a typed schema (`category`, `confidence`, `reasoning`), so the last hop is validated like every other tool call. The plan ships the string version because it keeps STEP 3 readable and makes the failure mode visible: run the smoke test, watch `_safe_float` catch at least one malformed confidence, *then* you understand why schemas exist. Upgrading to `final_answer` is the natural first improvement — and better interview material than having done it right the first time.

> **Add a timeout on the model.** `max_steps=3` bounds iterations, not wall-clock — a hung provider call holds a thread-pool slot forever. Pass a request timeout through `LiteLLMModel` (e.g. `LiteLLMModel(model_id=model_id, timeout=30)`; confirm the kwarg in STEP 1b) and record the observed p95 latency in STEP 7 so you can quote the agent's real cost against `/categorize`.

> **Why is `categorize()` synchronous?** `smolagents.ToolCallingAgent.run()` is synchronous (it manages its own internal async where needed). Called directly inside `async def`, it blocks the FastAPI event loop. The endpoint calls it via `asyncio.to_thread()` — same fix as FlashRank in Chapter 4. Don't force it async; trust the thread pool.

### [x] STEP 4 — Wire OTel tracing (Langfuse auto-capture)

> **Done 2026-08-05 — via the plan's own documented fallback, not the one-liner.** `instrument_smolagents()` doesn't exist on smolagents 1.26.0 (confirmed in STEP 1b by reading the installed package source, not just a failed import). Used the plan's own contingency: manual Langfuse spans — `as_type="agent"` around `CategorizerAgent.categorize()`, `as_type="tool"` inside each of the 3 tool bodies. **Live-verified against the real Langfuse API** (`GET /api/public/traces/{id}`), not assumed: a real `/categorize-agent` call produced `POST /categorize-agent` (FastAPI auto-span) → `categorizer_agent_run` (AGENT) → 3 child TOOL spans (`search_category_rules`, `find_similar_transactions`, `list_all_categories`), each correctly nested by `parentObservationId`. This nesting works because `asyncio.to_thread` (STEP 5) copies the current `contextvars.Context` into the worker thread, which is what lets Langfuse's OTel-based context propagation survive the sync/async boundary.

In [main.py](../../../services/ai-service/app/main.py), add ONE line — but **placement matters**.

The existing OTel setup from PF-AI001 runs at *module level*: `TracerProvider(...)` and `trace.set_tracer_provider(provider)` execute at import, well before `lifespan()` runs. So calling `instrument_smolagents()` inside the lifespan (STEP 5) binds to a provider that is already live — correct by construction.

```python
from smolagents.monitoring import instrument_smolagents   # smolagents >= 1.9

# Inside lifespan(), after app.state.categorizer_agent is created —
# the module-level trace.set_tracer_provider() has already run.
instrument_smolagents()
```

> **Do not "simplify" this to a module-level call placed above the exporter setup.** `instrument_smolagents()` binds to whichever `TracerProvider` is active *at call time*. Register it first and it captures a no-op provider — the agent runs, no error appears, and tool spans vanish. That's Knowledge Check #5, and it is very easy to cause by tidying imports.

This registers a hook that wraps `ToolCallingAgent.run()`, tool dispatch, and every LLM completion with OTel spans. Because the OTLP exporter to Langfuse is already configured (`OTEL_EXPORTER_OTLP_ENDPOINT` env var, wired in PF-AI001), every agent run flows to Langfuse without additional config.

**Verify after the smoke test (STEP 7):** open the Langfuse dashboard and confirm:
- A parent trace named `ToolCallingAgent` (or similar)
- Child spans for each tool call: `search_category_rules`, `find_similar_transactions`, `list_all_categories`
- A final LLM completion span with token counts and cost

> **Why one call?** `instrument_smolagents()` hooks into the running OTel `TracerProvider`. The OTLP exporter (already active) receives every span automatically — this is the value of OTel-first observability (PF-AI001): new frameworks "just work" without wiring them individually.

> **If smolagents < 1.9 (check `smolagents.__version__`):** the `monitoring` module may not exist. Fallback: wrap `CategorizerAgent.categorize()` with a manual Langfuse span using the existing `langfuse` client from PF-AI001. A 5-line decorator achieves the same parent/child trace shape.

### [x] STEP 5 — Add models + wire `POST /categorize-agent` in `main.py`

> **Done 2026-08-05.** `CategorizeAgentRequest`/`CategorizeAgentResponse` added to `models.py`. `_load_rules()` added (mirrors `_load_categories()`'s fail-open posture exactly — verified the column names `(keyword, category)` against `category_rules`, no `category_name` mistake). Agent wired in `lifespan()` after `app.state.retriever`/`app.state.categories` exist. `asyncio.to_thread` added (needed a new `import asyncio` at the top of `main.py` — not previously imported there). Endpoint returns 502 on any exception. Live-verified: `curl`able, returned HTTP 200 with a correct category for a real transaction (see STEP 7).

Extend [models.py](../../../services/ai-service/app/models.py):

```python
# ── Chapter 7: Agent Categorization ────────────────────────────────────────────

class CategorizeAgentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    description: str = Field(..., min_length=1, max_length=500)
    wallet: str = Field(default="Unknown")
    amount_idr: float = Field(default=0.0, ge=0.0)

class CategorizeAgentResponse(BaseModel):
    category: str
    confidence: float
    reasoning: str
    tool_calls_count: int
```

**C# equivalent** (Pydantic `BaseModel` + `Field` constraints → C# record DTOs with DataAnnotations; `str_strip_whitespace` has no attribute equivalent — normalize in the validator or a custom binder):

```csharp
public record CategorizeAgentRequest(
    [property: Required, StringLength(500, MinimumLength = 1)] string Description,
    string Wallet = "Unknown",
    [property: Range(0.0, double.MaxValue)] double AmountIdr = 0.0);

public record CategorizeAgentResponse(
    string Category, double Confidence, string Reasoning, int ToolCallsCount);
```

Add a rules loader next to the existing `_load_categories()` in [main.py](../../../services/ai-service/app/main.py) — same shape, same failure posture (a DB outage must not crash startup):

```python
async def _load_rules(db_url: str) -> dict[str, str]:
    """Snapshot the 106 category rules for the agent's search_category_rules tool.

    Columns are (id, keyword, type, category, keyword_length) — see
    supabase/migrations/20260101000000_initial_schema.sql. Mirrors
    _load_categories(): failure degrades the tool, never blocks the service.
    """
    try:
        conn = await asyncpg.connect(db_url)
        try:
            rows = await conn.fetch("SELECT keyword, category FROM category_rules")
        finally:
            await conn.close()
        return {r["keyword"]: r["category"] for r in rows}
    except Exception:
        logger.exception("failed to load category rules — agent rule tool will return no matches")
        return {}
```

Then wire it in the lifespan, **after** `app.state.retriever` and `app.state.categories` already exist:

```python
from app.agents.categorizer_agent import CategorizerAgent
from app.agents.tools.category_rules import load_rules
from app.agents.tools.categories import load_categories
from app.agents.tools.similarity import configure as configure_retriever
from smolagents.monitoring import instrument_smolagents

# Tool 1 — rules snapshot straight from the DB.
rules = await _load_rules(settings.database_url)
load_rules(rules)

# Tool 2 — hand the tool the SAME retriever instance /search and /ask use.
configure_retriever(app.state.retriever)

# Tool 3 — reuse the vocabulary already loaded on line ~91 for the query planner.
load_categories(app.state.categories)

app.state.categorizer_agent = CategorizerAgent()
instrument_smolagents()          # after set_tracer_provider() — see STEP 4
logger.info("Categorizer agent ready — %d rules, %d categories",
            len(rules), len(app.state.categories))
```

> **Three things the earlier draft of this plan got wrong here — all worth understanding, because they're the standard way agent wiring breaks:**
> 1. `app.state.retriever._conn` **does not exist.** [retriever.py](../../../services/ai-service/app/services/retriever.py) opens a fresh `asyncpg.connect()` per call and closes it in a `finally` — there is no long-lived connection to borrow. Reaching into another object's private attribute is what made this look plausible; it would have raised `AttributeError` at startup.
> 2. The column is **`category`, not `category_name`.** Verified against the initial-schema migration. A wrong column name here fails at startup with an asyncpg error that names the column — easy to fix, but only if you don't skip past it.
> 3. The vocabulary must come from **`app.state.categories`**, not a hand-written constant. It's already loaded four lines above.
>
> The pattern: an agent is mostly *wiring existing services into tool functions*. Almost every bug in that wiring is a wrong assumption about the services, not about the agent framework.

Add the endpoint:

```python
@app.post("/categorize-agent", response_model=CategorizeAgentResponse)
async def categorize_with_agent(request: CategorizeAgentRequest) -> CategorizeAgentResponse:
    """Categorize a transaction using the ReAct agent with visible reasoning trace.

    Slower than /categorize (1–3 LLM calls vs 0–1) but shows its work — use for
    debugging edge cases, demos, or when the fast path returns 'Other'.
    """
    try:
        result = await asyncio.to_thread(
            app.state.categorizer_agent.categorize,
            request.description,
            request.wallet,
            request.amount_idr,
        )
        return CategorizeAgentResponse(
            category=result.category,
            confidence=result.confidence,
            reasoning=result.reasoning,
            tool_calls_count=result.tool_calls_count,
        )
    except Exception as exc:
        logger.exception("agent categorization failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

**C# equivalent** (FastAPI route + lifespan wiring → ASP.NET Core controller action + DI registration in `Program.cs`; `asyncio.to_thread` → nothing — the agent call is already `async Task`; `HTTPException(502)` → `StatusCode(502, ...)`):

```csharp
// Program.cs — DI registration replaces the lifespan wiring
builder.Services.AddSingleton<CategorizerAgent>();

// CategorizeAgentController.cs
[ApiController]
[Route("api/[controller]")]
public class CategorizeAgentController : ControllerBase
{
    private readonly CategorizerAgent _agent;
    private readonly ILogger<CategorizeAgentController> _logger;

    public CategorizeAgentController(CategorizerAgent agent, ILogger<CategorizeAgentController> logger)
    {
        _agent = agent;
        _logger = logger;
    }

    [HttpPost]
    public async Task<ActionResult<CategorizeAgentResponse>> Categorize(CategorizeAgentRequest request)
    {
        try
        {
            var result = await _agent.CategorizeAsync(
                request.Description, request.Wallet, request.AmountIdr);
            return Ok(new CategorizeAgentResponse(
                result.Category, result.Confidence, result.Reasoning, result.ToolCallsCount));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "agent categorization failed");
            return StatusCode(502, new { detail = "llm_parse_error" });
        }
    }
}
```

> **Why a separate `/categorize-agent` endpoint (not replacing `/categorize`)?** The existing `/categorize` is the production path — fast, 4-layer, no agent overhead. The agent path is slower (1–3 LLM calls per request) and is invoked for debugging, edge cases, and demos. Both being live lets you compare: "same transaction, fast path says 'Shopping', agent says 'Shopping (Online)' with reasoning: 'Tokopedia rule matched + 3 past similar transactions confirmed Shopping (Online).' " That comparison is itself interview content.

> **Why 502 on agent failure (not 500)?** The error contract in `.claude/rules/ai-service.md`: LLM/provider failures are upstream-dependency errors → 502. Returning 200-with-empty is explicitly forbidden — it would poison any downstream evaluation with fake successes.

### [x] STEP 6 — Write unit tests in `tests/test_categorizer_agent.py`

> **Done 2026-08-05.** All 5 tests from the plan implemented (parse structured fields, garbage fallback to Other, non-numeric confidence survival, categorize calls agent.run, re-raise on agent error) — plus an added assertion that `tool_calls_count` is genuinely read from a populated `agent.memory.steps` mock (not just present). `ToolCallingAgent`/`LiteLLMModel` mocked at the class level per the plan — no real LLM calls. 5/5 pass. Note: the real (unmocked) `langfuse` client is still exercised by these tests (matches existing codebase precedent — `gemini.py`/`anthropic.py` providers already do this in their own tests) — with real Langfuse keys configured locally this produces real (harmless) trace entries even from unit test runs; confirmed via the Langfuse API while investigating STEP 7 that two of these traces (inputs `"TX"` and `"GJ*GRAB CAR JAKARTA"`) are from this test file, not from the live smoke test.

```python
"""Unit tests for CategorizerAgent — mocked smolagents, no real LLM calls."""
from unittest.mock import MagicMock, patch
import pytest

from app.agents.categorizer_agent import CategorizationResult, CategorizerAgent, _parse_result

def test_parse_result_extracts_structured_fields():
    raw = (
        "CATEGORY: Food & Dining\n"
        "CONFIDENCE: 0.9\n"
        "REASONING: Rule matched 'starbucks' → Food & Dining (Café)."
    )
    result = _parse_result(raw)
    assert result.category == "Food & Dining"
    assert result.confidence == pytest.approx(0.9)
    assert "starbucks" in result.reasoning.lower()

def test_parse_result_falls_back_to_other_on_garbage_output():
    result = _parse_result("nothing useful here at all")
    assert result.category == "Other"
    assert result.confidence == pytest.approx(0.5)

def test_parse_result_survives_non_numeric_confidence():
    # LLMs annotate confidence often enough that float() would 502 a good run.
    raw = "CATEGORY: Transfer\nCONFIDENCE: 0.8 (high)\nREASONING: Rule matched."
    assert _parse_result(raw).confidence == pytest.approx(0.8)

    raw_bad = "CATEGORY: Transfer\nCONFIDENCE: high\nREASONING: Rule matched."
    assert _parse_result(raw_bad).confidence == pytest.approx(0.5)

@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_calls_agent_run(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.return_value = (
        "CATEGORY: Transportation\n"
        "CONFIDENCE: 0.85\n"
        "REASONING: Grab rule matched → Transportation (Online)."
    )
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    result = agent.categorize("GJ*GRAB CAR JAKARTA", "BCA", 35000)

    mock_agent.run.assert_called_once()
    assert result.category == "Transportation"
    assert result.confidence == pytest.approx(0.85)

@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_re_raises_on_agent_error(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.side_effect = RuntimeError("model timeout")
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    with pytest.raises(RuntimeError, match="model timeout"):
        agent.categorize("TX", "BCA", 0)
```

**C# equivalent** (pytest functions → xUnit `[Fact]` with `Method_Condition_ExpectedResult` naming; `@patch` class-level mocking → `Mock<T>` constructor injection via Moq; `pytest.approx` → `Assert.Equal` with precision; `pytest.raises` → `Assert.ThrowsAsync`):

```csharp
public class CategorizerAgentTests
{
    [Fact]
    public void ParseResult_StructuredOutput_ExtractsAllFields()
    {
        // Arrange
        var raw = "CATEGORY: Food & Dining\nCONFIDENCE: 0.9\n" +
                  "REASONING: Rule matched 'starbucks' → Food & Dining (Café).";

        // Act
        var result = CategorizerAgent.ParseResult(raw);

        // Assert
        Assert.Equal("Food & Dining", result.Category);
        Assert.Equal(0.9, result.Confidence, precision: 2);
        Assert.Contains("starbucks", result.Reasoning, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ParseResult_GarbageOutput_FallsBackToOther()
    {
        // Act
        var result = CategorizerAgent.ParseResult("nothing useful here at all");

        // Assert
        Assert.Equal("Other", result.Category);
        Assert.Equal(0.5, result.Confidence, precision: 2);
    }

    [Fact]
    public async Task CategorizeAsync_AgentError_ReThrows()
    {
        // Arrange — inject a kernel whose prompt invocation throws
        var mockKernel = new Mock<IAgentRunner>();   // thin interface over Kernel for testability
        mockKernel.Setup(k => k.RunAsync(It.IsAny<string>()))
                  .ThrowsAsync(new TimeoutException("model timeout"));
        var agent = new CategorizerAgent(mockKernel.Object, NullLogger<CategorizerAgent>.Instance);

        // Act + Assert
        await Assert.ThrowsAsync<TimeoutException>(
            () => agent.CategorizeAsync("TX", "BCA", 0));
    }
}
```

> Argument-order trap: `Assert.Equal(expected, actual)` — the Python `assert result.category == "Other"` reads the opposite way. Also note SK's `Kernel` isn't mock-friendly directly; wrapping it behind a thin `IAgentRunner` interface is the Moq-compatible pattern (the analogue of patching `ToolCallingAgent` at the class level).

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_categorizer_agent.py -v
```

> **Why mock `ToolCallingAgent` at the class level?** smolagents' `ToolCallingAgent.__init__` may attempt to validate or initialize the LiteLLM model, which fails in CI without API keys. Patching the class at import prevents that initialization. Same pattern as mocking `anthropic.AsyncAnthropic` in the extraction tests — per `.claude/rules/ai-service.md`.

### [!] STEP 7 — Write + run the 5-transaction smoke test

> **Failure (partial): 1/5 exact matches confirmed live, not 5/5 — blocked by Gemini's free-tier daily quota (20 req/day), not a code defect.** `scripts/test_agent.py` built and runs correctly. The local dev DB's actual vocabulary (5 categories: `Bill`, `Emergency Fund`, `Food & Drinks`, `Loan`, `Salary`; only 5 `category_rules` rows) is far thinner than the plan's Starbucks/Tokopedia/Grab placeholder fixtures assume — rewrote the 5 test transactions around the DB's real categories per the plan's own script comment ("check GET /search results or the DB"). `transaction_embeddings` was also empty (a prior `supabase db reset` wiped the PF-AI003 backfill) — ran `backfill_embeddings.py --yes` (24 txns) first so Tool 2 had real vectors, otherwise it would have been dead weight by construction.
>
> Transaction 1 ("Monthly salary payment") completed the full ReAct loop correctly: `search_category_rules("salary")` → "No rules matched." → `find_similar_transactions` → 3 real "Salary" matches from the backfill (similarity 0.62) → `list_all_categories` → `CATEGORY: Salary`, exact match to expected. Live-verified via the Langfuse API: full trace tree present (agent span + 3 tool child spans, correctly nested) — satisfies the Langfuse acceptance criterion with real evidence, not a mocked one.
>
> Transaction 2 hit `429 RESOURCE_EXHAUSTED` mid-loop. First attempt: the 5-req/minute free-tier RPM cap (a single agent run alone burns ~4 completions in under 10s — back-to-back transactions trip it even though each run alone is under the limit). Added 65s inter-transaction pacing and retried; second attempt failed on the **daily** cap instead (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20/day, already exhausted). `ANTHROPIC_API_KEY` is unset (no funded fallback). This is the third distinct confirmation of this exact wall in this project (Day 42, Day 48, now 2026-08-05/Day 71 — see [progress.md](../../../docs/mentor/progress.md)) — a fixed daily reset, not something same-day retries or pacing can work around. Stopped rather than burn tomorrow's quota chasing a 5/5 that couldn't complete today.
>
> **Deferred:** re-run the remaining 4/5 transactions once the Gemini daily quota resets or a paid tier / funded Anthropic key exists.

Create [test_agent.py](../../../services/ai-service/scripts/test_agent.py):

```python
"""Smoke test: run the categorizer agent on 5 hand-picked transactions.

Usage:
    cd services/ai-service && PYTHONPATH=. python scripts/test_agent.py

Requires the AI service running on port 8000.
Prints: description | category | confidence | reasoning (truncated) | tool_calls
"""
import asyncio
import httpx

# Each fixture carries the category you expect. "Non-null category" is not a
# quality bar — five "Other"s would pass it. Set `expected` to a name that
# actually exists in YOUR vocabulary (check GET /search results or the DB).
TEST_TRANSACTIONS = [
    {"description": "STARBUCKS COFFEE GRAND INDONESIA", "wallet": "BCA",
     "amount_idr": 72000, "expected": "Food & Drink"},
    {"description": "TOKOPEDIA*BELANJA ELEKTRONIK", "wallet": "BCA",
     "amount_idr": 1500000, "expected": "Shopping"},
    {"description": "PLN PREPAID TOKEN LISTRIK", "wallet": "Superbank",
     "amount_idr": 200000, "expected": "Bills & Utilities"},
    {"description": "GJ*GRAB CAR JAKARTA SELATAN", "wallet": "BCA",
     "amount_idr": 35000, "expected": "Transportation"},
    {"description": "TRANSFER MASUK DARI RIKKY", "wallet": "BCA",
     "amount_idr": 5000000, "expected": "Transfer"},
]

URL = "http://localhost:8000/categorize-agent"
FAST_URL = "http://localhost:8000/categorize"

async def main() -> None:
    passed = 0
    async with httpx.AsyncClient(timeout=60.0) as client:
        for tx in TEST_TRANSACTIONS:
            payload = {k: v for k, v in tx.items() if k != "expected"}
            t0 = time.perf_counter()
            resp = await client.post(URL, json=payload)
            resp.raise_for_status()
            elapsed = time.perf_counter() - t0
            r = resp.json()

            ok = r["category"] == tx["expected"]
            passed += ok
            print(f"\n{'─' * 70}")
            print(f"  Description : {tx['description']}")
            print(f"  Expected    : {tx['expected']}")
            print(f"  Got         : {r['category']}  {'✅' if ok else '❌'}"
                  f"  (confidence={r['confidence']:.2f})")
            print(f"  Reasoning   : {r['reasoning'][:120]}...")
            print(f"  Tool calls  : {r['tool_calls_count']}    Latency: {elapsed:.2f}s")

    print(f"\n{'═' * 70}\n  {passed}/{len(TEST_TRANSACTIONS)} correct")

if __name__ == "__main__":
    asyncio.run(main())
```

Add `import time` alongside `asyncio` and `httpx`.

**C# equivalent** (`asyncio.run(main())` → `async Task Main`; `httpx.AsyncClient` → `HttpClient` + `System.Net.Http.Json`; f-string report → interpolated strings):

```csharp
using System.Net.Http.Json;

var testTransactions = new[]
{
    new { description = "STARBUCKS COFFEE GRAND INDONESIA", wallet = "BCA", amount_idr = 72000 },
    new { description = "TOKOPEDIA*BELANJA ELEKTRONIK", wallet = "BCA", amount_idr = 1500000 },
    new { description = "PLN PREPAID TOKEN LISTRIK", wallet = "Superbank", amount_idr = 200000 },
    new { description = "GJ*GRAB CAR JAKARTA SELATAN", wallet = "BCA", amount_idr = 35000 },
    new { description = "TRANSFER MASUK DARI RIKKY", wallet = "BCA", amount_idr = 5000000 },
};

using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
const string url = "http://localhost:8000/categorize-agent";

foreach (var tx in testTransactions)
{
    var resp = await client.PostAsJsonAsync(url, tx);
    resp.EnsureSuccessStatusCode();
    var r = await resp.Content.ReadFromJsonAsync<CategorizeAgentResponse>();
    Console.WriteLine(new string('─', 70));
    Console.WriteLine($"  Description : {tx.description}");
    Console.WriteLine($"  Category    : {r!.Category}  (confidence={r.Confidence:F2})");
    Console.WriteLine($"  Reasoning   : {r.Reasoning[..Math.Min(120, r.Reasoning.Length)]}...");
    Console.WriteLine($"  Tool calls  : {r.ToolCallsCount}");
}
```

Run:

```bash
# Terminal 1: start ai service (if not already running)
cd services/ai-service && uvicorn app.main:app --reload --port 8000

# Terminal 2: run the smoke test
cd services/ai-service && PYTHONPATH=. python scripts/test_agent.py
```

**The bar: 5/5 exact matches**, each with `tool_calls_count ≥ 1` and a reasoning string naming the tool that produced the evidence.

If you get 3/5, that is the interesting outcome — don't lower the bar. Open the two failing traces in Langfuse and diagnose *which link broke*: did the agent skip `search_category_rules` (docstring ordering, see Knowledge Check #3)? Did `find_similar_transactions` return `uncategorized` rows (STEP 1c not applied to both retriever paths)? Did it invent a category name (vocabulary snapshot empty)? Each failure maps to a specific line you wrote. That diagnosis loop is the actual skill this chapter teaches — a first run that passes 5/5 teaches less.

Also record the latency numbers. You now have the honest version of the comparison story: *"the agent is N× slower than the fast path and costs 1–3 LLM calls instead of 0–1; here's the trace that justifies it."*

**What to look for in Langfuse after the smoke test:** open the dashboard and find the 5 new traces. Each trace shows a tree: parent = agent run, children = individual tool call spans. Click into a span to see the tool input (the keyword passed) and the tool output (matched rules or similar transactions). *This* is the "observable agentic reasoning" demo — not just a prediction, a full reasoning trail.

> **Comparison story:** run the same 5 transactions against `/categorize` (the fast 4-layer path) and note where the two diverge. Identical result + different latency = the agent's cost for explainability. That tradeoff is interview content.

### [ ] STEP 8 — Stretch: DeepLearning.AI Functions, Tools and Agents with LangChain

> Not attempted this session — explicitly optional per the plan ("don't let it block the commit"). Does not block Chapter 7 close-out.

If time allows (this is optional — don't let it block the commit): complete DeepLearning.AI *Functions, Tools and Agents with LangChain* (free, ~3h) → https://learn.deeplearning.ai (search "Functions, Tools and Agents").

This course bridges smolagents' tool-calling primitives to LangChain's function-calling API, which LangGraph (Chapter 8) builds on. Complete it between STEP 7 and the Chapter 8 start — not as a blocker to this chapter's commit.

### [x] STEP 9 — Full test pass + commit

> **Test pass done 2026-08-05: 138 passed, 1 pre-existing unrelated failure** (`test_is_pii_keyword[REK123456-True]` in `test_merchant_suggester.py` — the same pre-existing failure logged 2026-07-24, untouched by this chapter). No regressions from PF-AI007 changes. **Commit intentionally NOT run** — per this session's execute skill, all changes are left uncommitted for the user to review in their git client rather than auto-committed.

```bash
# Full suite — STEP 1c touched shared retrieval code, so run everything,
# not just the new file.
cd services/ai-service && PYTHONPATH=. pytest -q
cd /c/workspaces/personal-finance
git add services/ai-service/app/agents/
git add services/ai-service/app/models.py
git add services/ai-service/app/services/retriever.py
git add services/ai-service/app/main.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_categorizer_agent.py
git add services/ai-service/scripts/test_agent.py
git status    # verify NO .env, NO credentials
git commit -m "PF-AI007: Chapter 7 — Transaction Categorizer Agent (smolagents ToolCallingAgent, 3 tools, Langfuse traces)"
```

### [x] STEP 10 — Log progress

> **Done 2026-08-05.** Full session entry (Day 71) written to [progress.md](../../../docs/mentor/progress.md), including the STEP 0 active-retrieval answers, the STEP 1b version-surface findings, the tracing-fallback design, the STEP 1c regression + fix, and the STEP 7 quota-wall diagnosis.

```
/mentor log Built Transaction Categorizer Agent (smolagents ToolCallingAgent, 3 tools: search_category_rules / find_similar_transactions / list_all_categories); all 5 smoke-test transactions categorized correctly; tool calls visible as Langfuse child spans. Chapter 7 complete.
```

## 📌 Notes

- **smolagents version check first.** STEP 1b covers this — `instrument_smolagents()` lives in `smolagents.monitoring` from v1.9+, and the system-prompt kwarg name has moved across releases. Don't start STEP 3 without it.
- **`find_similar_transactions` needs the DB, not the HTTP service.** It calls `app.state.retriever` in-process via `asyncio.run()`, so a running Postgres with embeddings (PF-AI003 backfill) is the real prerequisite. In unit tests the tool is never called (the agent is mocked). In the smoke test, the service is running anyway.
- **STEP 1c touches two retriever paths.** `_search_vector()` **and** `_fetch_results_by_ids()` both build `SearchResult`. Patch only the first and vector search shows categories while hybrid/BM25 silently shows `None` — a bug that appears only when you flip `search_mode`.
- **`category_rules` columns are `(id, keyword, type, category, keyword_length)`.** Verified against [20260101000000_initial_schema.sql](../../../supabase/migrations/20260101000000_initial_schema.sql). There is no `category_name`.
- **Tool errors must not escape.** Every `@tool` returns a string on failure — never raises. A raised exception aborts the run and throws away evidence the agent already gathered.
- **`max_steps=3` may need tuning.** If the agent hits the step limit (you'll see "Max iterations reached" in the logs), investigate *why* before raising the limit. Usually it's an ambiguous tool docstring — the LLM doesn't know when to stop. Fix the docstring; don't just raise `max_steps`.
- **Why not LangChain / LlamaIndex for this chapter?** Those frameworks arrive in Chapter 8+ (LangGraph) and later. Building in raw smolagents first means you understand what the frameworks abstract. "I know what LangGraph adds because I built the raw version first" is a stronger position than "I just used LangChain from day one."
- **THINK-05 (frozen contract):** `CategorizeAgentRequest` and `CategorizeAgentResponse` are new contract surface. When .NET grows a `/categorize-agent` proxy (future feature, not in this chapter), freeze these fields and update [ai-service.md](../../rules/ai-service.md).
- **Next chapter (8 — LangGraph):** the `CategorizerAgent` becomes one *node* in the Financial Advisor graph. The 3 tools become graph tools. `max_steps=3` becomes explicit `END` routing. You'll understand what LangGraph adds — and why — because you've now seen what it replaces.
- **Deferred:** conversation memory within a categorization session (Chapter 8), MCP server exposing tools to Claude Desktop (Chapter 9), streaming the reasoning steps token-by-token (Chapter 5 streaming applies to `/ask` first).

## 📚 Resources / Theory to Learn

Organized by when you need them — read just before the step that uses it.

### Concept 1 — The ReAct agent loop (STEP 0)
- **HF Agents Course, Unit 1** → https://huggingface.co/learn/agents-course/unit1/introduction — the canonical agent loop (Observe → Reason → Act). Read Unit 1 in full before writing a single line of agent code.
- **HF Agents Course, Unit 2 — smolagents** → https://huggingface.co/learn/agents-course/unit2/smolagents — `@tool`, `ToolCallingAgent` vs `CodeAgent`, running the first example. Estimated 25 min.
- **Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*** (2022) → https://arxiv.org/abs/2210.03629 — skim abstract + Figure 1 for the canonical ReAct diagram; skip the math. The interview vocabulary ("Reason → Act → Observe") comes from this paper.

### Concept 2 — ToolCallingAgent vs CodeAgent (STEP 3)
- **smolagents docs — Agent types** → https://huggingface.co/docs/smolagents/en/conceptual_guides/react_and_code_agents — the side-by-side comparison. Read before writing `CategorizerAgent` to cement why you're choosing `ToolCallingAgent`.
- **smolagents docs — Writing good tools** → https://huggingface.co/docs/smolagents/en/tutorials/building_good_tools — "the tool docstring IS the schema description." Bad docstrings = bad tool choices. Read before STEP 2.

### Concept 3 — OTel tracing in smolagents (STEP 4)
- **smolagents docs — Monitoring** → https://huggingface.co/docs/smolagents/en/tutorials/inspect_runs — the `instrument_smolagents()` call and what OTel spans it emits.
- **Langfuse — OpenTelemetry integration** → https://langfuse.com/docs/opentelemetry — how our existing OTLP exporter receives smolagents spans. Skim the "Traces" section to understand the parent/child span shape.

### Concept 4 — Bridge to LangGraph (preview for Chapter 8)
- **LangChain blog — *Introduction to LangGraph*** → https://blog.langchain.dev/langgraph/ — read the first two sections only ("What is LangGraph" + "Motivation"). The key insight: LangGraph replaces the implicit `max_steps` loop with an explicit state graph. Everything you built in Chapter 7 becomes one node in Chapter 8's graph.
- **DeepLearning.AI — *Functions, Tools and Agents with LangChain*** → https://learn.deeplearning.ai — the STEP 8 stretch task; bridges smolagents to LangChain primitives that LangGraph sits on top of.

## 🧠 Learning Strategy

**Daily loop for Chapter 7:**
- **Morning (60–90 min, deep block #1):** STEP 0 (HF Agents Course) + STEPs 1/1b/1c (install, API check, `SearchResult.category`). Stop when you can explain the ReAct loop from memory without looking at notes.
- **Midday (90 min, deep block #2):** STEPs 2–3 (tools + agent). Stop when `CategorizerAgent.categorize("STARBUCKS", "BCA", 72000)` runs without error (even if output is imperfect — you're verifying the loop works, not the quality yet).
- **Afternoon (60 min):** STEPs 4–5 (OTel + endpoint). The Langfuse span tree is this chapter's demo artifact — don't skip the verification.
- **Next session (60 min):** STEPs 6–9 (tests + smoke test + commit + log). The smoke test is not optional.

**The 5 principles applied to Chapter 7:**
1. **Active retrieval:** STEP 0's write-from-memory section. If you can't explain ReAct without notes, the tools will work by accident — not by design.
2. **Project-first:** don't read the smolagents docs cover-to-cover. Read Unit 1–2, then open the project and build STEP 2. Pull docs when you hit a wall.
3. **Same-day shipping:** tools + agent (STEPs 2–3) in session 1; endpoint + tests (STEPs 4–6) in session 2. Two commits, not one.
4. **Interleaving:** while smolagents installs (STEP 1), skim the Chapter 8 LangGraph intro. Not distraction — context priming. You'll see Chapter 7 and Chapter 8 as two levels of the same abstraction.
5. **Teach-back:** after STEP 3, close the editor. Say out loud: "smolagents is the ReAct loop — observe tools, reason about next step, call a tool, repeat. LangGraph makes each step a node in a graph so you can add conditional routing. MCP makes each tool a server any agent can call. I've built the raw version now."

**Anti-patterns to avoid:**
- ❌ Using `CodeAgent` instead of `ToolCallingAgent`. Code execution in a web service is a security vulnerability — explicitly the wrong call here.
- ❌ Calling `agent.run()` directly inside `async def` without `asyncio.to_thread`. You'll stall the event loop for the full agent duration (1–5s) and timeout every concurrent request.
- ❌ Calling the real LLM in unit tests. Mock `ToolCallingAgent` at the class level — per ai-service.md patterns.
- ❌ Giving the agent 7+ tools. Start with 3 and measure. More tools = more indirection = harder to trace when the agent loops.
- ❌ Skipping the Langfuse verification after the smoke test. The trace tree is the proof point. Without it, "I built an observable agent" is an empty claim.
- ❌ Returning 200 with empty category on LLM failure. The error contract says 502 — evaluation harnesses depend on it.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I built a transaction categorizer agent using smolagents ToolCallingAgent with 3 tools: rule-based keyword search, semantic similarity search via pgvector (from Chapter 3), and a category vocabulary guard. The agent runs a ReAct loop — max 3 iterations — and every tool call is a Langfuse child span. I can show you the trace where it called search_category_rules, got 'No rules matched', then called find_similar_transactions, found 3 past 'Shopping (Online)' transactions, and returned that category with 0.7 confidence. That's observable agentic reasoning — not just a demo, a debuggable production artifact."*

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. The ReAct loop (Databricks · Google Cloud PMLE)

*Scenario:* You are explaining your smolagents categorizer to an interviewer. They ask: "What does the agent actually do between receiving the transaction description and returning a category?"

*Question:* Which sequence correctly describes the ReAct agent loop?

- **A.** The LLM generates the final answer in one shot, then optionally calls tools to verify it
- **B.** The LLM calls all tools in parallel, aggregates the results, and generates a final answer
- **C.** The agent pre-selects the correct tool based on input type, then executes it exactly once
- **D.** The LLM observes the current state (input + any prior tool outputs), reasons about the next action, calls a tool, observes the new output, and repeats until it has sufficient evidence to produce a final answer

<details>
<summary>Show answer</summary>

**D** — ReAct (Reason + Act) is an iterative loop: observe → reason → act (call a tool) → observe again → repeat. The LLM does not answer in one shot (A), tools are not called in parallel (B), and the tool choice is decided by the LLM at each iteration based on what it has learned so far — not pre-selected (C).
*Maps to: Databricks GenAI Engineer Associate · Agentic AI & Tool Use; Google Cloud PMLE · AI Agents & Reasoning*
</details>

### 2. ToolCallingAgent vs CodeAgent (Azure AI-102 · Databricks)

*Scenario:* Your personal-finance AI service exposes `/categorize-agent` to end users. A colleague suggests smolagents' `CodeAgent` because it's more flexible. You reject it.

*Question:* What is the primary reason to use `ToolCallingAgent` instead of `CodeAgent` in a production web service?

- **A.** `CodeAgent` generates and executes arbitrary Python code — which can include dangerous system calls; `ToolCallingAgent` constrains the LLM to structured JSON tool calls only, matching the `tool_use` pattern already used in the extraction pipeline
- **B.** `CodeAgent` requires GPU access; `ToolCallingAgent` runs on CPU
- **C.** `ToolCallingAgent` is faster because it skips the reasoning step
- **D.** `ToolCallingAgent` has built-in rate limiting that prevents overuse

<details>
<summary>Show answer</summary>

**A** — `CodeAgent` can generate `os.system("rm -rf /")` or arbitrary network calls and execute them — a critical vulnerability in any multi-tenant or internet-facing service. `ToolCallingAgent` limits the LLM's actions to the declared tool list, expressed as JSON. This is the same reason the extraction pipeline uses `tool_use` with explicit schema validation instead of free-text parsing.
*Maps to: Azure AI-102 · Responsible AI & Security; Databricks GenAI Engineer Associate · Production AI Security*
</details>

### 3. Tool docstring quality (Databricks · AWS ML Engineer)

*Scenario:* Your `find_similar_transactions` tool is being called even when a clear rule match exists. The Langfuse trace shows it firing first, before `search_category_rules`.

*Question:* What is the most likely cause, and how do you fix it?

- **A.** The similarity search endpoint is faster — add a timeout to deprioritize it
- **B.** `ToolCallingAgent` calls tools in the order they appear in the tools list; reorder them
- **C.** The `search_category_rules` docstring doesn't say "Use this tool FIRST" — the LLM has no grounding for the intended call order. Fix: add explicit ordering guidance to both tool docstrings
- **D.** smolagents caches the tool call order from the previous request — restart the service

<details>
<summary>Show answer</summary>

**C** — the tool docstring IS the schema description the LLM sees when it decides which tool to call. Without explicit ordering guidance, the LLM reasons from description relevance alone. Adding "Use this tool FIRST" to `search_category_rules` and "Use this when rules return No rules matched" to `find_similar_transactions` steers the agent toward the intended strategy. The LLM does not use list order (B) or caching (D) as selection criteria.
*Maps to: Databricks GenAI Engineer Associate · Prompt Engineering for Agents; AWS Certified ML Engineer – Associate · Model optimization*
</details>

### 4. Blocking the async event loop (Google Cloud PMLE · Azure AI-102)

*Scenario:* You call `agent.run()` directly inside your FastAPI `async def categorize_with_agent()` endpoint. Under moderate load, `/health` and `/search` start timing out.

*Question:* Why does this happen, and what is the correct fix?

- **A.** smolagents is not thread-safe; use a threading lock to serialize calls
- **B.** `agent.run()` is synchronous CPU-bound work; calling it inline inside `async def` blocks the FastAPI event loop for the full agent duration, starving all concurrent requests. Fix: `await asyncio.to_thread(agent.run, ...)` to offload it to the thread pool
- **C.** The agent is making too many LLM calls; reduce `max_steps` to 1
- **D.** FastAPI cannot handle agentic workloads; use a dedicated Celery worker

<details>
<summary>Show answer</summary>

**B** — FastAPI's event loop is single-threaded. A synchronous blocking call inside `async def` holds the loop for its full duration — every other request queues behind it. `asyncio.to_thread()` offloads the sync call to the thread pool, freeing the event loop to handle concurrent requests. This is the same fix applied to FlashRank in Chapter 4 and the same principle as `Task.Run()` in ASP.NET Core for CPU-bound sync work.
*Maps to: Google Cloud PMLE · Production deployment patterns; Azure AI-102 · Scalable AI service design*
</details>

### 5. OTel hook ordering at startup (Databricks · AWS ML Engineer)

*Scenario:* You call `instrument_smolagents()` at service startup and run 5 transactions via the smoke test. Langfuse shows 5 parent traces but no child spans for individual tool calls.

*Question:* What is the most likely cause?

- **A.** `instrument_smolagents()` was called before the OTLP exporter was configured; it registered a hook with no destination, so tool spans are silently dropped
- **B.** OTel spans are emitted only for LLM calls, not tool calls — you need a separate manual tracer for tools
- **C.** smolagents emits only one parent span per run by design; tool spans require a separate SDK
- **D.** The Langfuse dashboard paginates; scroll down to find tool spans under the parent

<details>
<summary>Show answer</summary>

**A** — `instrument_smolagents()` registers the OTel hook at call time, binding to whatever `TracerProvider` is active at that moment. If the OTLP exporter (pointing at Langfuse) is configured *after* this call, the hook fires into a no-op provider — parent traces may appear from a different pre-existing tracer, but tool-call child spans are lost. Fix: ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set and the provider is initialized *before* `instrument_smolagents()` in the startup sequence.
*Maps to: Databricks GenAI Engineer Associate · AI Observability; AWS Certified ML Engineer – Associate · Model monitoring*
</details>

### 6. Observability as a competitive signal (Databricks · Azure AI-102)

*Scenario:* An interviewer at an async-first company asks: "How do you debug a wrong category prediction from your agent?"

*Question:* What answer best demonstrates production AI engineering maturity?

- **A.** "We add more training examples and retrain the model."
- **B.** "We increase `max_steps` so the agent has more time to reconsider."
- **C.** "We check the output in unit tests after each deployment."
- **D.** "Every agent run produces a Langfuse trace with a child span per tool call — I can see which tools were called, with what arguments, and what they returned for any specific prediction. When a wrong category is reported, I replay the trace to identify which tool produced misleading output and fix it there — either the rule, the similarity data, or the tool docstring."

<details>
<summary>Show answer</summary>

**D** — "I can show you the trace" is the production AI engineering answer. It demonstrates: (1) observability was designed in, not bolted on after a bug; (2) debugging is trace-driven, not guess-driven; (3) agent failures are tool failures — you fix the tool or its data, not the LLM. Unit tests (C) don't cover the reasoning path; more steps (B) don't diagnose the cause; retraining (A) is wrong category entirely for a tool-calling agent.
*Maps to: Databricks GenAI Engineer Associate · AI Observability & Debugging; Azure AI-102 · Monitoring AI applications*
</details>
