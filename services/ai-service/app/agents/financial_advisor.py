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

from app.agents.advisor_tools import TOOLS
from app.agents.state import AdvisorState
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


# Singleton — compiled once at import time, reused across requests.
advisor_graph = build_graph()
