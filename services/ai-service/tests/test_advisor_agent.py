"""Graph routing tests — verify should_continue routing logic."""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from langchain_core.callbacks import BaseCallbackHandler
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
        model_calls=0,
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
    assert "503" not in result["messages"][0].content


def test_advisor_state_fields():
    """Smoke-check TypedDict field names match what the graph sets."""
    state = _state([HumanMessage(content="test")])
    assert "pyramid_scores" in state
    assert "error" in state
    assert "session_id" in state


@pytest.fixture
def harness(monkeypatch):
    from app.agents import financial_advisor as agent
    from app.services import advisor as service
    llm = MagicMock()
    llm.ainvoke = AsyncMock()
    monkeypatch.setattr(agent, "_build_llm", MagicMock(return_value=llm))
    graph = agent.build_graph()
    monkeypatch.setattr(service, "advisor_graph", graph)
    callback = BaseCallbackHandler()
    monkeypatch.setattr(service, "CallbackHandler", lambda: callback)
    return agent, service, graph, llm, callback


def tool_call(id="call-1"):
    return AIMessage(content="", tool_calls=[{"name": "get_pyramid_scores", "args": {}, "id": id}])


async def test_tool_roundtrip_synthesis_callbacks_and_two_turn_memory(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    response = httpx.Response(200, json={"currentLevel": 2, "levelScores": {"L2": 42.5}},
                              request=httpx.Request("GET", "http://test/api/journey/state"))
    llm.ainvoke.side_effect = [tool_call(), AIMessage(content="L2: 42.5"), AIMessage(content="Follow-up")]
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(return_value=response)) as get:
        first = await service.AdvisorService().ask(AdvisorRequest(query="Synthetic question"))
        second = await service.AdvisorService().ask(AdvisorRequest(query="What next?", session_id=first.session_id))
    assert first.answer == "L2: 42.5"
    assert second.answer == "Follow-up"
    assert second.session_id == first.session_id
    get.assert_awaited_once_with("/api/journey/state")
    messages = llm.ainvoke.await_args_list[1].args[0]
    assert any(isinstance(m, ToolMessage) and '42.5' in m.content for m in messages)
    history = llm.ainvoke.await_args_list[2].args[0]
    assert [m.content for m in history if isinstance(m, HumanMessage)] == ["Synthetic question", "What next?"]
    assert any(isinstance(m, AIMessage) and m.content == first.answer for m in history)
    forwarded = llm.ainvoke.await_args.kwargs["config"]
    assert callback in forwarded["callbacks"].handlers
    assert forwarded["configurable"]["thread_id"] == first.session_id


@pytest.mark.parametrize("stage", ["constructor", "binding", "invocation", "429"])
async def test_provider_failures_are_controlled_and_private(harness, stage, caplog):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    private = "503 secret-credential private-prompt"
    if stage == "constructor":
        agent._build_llm.side_effect = ValueError(private)
    elif stage == "binding":
        fake = MagicMock()
        fake.bind_tools.side_effect = ValueError(private)
        agent._build_llm.side_effect = lambda: fake.bind_tools(agent.TOOLS)
    else:
        error = httpx.HTTPStatusError(private, request=httpx.Request("POST", "http://test"),
                                      response=httpx.Response(429)) if stage == "429" else RuntimeError(private)
        llm.ainvoke.side_effect = error
    result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    assert private not in result.answer + caplog.text
    assert llm.ainvoke.await_count == (0 if stage in ("constructor", "binding") else 1)
    agent._build_llm.assert_called_once()


async def test_call_limit_stops_without_extra_tools_or_synthesis_and_resets(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.side_effect = [tool_call(str(i)) for i in range(4)] + [AIMessage(content="New turn")]
    response = httpx.Response(200, json={}, request=httpx.Request("GET", "http://test"))
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(return_value=response)) as get:
        first = await service.AdvisorService().ask(AdvisorRequest(query="loop"))
        assert first.answer.startswith("Maaf")
        assert llm.ainvoke.await_count == 4
        assert get.await_count == 3
        snapshot = await graph.aget_state({"configurable": {"thread_id": first.session_id}})
        assert snapshot.values["model_calls"] == 4
        assert not snapshot.next
        second = await service.AdvisorService().ask(AdvisorRequest(query="next", session_id=first.session_id))
    assert second.answer == "New turn"
    snapshot = await graph.aget_state({"configurable": {"thread_id": first.session_id}})
    assert snapshot.values["model_calls"] == 1
    history = llm.ainvoke.await_args.args[0]
    assert {m.tool_call_id for m in history if isinstance(m, ToolMessage)} == {"0", "1", "2", "3"}


