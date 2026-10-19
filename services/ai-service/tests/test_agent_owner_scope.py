"""PF-S15 STEP 14: the categorizer agent's tools are owner-scoped per request.

Mocked DB, retriever and agent only. The live two-user check is
scripts/pf_s15_ai_isolation.py.
"""
import asyncio
import contextvars
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.agents.categorizer_agent import CategorizationResult, CategorizerAgent
from app.agents.owner_context import OwnerContext, bind_owner_context, current_owner_context
from app.agents.tools.categories import FALLBACK_CATEGORIES, list_all_categories
from app.agents.tools.category_rules import search_category_rules
from app.agents.tools.similarity import find_similar_transactions
from app.config import settings
from app.main import app
from app.models import SearchResult
from app.services.owner_rules import load_owner_rules
from tests.test_owner_scope import KEY, OWNER_A, OWNER_B, SECRET, _row, _sign


def _context(owner: uuid.UUID, rules: dict[str, str] | None = None,
             categories: list[str] | None = None, retriever=None) -> OwnerContext:
    return OwnerContext(owner_id=owner, rules=rules or {}, categories=categories or [],
                        retriever=retriever)


# ── tools ────────────────────────────────────────────────────────────────────

def test_tools_fail_closed_without_an_owner_context():
    assert current_owner_context() is None
    assert search_category_rules(keyword="grab") == "Rule search unavailable."
    assert list_all_categories() == "Category list unavailable."
    assert find_similar_transactions(description="grab") == "Similarity search unavailable."


def test_tools_read_only_the_bound_owners_rules_and_categories():
    with bind_owner_context(_context(OWNER_B, rules={"zebra mart": "Zebra B15"},
                                     categories=["Zebra B15"])):
        assert "Zebra B15" in search_category_rules(keyword="zebra")
        assert "Zebra B15" in list_all_categories()
    with bind_owner_context(_context(OWNER_A, rules={"kopi": "Kopi A15"}, categories=["Kopi A15"])):
        assert search_category_rules(keyword="zebra") == "No rules matched."
        assert "Zebra B15" not in list_all_categories()
    assert current_owner_context() is None


def test_similarity_tool_searches_as_the_bound_owner():
    retriever = MagicMock()
    retriever.search = AsyncMock(return_value=[SearchResult(
        transaction_id=1, similarity=0.91, description="KOPI KENANGAN", date="2026-03-01",
        amount_idr=25000.0, flow="DB", wallet="BCA", category="Kopi A15")])

    with bind_owner_context(_context(OWNER_A, retriever=retriever)):
        result = find_similar_transactions(description="kopi")

    assert "KOPI KENANGAN" in result
    retriever.search.assert_awaited_once_with(query="kopi", top_k=3, owner_id=OWNER_A)


@pytest.mark.asyncio
async def test_concurrent_owners_in_worker_threads_see_only_their_own_context():
    """The route's pattern: bind, then run in a thread with a copy of the context."""
    def tool_view() -> tuple[str, str]:
        return search_category_rules(keyword="mart"), list_all_categories()

    async def run(context: OwnerContext) -> tuple[str, str]:
        with bind_owner_context(context):
            await asyncio.sleep(0)   # let the other request bind in between
            return await asyncio.to_thread(contextvars.copy_context().run, tool_view)

    a, b = await asyncio.gather(
        run(_context(OWNER_A, rules={"alfamart": "Groceries A"}, categories=["Groceries A"])),
        run(_context(OWNER_B, rules={"zebra mart": "Zebra B15"}, categories=["Zebra B15"])),
    )

    assert "Groceries A" in a[0] and "Zebra B15" not in a[0] + a[1]
    assert "Zebra B15" in b[0] and "Groceries A" not in b[0] + b[1]
    assert current_owner_context() is None


