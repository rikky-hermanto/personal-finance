# PF-AI008 — LangGraph: Stateful Financial Health Advisor

> **Learning Phase:** Phase 2 · Chapter 8 of 12 · Day ~45 of 90
> **Status:** To Do
> **Planned from branch:** main
> **Pivot goal:** Build a multi-step conversational agent with LangGraph — state, conditional routing, tool use, conversation memory, and error handling. After this chapter, you have the dominant agent framework in current AI Eng JDs checked off with a real, demo-able artifact grounded in your own financial data.

## Objective

The existing `/journey/advise` endpoint is a single-shot Anthropic call: request → prompt → tool_use → response. It doesn't fetch data dynamically, can't handle follow-up questions, and can't route conditionally based on what it discovers. It's the toy version of an agent.

This chapter builds a **separate conversational agent** — `POST /advisor` — using LangGraph:

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
     AdvisorResponse { answer, sources, session_id, steps_taken }
```

LangGraph's key concepts implemented in this chapter:
1. **TypedDict state** — typed, reducible state passed between nodes
2. **StateGraph** — declarative node + edge graph definition
3. **ToolNode** — prebuilt node that dispatches tool calls and feeds results back
4. **Conditional edges** — `should_continue` routes to tools, END, or fallback
5. **MemorySaver checkpointer** — persists state between turns in a session
6. **Error-aware routing** — tool failures route to a fallback node, not a crash

**Relationship to existing `/journey/advise`:** that endpoint stays unchanged — it serves the quest-card UI. The new `/advisor` serves a conversational chat UI (built in Chapter 5). Both endpoints coexist; Chapter 5 will stream `/advisor` over SSE.

**Depends on:** Chapter 7 (smolagents — agent mental model). LangGraph builds on it as "industrial smolagents."  
**Unblocks:** Chapter 9 (MCP server — the tools you build here become MCP tools), Chapter 10 (blog post — the LangGraph traces are demo material).

## Acceptance Criteria

- [ ] `app/agents/state.py` — `AdvisorState` TypedDict with at least 6 fields; annotated `messages` using `add_messages` reducer
- [ ] `app/agents/tools.py` — 4 `@tool`-decorated async functions (pyramid scores, cashflow summary, spending by category, investment summary) that call the .NET API; unit-tested with mocked httpx
- [ ] `app/agents/financial_advisor.py` — `StateGraph` compiled with: agent node, ToolNode, conditional edge (`should_continue`), fallback node, MemorySaver checkpointer
- [ ] `AdvisorService.ask(query, session_id)` returns `AdvisorResponse` with multi-step answer; same session_id replays state correctly (conversation memory works)
- [ ] `POST /advisor` wired in FastAPI — accepts `{query, session_id?, filters?}`, returns `{answer, sources[], session_id, steps_taken}`
- [ ] LLM failures in tool execution route to a fallback node, not a 500 crash
- [ ] 5 written test scenarios (`evals/advisor_scenarios.json`) with expected behavior notes
- [ ] `pytest` green — `tests/test_advisor_tools.py`, `tests/test_advisor_agent.py` (all mocked — no real API or LLM calls)
- [ ] Langfuse traces visible for each `/advisor` call — steps, token counts, latency per node
- [ ] `pyproject.toml` updated: `langgraph>=0.2`, `langchain-anthropic>=0.3` in dependencies; `langchain-google-genai>=2.0` in optional/dev

## Approach

**LangGraph over raw loops — for Chapter 8.** The smolagents agent (Chapter 7) hand-rolls the tool-use loop. LangGraph is the same loop made explicit as a graph: nodes are functions, edges are routing decisions, state flows between them. Once you've built the loop by hand (Chapter 7), the graph abstraction makes sense rather than feeling magic.

**`langchain-anthropic` as the agent's LLM wrapper.** LangGraph integrates natively with LangChain-wrapped models. The existing `ProviderFactory` (raw Anthropic SDK) stays for extraction — that surface is frozen (THINK-05). The agent uses `ChatAnthropic` from `langchain-anthropic`, which wraps the same Claude API. Adding a LangChain model here doesn't pollute the extraction pipeline; they live in separate modules.

**Tools call the .NET API, not the database directly.** The agent's tools use httpx to call `http://localhost:7208/api/journey/scores`, `/api/transactions/summary`, etc. This keeps the data layer in .NET (where the business logic lives) and makes the agent composable — the same tools become MCP tools in Chapter 9 with minimal change.

