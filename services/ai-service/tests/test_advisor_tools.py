"""Unit tests for advisor tools — mock httpx, never call real .NET API."""
import asyncio
from contextvars import ContextVar
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.advisor_tools import caller_token

TOKEN = "caller-a-token"  # commit-skill:allow
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def mock_httpx_client():
    """Patch the module-level _CLIENT in advisor_tools.py and act as one caller."""
    with patch("app.agents.advisor_tools._CLIENT") as mock_client, caller_token(TOKEN):
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

    from app.agents.advisor_tools import get_pyramid_scores
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

    from app.agents.advisor_tools import get_cashflow_summary
    result = await get_cashflow_summary.ainvoke({})
    assert result["net"] == 3_000_000
    mock_httpx_client.get.assert_called_with("/api/transactions/aggregated", headers=AUTH)


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

    from app.agents.advisor_tools import get_spending_by_category
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

    from app.agents.advisor_tools import get_investment_summary
    result = await get_investment_summary.ainvoke({})
    assert result["net_worth_idr"] == 570_000_000
    assert result["allocation_by_class"]["Investment"] == 50_000_000


@pytest.mark.asyncio
async def test_tools_refuse_to_call_the_api_without_a_caller_token():
    from app.agents.advisor_tools import get_pyramid_scores
    with patch("app.agents.advisor_tools._CLIENT") as mock_client:
        mock_client.get = AsyncMock()
        with pytest.raises(PermissionError):
            await get_pyramid_scores.ainvoke({})
    mock_client.get.assert_not_called()


@pytest.mark.asyncio
async def test_concurrent_requests_each_send_their_own_token():
    """Two requests in flight at once: every tool call carries only its own caller's token.

    LangChain runs each tool call in a child task, so this also proves the token
    reaches tasks spawned under the request.
    """
    from app.agents.advisor_tools import _CALLER_TOKEN, get_pyramid_scores
    calls: list[tuple[str, str]] = []
    runner: ContextVar[str] = ContextVar("runner")

    async def recording_get(path, headers):
        calls.append((runner.get(), headers["Authorization"]))
        await asyncio.sleep(0)   # yield so the two requests interleave
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = {"currentLevel": 1, "levelScores": {}}
        return response

    async def run(label: str, token: str) -> None:
        runner.set(label)
        with caller_token(token):
            for _ in range(3):
                await get_pyramid_scores.ainvoke({})
                await asyncio.sleep(0)

    with patch("app.agents.advisor_tools._CLIENT") as mock_client:
        mock_client.get = recording_get
        await asyncio.gather(run("a", "token-a"), run("b", "token-b"))

    assert sorted(calls) == [("a", "Bearer token-a")] * 3 + [("b", "Bearer token-b")] * 3
    assert [task for task, _ in calls] != ["a"] * 3 + ["b"] * 3   # they really interleaved
    assert _CALLER_TOKEN.get() is None
