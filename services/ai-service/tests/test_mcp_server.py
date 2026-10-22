"""Unit tests for the MCP server tool handlers — all external calls mocked."""
import uuid

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


@pytest.mark.asyncio
async def test_get_transactions_returns_list(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        {"date": "2026-03-01", "description": "GOPAY MERCHANT", "category": "Food & Dining",
         "amount_idr": 25000.0, "flow": "DB", "account": "BCA"},
    ])
    import app.mcp_server as srv
    srv.set_pool(pool)
    results = await srv.get_transactions(category="makan", limit=5)
    assert isinstance(results, list)
    assert results[0]["flow"] in ("DB", "CR")


@pytest.mark.asyncio
async def test_get_transactions_hard_caps_limit(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_pool(pool)
    await srv.get_transactions(limit=9999)
    call_args = conn.fetch.call_args
    # 100 (the cap) must appear in the positional params
    assert 100 in call_args.args


@pytest.mark.asyncio
async def test_get_cashflow_summary_groups_by_category(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        {"category": "Food & Dining", "total_debit": 500000.0, "total_credit": 0.0, "count": 10},
        {"category": "Income", "total_debit": 0.0, "total_credit": 15000000.0, "count": 1},
    ])
    import app.mcp_server as srv
    srv.set_pool(pool)
    result = await srv.get_cashflow_summary("this_month")
    assert any(r["category"] == "Income" for r in result)


@pytest.mark.asyncio
async def test_get_cashflow_summary_unknown_period_defaults_gracefully(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_pool(pool)
    # Unknown period falls back to this_month — should not raise
    await srv.get_cashflow_summary("decade")


@pytest.mark.asyncio
async def test_get_pyramid_scores_calls_net_api():
    with patch("app.mcp_server.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"tier": "L1", "score": 0.95, "status": "achieved"},
            {"tier": "L2", "score": 0.72, "status": "in_progress"},
        ]
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        import app.mcp_server as srv
        result = await srv.get_pyramid_scores()
        assert result[0]["tier"] == "L1"
        mock_client.get.assert_called_once_with("/api/journey/scores")


@pytest.mark.asyncio
async def test_search_transactions_semantic_delegates_to_retriever():
    from app.models import SearchResult
    owner = uuid.uuid4()
    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[
        SearchResult(transaction_id=1, similarity=0.92, description="STARBUCKS",
                     date="2026-03-10", amount_idr=45000.0, flow="DB", wallet="BCA"),
    ])
    import app.mcp_server as srv
    srv.set_retriever(mock_retriever)
    srv.set_owner(owner)
    results = await srv.search_transactions_semantic("kopi", top_k=3)
    assert results[0]["description"] == "STARBUCKS"
    assert results[0]["similarity"] == 0.92
    # Reason: PF-S15 made RetrievalService.search owner-scoped — the stale plan
    # predates this, so the call now also carries owner_id.
    mock_retriever.search.assert_called_once_with(query="kopi", top_k=3, owner_id=owner)


@pytest.mark.asyncio
async def test_search_transactions_semantic_caps_top_k():
    owner = uuid.uuid4()
    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_retriever(mock_retriever)
    srv.set_owner(owner)
    await srv.search_transactions_semantic("test", top_k=999)
    mock_retriever.search.assert_called_once_with(query="test", top_k=20, owner_id=owner)
