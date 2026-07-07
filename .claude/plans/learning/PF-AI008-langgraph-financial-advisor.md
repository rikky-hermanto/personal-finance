# PF-AI008 — LangGraph: Stateful Financial Health Advisor

> **Learning Phase:** Phase 2 · Chapter 8 of 12 · Day ~45 of 90
> **Status:** To Do
> **Planned from branch:** main
> **Pivot goal:** Build a multi-step conversational agent with LangGraph — state, conditional routing, tool use, conversation memory, and error handling. After this chapter, you have the dominant agent framework in current AI Eng JDs checked off with a real, demo-able artifact grounded in your own financial data.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
  - [High level — what is this?](#high-level--what-is-this)
  - [StateGraph vs. a hand-rolled loop](#stategraph-vs-a-hand-rolled-loop)
  - [The add_messages reducer](#the-add_messages-reducer)
  - [Conditional routing and the fallback node](#conditional-routing-and-the-fallback-node)
  - [Memory across turns — MemorySaver and thread_id](#memory-across-turns--memorysaver-and-thread_id)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
    - [STEP 0 — Prerequisite gate: Chapter 7 smolagents complete](#--step-0--prerequisite-gate-chapter-7-smolagents-complete)
    - [STEP 1 — Theory anchor: LangGraph mental model (45 min)](#--step-1--theory-anchor-langgraph-mental-model-45-min)
    - [STEP 2 — THINK-03 gate: justify `AdvisorState` fields before coding](#--step-2--think-03-gate-justify-advisorstate-fields-before-coding)
    - [STEP 3 — Add deps; create `app/agents/state.py`](#--step-3--add-deps-create-appagentsstatepy)
    - [STEP 4 — Build `app/agents/tools.py` (the 4 data-fetch tools)](#--step-4--build-appagentstoolspy-the-4-data-fetch-tools)
    - [STEP 5 — Build `app/agents/financial_advisor.py` (the graph)](#--step-5--build-appagentsfinancial_advisorpy-the-graph)
    - [STEP 6 — Build `app/services/advisor.py` (the service wrapper)](#--step-6--build-appservicesadvisorpy-the-service-wrapper)
    - [STEP 7 — Add `/advisor` models to `app/models.py`](#--step-7--add-advisor-models-to-appmodelspy)
    - [STEP 8 — Wire `POST /advisor` in `app/main.py`](#--step-8--wire-post-advisor-in-appmainpy)
    - [STEP 9 — Unit tests for graph routing (`tests/test_advisor_agent.py`)](#--step-9--unit-tests-for-graph-routing-teststest_advisor_agentpy)
    - [STEP 10 — Write 5 evaluation scenarios (`evals/advisor_scenarios.json`)](#--step-10--write-5-evaluation-scenarios-evalsadvisor_scenariosjson)
    - [STEP 11 — Update `docs/performances/ai-observability-metrics.md`](#--step-11--update-docsperformancesai-observability-metricsmd)
    - [STEP 12 — Full test pass + commit](#--step-12--full-test-pass--commit)
    - [STEP 13 — Log progress](#--step-13--log-progress)
  - [📌 Notes](#-notes)
  - [📚 Resources / Theory to Learn](#-resources--theory-to-learn)
  - [🧠 Learning Strategy](#-learning-strategy)
  - [📝 Knowledge Check](#-knowledge-check)

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

The existing `/journey/advise` endpoint is a single-shot call: request in, one prompt, one
`tool_use` reply, done. It can't fetch its own data, can't handle a follow-up question, and can't
change its mind based on what it finds. This chapter builds a second endpoint, `/advisor`, that
behaves like a person looking at your dashboard: it checks your pyramid scores, decides whether it
needs cashflow or investment numbers too, asks for them, reasons over what comes back, and remembers
the conversation on the next turn.

```
  user question ───►┌────────────────────────────┐───► grounded answer
  ("gimana kondisi   │  Advisor = LLM + 4 tools   │      + session_id
   keuangan saya?")  │                            │
                     │   observe ◄──┐             │   loops (ReAct):
                     │      │       │             │   pyramid → cashflow →
                     │   reason      │ tool        │   spending → investment
                     │      │       │ output       │   (only what's needed)
                     │      ▼       │              │
                     │    act ──────┘              │
                     │  (call a tool)              │
                     │                             │
                     │  same session_id next turn  │
                     │  → memory resumes           │
                     └────────────────────────────┘
```

## StateGraph vs. a hand-rolled loop

**Stage 0 — smolagents' `ToolCallingAgent.run()`.** Chapter 7 wraps the whole ReAct loop inside one
library call — you call `.run()` and get a categorized transaction back. The loop exists, but it's
opaque: you can't see or reuse its internal steps.

> **The wall:** the advisor needs things `.run()` doesn't give you — a dedicated error path that
> returns a graceful message instead of raising, and state that survives *between separate HTTP
> requests* (turn 1's fetched pyramid scores need to still be there on turn 2). Forking into
> `.run()`'s internals to add that isn't realistic.

**Stage 1 — LangGraph's `StateGraph`.** Instead of one opaque call, you write the loop's steps as
plain functions (**nodes**) and the routing between them as a plain function too (**edges**): an
`agent` node that calls the LLM, a `tools` node that dispatches whatever the LLM asked for
(**ToolNode**, a prebuilt node — you don't write the dispatch logic by hand), and a routing function
that decides `tools`, `fallback`, or done. *This is what the chapter ships.* Every one of those
pieces is independently testable — Step 9 tests the routing function with zero LLM or network calls.

▶ **Watch/read for this concept:** LangGraph quickstart → https://langchain-ai.github.io/langgraph/tutorials/introduction/

## The add_messages reducer

**Stage 0 — a plain list field.** `messages: list[BaseMessage]` in the state TypedDict, appended to
by hand each turn.

> **The wall:** LangGraph doesn't merge dict updates the way you'd expect. When a node returns
> `{"messages": [new_msg]}`, LangGraph's default behavior for a plain list field is to **replace**
> the old value with the new one — not append. Turn 2 of a conversation ("Apa yang harus saya
> lakukan dulu untuk mencapai L3?") would start from an empty list, and the agent would have no idea
> what "L3" refers to — turn 1's history is simply gone.

**Stage 1 — `Annotated[list, add_messages]`.** **`add_messages`** is a *reducer*: a function
LangGraph calls to merge a node's returned value into existing state, instead of overwriting it. For
a `messages` field annotated this way, new messages are appended to the existing list. *This is what
the chapter ships,* and it's the single most common silent-bug source in a first LangGraph build —
the graph runs without error, it just quietly forgets everything from previous turns.

▶ **Watch/read for this concept:** the reducer explanation → https://langchain-ai.github.io/langgraph/concepts/low_level/#reducers

## Conditional routing and the fallback node

**Stage 0 — try/except in the endpoint.** Every existing AI-service endpoint (`/parse-pdf`,
`/journey/advise`) wraps its logic in one try/except and returns HTTP 502 on failure.

> **The wall:** that pattern works for a single call. It doesn't work for a multi-step graph — an
> exception raised inside a tool call, three hops deep into a conversation, bubbles all the way up
> and kills the whole turn with no graceful message, and there's no way to unit-test "what happens
> when a tool fails" without actually raising an exception through several call layers.

**Stage 1 — nodes catch their own exceptions, edges route around them.** A node that fails sets
`state["error"]` instead of raising. A conditional edge (`should_continue`) checks that field first
and routes to a dedicated `fallback` node when it's set — a plain function, testable with a state
fixture and no mocking of exceptions at all (see Step 9). *This is what the chapter ships.* The
fallback path shows up as a real node in the graph topology and in Langfuse traces, not as a stack
trace buried in a log.

▶ **Watch/read for this concept:** handling tool errors → https://langchain-ai.github.io/langgraph/how-tos/tool-calling-errors/

## Memory across turns — MemorySaver and thread_id

**Stage 0 — a stateless call.** `advisor_graph.ainvoke(initial_state)` with nothing else. Every
request starts from zero.

> **The wall:** a real advisor conversation needs turn 2 to remember what turn 1 already fetched —
> re-fetching pyramid scores and cashflow data on every follow-up wastes tool calls and can't answer
> "how do I fix that category from before" without asking the user to repeat themselves.

**Stage 1 — `MemorySaver` + `thread_id`.** A **checkpointer** saves the graph's state after every
run and loads it back in before the next one, keyed by an opaque `thread_id` you pass in
`config`. Pass the same `thread_id` (mapped from `session_id`) on turn 2, and LangGraph resumes
exactly where turn 1 left off — no re-fetching, no repeated context. *This is what the chapter
ships.* **Teaser, not taught here:** `MemorySaver` is in-process only; a production deployment swaps
in `PostgresSaver` with a one-line change — Chapter 9's MCP tools reuse this same state shape.

▶ **Watch/read for this concept:** persistence + `thread_id` → https://langchain-ai.github.io/langgraph/concepts/persistence/

---

# 🔧 Implementation

## 🎯 Objective

Build a **separate conversational agent** — `POST /advisor` — using LangGraph:

```
Current: /journey/advise (single-shot)
         JourneyAdviseRequest  ──► prompt ──► generate_quests (tool_use) ──► JourneyAdviseResponse
         (scores passed IN from frontend — no data fetching, no iteration)

Target: /advisor (stateful, multi-step)
        AdvisorRequest
            │
            ▼
     ┌─────────────────────────────────────────────────────┐
     │  StateGraph — AdvisorState                          │
     │                                                     │
     │  ┌─────────┐   tool_calls?   ┌──────────────────┐  │
     │  │  agent  │ ──── YES ────► │    tool_node      │  │
     │  │  (LLM   │ ◄── observe ── │  get_pyramid_     │  │
     │  │  +tools)│                │  scores()         │  │
     │  │         │ ──── NO ─────► │  get_cashflow_    │  │
     │  └────┬────┘      END       │  summary()        │  │
     │       │  error?             │  get_spending_    │  │
     │       └──── YES ──────────► │  by_category()    │  │
     │                 fallback    │  get_investment_  │  │
     │                             │  summary()        │  │
     │                             └──────────────────┘  │
     │                                                     │
     │  MemorySaver checkpointer — session-scoped state   │
     └─────────────────────────────────────────────────────┘
            │
            ▼
     AdvisorResponse { answer, session_id, steps_taken }
```

See the [Introduction](#-introduction) for the concept walkthrough — this section is scope and
contract, not theory.

**Relationship to existing `/journey/advise`:** that endpoint stays unchanged — it serves the quest-card UI. The new `/advisor` serves a conversational chat UI (built in Chapter 5). Both endpoints coexist; Chapter 5 will stream `/advisor` over SSE.

**Depends on:** Chapter 7 (smolagents — agent mental model). LangGraph builds on it as "industrial smolagents."
**Unblocks:** Chapter 9 (MCP server — the tools you build here become MCP tools), Chapter 10 (blog post — the LangGraph traces are demo material).

## ✅ Acceptance Criteria

- [ ] `app/agents/state.py` — `AdvisorState` TypedDict with at least 6 fields; annotated `messages` using `add_messages` reducer
- [ ] `app/agents/tools.py` — 4 `@tool`-decorated async functions (pyramid scores, cashflow summary, spending by category, investment summary) that call the **real** .NET API routes (`/api/journey/state`, `/api/transactions/aggregated`, `/api/networth/current` + `/api/networth/allocation` — see Step 4); unit-tested with mocked httpx
- [ ] `app/agents/financial_advisor.py` — `StateGraph` compiled with: agent node, ToolNode, conditional edge (`should_continue`), fallback node, MemorySaver checkpointer
- [ ] `AdvisorService.ask(query, session_id)` returns `AdvisorResponse` with multi-step answer; same session_id replays state correctly (conversation memory works); the final answer is the agent's own synthesis, not a raw tool result
- [ ] `POST /advisor` wired in FastAPI — accepts `{query, session_id?, date_from?, date_to?}`, returns `{answer, session_id, steps_taken}`
- [ ] LLM failures in tool execution route to a fallback node, not a 500 crash
- [ ] 5 written test scenarios (`evals/advisor_scenarios.json`) with expected behavior notes
- [ ] `pytest` green — `tests/test_advisor_tools.py`, `tests/test_advisor_agent.py` (all mocked — no real API or LLM calls)
- [ ] Langfuse traces visible for each `/advisor` call — steps, token counts, latency per node
- [ ] `pyproject.toml` updated: `langgraph>=0.2`, `langchain-anthropic>=0.3` in dependencies; `langchain-google-genai>=2.0` in optional/dev

## 🧭 Approach

**LangGraph over raw loops — for Chapter 8.** The smolagents agent (Chapter 7) hides its loop inside `.run()`. LangGraph is the same loop made explicit as a graph: nodes are functions, edges are routing decisions, state flows between them. Once you've seen the library-managed version (Chapter 7), the graph abstraction makes sense rather than feeling magic.

**`langchain-anthropic` as the agent's LLM wrapper.** LangGraph integrates natively with LangChain-wrapped models. The existing `ProviderFactory` (raw Anthropic/Gemini SDKs) stays for extraction — that surface is frozen (THINK-05). The agent uses `ChatAnthropic` from `langchain-anthropic`, which wraps the same Claude API. Adding a LangChain model here doesn't pollute the extraction pipeline; they live in separate modules. **Gotcha:** this makes `/advisor` require `ANTHROPIC_API_KEY` regardless of the service's `AI_PROVIDER` setting — the advisor always talks to Claude, independent of which provider extraction is using. If your local `.env` only has `GEMINI_API_KEY` set (the project default), add `ANTHROPIC_API_KEY` before testing this chapter.

**Tools call the .NET API, not the database directly — and reuse what already exists.** The agent's tools use httpx to call real, existing routes: `GET /api/journey/state`, `GET /api/transactions/aggregated`, `GET /api/networth/current`, `GET /api/networth/allocation`. There is no dedicated `/api/investments/summary` or `/api/transactions/cashflow-summary` endpoint — rather than inventing new .NET surface out of scope for an AI-service chapter, the tools compose the closest existing data (see Step 4 and the Notes section). This keeps the data layer in .NET and makes the tools composable — the same tools become MCP tools in Chapter 9 with minimal change.

**MemorySaver for session memory — not a database.** `MemorySaver` is an in-memory checkpointer, scoped to the process lifetime. For this project's personal-use scale, that's correct. The interview framing: "I use MemorySaver for development; production would swap in `PostgresSaver` or `RedisSaver` with one line change — LangGraph's checkpointer API is storage-agnostic."

**Error routing, not exception bubbling.** Nodes catch their own exceptions and set `state["error"]`; a conditional edge routes error-state to a `fallback` node that returns a graceful message. This is the LangGraph-idiomatic pattern and it's what distinguishes a production agent from a demo: crashes are handled by the graph, not by HTTP 500.

**`date_from`/`date_to` fold into the prompt, not into tool arguments.** The .NET dashboard endpoint doesn't take an arbitrary date range (it takes `year`/`month`/`months` — see Step 4), so a user-specified period is appended to the query text the agent sees rather than threaded through the tools as structured args. It's a deliberate simplification for this chapter, not an oversight — see Step 6.

Out of scope: streaming the advisor over SSE (Chapter 5 builds that), multi-agent collaboration (Chapter 8 is a single-agent graph), MCP wiring (Chapter 9), replacing the existing quest-card endpoint. Don't touch `app/services/journey_advisor.py`.

## 📂 Affected Files

| File | Change |
|------|--------|
| [\_\_init\_\_.py](../../../services/ai-service/app/agents/__init__.py) (`app/agents/`) | Create — empty module marker |
| [state.py](../../../services/ai-service/app/agents/state.py) | Create — `AdvisorState` TypedDict |
| [tools.py](../../../services/ai-service/app/agents/tools.py) | Create — 4 `@tool` functions (httpx → .NET API) |
| [financial_advisor.py](../../../services/ai-service/app/agents/financial_advisor.py) | Create — `StateGraph`, nodes, edges, compile |
| [advisor.py](../../../services/ai-service/app/services/advisor.py) | Create — `AdvisorService` wrapping the compiled graph |
| [models.py](../../../services/ai-service/app/models.py) | Edit — add `AdvisorRequest`, `AdvisorResponse` |
| [main.py](../../../services/ai-service/app/main.py) | Edit — add `POST /advisor`; wire graph in lifespan |
| [config.py](../../../services/ai-service/app/config.py) | Edit — add `net_api_base_url: str` for tool HTTP calls |
| [pyproject.toml](../../../services/ai-service/pyproject.toml) | Edit — add `langgraph>=0.2`, `langchain-anthropic>=0.3` |
| [test_advisor_tools.py](../../../services/ai-service/tests/test_advisor_tools.py) | Create — unit tests for each tool (mocked httpx) |
| [test_advisor_agent.py](../../../services/ai-service/tests/test_advisor_agent.py) | Create — graph routing tests (mocked LLM + tools) |
| [advisor_scenarios.json](../../../services/ai-service/evals/advisor_scenarios.json) | Create — 5 scenarios with expected behavior notes |

## 📋 TODO

### [ ] STEP 0 — Prerequisite gate: Chapter 7 smolagents complete

Before LangGraph, you need the agent mental model: tool-use loop, observation → reasoning cycle, traces. Chapter 7 builds that with smolagents on the smallest possible surface. LangGraph is "the same loop, expressed as a graph."

> **If Chapter 7 is done:** proceed to Step 1.
> **If Chapter 7 is not done:** start there. LangGraph's StateGraph, ToolNode, and conditional edges will make far more sense once you've seen the equivalent library-managed loop.

---

### [ ] STEP 1 — Theory anchor: LangGraph mental model (45 min)

The one genuine pre-read. The wall here is understanding *what LangGraph adds over a plain while loop*.

**Read (in this order):**
1. LangGraph quickstart → https://langchain-ai.github.io/langgraph/tutorials/introduction/ (build the ReAct agent — 20 min)
2. LangGraph concepts: State, Nodes, Edges → https://langchain-ai.github.io/langgraph/concepts/ (skim the three core concept pages — 15 min)
3. MemorySaver + thread_id → https://langchain-ai.github.io/langgraph/concepts/persistence/ (the checkpointer section — 10 min)

**Active-retrieval task (do NOT skip):** Close all tabs. Append to `evals/README.md` a section `## LangGraph mental model (written from memory)`:
- How does a `StateGraph` differ from writing a `while tool_calls: ...` loop? What does the graph give you that the loop doesn't?
- What is the `thread_id` in a checkpointer call, and why does passing the same `thread_id` twice resume the conversation instead of starting a new one?
- Why does LangGraph use `Annotated[list, add_messages]` instead of just `list[BaseMessage]` for the messages field? What problem does the reducer solve?

> **The interview frame:** "LangGraph makes the agent loop explicit: nodes are functions (agent, tool_node, fallback), edges are routing decisions (should_continue), and state flows through the graph as a typed dict. The key upgrade over a hand-rolled loop: graph structure is inspectable, testable node-by-node, and the checkpointer saves/restores full state between turns for free. I can show the Langfuse traces for every hop."

---

### [ ] STEP 2 — THINK-03 gate: justify `AdvisorState` fields before coding

Per THINK-03 — list every state field, its type, an example value, and *why it lives in state* before writing code. Wrong types here create graph routing bugs (not SQL bugs, but equally opaque). Field shapes below are pinned to the real .NET DTOs the tools call (Step 4), not invented ones.

| Field | Python type | Example | Why in state |
|-------|-------------|---------|-------------|
| `messages` | `Annotated[list, add_messages]` | `[HumanMessage(...), AIMessage(...)]` | LangGraph's standard message list; `add_messages` reducer appends rather than overwrites — required for multi-turn |
| `pyramid_scores` | `dict \| None` | `{"current_level": 2, "level_scores": {"L1": 85.0, "L2": 42.5, "L3": 10.0}}` | Mirrors `JourneyStateDto` (`GET /api/journey/state`) — fetched once, reused across turns without re-fetching |
| `cashflow_summary` | `dict \| None` | `{"total_income": 15000000, "total_expenses": 12000000, "net": 3000000, "month": "2026-07"}` | From `DashboardDto.Summary` / `.CurrentMonth` (`GET /api/transactions/aggregated`) — fetch once, reason many times |
| `spending_by_category` | `dict \| None` | `{"Food & Dining": 2500000, "Transport": 800000}` | From the *same* `/aggregated` call's `TopCategories` list — a different slice of one response, not a second endpoint |
| `investment_summary` | `dict \| None` | `{"net_worth_idr": 570000000, "allocation_by_class": {"Property": 500000000, "Investment": 50000000, "Savings": 20000000}}` | Composed from `GET /api/networth/current` + `GET /api/networth/allocation` — no dedicated investment-only endpoint exists yet (see [Notes](#-notes)) |
| `error` | `str \| None` | `"get_pyramid_scores failed: 503"` | Tool-failure signal; conditional edge routes to fallback when set |
| `session_id` | `str` | `"session_abc123"` | Mapped to LangGraph `thread_id` for checkpointer — ensures same session resumes |

> **Why:** If `messages` were `list[BaseMessage]` without the `add_messages` reducer, each graph invocation would *overwrite* the message list, destroying conversation history. The reducer is LangGraph's solution to the immutable-state update problem. This is the non-obvious concept that trips people up most in LangGraph interviews.

---

### [ ] STEP 3 — Add deps; create `app/agents/state.py`

Add to `pyproject.toml` dependencies:
```toml
    "langgraph>=0.2",
    "langchain-anthropic>=0.3",
    "httpx>=0.27",
```

```bash
cd services/ai-service && pip install langgraph langchain-anthropic httpx
```

Create [\_\_init\_\_.py](../../../services/ai-service/app/agents/__init__.py) (empty).

Create [state.py](../../../services/ai-service/app/agents/state.py):

```python
"""AdvisorState — the typed state graph for the Financial Health Advisor agent."""
from __future__ import annotations

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AdvisorState(TypedDict):
    # LangGraph messages accumulate via the add_messages reducer.
    # Plain list[BaseMessage] would overwrite on each node call.
    messages: Annotated[list, add_messages]
    # Tool-fetched data — populated once, reused across reasoning turns.
    pyramid_scores: dict | None
    cashflow_summary: dict | None
    spending_by_category: dict | None
    investment_summary: dict | None
    # Error signal — set by any node on failure; routes to fallback edge.
    error: str | None
    # Passed through from the request, mapped to thread_id in the checkpointer.
    session_id: str
```

> **Why TypedDict and not Pydantic?** LangGraph requires TypedDict (or dataclass) for state — Pydantic BaseModel isn't supported as of langgraph 0.2. TypedDict is sufficient here because state validation happens at node boundaries (inputs are tool results from your own code), not at external API edges.

**C# equivalent** (no direct .NET package equivalent to a LangGraph-managed `TypedDict` state exists; the closest real analogue is a plain mutable class threaded through a hand-rolled loop — there's no packaged `add_messages`-style reducer either, so appending history is something you write yourself):

```csharp
public class AdvisorState
{
    // No reducer exists to auto-append — whoever calls into this list is
    // responsible for adding to it, not replacing it. That responsibility is
    // exactly what add_messages automates in LangGraph.
    public List<object> Messages { get; init; } = new();
    public Dictionary<string, object>? PyramidScores { get; set; }
    public Dictionary<string, object>? CashflowSummary { get; set; }
    public Dictionary<string, object>? SpendingByCategory { get; set; }
    public Dictionary<string, object>? InvestmentSummary { get; set; }
    public string? Error { get; set; }
    public required string SessionId { get; init; }
}
```

---

### [ ] STEP 4 — Build `app/agents/tools.py` (the 4 data-fetch tools)

Create [tools.py](../../../services/ai-service/app/agents/tools.py):

```python
"""LangGraph tool functions for the Financial Health Advisor agent.

Each tool calls the .NET API via httpx. They are @tool-decorated so LangGraph's
ToolNode can dispatch them automatically from the LLM's tool_calls.

The .NET API base URL comes from config.net_api_base_url (default: http://localhost:7208).
All tools return a plain dict — ToolNode serializes it back into a ToolMessage.

Endpoint note: GET /api/transactions/aggregated returns both cashflow totals AND
the top-category breakdown in one DashboardDto payload — get_cashflow_summary and
get_spending_by_category both call it and each extract their own slice. There is
no dedicated /api/investments/summary endpoint yet; get_investment_summary
composes /api/networth/current + /api/networth/allocation instead (see the
plan's Notes section for why that gap exists).
"""
from __future__ import annotations

import logging

import httpx
from langchain_core.tools import tool

from app.config import settings

logger = logging.getLogger(__name__)

_CLIENT = httpx.AsyncClient(base_url=settings.net_api_base_url, timeout=10.0)


@tool
async def get_pyramid_scores() -> dict:
    """Fetch the user's current Financial Pyramid tier state.

    Returns a dict with keys: current_level (int 1-5), level_scores
    (dict of "L1".."L5" -> decimal 0-100, only levels with live data present).
    """
    resp = await _CLIENT.get("/api/journey/state")
    resp.raise_for_status()
    data = resp.json()
    return {
        "current_level": data.get("currentLevel"),
        "level_scores": data.get("levelScores", {}),
    }


@tool
async def get_cashflow_summary() -> dict:
    """Fetch total income, total expenses, and net for the current month.

    Returns keys: total_income, total_expenses, net, month.
    """
    resp = await _CLIENT.get("/api/transactions/aggregated")
    resp.raise_for_status()
    data = resp.json()
    summary = data.get("summary", {})
    current_month = data.get("currentMonth", {})
    return {
        "total_income": summary.get("totalIncome"),
        "total_expenses": summary.get("totalExpenses"),
        "net": current_month.get("net"),
        "month": current_month.get("month"),
    }


@tool
async def get_spending_by_category() -> dict:
    """Fetch the top spending categories for the current month.

    Returns a dict of {category_name: total_idr}, highest first.
    """
    resp = await _CLIENT.get("/api/transactions/aggregated")
    resp.raise_for_status()
    top_categories = resp.json().get("topCategories", [])
    return {row["category"]: row["amount"] for row in top_categories}


@tool
async def get_investment_summary() -> dict:
    """Fetch net worth total and the breakdown by asset class (properties,
    investments, savings, vehicles, etc).

    Returns keys: net_worth_idr, allocation_by_class (dict of class name -> IDR value).
    There is no per-holding investment return % yet — see the plan's Notes section.
    """
    net_worth_resp = await _CLIENT.get("/api/networth/current")
    net_worth_resp.raise_for_status()
    allocation_resp = await _CLIENT.get("/api/networth/allocation")
    allocation_resp.raise_for_status()
    return {
        "net_worth_idr": net_worth_resp.json().get("netWorthIdr"),
        "allocation_by_class": allocation_resp.json(),
    }


TOOLS = [get_pyramid_scores, get_cashflow_summary, get_spending_by_category, get_investment_summary]
```

Add `net_api_base_url` to [config.py](../../../services/ai-service/app/config.py):
```python
    net_api_base_url: str = "http://localhost:7208"
```

**C# equivalent** (Python module-level `httpx.AsyncClient` singleton + `@tool`-decorated function → an injected `HttpClient` + methods reflected over by an agent framework's function-calling attribute — Semantic Kernel's `[KernelFunction]` is the nearest analogue; dict `.get()` chains → typed DTOs deserialized straight off the real project contracts):

```csharp
public class AdvisorTools
{
    private readonly HttpClient _client;   // BaseAddress = net_api_base_url, from IHttpClientFactory

    public AdvisorTools(HttpClient client) => _client = client;

    [KernelFunction, Description("Fetch the user's current Financial Pyramid tier state.")]
    public async Task<JourneyStateDto?> GetPyramidScoresAsync() =>
        await _client.GetFromJsonAsync<JourneyStateDto>("/api/journey/state");

    [KernelFunction, Description("Fetch total income, expenses, and net for the current month.")]
    public async Task<DashboardCurrentMonthDto?> GetCashflowSummaryAsync()
    {
        var dashboard = await _client.GetFromJsonAsync<DashboardDto>("/api/transactions/aggregated");
        return dashboard?.CurrentMonth;
    }

    [KernelFunction, Description("Fetch the top spending categories for the current month.")]
    public async Task<List<DashboardTopCategoryDto>> GetSpendingByCategoryAsync()
    {
        var dashboard = await _client.GetFromJsonAsync<DashboardDto>("/api/transactions/aggregated");
        return dashboard?.TopCategories ?? [];
    }

    [KernelFunction, Description("Fetch net worth total and allocation by asset class.")]
    public async Task<(decimal NetWorthIdr, Dictionary<string, decimal> AllocationByClass)> GetInvestmentSummaryAsync()
    {
        var netWorth = await _client.GetFromJsonAsync<JsonElement>("/api/networth/current");
        var allocation = await _client.GetFromJsonAsync<Dictionary<string, decimal>>("/api/networth/allocation");
        return (netWorth.GetProperty("netWorthIdr").GetDecimal(), allocation ?? []);
    }
}
```

> Note `get_cashflow_summary`/`get_spending_by_category` hitting the same `/aggregated` route twice per turn (once per tool) is accepted duplication — each tool stays independently callable and testable, matching the acceptance criteria's "4 distinct tools." A production version would cache the dashboard response per-turn.

Create [test_advisor_tools.py](../../../services/ai-service/tests/test_advisor_tools.py):

```python
"""Unit tests for advisor tools — mock httpx, never call real .NET API."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def mock_httpx_client():
    """Patch the module-level _CLIENT in tools.py."""
    with patch("app.agents.tools._CLIENT") as mock_client:
        yield mock_client


@pytest.mark.asyncio
async def test_get_pyramid_scores_returns_level_scores(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "currentLevel": 2,
        "levelScores": {"L1": 85.0, "L2": 42.5},
    }
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_pyramid_scores
    result = await get_pyramid_scores.ainvoke({})
    assert result["level_scores"]["L2"] == 42.5


@pytest.mark.asyncio
async def test_get_cashflow_summary_reads_dashboard_shape(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "summary": {"totalIncome": 15_000_000, "totalExpenses": 12_000_000},
        "currentMonth": {"month": "2026-07", "net": 3_000_000},
    }
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_cashflow_summary
    result = await get_cashflow_summary.ainvoke({})
    assert result["net"] == 3_000_000
    mock_httpx_client.get.assert_called_with("/api/transactions/aggregated")


@pytest.mark.asyncio
async def test_get_spending_by_category_returns_dict(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "topCategories": [
            {"category": "Food & Dining", "amount": 2_500_000, "percentage": 20.8, "transactionCount": 34},
            {"category": "Transport", "amount": 800_000, "percentage": 6.6, "transactionCount": 12},
        ]
    }
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_spending_by_category
    result = await get_spending_by_category.ainvoke({})
    assert result["Food & Dining"] == 2_500_000


@pytest.mark.asyncio
async def test_get_investment_summary_combines_two_endpoints(mock_httpx_client):
    net_worth_resp = MagicMock()
    net_worth_resp.json.return_value = {"netWorthIdr": 570_000_000}
    net_worth_resp.raise_for_status = MagicMock()
    allocation_resp = MagicMock()
    allocation_resp.json.return_value = {"Property": 500_000_000, "Investment": 50_000_000, "Savings": 20_000_000}
    allocation_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(side_effect=[net_worth_resp, allocation_resp])

    from app.agents.tools import get_investment_summary
    result = await get_investment_summary.ainvoke({})
    assert result["net_worth_idr"] == 570_000_000
    assert result["allocation_by_class"]["Investment"] == 50_000_000
```

```bash
PYTHONPATH=. pytest tests/test_advisor_tools.py -v
```

**C# equivalent** (pytest async tests + `patch()` module-level mocking → xUnit `[Fact]` + a mocked `HttpMessageHandler` wired into a real `HttpClient`, since C# has no module-level-attribute-patching equivalent — the handler is the seam instead):

```csharp
public class AdvisorToolsTests
{
    private static HttpClient MockClient(object jsonBody)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync", ItExpr.IsAny<HttpRequestMessage>(), ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage { StatusCode = HttpStatusCode.OK, Content = JsonContent.Create(jsonBody) });
        return new HttpClient(handler.Object) { BaseAddress = new Uri("http://localhost:7208") };
    }

    [Fact]
    public async Task GetPyramidScoresAsync_ValidResponse_ReturnsLevelScores()
    {
        // Arrange
        var dto = new JourneyStateDto(2, 63.75m,
            new Dictionary<string, decimal> { ["L1"] = 85m, ["L2"] = 42.5m }, [], [], DateTime.UtcNow);
        var tools = new AdvisorTools(MockClient(dto));

        // Act
        var result = await tools.GetPyramidScoresAsync();

        // Assert
        Assert.Equal(42.5m, result!.LevelScores["L2"]);
    }
}
```

> **Why tools call the .NET API instead of the DB directly?** Business logic — pyramid scoring, category aggregation, net worth allocation — lives in the .NET services. Bypassing them and hitting the DB directly would duplicate logic and break when those services evolve. It also makes the tools trivially MCP-compatible in Chapter 9: MCP tools are just HTTP calls with a name schema, same as these.

> **Why `@tool` instead of `BaseTool` subclass?** The decorator form is correct for functions with clear signatures. `BaseTool` is for tools with complex init or async streaming — not needed here. LangGraph's `ToolNode` handles both forms identically.

---

### [ ] STEP 5 — Build `app/agents/financial_advisor.py` (the graph)

Create [financial_advisor.py](../../../services/ai-service/app/agents/financial_advisor.py):

```python
"""Financial Health Advisor — LangGraph StateGraph definition.

Graph topology:
  START → agent
  agent -- has tool_calls → tools → agent (ReAct loop)
  agent -- no tool_calls  → END
  agent -- error set      → fallback → END
"""
from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from app.agents.state import AdvisorState
from app.agents.tools import TOOLS
from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a personal financial advisor for a user managing finances
through the Personal Finance Platform. The platform tracks a 5-tier Financial Pyramid:
  L1 Foundations  — spending < income, bills paid
  L2 Defense      — 3-month emergency fund, debt-to-income < 20%
  L3 Growth       — investing ≥15% income, savings goals
  L4 Freedom      — passive income covers expenses
  L5 Legacy       — estate planning, succession

You have tools to fetch the user's real financial data. Use them — never estimate.
After fetching data, identify which pyramid level the user is on and the highest-leverage
next action. Be specific: name the category, amount, or ratio, not vague advice.
Answer in the same language as the user's question (Indonesian or English)."""


def _build_llm() -> ChatAnthropic:
    return ChatAnthropic(
        model="claude-sonnet-4-6",
        api_key=settings.anthropic_api_key,
        temperature=0.0,
        max_tokens=2048,
    ).bind_tools(TOOLS)


# ── Nodes ──────────────────────────────────────────────────────────────────────

def call_agent(state: AdvisorState) -> dict:
    """The central agent node: call the LLM with current state.messages."""
    llm = _build_llm()
    # Prepend system message if starting a new conversation.
    messages = state["messages"]
    if not any(isinstance(m, SystemMessage) for m in messages):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages
    try:
        response: AIMessage = llm.invoke(messages)
        return {"messages": [response], "error": None}
    except Exception as exc:
        logger.exception("agent node failed")
        return {"error": str(exc)}


def call_fallback(state: AdvisorState) -> dict:
    """Fallback node — returns a graceful error message instead of crashing."""
    error = state.get("error") or "unknown error"
    logger.warning("advisor fallback invoked: %s", error)
    from langchain_core.messages import AIMessage as _AI
    return {
        "messages": [_AI(content=(
            "Maaf, saya tidak dapat mengambil data keuangan Anda saat ini. "
            "Silakan coba lagi dalam beberapa saat. "
            f"(Technical detail: {error})"
        ))],
        "error": None,
    }


# ── Routing ────────────────────────────────────────────────────────────────────

def should_continue(state: AdvisorState) -> str:
    """Route after the agent node:
    - error set → 'fallback'
    - last message has tool_calls → 'tools'
    - otherwise → END
    """
    if state.get("error"):
        return "fallback"
    messages = state["messages"]
    last = messages[-1] if messages else None
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


# ── Graph ──────────────────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    tool_node = ToolNode(TOOLS)

    builder = StateGraph(AdvisorState)
    builder.add_node("agent", call_agent)
    builder.add_node("tools", tool_node)
    builder.add_node("fallback", call_fallback)

    builder.add_edge(START, "agent")
    builder.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "fallback": "fallback", END: END},
    )
    builder.add_edge("tools", "agent")   # tools always cycle back for re-reasoning
    builder.add_edge("fallback", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


# Singleton — compiled once at lifespan startup, reused across requests.
advisor_graph = build_graph()
```

> **Why `_build_llm()` called inside the node instead of module-level?** Module-level `ChatAnthropic(...)` instantiates at import time. In tests, that fires before you've patched `settings`. Inside the node, it instantiates at call time — patches apply correctly, and you can mock it per test. The performance cost (~microseconds) is irrelevant for a network-bound agent.

> **Why does `tools` always loop back to `agent`?** The ReAct pattern: Reason → Act → Observe → Reason. After ToolNode executes the tool calls and appends `ToolMessage` results, the agent needs to *reason again* over those results. The `agent → tools → agent` cycle IS the ReAct loop made explicit as a graph edge. A one-way `agent → tools → END` would give you an action with no synthesis.

**C# equivalent of `should_continue`:**
```csharp
// LangGraph's routing function maps to a switch/match over MediatR command types:
// agent output → route to ToolNode or END
// equivalent to: IMediator.Send(command) where the handler picks the next step.
// The difference: LangGraph makes the routing function an explicit, testable,
// separately-inspectable artifact rather than implicit handler dispatch.
public static string ShouldContinue(AdvisorState state)
{
    if (state.Error is not null) return "fallback";
    var last = state.Messages.LastOrDefault();
    return last is AIMessageLike { ToolCalls.Count: > 0 } ? "tools" : "end";
}
```

**C# equivalent of the graph itself** (no packaged `StateGraph` runtime exists in .NET; the honest port is the plain loop LangGraph compiles a 3-node graph *down to* — same shape, no framework):

```csharp
public class FinancialAdvisorGraph
{
    private readonly Kernel _kernel;   // Semantic Kernel, tools registered as KernelFunctions
    private readonly ILogger<FinancialAdvisorGraph> _logger;

    public FinancialAdvisorGraph(Kernel kernel, ILogger<FinancialAdvisorGraph> logger)
        => (_kernel, _logger) = (kernel, logger);

    public async Task<AdvisorState> RunAsync(AdvisorState state)
    {
        while (true)
        {
            state = await CallAgentAsync(state);
            if (state.Error is not null)
                return CallFallback(state);

            if (state.Messages.LastOrDefault() is AIMessageLike { ToolCalls.Count: > 0 } last)
            {
                state = await InvokeToolsAsync(state, last.ToolCalls);   // ToolNode equivalent
                continue;                                                // "tools -> agent" edge
            }
            return state;                                                 // should_continue's END branch
        }
    }

    private async Task<AdvisorState> CallAgentAsync(AdvisorState state)
    {
        try
        {
            var settings = new PromptExecutionSettings { FunctionChoiceBehavior = FunctionChoiceBehavior.Auto() };
            var response = await _kernel.InvokePromptAsync(BuildPrompt(state), new(settings));
            state.Messages.Add(new AIMessageLike(response.ToString()));
            state.Error = null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "agent node failed");
            state.Error = ex.Message;
        }
        return state;
    }

    private AdvisorState CallFallback(AdvisorState state)
    {
        _logger.LogWarning("advisor fallback invoked: {Error}", state.Error);
        state.Messages.Add(new AIMessageLike(
            $"Maaf, saya tidak dapat mengambil data keuangan Anda saat ini. (Technical detail: {state.Error})"));
        state.Error = null;
        return state;
    }
}
```

---

### [ ] STEP 6 — Build `app/services/advisor.py` (the service wrapper)

Create [advisor.py](../../../services/ai-service/app/services/advisor.py):

```python
"""AdvisorService — wraps the compiled LangGraph for the /advisor endpoint."""
from __future__ import annotations

import logging
import uuid

from langchain_core.messages import AIMessage, HumanMessage

from app.agents.financial_advisor import advisor_graph
from app.models import AdvisorRequest, AdvisorResponse

logger = logging.getLogger(__name__)


class AdvisorService:
    async def ask(self, request: AdvisorRequest) -> AdvisorResponse:
        session_id = request.session_id or str(uuid.uuid4())

        # LangGraph checkpointer key — same session_id = same memory thread.
        config = {"configurable": {"thread_id": session_id}}

        initial_state = {
            "messages": [HumanMessage(content=self._build_query(request))],
            "pyramid_scores": None,
            "cashflow_summary": None,
            "spending_by_category": None,
            "investment_summary": None,
            "error": None,
            "session_id": session_id,
        }

        logger.info("advisor.ask session=%s query=%s", session_id, request.query[:80])

        # LangGraph ainvoke runs the graph to completion and returns final state.
        final_state = await advisor_graph.ainvoke(initial_state, config=config)

        # The last AIMessage IS the agent's final answer — should_continue only
        # reaches END once the latest AIMessage carries no pending tool_calls, so
        # the last AIMessage in the list is always the synthesized reply.
        messages = final_state.get("messages", [])
        last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
        answer = last_ai.content if last_ai else "No response generated."

        # Count how many turns actually issued tool calls (steps taken = tool hops).
        steps_taken = sum(
            1 for m in messages
            if isinstance(m, AIMessage) and m.tool_calls
        )

        return AdvisorResponse(
            answer=answer,
            session_id=session_id,
            steps_taken=steps_taken,
        )

    @staticmethod
    def _build_query(request: AdvisorRequest) -> str:
        """Fold an optional date range into the question text. The tools take
        no date arguments of their own (get_cashflow_summary/get_spending_by_category
        always return the current month — see Step 4), so a period the user asked
        about travels as part of the prompt instead of as structured tool input."""
        if not request.date_from and not request.date_to:
            return request.query
        return (
            f"{request.query}\n\n(Period requested: "
            f"{request.date_from or 'earliest'} to {request.date_to or 'today'})"
        )
```

> **Why `ainvoke` instead of `astream`?** Chapter 5 adds SSE streaming — at that point, `astream_events` replaces `ainvoke` here, yielding tokens as they arrive. Using `ainvoke` now keeps the endpoint simple and correct; Chapter 5 is the natural upgrade point.

> **The bug this replaces:** an earlier draft of this file filtered for `hasattr(m, "content") and not hasattr(m, "tool_calls")` to find the final answer. That's backwards — every `AIMessage` instance always *has* a `tool_calls` attribute (it's a Pydantic field defaulting to `[]`), so `not hasattr(m, "tool_calls")` is false for every `AIMessage`, regardless of whether it made a call. The filter actually matched the last `ToolMessage` (which has `content` but no `tool_calls` attribute at all) — meaning `answer` would silently become the raw tool JSON instead of the LLM's synthesized reply on a normal turn. `isinstance(m, AIMessage)` is the correct check and was the fix applied here.

**C# equivalent** (Pydantic-style duck typing → `OfType<T>()`, which filters by actual runtime type — this sidesteps the exact bug above, since C#'s type system won't let you check "does this have a property" as a stand-in for "is this the right type" the way Python's `hasattr` does):

```csharp
public class AdvisorService
{
    private readonly FinancialAdvisorGraph _graph;

    public AdvisorService(FinancialAdvisorGraph graph) => _graph = graph;

    public async Task<AdvisorResponse> AskAsync(AdvisorRequest request)
    {
        var sessionId = request.SessionId ?? Guid.NewGuid().ToString();
        var state = new AdvisorState
        {
            Messages = { new HumanMessageLike(BuildQuery(request)) },
            SessionId = sessionId,
        };

        var final = await _graph.RunAsync(state);   // a real checkpointer port would
                                                       // load/save state here by thread_id

        var lastAi = final.Messages.OfType<AIMessageLike>().LastOrDefault();
        var stepsTaken = final.Messages.OfType<AIMessageLike>().Count(m => m.ToolCalls.Count > 0);

        return new AdvisorResponse(
            Answer: lastAi?.Content ?? "No response generated.",
            SessionId: sessionId,
            StepsTaken: stepsTaken);
    }

    private static string BuildQuery(AdvisorRequest request) =>
        request.DateFrom is null && request.DateTo is null
            ? request.Query
            : $"{request.Query}\n\n(Period requested: {request.DateFrom ?? "earliest"} to {request.DateTo ?? "today"})";
}
```

---

### [ ] STEP 7 — Add `/advisor` models to `app/models.py`

```python
# ── Chapter 8: LangGraph Financial Advisor ────────────────────────────────────

class AdvisorRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = None          # if None, a new session is created
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to:   str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class AdvisorResponse(BaseModel):
    answer: str
    session_id: str                         # echo back so frontend can continue the conversation
    steps_taken: int = 0                    # number of tool-call hops in this turn
```

**C# equivalent** (Pydantic `BaseModel` + `Field` constraints → C# record DTOs with DataAnnotations; `str_strip_whitespace` has no attribute equivalent — normalize in the validator or a custom binder):

```csharp
public record AdvisorRequest(
    [property: Required, StringLength(1000, MinimumLength = 1)] string Query,
    string? SessionId = null,
    [property: RegularExpression(@"^\d{4}-\d{2}-\d{2}$")] string? DateFrom = null,
    [property: RegularExpression(@"^\d{4}-\d{2}-\d{2}$")] string? DateTo = null);

public record AdvisorResponse(
    string Answer,
    string SessionId,
    int StepsTaken = 0);
```

> **Why echo `session_id` back?** The frontend sends `session_id` on follow-up turns. If the first request omitted it, the service generated one — the frontend needs to know it for the next turn. Without the echo, follow-ups start fresh sessions, breaking conversation memory.

---

### [ ] STEP 8 — Wire `POST /advisor` in `app/main.py`

In the lifespan, no additional setup is needed (advisor_graph is a module-level singleton compiled at import time). Just add the endpoint:

```python
from app.models import AdvisorRequest, AdvisorResponse
from app.services.advisor import AdvisorService

_advisor = AdvisorService()

@app.post("/advisor", response_model=AdvisorResponse)
async def advisor(request: AdvisorRequest) -> AdvisorResponse:
    """Stateful financial advisor — multi-step, tool-grounded, session-persistent."""
    try:
        return await _advisor.ask(request)
    except Exception as exc:
        logger.exception("advisor failed")
        raise HTTPException(status_code=502, detail="advisor_error") from exc
```

**C# equivalent** (FastAPI route + module-level singleton → ASP.NET Core controller action + DI-registered service; `HTTPException(502)` → `StatusCode(502, ...)`):

```csharp
[ApiController]
[Route("api/[controller]")]
public class AdvisorController(AdvisorService advisorService, ILogger<AdvisorController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<AdvisorResponse>> Ask(AdvisorRequest request)
    {
        try
        {
            return Ok(await advisorService.AskAsync(request));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "advisor failed");
            return StatusCode(502, "advisor_error");
        }
    }
}
```

Smoke test (service running, .NET API running):

```bash
# Turn 1 — new session
curl -X POST http://localhost:8000/advisor \
  -H "Content-Type: application/json" \
  -d '{"query": "Kondisi keuangan saya sekarang bagaimana?"}'
# Note the session_id in the response.

# Turn 2 — continue session (replace SESSION_ID)
curl -X POST http://localhost:8000/advisor \
  -H "Content-Type: application/json" \
  -d '{"query": "Apa yang harus saya lakukan dulu untuk mencapai L3?", "session_id": "SESSION_ID"}'
# Verify: the agent remembers the L1/L2 context from turn 1 without re-fetching.
```

Verify:
- Turn 1 returns a multi-sentence grounded answer referencing pyramid scores.
- Turn 2 uses prior state (no duplicate tool calls for data already fetched in turn 1).
- Langfuse dashboard shows both turns under the same session thread.

---

### [ ] STEP 9 — Unit tests for graph routing (`tests/test_advisor_agent.py`)

The graph routing tests mock the LLM and ToolNode — no real API or LangGraph state needed:

```python
"""Graph routing tests — verify should_continue routing logic."""
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from app.agents.financial_advisor import should_continue
from app.agents.state import AdvisorState


def _state(messages: list, error: str | None = None) -> AdvisorState:
    return AdvisorState(
        messages=messages,
        pyramid_scores=None,
        cashflow_summary=None,
        spending_by_category=None,
        investment_summary=None,
        error=error,
        session_id="test",
    )


def test_should_continue_routes_to_tools_when_tool_calls():
    ai_msg = AIMessage(content="", tool_calls=[{"name": "get_pyramid_scores", "args": {}, "id": "1"}])
    assert should_continue(_state([HumanMessage(content="q"), ai_msg])) == "tools"


def test_should_continue_routes_to_end_when_no_tool_calls():
    ai_msg = AIMessage(content="Here is your advice.")
    assert should_continue(_state([ai_msg])) == "__end__"


def test_should_continue_routes_to_fallback_on_error():
    assert should_continue(_state([], error="network timeout")) == "fallback"


def test_should_continue_routes_to_end_on_empty_messages():
    from langgraph.graph import END
    assert should_continue(_state([])) == END


def test_call_fallback_clears_error():
    from app.agents.financial_advisor import call_fallback
    result = call_fallback(_state([], error="503 Service Unavailable"))
    assert result["error"] is None
    assert "503" in result["messages"][0].content


def test_advisor_state_fields():
    """Smoke-check TypedDict field names match what the graph sets."""
    state = _state([HumanMessage(content="test")])
    assert "pyramid_scores" in state
    assert "error" in state
    assert "session_id" in state
```

```bash
PYTHONPATH=. pytest tests/test_advisor_agent.py -v
```

**C# equivalent** (pytest functions → xUnit `[Fact]` with `Method_Condition_ExpectedResult` naming; a state-building helper replaces the pytest fixture-by-function pattern):

```csharp
public class AdvisorRoutingTests
{
    private static AdvisorState State(List<object> messages, string? error = null) => new()
    {
        Messages = messages, Error = error, SessionId = "test",
    };

    [Fact]
    public void ShouldContinue_ToolCallsPresent_RoutesToTools()
    {
        // Arrange
        var aiMsg = new AIMessageLike("", toolCalls: [new ToolCallLike("get_pyramid_scores", "{}", "1")]);

        // Act & Assert
        Assert.Equal("tools", FinancialAdvisorGraph.ShouldContinue(State([new HumanMessageLike("q"), aiMsg])));
    }

    [Fact]
    public void ShouldContinue_ErrorSet_RoutesToFallbackRegardlessOfToolCalls()
    {
        // Arrange & Act & Assert
        Assert.Equal("fallback", FinancialAdvisorGraph.ShouldContinue(State([], error: "network timeout")));
    }
}
```

> **Why test routing functions directly, not the full compiled graph?** The full graph calls real LLM and real tools. Unit tests should be fast and deterministic. `should_continue` is a pure function over state — test it as such. Integration tests (the 5 scenarios in Step 10) exercise the full graph with traces as evidence. Same discipline as the `.NET` CQRS tests: validators tested in isolation, handlers exercised in integration.

---

### [ ] STEP 10 — Write 5 evaluation scenarios (`evals/advisor_scenarios.json`)

Create [advisor_scenarios.json](../../../services/ai-service/evals/advisor_scenarios.json):

```json
[
  {
    "id": "S1",
    "query": "Kondisi keuangan saya sekarang bagaimana? Dan apa yang harus saya prioritaskan?",
    "session_id": null,
    "expected_behavior": "Agent fetches pyramid_scores + cashflow_summary. Identifies current level (expected L1 or L2 based on real data). Gives a specific next action — not generic advice.",
    "pass_criteria": "Answer mentions a specific pyramid level, references real IDR amounts, and names at least one concrete next step."
  },
  {
    "id": "S2",
    "query": "Dana darurat saya sudah cukup belum?",
    "session_id": null,
    "expected_behavior": "Agent fetches pyramid_scores (L2 indicator) + cashflow_summary (monthly expenses). Computes 3-month target vs actual savings. States whether the gap is positive or negative with IDR amounts.",
    "pass_criteria": "Answer includes a 3-month target calculation (3 × monthly expense) and compares it to actual emergency fund balance."
  },
  {
    "id": "S3",
    "query": "Saya mau mulai investasi, dari mana yang terbaik?",
    "session_id": null,
    "expected_behavior": "Agent checks pyramid_scores first. If L2 is not solid (emergency fund, debt), recommends completing L2 before investing. If L2 is solid, fetches investment_summary and recommends based on current allocation.",
    "pass_criteria": "Answer is conditional on L2 score — does NOT jump straight to investment picks if L2 < 70."
  },
  {
    "id": "S4-turn1",
    "query": "Apa pengeluaran terbesar saya bulan lalu?",
    "session_id": "scenario4",
    "expected_behavior": "Agent fetches spending_by_category. Names the top category with IDR amount.",
    "pass_criteria": "Answer names a specific category (e.g., 'Food & Dining') and the IDR total."
  },
  {
    "id": "S4-turn2",
    "query": "Bagaimana cara saya kurangi pengeluaran di kategori itu?",
    "session_id": "scenario4",
    "expected_behavior": "Second turn in the SAME session. Agent should NOT re-fetch spending data — it already has it from turn 1. Should give specific reduction tactics for the category named in turn 1.",
    "pass_criteria": "Langfuse trace shows NO get_spending_by_category tool call in turn 2. Answer references the specific category from turn 1."
  },
  {
    "id": "S5",
    "query": "Berapa total investasi saya di tahun 3000?",
    "session_id": null,
    "expected_behavior": "Adversarial — no data for year 3000. Agent fetches investment_summary, finds no data for that period. Responds honestly that it cannot answer — does NOT invent numbers.",
    "pass_criteria": "Answer explicitly states it cannot find data for year 3000. Does NOT fabricate a total."
  }
]
```

Run these manually against the live service, then inspect Langfuse traces for:
- Tool call counts per turn (S4 turn 2 must show 0 for `get_spending_by_category`)
- Session continuity (S4 turns 1+2 share a thread_id in Langfuse)
- No fabricated numbers in S5

Record pass/fail per scenario in [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md).

> **Why manual eval instead of an automated harness?** Agent outputs are free-text and grounding is context-dependent — LLM-as-judge is the right evaluator, but it's a Chapter 6/Advanced skill. For now, manual pass/fail per written criterion is honest and sufficient. The traces are the evidence. If you ship a blog post in Chapter 10, the Langfuse screenshots from S4 (zero re-fetch in turn 2) are compelling demo material.

---

### [ ] STEP 11 — Update `docs/performances/ai-observability-metrics.md`

Append:

```markdown
## Chapter 8 (PF-AI008) — LangGraph Financial Health Advisor

| Metric | Value |
|--------|-------|
| Scenario pass rate (5 scenarios) | X/5 |
| Avg tool calls per first turn | ~X.X |
| Session memory verified (S4 turn 2 = 0 re-fetches) | ✅ / ❌ |
| Agent p50 response time (tool fetch + reasoning) | ~XXs |
| /advisor p95 response time | ~XXs |
| Langfuse traces: cost per advisor turn (Sonnet 4.6) | ~$0.00X |
```

> **The Sunday metric answer for this chapter:** *"I built a stateful conversational agent with LangGraph — StateGraph with conditional routing, ToolNode dispatching 4 live data-fetch tools against my .NET API, MemorySaver checkpointer for session persistence. I can show 5 scenario traces in Langfuse, including one that proves the agent uses cached state in turn 2 instead of re-calling the tool."*

---

### [ ] STEP 12 — Full test pass + commit

```bash
cd services/ai-service && PYTHONPATH=. pytest -v          # all suites including new files
cd c:\workspaces\personal-finance
git add services/ai-service/app/agents/
git add services/ai-service/app/services/advisor.py
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/app/config.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_advisor_tools.py
git add services/ai-service/tests/test_advisor_agent.py
git add services/ai-service/evals/advisor_scenarios.json
git add docs/performances/ai-observability-metrics.md
git status    # verify NO .env, NO credentials
git commit -m "PF-AI008: LangGraph Financial Health Advisor — stateful agent, tool routing, session memory"
```

---

### [ ] STEP 13 — Log progress

```
/mentor log Built LangGraph Financial Health Advisor: StateGraph with 3 nodes (agent, tools, fallback), 4 @tool functions calling .NET API, MemorySaver session memory, POST /advisor endpoint. Verified 5 scenarios in Langfuse — turn-2 memory confirmed (0 re-fetches). Chapter 8 complete.
```

## 📌 Notes

- **`_build_llm()` per node call is correct for testability**, not a performance concern. In a high-throughput service, cache the `ChatAnthropic` instance at module level; for personal-use volumes, the per-call pattern is fine and test-safe.
- **`MemorySaver` is process-scoped.** Service restart = all sessions lost. For development, that's acceptable. Document the production upgrade path: `langgraph-checkpoint-postgres` → `PostgresSaver` with `psycopg`; it's a one-class swap.
- **Langfuse + LangChain integration.** Add `langfuse` `CallbackHandler` to the `config` dict passed to `ainvoke`: `config = {"configurable": {...}, "callbacks": [langfuse_handler]}`. This adds per-node tracing to the existing Langfuse dashboard from PF-AI001, zero new infra.
- **`/journey/advise` is untouched.** It generates quest cards from a snapshot — a different UX pattern (batch, triggered by the journey page load). The new `/advisor` is a conversational agent triggered by the user. Both coexist; neither replaces the other.
- **No `/api/investments/summary` endpoint exists.** `InvestmentsController` only exposes per-setup CRUD (`setups`, `setups/{id}/holdings`, `setups/{id}/review`) — there's no aggregate "total portfolio value + return %" route. `get_investment_summary` composes `GET /api/networth/current` + `GET /api/networth/allocation` instead, which gives net worth and asset-class allocation but not investment-specific return %. If a real portfolio-return figure becomes worth showing in the advisor, that's a new .NET aggregation endpoint — flagged here, not built this chapter.
- **`ANTHROPIC_API_KEY` is required independent of `AI_PROVIDER`.** The advisor always uses `ChatAnthropic`, regardless of whether the AI service's extraction pipeline is configured for Gemini or Anthropic. Set it in `.env` before running Step 8's smoke test.
- **THINK-05 new contract surface.** `AdvisorRequest`/`AdvisorResponse` are new fields. When `.NET` grows a `/advisor` proxy for the chat UI, those field names freeze. Add a note in [ai-service.md](../../rules/ai-service.md) at that point.
- **Chapter 5 upgrade path.** When Chapter 5 adds SSE streaming, `AdvisorService.ask()` switches from `ainvoke` to `astream_events`, yielding token deltas as they arrive. The node/graph structure is unchanged; only the transport layer changes. That's the value of the service wrapper abstraction.
- **Deferred:** multi-agent collaboration (supervisor + specialist agents), streaming SSE (Chapter 5), MCP tool wiring (Chapter 9 — these tools become MCP tools with minimal change), persistent checkpointer with Postgres, a real per-holding investment-return endpoint.

## 📚 Resources / Theory to Learn

Organized by concept — read when you hit the wall for that step, not front-loaded.

### Concept 1 — LangGraph core (Steps 1–5)

- **LangGraph quickstart** → https://langchain-ai.github.io/langgraph/tutorials/introduction/ — build the minimal ReAct agent; the graph structure becomes obvious by contrast with your smolagents loop.
- **LangGraph how-to: add memory** → https://langchain-ai.github.io/langgraph/how-tos/persistence/ — the MemorySaver + `thread_id` pattern, exactly as used in Step 6.
- **LangGraph how-to: handle tool errors** → https://langchain-ai.github.io/langgraph/how-tos/tool-calling-errors/ — how errors in ToolNode propagate and how to route around them. Supplements the error-state pattern in `call_agent`.

### Concept 2 — Tool definition with LangChain (Step 4)

- **LangChain `@tool` docs** → https://python.langchain.com/docs/concepts/tools/ — the decorator form, how docstrings become tool descriptions (the LLM reads them!), async support.
- **LangChain ToolNode** → https://langchain-ai.github.io/langgraph/concepts/agentic_concepts/#tool-calling — how ToolNode dispatches `AIMessage.tool_calls` → tool functions → `ToolMessage` results.

### Concept 3 — Checkpointers and session memory (Step 6)

- **LangGraph persistence docs** → https://langchain-ai.github.io/langgraph/concepts/persistence/ — why `thread_id` maps to a conversation; when `MemorySaver` is right vs `PostgresSaver`.
- **`add_messages` reducer explanation** → https://langchain-ai.github.io/langgraph/concepts/low_level/#reducers — the non-obvious part: why state fields need reducers, what happens without one.

### Concept 4 — Agent evals with traces (Step 10)

- **Langfuse LangChain integration** → https://langfuse.com/docs/integrations/langchain — how to wire Langfuse tracing into LangChain/LangGraph calls via `CallbackHandler`. Adds per-node cost + latency to the Langfuse dashboard.
- **Braintrust — *Evaluating Agents*** → https://braintrust.dev/blog/evaluating-agents — the trajectory-eval approach: score tool call sequence, not just final output. Good framing for the manual S4 evaluation.

### Videos (targeted, not full courses)

- **DeepLearning.AI — *LangGraph: Multi-Agent Workflows*** (free, 3h) → https://learn.deeplearning.ai/courses/langgraph-multi-agent-workflows — the Chapter 8 slot from the learning path. Module 1 (state + routing) + Module 3 (memory) map directly to what you're building.
- **LangGraph Academy** → https://academy.langchain.com/courses/intro-to-langgraph — the LangChain official tutorial; more structured than the quickstart. Use as a reference, not a watch-through.

## 🧠 Learning Strategy

**Daily loop for Chapter 8:**

- **Day 1 (theory + state + tools — Steps 1–4):** LangGraph quickstart first (45 min). Then TypedDict state (15 min) and tools module (60 min). Stop when `pytest tests/test_advisor_tools.py` is green.
- **Day 2 (graph + routing — Step 5):** Build the graph. The `should_continue` routing function is the hardest part — test it in isolation (Step 9, routing tests) before wiring the full graph. Stop when the graph compiles and the routing tests pass.
- **Day 3 (service + endpoint + smoke — Steps 6–8):** Wrap the graph in `AdvisorService`, wire `/advisor`, run the two-turn smoke test. Stop when turn 2 shows 0 re-fetches in Langfuse.
- **Day 4 (evals + commit — Steps 10–13):** Run 5 scenarios, record pass/fail, update metrics doc, commit.

**The 5 principles applied:**

1. **Active retrieval:** Step 1's three questions, written from memory. If you can't explain why `add_messages` is needed, you'll write a state type that silently drops conversation history.
2. **Project-first:** The tools call your real .NET API — this is grounded in your actual pyramid scores and cashflow, not toy data.
3. **Same-day shipping:** Graph compiling (Day 2) is the gate; don't move to Day 3 without the routing tests green.
4. **Interleaving:** While the LangGraph models download, write the tool unit tests. Parallelise setup and build work.
5. **Teach-back:** The ReAct loop framing ("nodes are functions, edges are routing, state flows through") and the MemorySaver `thread_id` story are the two teach-backs. Say them without notes.

**Anti-patterns to avoid this chapter:**

- ❌ Building a multi-agent graph before the single-agent graph is solid. One agent, four tools, three nodes — that's Chapter 8. Multi-agent is Phase 3 territory.
- ❌ Calling `llm.invoke()` inside a node at module import time. Import-time API calls break tests and slow startup. Instantiate inside the function (see `_build_llm()` pattern above).
- ❌ Passing `session_id` directly as `thread_id` without validating it. LangGraph's `thread_id` is opaque bytes from the checkpointer's perspective — a short UUID or user-generated ID string is fine; an untrusted user value could collide sessions if not namespaced (acceptable at personal scale, note it for production).
- ❌ Using `hasattr` as a stand-in for a type check when filtering messages. See the bug fixed in Step 6 — `isinstance` is the correct tool; a shared-but-always-present attribute is not a reliable type signal.
- ❌ Using `ainvoke` with `stream_mode="values"` in unit tests — it opens a real DB/LLM connection. Mock the graph or test nodes in isolation.
- ❌ Touching `app/services/journey_advisor.py`. That endpoint serves the quest-card UI and is stable. Chapter 8 adds `POST /advisor` alongside it.

**The Sunday metric:**

> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I replaced a single-shot prompt with a LangGraph StateGraph — three nodes (agent, tool_node, fallback), four data-fetch tools calling my .NET API, conditional routing via `should_continue`, and MemorySaver session persistence. I have Langfuse traces proving turn 2 uses cached state instead of re-calling tools, and 5 scenario tests including an adversarial one where the agent correctly refuses to fabricate data for year 3000."*

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering
> certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS
> Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the
> style and topic areas of those exams — not verbatim exam items. Each question is tagged to
> the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. StateGraph vs sequential pipeline (Databricks · Google Cloud PMLE)

*Scenario:* A colleague suggests implementing the Financial Health Advisor as a simple function: fetch all four data sources, concatenate them, call the LLM once with the full context.

*Question:* What does a LangGraph `StateGraph` give you that the single-function approach does NOT?

- **A.** The graph allows the LLM to decide *which* tools to call and *in what order*, observe the results, and reason again — enabling conditional, multi-hop behavior that a fixed pipeline can't express
- **B.** The graph parallelises all tool calls automatically, halving latency
- **C.** The graph validates tool return types against the state schema at compile time
- **D.** The graph automatically caches LLM responses across requests, so repeated queries are free

<details>
<summary>Show answer</summary>

**A** — the ReAct loop (Reason → Act → Observe → Reason) is the key upgrade. A single-function pipeline fetches everything regardless of whether it's needed; the graph lets the LLM call only the tools it needs, in the order it needs them, then synthesise over the actual results. B is wrong (ToolNode dispatches calls serially by default); C and D are not LangGraph features.
*Maps to: Databricks GenAI Engineer Associate · Application Development (agentic systems); Google Cloud PMLE · MLOps / production AI systems*
</details>

---

### 2. The `add_messages` reducer (Databricks · AWS ML Engineer)

*Scenario:* You define `messages: list[BaseMessage]` in your TypedDict state (without `Annotated[list, add_messages]`). On the second turn, the user's message is missing from the LLM's context.

*Question:* What caused this, and how does `add_messages` fix it?

- **A.** `list[BaseMessage]` is not serialisable; `add_messages` converts it to JSON for the checkpointer
- **B.** Without `add_messages`, LangGraph limits message history to one turn to save memory
- **C.** LangGraph state updates replace field values by default. Without a reducer, each node's returned `{"messages": [...]}` overwrites the previous list. `add_messages` is a reducer that *appends* instead of replacing — it merges the new messages onto the existing list.
- **D.** `add_messages` deduplicates messages so the LLM never sees the same message twice

<details>
<summary>Show answer</summary>

**C** — LangGraph's default state update is a merge of dicts, but for list fields, the incoming value *replaces* the previous value unless a reducer is specified. `add_messages` is the canonical reducer for conversation history: it appends incoming messages to the accumulator. This is the non-obvious TypedDict gotcha that causes silent history loss.
*Maps to: Databricks GenAI Engineer Associate · Application Development (stateful agents); AWS Certified ML Engineer – Associate · Model deployment*
</details>

---

### 3. Conditional routing (Azure AI-102 · Databricks)

*Scenario:* Your `should_continue` function receives a state where the agent node set `error: "httpx.ConnectError: .NET API unreachable"` instead of making tool calls.

*Question:* What is the correct routing outcome, and why is routing through the graph preferable to catching the exception in the agent node?

- **A.** Route to `END` immediately; the graph cannot recover from a network error at runtime
- **B.** Re-route to the agent node to retry; LangGraph automatically retries tool failures
- **C.** Route to `"tools"` to trigger tool re-execution with a different provider
- **D.** Route to `"fallback"` — because the error field is set, `should_continue` returns `"fallback"` regardless of tool_calls; the fallback node returns a graceful user-facing message. Graph-level routing is preferable because it makes the error path an explicit, testable, inspectable graph edge — not an implicit try/catch that swallows failures silently.

<details>
<summary>Show answer</summary>

**D** — `should_continue` checks `state.get("error")` before checking `tool_calls`, so any node that sets an error signal routes to `"fallback"`. The graph advantage over try/catch: the fallback path appears in the graph topology, can be unit-tested with a state fixture, and shows up in Langfuse as a named node — not as a stack trace buried in logs.
*Maps to: Azure AI-102 · Responsible AI / error handling; Databricks GenAI Engineer Associate · Application Development (reliability)*
</details>

---

### 4. MemorySaver and session identity (Databricks · AWS ML Engineer)

*Scenario:* Two users call `POST /advisor` in the same second. Both requests omit `session_id`. What determines whether they share conversation memory?

- **A.** They share memory because MemorySaver is process-scoped and not tenant-aware
- **B.** They each get a fresh `uuid4()` session_id assigned by `AdvisorService.ask()`; MemorySaver uses `thread_id` as the isolation key. Different thread_ids = independent memory threads.
- **C.** LangGraph automatically namespaces MemorySaver by request timestamp
- **D.** They share memory for the duration of the current event loop tick, then diverge

<details>
<summary>Show answer</summary>

**B** — `AdvisorService.ask()` generates a `uuid4()` when `session_id` is None, then maps it to `thread_id` in the LangGraph config. MemorySaver isolates state by `thread_id` — two different UUIDs are two independent conversation threads even in the same process. A is technically true (MemorySaver is process-scoped) but wrong about the isolation: thread_id is the isolation key, not process scope.
*Maps to: Databricks GenAI Engineer Associate · Application Development (multi-user agents); AWS Certified ML Engineer – Associate · Model serving*
</details>

---

### 5. Tool docstrings as prompt (Databricks · Google Cloud PMLE)

*Scenario:* The agent never calls `get_investment_summary` even when the user asks about their portfolio. You notice the `@tool` function has a one-line docstring: `"""Get investments."""`

*Question:* What is the most likely root cause?

- **A.** The LLM uses the tool's docstring as its description to decide *when* to call it. A vague docstring — `"""Get investments."""` — gives the model no signal about what data the tool returns or when it's relevant. A specific docstring that mentions return fields and use-case triggers correct tool selection.
- **B.** `@tool` decorated functions must have `async def` signatures to work with LangGraph
- **C.** The tool is not in the `TOOLS` list passed to `ChatAnthropic.bind_tools()`
- **D.** Investment tools require a `portfolio_id` parameter; without it, LangGraph silently skips the tool

<details>
<summary>Show answer</summary>

**A** — tool docstrings ARE the tool description injected into the LLM's system context. The LLM selects tools based on how well their description matches the user's intent. Vague descriptions = tool never called. The fix is a docstring that names the return fields and when to use the tool — exactly as `get_investment_summary` is written in Step 4. C would also prevent it being called, but the scenario says it's in the list.
*Maps to: Databricks GenAI Engineer Associate · Application Development (tool design); Google Cloud PMLE · Prompt engineering*
</details>

---

### 6. ReAct loop structure (Databricks · Azure AI-102)

*Scenario:* After `ToolNode` returns a `ToolMessage` containing the pyramid scores, the next edge in your graph goes directly to `END`. The agent's final answer says "I don't have access to your financial data."

*Question:* What structural mistake caused this, and what is the fix?

- **A.** `ToolMessage` is not a valid state message type; replace it with `HumanMessage`
- **B.** The tool returned scores in the wrong format; fix the JSON schema
- **C.** MemorySaver was not initialised with the correct `thread_id`, so the tool result was stored in a different session
- **D.** The edge `tools → END` skips the re-reasoning step. After ToolNode appends the tool result, the agent needs to *reason again* over that result to produce an answer. The fix: add an edge `tools → agent` so the LLM sees the tool results and synthesises an answer.

<details>
<summary>Show answer</summary>

**D** — the ReAct loop is: Reason → Act → **Observe → Reason again**. `tools → END` cuts the loop after "Act" — the LLM never sees the tool results. The `tools → agent` edge is mandatory; it's what makes the result *observable* and closes the ReAct cycle. The agent then produces its final answer in the next `agent` node invocation, which returns no tool_calls, and `should_continue` routes to END.
*Maps to: Databricks GenAI Engineer Associate · Application Development (agentic loop design); Azure AI-102 · Implement AI agents*
</details>