**MemorySaver for session memory — not a database.** `MemorySaver` is an in-memory checkpointer, scoped to the process lifetime. For this project's personal-use scale, that's correct. The interview framing: "I use MemorySaver for development; production would swap in `PostgresSaver` or `RedisSaver` with one line change — LangGraph's checkpointer API is storage-agnostic."

**Error routing, not exception bubbling.** Nodes catch their own exceptions and set `state["error"]`; a conditional edge routes error-state to a `fallback` node that returns a graceful message. This is the LangGraph-idiomatic pattern and it's what distinguishes a production agent from a demo: crashes are handled by the graph, not by HTTP 500.

Out of scope: streaming the advisor over SSE (Chapter 5 builds that), multi-agent collaboration (Chapter 8 is a single-agent graph), MCP wiring (Chapter 9), replacing the existing quest-card endpoint. Don't touch `app/services/journey_advisor.py`.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/agents/__init__.py` | Create — empty module marker |
| `services/ai-service/app/agents/state.py` | Create — `AdvisorState` TypedDict |
| `services/ai-service/app/agents/tools.py` | Create — 4 `@tool` functions (httpx → .NET API) |
| `services/ai-service/app/agents/financial_advisor.py` | Create — `StateGraph`, nodes, edges, compile |
| `services/ai-service/app/services/advisor.py` | Create — `AdvisorService` wrapping the compiled graph |
| `services/ai-service/app/models.py` | Edit — add `AdvisorRequest`, `AdvisorResponse`, `SourceTransaction` |
| `services/ai-service/app/main.py` | Edit — add `POST /advisor`; wire graph in lifespan |
| `services/ai-service/app/config.py` | Edit — add `net_api_base_url: str` for tool HTTP calls |
| `services/ai-service/pyproject.toml` | Edit — add `langgraph>=0.2`, `langchain-anthropic>=0.3` |
| `services/ai-service/tests/test_advisor_tools.py` | Create — unit tests for each tool (mocked httpx) |
| `services/ai-service/tests/test_advisor_agent.py` | Create — graph routing tests (mocked LLM + tools) |
| `services/ai-service/evals/advisor_scenarios.json` | Create — 5 scenarios with expected behavior notes |

---

## TODO

### [ ] STEP 0 — Prerequisite gate: Chapter 7 smolagents complete

Before LangGraph, you need the agent mental model: tool-use loop, observation → reasoning cycle, traces. Chapter 7 builds that with smolagents on the smallest possible surface. LangGraph is "the same loop, expressed as a graph."

> **If Chapter 7 is done:** proceed to Step 1.
> **If Chapter 7 is not done:** start there. LangGraph's StateGraph, ToolNode, and conditional edges will make far more sense once you've built the equivalent by hand.

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

Per THINK-03 — list every state field, its type, an example value, and *why it lives in state* before writing code. Wrong types here create graph routing bugs (not SQL bugs, but equally opaque).

| Field | Python type | Example | Why in state |
|-------|-------------|---------|-------------|
| `messages` | `Annotated[list, add_messages]` | `[HumanMessage(...), AIMessage(...)]` | LangGraph's standard message list; `add_messages` reducer appends rather than overwrites — required for multi-turn |
| `pyramid_scores` | `dict \| None` | `{"l1": 85, "l2": 40, "l3": 10, "l4": 0, "l5": 0}` | Fetched once by `get_pyramid_scores()`, reused across turns without re-fetching |
| `cashflow_summary` | `dict \| None` | `{"income_monthly": 15000000, "expense_monthly": 12000000}` | Same — fetch once, reason many times |
| `spending_by_category` | `dict \| None` | `{"Food & Dining": 2500000, "Transport": 800000}` | Category breakdown for gap analysis |
| `investment_summary` | `dict \| None` | `{"total_value": 50000000, "allocation": {...}}` | L3/L4 pyramid context |
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

Create `services/ai-service/app/agents/__init__.py` (empty).