async def test_fourth_call_can_return_final_answer(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.side_effect = [tool_call(str(i)) for i in range(3)] + [AIMessage(content="Finished")]
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(return_value=MagicMock())):
        result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer == "Finished"
    assert llm.ainvoke.await_count == 4


async def test_timeout_cancels_invocation_without_retry(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    cancelled = asyncio.Event()
    async def stalled(*args, **kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    llm.ainvoke.side_effect = stalled
    monkeypatch.setattr(agent, "MODEL_TIMEOUT_SECONDS", 0.01)
    result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    assert cancelled.is_set()
    llm.ainvoke.assert_awaited_once()


async def test_tool_http_failure_stops_before_synthesis(harness, caplog):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.return_value = tool_call()
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(side_effect=RuntimeError("private-http-payload"))):
        result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    llm.ainvoke.assert_awaited_once()
    snapshot = await graph.aget_state({"configurable": {"thread_id": result.session_id}})
    assert "private-http-payload" not in str(snapshot.values) + caplog.text


async def test_secondary_recursion_guard_returns_fallback_and_closes_saved_turn(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    monkeypatch.setattr(service, "GRAPH_RECURSION_LIMIT", 1)
    llm.ainvoke.return_value = tool_call()
    result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    snapshot = await graph.aget_state({"configurable": {"thread_id": result.session_id}})
    assert not snapshot.next
    assert any(isinstance(m, ToolMessage) for m in snapshot.values["messages"])
    llm.ainvoke.assert_awaited_once()


@pytest.mark.parametrize("content,expected", [
    ("plain", "plain"),
    (["first", {"type": "text", "text": "second"}, {"type": "thinking", "thinking": "private"},
      {"type": "tool_use", "name": "metadata"}], "first\nsecond"),
    ([{"type": "thinking", "thinking": "private"}], "No response generated."),
    ([], "No response generated."),
])
async def test_answer_content_normalized_to_contract_string(harness, content, expected):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.return_value = AIMessage(content=content)
    result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer == expected
    assert set(result.model_dump()) == {"answer", "session_id", "steps_taken"}


def test_factory_and_tools_are_wired():
    from app.agents.financial_advisor import _build_llm, TOOLS, settings
    with patch("app.agents.financial_advisor.create_chat_model") as factory:
        assert _build_llm() is factory.return_value.bind_tools.return_value
        factory.assert_called_once_with(settings)
        factory.return_value.bind_tools.assert_called_once_with(TOOLS)


def test_fallback_pairs_current_tool_batch_even_when_ids_repeat():
    from app.agents.financial_advisor import call_fallback
    state = _state([tool_call("same"), ToolMessage(content="old", tool_call_id="same"),
                    AIMessage(content="old answer"), HumanMessage(content="next"), tool_call("same")])
    result = call_fallback(state)
    assert isinstance(result["messages"][0], ToolMessage)
    assert result["messages"][0].tool_call_id == "same"
    assert result["messages"][0].status == "error"


async def test_selected_missing_key_uses_graph_fallback_without_inactive_provider(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    from app.agents.chat_model_factory import create_chat_model
    from app.config import Settings
    from app.models import AdvisorRequest
    config = Settings(_env_file=None, ai_provider="gemini", ai_model="gemini-2.5-flash",
                      gemini_api_key="", anthropic_api_key="")
    agent._build_llm.side_effect = lambda: create_chat_model(config).bind_tools(agent.TOOLS)
    with patch("app.agents.chat_model_factory.ChatAnthropic") as unused:
        result = await service.AdvisorService().ask(AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    assert "API_KEY" not in result.answer
    unused.assert_not_called()


async def test_advisor_http_contract_with_mocked_model(harness):
    agent, service, graph, llm, callback = harness
    from app.main import app
    llm.ainvoke.return_value = AIMessage(content=[{"type": "text", "text": "Mock answer"}])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/advisor", json={"query": "Synthetic", "date_from": "2026-01-01"})
        invalid = await client.post("/advisor", json={"query": ""})
    assert response.status_code == 200
    assert response.json()["answer"] == "Mock answer"
    assert set(response.json()) == {"answer", "session_id", "steps_taken"}
    assert "2026-01-01" in llm.ainvoke.await_args.args[0][-1].content
    assert invalid.status_code == 422
