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