Create `services/ai-service/app/agents/state.py`:

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

---

### [ ] STEP 4 — Build `app/agents/tools.py` (the 4 data-fetch tools)

Create `services/ai-service/app/agents/tools.py`:

```python
"""LangGraph tool functions for the Financial Health Advisor agent.

Each tool calls the .NET API via httpx. They are @tool-decorated so LangGraph's
ToolNode can dispatch them automatically from the LLM's tool_calls.

The .NET API base URL comes from config.net_api_base_url (default: http://localhost:7208).
All tools return a plain dict — ToolNode serializes it back into a ToolMessage.
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
    """Fetch the user's current Financial Pyramid tier scores (L1–L5).

    Returns a dict with keys: l1, l2, l3, l4, l5 (int 0–100 each)
    and overall_level (int 1–5).
    """
    resp = await _CLIENT.get("/api/journey/scores")
    resp.raise_for_status()
    return resp.json()


@tool
async def get_cashflow_summary(date_from: str = "", date_to: str = "") -> dict:
    """Fetch monthly cashflow summary: total income, total expenses, net, savings rate.

    Args:
        date_from: ISO date string YYYY-MM-DD (optional, defaults to last 3 months)
        date_to:   ISO date string YYYY-MM-DD (optional, defaults to today)
    Returns keys: income_total, expense_total, net, savings_rate_pct, period_days
    """
    params = {}
    if date_from:
        params["dateFrom"] = date_from
    if date_to:
        params["dateTo"] = date_to
    resp = await _CLIENT.get("/api/transactions/cashflow-summary", params=params)
    resp.raise_for_status()
    return resp.json()


@tool
async def get_spending_by_category(date_from: str = "", date_to: str = "") -> dict:
    """Fetch spending breakdown by category for the given period.

    Returns a dict of {category_name: total_idr} sorted descending by amount.
    """
    params = {"groupBy": "category"}
    if date_from:
        params["dateFrom"] = date_from
    if date_to:
        params["dateTo"] = date_to
    resp = await _CLIENT.get("/api/transactions/analysis", params=params)
    resp.raise_for_status()
    return resp.json()


@tool
async def get_investment_summary() -> dict:
    """Fetch the user's investment portfolio summary.

    Returns keys: total_value_idr, allocation (dict by asset class),
    total_return_pct, monthly_contribution_idr.
    """
    resp = await _CLIENT.get("/api/investments/summary")
    resp.raise_for_status()
    return resp.json()


TOOLS = [get_pyramid_scores, get_cashflow_summary, get_spending_by_category, get_investment_summary]
```

Add `net_api_base_url` to `app/config.py`:
```python
    net_api_base_url: str = "http://localhost:7208"
```

Create `services/ai-service/tests/test_advisor_tools.py`:

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
async def test_get_pyramid_scores_returns_parsed_json(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"l1": 85, "l2": 40, "l3": 10, "l4": 0, "l5": 0, "overall_level": 2}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_pyramid_scores
    result = await get_pyramid_scores.ainvoke({})
    assert result["l2"] == 40


@pytest.mark.asyncio
async def test_get_cashflow_summary_passes_date_params(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"income_total": 15_000_000, "expense_total": 12_000_000}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_cashflow_summary
    await get_cashflow_summary.ainvoke({"date_from": "2026-03-01", "date_to": "2026-03-31"})
    call_kwargs = mock_httpx_client.get.call_args
    assert "dateFrom" in call_kwargs[1]["params"]


@pytest.mark.asyncio
async def test_get_spending_by_category_returns_dict(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"Food & Dining": 2_500_000, "Transport": 800_000}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_spending_by_category
    result = await get_spending_by_category.ainvoke({})
    assert "Food & Dining" in result


@pytest.mark.asyncio
async def test_get_investment_summary_returns_allocation(mock_httpx_client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"total_value_idr": 50_000_000, "allocation": {"stocks": 60}}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx_client.get = AsyncMock(return_value=mock_resp)

    from app.agents.tools import get_investment_summary
    result = await get_investment_summary.ainvoke({})
    assert result["total_value_idr"] == 50_000_000
