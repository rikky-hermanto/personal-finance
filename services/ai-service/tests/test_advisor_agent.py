"""Graph routing tests — verify should_continue routing logic."""
import pytest
import asyncio
import importlib
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from app.agents.financial_advisor import should_continue
from app.agents.state import AdvisorState
from tests.conftest import fake_jwt

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
AUTH = {"Authorization": f"Bearer {fake_jwt(str(OWNER))}"}


def _ask(service, request, owner: uuid.UUID = OWNER):
    return service.AdvisorService().ask(request, owner_id=owner, user_token=fake_jwt(str(owner)))


def _thread(session_id: str, owner: uuid.UUID = OWNER) -> dict:
    return {"configurable": {"thread_id": f"{owner}:{session_id}"}}


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
        first = await _ask(service, AdvisorRequest(query="Synthetic question"))
        second = await _ask(service, AdvisorRequest(query="What next?", session_id=first.session_id))
    assert first.answer == "L2: 42.5"
    assert second.answer == "Follow-up"
    assert second.session_id == first.session_id
    get.assert_awaited_once_with("/api/journey/state", headers=AUTH)
    messages = llm.ainvoke.await_args_list[1].args[0]
    assert any(isinstance(m, ToolMessage) and '42.5' in m.content for m in messages)
    history = llm.ainvoke.await_args_list[2].args[0]
    assert [m.content for m in history if isinstance(m, HumanMessage)] == ["Synthetic question", "What next?"]
    assert any(isinstance(m, AIMessage) and m.content == first.answer for m in history)
    forwarded = llm.ainvoke.await_args.kwargs["config"]
    assert callback in forwarded["callbacks"].handlers
    assert forwarded["configurable"]["thread_id"] == f"{OWNER}:{first.session_id}"


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
    result = await _ask(service, AdvisorRequest(query="synthetic"))
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
        first = await _ask(service, AdvisorRequest(query="loop"))
        assert first.answer.startswith("Maaf")
        assert llm.ainvoke.await_count == 4
        assert get.await_count == 3
        snapshot = await graph.aget_state(_thread(first.session_id))
        assert snapshot.values["model_calls"] == 4
        assert not snapshot.next
        second = await _ask(service, AdvisorRequest(query="next", session_id=first.session_id))
    assert second.answer == "New turn"
    snapshot = await graph.aget_state(_thread(first.session_id))
    assert snapshot.values["model_calls"] == 1
    history = llm.ainvoke.await_args.args[0]
    assert {m.tool_call_id for m in history if isinstance(m, ToolMessage)} == {"0", "1", "2", "3"}


