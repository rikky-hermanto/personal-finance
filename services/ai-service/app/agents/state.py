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