```

```bash
PYTHONPATH=. pytest tests/test_advisor_tools.py -v
```

> **Why tools call the .NET API instead of the DB directly?** Business logic — pyramid scoring, category aggregation, investment valuation — lives in the .NET services. Bypassing them and hitting the DB directly would duplicate logic and break when those services evolve. It also makes the tools trivially MCP-compatible in Chapter 9: MCP tools are just HTTP calls with a name schema, same as these.

> **Why `@tool` instead of `BaseTool` subclass?** The decorator form is correct for functions with clear signatures. `BaseTool` is for tools with complex init or async streaming — not needed here. LangGraph's `ToolNode` handles both forms identically.

---

### [ ] STEP 5 — Build `app/agents/financial_advisor.py` (the graph)

Create `services/ai-service/app/agents/financial_advisor.py`:

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

> **C# equivalent of `should_continue`:**
> ```csharp
> // LangGraph's routing function maps to a switch/match over MediatR command types:
> // agent output → route to ToolNode or END
> // equivalent to: IMediator.Send(command) where the handler picks the next step.
> // The difference: LangGraph makes the routing function an explicit, testable,
> // separately-inspectable artifact rather than implicit handler dispatch.
> ```

---

### [ ] STEP 6 — Build `app/services/advisor.py` (the service wrapper)

Create `services/ai-service/app/services/advisor.py`:

```python
"""AdvisorService — wraps the compiled LangGraph for the /advisor endpoint."""
from __future__ import annotations

import logging
import uuid

from langchain_core.messages import HumanMessage

from app.agents.financial_advisor import advisor_graph
from app.models import AdvisorRequest, AdvisorResponse

logger = logging.getLogger(__name__)