async def test_fourth_call_can_return_final_answer(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.side_effect = [tool_call(str(i)) for i in range(3)] + [AIMessage(content="Finished")]
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(return_value=MagicMock())):
        result = await _ask(service, AdvisorRequest(query="synthetic"))
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
    result = await _ask(service, AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    assert cancelled.is_set()
    llm.ainvoke.assert_awaited_once()


async def test_tool_http_failure_stops_before_synthesis(harness, caplog):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    llm.ainvoke.return_value = tool_call()
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(side_effect=RuntimeError("private-http-payload"))):
        result = await _ask(service, AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    llm.ainvoke.assert_awaited_once()
    snapshot = await graph.aget_state(_thread(result.session_id))
    assert "private-http-payload" not in str(snapshot.values) + caplog.text


async def test_secondary_recursion_guard_returns_fallback_and_closes_saved_turn(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    monkeypatch.setattr(service, "GRAPH_RECURSION_LIMIT", 1)
    llm.ainvoke.return_value = tool_call()
    result = await _ask(service, AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    snapshot = await graph.aget_state(_thread(result.session_id))
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
    result = await _ask(service, AdvisorRequest(query="synthetic"))
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
        result = await _ask(service, AdvisorRequest(query="synthetic"))
    assert result.answer.startswith("Maaf")
    assert "API_KEY" not in result.answer
    unused.assert_not_called()


def _advisor_client(monkeypatch, headers: dict, agents_enabled: bool = True) -> httpx.AsyncClient:
    from app.main import app
    from app.config import settings
    from tests.test_owner_scope import KEY, SECRET
    monkeypatch.setattr(settings, "internal_api_key", KEY)
    monkeypatch.setattr(settings, "owner_signing_secret", SECRET)
    monkeypatch.setattr(settings, "ai_agents_enabled", agents_enabled)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test",
                             headers=headers)


def _owner_headers(owner: uuid.UUID = OWNER, user_sub: str | None = None) -> dict:
    from tests.test_owner_scope import KEY, _sign
    return {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(owner),
            "X-Pf-User-Token": fake_jwt(user_sub or str(owner))}


async def test_advisor_http_contract_with_mocked_model(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    llm.ainvoke.return_value = AIMessage(content=[{"type": "text", "text": "Mock answer"}])
    async with _advisor_client(monkeypatch, _owner_headers()) as client:
        response = await client.post("/advisor", json={"query": "Synthetic", "date_from": "2026-01-01"})
        invalid = await client.post("/advisor", json={"query": ""})
    assert response.status_code == 200
    assert response.json()["answer"] == "Mock answer"
    assert set(response.json()) == {"answer", "session_id", "steps_taken"}
    assert "2026-01-01" in llm.ainvoke.await_args.args[0][-1].content
    assert invalid.status_code == 422


async def test_advisor_route_404_when_agents_flag_off(harness, monkeypatch):
    agent, service, graph, llm, callback = harness
    async with _advisor_client(monkeypatch, _owner_headers(), agents_enabled=False) as client:
        response = await client.post("/advisor", json={"query": "Synthetic"})
    assert response.status_code == 404
    llm.ainvoke.assert_not_awaited()


def _drop(headers: dict, name: str) -> dict:
    return {k: v for k, v in headers.items() if k != name}


_BAD_ADVISOR_HEADERS = {
    "no key, no owner": lambda: {},
    "no user token": lambda: _drop(_owner_headers(), "X-Pf-User-Token"),
    "malformed user token": lambda: {**_owner_headers(), "X-Pf-User-Token": "not-a-jwt"},
    "user token for another user": lambda: _owner_headers(user_sub="22222222-2222-2222-2222-222222222222"),
    "user token, no owner token": lambda: _drop(_owner_headers(), "X-Pf-Owner-Token"),
}


@pytest.mark.parametrize("case", list(_BAD_ADVISOR_HEADERS))
async def test_advisor_route_401_without_matching_owner_and_user_token(harness, monkeypatch, case):
    agent, service, graph, llm, callback = harness
    async with _advisor_client(monkeypatch, _BAD_ADVISOR_HEADERS[case]()) as client:
        response = await client.post("/advisor", json={"query": "Synthetic"})
    assert response.status_code == 401, case
    llm.ainvoke.assert_not_awaited()


async def test_other_users_session_id_starts_an_empty_thread(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    other = uuid.UUID("22222222-2222-2222-2222-222222222222")
    llm.ainvoke.side_effect = [AIMessage(content="A's answer"), AIMessage(content="B's answer")]
    first = await _ask(service, AdvisorRequest(query="A private question"))
    second = await _ask(service, AdvisorRequest(query="B question", session_id=first.session_id), owner=other)

    assert second.session_id == first.session_id
    history = llm.ainvoke.await_args_list[1].args[0]
    assert [m.content for m in history if isinstance(m, HumanMessage)] == ["B question"]
    assert not any(isinstance(m, AIMessage) and m.content == "A's answer" for m in history)
    a_thread = await graph.aget_state(_thread(first.session_id))
    b_thread = await graph.aget_state(_thread(first.session_id, owner=other))
    assert [m.content for m in a_thread.values["messages"] if isinstance(m, HumanMessage)] == ["A private question"]
    assert [m.content for m in b_thread.values["messages"] if isinstance(m, HumanMessage)] == ["B question"]


async def test_tools_send_the_callers_own_token_through_the_graph(harness):
    agent, service, graph, llm, callback = harness
    from app.models import AdvisorRequest
    other = uuid.UUID("22222222-2222-2222-2222-222222222222")
    llm.ainvoke.side_effect = [tool_call(), AIMessage(content="done")]
    response = httpx.Response(200, json={}, request=httpx.Request("GET", "http://test"))
    with patch("app.agents.advisor_tools._CLIENT.get", AsyncMock(return_value=response)) as get:
        await _ask(service, AdvisorRequest(query="q"), owner=other)
    get.assert_awaited_once_with(
        "/api/journey/state", headers={"Authorization": f"Bearer {fake_jwt(str(other))}"})