# ── per-owner rules ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_load_owner_rules_reads_own_private_rules_then_presets(owner_db):
    async def fetch(sql, *params):
        if "FROM category_rules" in sql:
            assert "user_id = $1" in sql and params == (OWNER_B,)
            return [_row({"keyword": "Zebra Mart", "category": "Zebra B15"})]
        assert "FROM category_presets" in sql and params == ()
        return [_row({"keyword": "zebra mart", "category": "Groceries"}),
                _row({"keyword": "GRAB", "category": "Transportation"})]
    owner_db.fetch = AsyncMock(side_effect=fetch)

    rules = await load_owner_rules("postgresql://test", OWNER_B)

    # The private rule wins over the preset with the same keyword; keys are lower-cased.
    assert rules == {"zebra mart": "Zebra B15", "grab": "Transportation"}
    assert owner_db.fetch.await_count == 2
    executed = [c.args[0] for c in owner_db.execute.call_args_list]
    assert executed[0] == "SET LOCAL ROLE authenticated"


@pytest.mark.asyncio
async def test_load_owner_rules_failure_returns_no_rules(owner_db):
    owner_db.fetch = AsyncMock(side_effect=Exception("db down"))
    assert await load_owner_rules("postgresql://test", OWNER_A) == {}


# ── /categorize-agent route ──────────────────────────────────────────────────

def _client(headers: dict) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers)


@pytest.fixture
def agents_on(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", KEY)
    monkeypatch.setattr(settings, "owner_signing_secret", SECRET)
    monkeypatch.setattr(settings, "ai_agents_enabled", True)


@pytest.mark.asyncio
async def test_categorize_agent_404_when_agents_flag_off(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", KEY)
    monkeypatch.setattr(settings, "owner_signing_secret", SECRET)
    async with _client({"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_A)}) as client:
        assert (await client.post("/categorize-agent", json={"description": "x"})).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("headers", [{}, {"X-Internal-Api-Key": KEY}])
async def test_categorize_agent_401_without_owner(agents_on, headers):
    async with _client(headers) as client:
        assert (await client.post("/categorize-agent", json={"description": "x"})).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("owner_categories,expected", [
    (["Zebra B15"], ["Zebra B15"]),
    ([], FALLBACK_CATEGORIES),     # a new user gets the static list, never someone else's
])
async def test_categorize_agent_runs_with_the_callers_context(agents_on, owner_categories, expected):
    seen: list[OwnerContext | None] = []

    def categorize(description, wallet, amount_idr):
        seen.append(current_owner_context())
        return CategorizationResult(category="Zebra B15", confidence=1.0, reasoning="rule", tool_calls_count=1)

    names = ("vocabulary", "categorizer_agent", "retriever")
    saved = {n: getattr(app.state, n, None) for n in names}
    app.state.vocabulary = MagicMock()
    app.state.vocabulary.for_owner = AsyncMock(return_value=owner_categories)
    app.state.categorizer_agent = MagicMock(categorize=categorize)
    app.state.retriever = sentinel_retriever = MagicMock()
    try:
        with patch("app.main.load_owner_rules", AsyncMock(return_value={"zebra mart": "Zebra B15"})) as rules:
            headers = {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_B)}
            async with _client(headers) as client:
                response = await client.post("/categorize-agent", json={"description": "ZEBRA MART"})
    finally:
        for n, v in saved.items():
            setattr(app.state, n, v)

    assert response.status_code == 200 and response.json()["category"] == "Zebra B15"
    assert rules.await_args.args[1] == OWNER_B
    bound = seen[0]
    assert bound.owner_id == OWNER_B
    assert bound.rules == {"zebra mart": "Zebra B15"}
    assert bound.categories == list(expected)
    assert bound.retriever is sentinel_retriever
    assert current_owner_context() is None


# ── per-run agent ────────────────────────────────────────────────────────────

@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_each_run_gets_a_fresh_agent_so_memory_is_never_shared(mock_model_cls, mock_agent_cls):
    mock_agent_cls.side_effect = lambda **kwargs: MagicMock(
        run=MagicMock(return_value="CATEGORY: Other\nCONFIDENCE: 0.5\nREASONING: none"))
    agent = CategorizerAgent()

    agent.categorize("A's row", "BCA", 1)
    agent.categorize("B's row", "BCA", 2)

    assert mock_agent_cls.call_count == 2
    mock_model_cls.assert_called_once()   # the model client is still shared
