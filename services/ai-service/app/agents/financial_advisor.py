"""Financial Health Advisor — LangGraph StateGraph definition.

Graph topology:
  START → agent
  agent -- has tool_calls → tools → agent (ReAct loop)
  agent -- no tool_calls  → END
  agent -- error set      → fallback → END
"""
from __future__ import annotations

import asyncio
import logging

from langchain_core.language_models import LanguageModelInput
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_core.runnables import Runnable, RunnableConfig
from app.agents.bounded_saver import BoundedMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode

from app.agents.advisor_tools import TOOLS
from app.agents.chat_model_factory import (
    MAX_MODEL_CALLS, MODEL_TIMEOUT_SECONDS, create_chat_model,
)
from app.agents.state import AdvisorState
from app.config import settings

logger = logging.getLogger(__name__)

# PF-157 (FIN-02, FIN-04): the 0-100 scale and the 70 (cleared) and 100 (mastered) marks come from
# docs/references/finance-domain/scoring-rubric.md. The prompt states no other threshold: the
# platform computes the scores and the advisor only reports them. Wording reviewed by /cio.
SYSTEM_PROMPT = """You are a personal financial advisor for a user managing finances
through the Personal Finance Platform. The platform scores a 5-tier Financial Pyramid:
  L1 Foundations — spending against income
  L2 Defense     — emergency-fund cover and debt-to-income
  L3 Growth      — savings and investing rate
  L4 Freedom     — passive income against expenses (not scored yet)
  L5 Legacy      — estate planning and succession (no indicator yet)

The platform scores each live indicator from 0 to 100. A tier is cleared when every live
indicator in it scores 70 or more, and mastered at 100. The tool gives you one score per tier,
which is the average of that tier's live indicators. A tier score below 70 means the tier is not
cleared. A tier score of 70 or more does not prove it is cleared, because one indicator can still
be below 70: say the score is at or above the clearing mark and that the Journey page shows each
indicator. Only a tier score of 100 proves mastery. A tier missing from the tool's level_scores
has not been evaluated: say so, and never treat it as passed or failed. current_level is never
below 1, even when L1 is not cleared, so judge L1 from its own score, not from current_level.
Apart from the 0-100 scale and the 70 and 100 marks, never state a threshold, target ratio or
number of months yourself. Report the scores your tools return and what they mean for the next step.

You have tools to fetch the user's real financial data. Use them — never estimate.
After fetching data, identify which pyramid level the user is on and the highest-leverage
next action. Be specific: name the category, amount, or ratio the tools returned, not vague advice.
Answer in the same language as the user's question (Indonesian or English)."""


def _build_llm() -> Runnable[LanguageModelInput, BaseMessage]:
    return create_chat_model(settings).bind_tools(TOOLS)


# ── Nodes ──────────────────────────────────────────────────────────────────────

async def call_agent(state: AdvisorState, config: RunnableConfig) -> dict:
    """The central agent node: call the LLM with current state.messages."""
    calls = state.get("model_calls", 0)
    if calls >= MAX_MODEL_CALLS:
        return {"error": "advisor_call_limit"}
    
    # ToolNode marks failed tool results; do not ask the model to reinterpret them.
    if state["messages"] and isinstance(state["messages"][-1], ToolMessage):
        for message in reversed(state["messages"]):
            if not isinstance(message, ToolMessage):
                break
            if message.status == "error":
                return {"error": "advisor_tool_error"}
            
    # Prepend system message if starting a new conversation.
    messages = state["messages"]
    if not any(isinstance(m, SystemMessage) for m in messages):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages
    try:
        llm = _build_llm()
        async with asyncio.timeout(MODEL_TIMEOUT_SECONDS):
            response = await llm.ainvoke(messages, config=config)
        return {"messages": [response], "error": None, "model_calls": calls + 1}
    except Exception as exc:
        # Exception messages/tracebacks can contain credentials or private prompts.
        logger.warning("advisor model failed type=%s", type(exc).__name__)
        return {"error": "advisor_provider_error", "model_calls": calls + 1}


def call_fallback(state: AdvisorState) -> dict:
    """Fallback node — returns a graceful error message instead of crashing."""
    logger.warning("advisor fallback invoked")
    # Pair unexecuted tool calls when a limit interrupts a batch. This keeps
    # saved history valid for the next turn without fetching or synthesizing.
    messages = state.get("messages", [])
    last_ai_index = next((i for i in range(len(messages) - 1, -1, -1)
                          if isinstance(messages[i], AIMessage)), None)
    last_ai = messages[last_ai_index] if last_ai_index is not None else None
    # Tool IDs can repeat on later turns; only this batch's results count.
    trailing = messages[last_ai_index + 1:] if last_ai_index is not None else []
    answered = {m.tool_call_id for m in trailing if isinstance(m, ToolMessage)}
    cancelled = [
        ToolMessage(content="Tool execution stopped.", tool_call_id=call["id"], status="error")
        for call in (last_ai.tool_calls if last_ai else []) if call["id"] not in answered
    ]
    return {
        "messages": cancelled + [AIMessage(content=(
            "Maaf, saya tidak dapat mengambil data keuangan Anda saat ini. "
            "Silakan coba lagi dalam beberapa saat. "
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
        if state.get("model_calls", 0) >= MAX_MODEL_CALLS:
            return "fallback"
        return "tools"
    return END


# ── Graph ──────────────────────────────────────────────────────────────────────

def build_graph() -> CompiledStateGraph:
    tool_node = ToolNode(TOOLS, handle_tool_errors="Advisor data fetch failed.")

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

    checkpointer = BoundedMemorySaver()
    return builder.compile(checkpointer=checkpointer)


# Singleton — compiled once at import time, reused across requests.
advisor_graph = build_graph()