class AdvisorService:
    async def ask(self, request: AdvisorRequest) -> AdvisorResponse:
        session_id = request.session_id or str(uuid.uuid4())

        # LangGraph checkpointer key — same session_id = same memory thread.
        config = {"configurable": {"thread_id": session_id}}

        initial_state = {
            "messages": [HumanMessage(content=request.query)],
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

        # The last AIMessage is the agent's final answer.
        messages = final_state.get("messages", [])
        last_ai = next(
            (m for m in reversed(messages) if hasattr(m, "content") and not hasattr(m, "tool_calls")),
            None,
        )
        answer = last_ai.content if last_ai else "No response generated."

        # Count how many tool calls were made (steps taken = tool hops).
        steps_taken = sum(
            1 for m in messages
            if hasattr(m, "tool_calls") and m.tool_calls
        )

        return AdvisorResponse(
            answer=answer,
            session_id=session_id,
            steps_taken=steps_taken,
        )
```

> **Why `ainvoke` instead of `astream`?** Chapter 5 adds SSE streaming — at that point, `astream_events` replaces `ainvoke` here, yielding tokens as they arrive. Using `ainvoke` now keeps the endpoint simple and correct; Chapter 5 is the natural upgrade point.

> **Why extract the answer by reversing `messages` instead of `final_state["messages"][-1]`?** `ToolMessage` results appear after `AIMessage` in the list. Reversing and filtering for messages *without* `tool_calls` gets the last reasoning message. A naive `[-1]` would return the last tool result if the agent's final turn was a tool call, which is rare but possible.

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

> **Why test routing functions directly, not the full compiled graph?** The full graph calls real LLM and real tools. Unit tests should be fast and deterministic. `should_continue` is a pure function over state — test it as such. Integration tests (the 5 scenarios in Step 10) exercise the full graph with traces as evidence. Same discipline as the `.NET` CQRS tests: validators tested in isolation, handlers exercised in integration.

---

### [ ] STEP 10 — Write 5 evaluation scenarios (`evals/advisor_scenarios.json`)

Create `services/ai-service/evals/advisor_scenarios.json`:

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

Record pass/fail per scenario in `docs/performances/ai-observability-metrics.md`.

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

---

## Resources / Theory to Learn

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

---

## Learning Strategy

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
- ❌ Using `ainvoke` with `stream_mode="values"` in unit tests — it opens a real DB/LLM connection. Mock the graph or test nodes in isolation.
- ❌ Touching `app/services/journey_advisor.py`. That endpoint serves the quest-card UI and is stable. Chapter 8 adds `POST /advisor` alongside it.

**The Sunday metric:**

> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I replaced a single-shot prompt with a LangGraph StateGraph — three nodes (agent, tool_node, fallback), four data-fetch tools calling my .NET API, conditional routing via `should_continue`, and MemorySaver session persistence. I have Langfuse traces proving turn 2 uses cached state instead of re-calling tools, and 5 scenario tests including an adversarial one where the agent correctly refuses to fabricate data for year 3000."*

---

## Notes

- **`_build_llm()` per node call is correct for testability**, not a performance concern. In a high-throughput service, cache the `ChatAnthropic` instance at module level; for personal-use volumes, the per-call pattern is fine and test-safe.
- **`MemorySaver` is process-scoped.** Service restart = all sessions lost. For development, that's acceptable. Document the production upgrade path: `langgraph-checkpoint-postgres` → `PostgresSaver` with `psycopg`; it's a one-class swap.
- **Langfuse + LangChain integration.** Add `langfuse` `CallbackHandler` to the `config` dict passed to `ainvoke`: `config = {"configurable": {...}, "callbacks": [langfuse_handler]}`. This adds per-node tracing to the existing Langfuse dashboard from PF-AI001, zero new infra.
- **`/journey/advise` is untouched.** It generates quest cards from a snapshot — a different UX pattern (batch, triggered by the journey page load). The new `/advisor` is a conversational agent triggered by the user. Both coexist; neither replaces the other.
- **Chapter 5 upgrade path.** When Chapter 5 adds SSE streaming, `AdvisorService.ask()` switches from `ainvoke` to `astream_events`, yielding token deltas as they arrive. The node/graph structure is unchanged; only the transport layer changes. That's the value of the service wrapper abstraction.
- **THINK-05 new contract surface.** `AdvisorRequest`/`AdvisorResponse` are new fields. When `.NET` grows a `/advisor` proxy for the chat UI, those field names freeze. Add a note in `.claude/rules/ai-service.md` at that point.
- **Deferred:** multi-agent collaboration (supervisor + specialist agents), streaming SSE (Chapter 5), MCP tool wiring (Chapter 9 — these tools become MCP tools with minimal change), persistent checkpointer with Postgres.

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering
> certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS
> Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the
> style and topic areas of those exams — not verbatim exam items. Each question is tagged to
> the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. StateGraph vs sequential pipeline (Databricks · Google Cloud PMLE)

*Scenario:* A colleague suggests implementing the Financial Health Advisor as a simple function: fetch all four data sources, concatenate them, call the LLM once with the full context.

*Question:* What does a LangGraph `StateGraph` give you that the single-function approach does NOT?

- **A.** The graph automatically caches LLM responses across requests, so repeated queries are free
- **B.** The graph allows the LLM to decide *which* tools to call and *in what order*, observe the results, and reason again — enabling conditional, multi-hop behavior that a fixed pipeline can't express
- **C.** The graph parallelises all tool calls automatically, halving latency
- **D.** The graph validates tool return types against the state schema at compile time

<details>
<summary>Show answer</summary>

**B** — the ReAct loop (Reason → Act → Observe → Reason) is the key upgrade. A single-function pipeline fetches everything regardless of whether it's needed; the graph lets the LLM call only the tools it needs, in the order it needs them, then synthesise over the actual results. C is wrong (ToolNode dispatches calls serially by default); A and D are not LangGraph features.
*Maps to: Databricks GenAI Engineer Associate · Application Development (agentic systems); Google Cloud PMLE · MLOps / production AI systems*
</details>

---

### 2. The `add_messages` reducer (Databricks · AWS ML Engineer)

*Scenario:* You define `messages: list[BaseMessage]` in your TypedDict state (without `Annotated[list, add_messages]`). On the second turn, the user's message is missing from the LLM's context.

*Question:* What caused this, and how does `add_messages` fix it?

- **A.** `list[BaseMessage]` is not serialisable; `add_messages` converts it to JSON for the checkpointer
- **B.** LangGraph state updates replace field values by default. Without a reducer, each node's returned `{"messages": [...]}` overwrites the previous list. `add_messages` is a reducer that *appends* instead of replacing — it merges the new messages onto the existing list.
- **C.** `add_messages` deduplications messages so the LLM never sees the same message twice
- **D.** Without `add_messages`, LangGraph limits message history to one turn to save memory

<details>
<summary>Show answer</summary>

**B** — LangGraph's default state update is a merge of dicts, but for list fields, the incoming value *replaces* the previous value unless a reducer is specified. `add_messages` is the canonical reducer for conversation history: it appends incoming messages to the accumulator. This is the non-obvious TypedDict gotcha that causes silent history loss.
*Maps to: Databricks GenAI Engineer Associate · Application Development (stateful agents); AWS Certified ML Engineer – Associate · Model deployment*
</details>

---

### 3. Conditional routing (Azure AI-102 · Databricks)

*Scenario:* Your `should_continue` function receives a state where the agent node set `error: "httpx.ConnectError: .NET API unreachable"` instead of making tool calls.

*Question:* What is the correct routing outcome, and why is routing through the graph preferable to catching the exception in the agent node?

- **A.** Route to `END` immediately; the graph cannot recover from a network error at runtime
- **B.** Route to `"fallback"` — because the error field is set, `should_continue` returns `"fallback"` regardless of tool_calls; the fallback node returns a graceful user-facing message. Graph-level routing is preferable because it makes the error path an explicit, testable, inspectable graph edge — not an implicit try/catch that swallows failures silently.
- **C.** Re-route to the agent node to retry; LangGraph automatically retries tool failures
- **D.** Route to `"tools"` to trigger tool re-execution with a different provider

<details>
<summary>Show answer</summary>

**B** — `should_continue` checks `state.get("error")` before checking `tool_calls`, so any node that sets an error signal routes to `"fallback"`. The graph advantage over try/catch: the fallback path appears in the graph topology, can be unit-tested with a state fixture, and shows up in Langfuse as a named node — not as a stack trace buried in logs.
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

- **A.** The tool is not in the `TOOLS` list passed to `ChatAnthropic.bind_tools()`
- **B.** `@tool` decorated functions must have `async def` signatures to work with LangGraph
- **C.** The LLM uses the tool's docstring as its description to decide *when* to call it. A vague docstring — `"""Get investments."""` — gives the model no signal about what data the tool returns or when it's relevant. A specific docstring that mentions return fields and use-case triggers correct tool selection.
- **D.** Investment tools require a `portfolio_id` parameter; without it, LangGraph silently skips the tool

<details>
<summary>Show answer</summary>

**C** — tool docstrings ARE the tool description injected into the LLM's system context. The LLM selects tools based on how well their description matches the user's intent. Vague descriptions = tool never called. The fix is a docstring that names the return fields and when to use the tool — exactly as `get_investment_summary` is written in Step 4. A would also prevent it being called, but the scenario says it's in the list.
*Maps to: Databricks GenAI Engineer Associate · Application Development (tool design); Google Cloud PMLE · Prompt engineering*
</details>

---

### 6. ReAct loop structure (Databricks · Azure AI-102)

*Scenario:* After `ToolNode` returns a `ToolMessage` containing the pyramid scores, the next edge in your graph goes directly to `END`. The agent's final answer says "I don't have access to your financial data."

*Question:* What structural mistake caused this, and what is the fix?

- **A.** `ToolMessage` is not a valid state message type; replace it with `HumanMessage`
- **B.** The tool returned scores in the wrong format; fix the JSON schema
- **C.** The edge `tools → END` skips the re-reasoning step. After ToolNode appends the tool result, the agent needs to *reason again* over that result to produce an answer. The fix: add an edge `tools → agent` so the LLM sees the tool results and synthesises an answer.
- **D.** MemorySaver was not initialised with the correct `thread_id`, so the tool result was stored in a different session

<details>
<summary>Show answer</summary>

**C** — the ReAct loop is: Reason → Act → **Observe → Reason again**. `tools → END` cuts the loop after "Act" — the LLM never sees the tool results. The `tools → agent` edge is mandatory; it's what makes the result *observable* and closes the ReAct cycle. The agent then produces its final answer in the next `agent` node invocation, which returns no tool_calls, and `should_continue` routes to END.
*Maps to: Databricks GenAI Engineer Associate · Application Development (agentic loop design); Azure AI-102 · Implement AI agents*
</details>
