"""Unit tests for AggregationService — mocked asyncpg, no real DB.

The contract under test: values are ALWAYS bound parameters, never interpolated
into the SQL string; money returns as Decimal; dates are bound as datetime.date
(the asyncpg ::date codec bug regression-guarded from PF-AI004 STEP 10).
"""
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import QueryPlan, SearchResult
from app.services.aggregator import AggregationService


def _row(data: dict) -> MagicMock:
    row = MagicMock()
    row.__getitem__ = MagicMock(side_effect=lambda key: data[key])
    return row


def _display_row(tid=1, amount=100000.0) -> MagicMock:
    return _row({
        "transaction_id": tid, "description": f"TX{tid}", "date": "2024-04-15",
        "amount_idr": amount, "flow": "DB", "wallet": "BCA",
    })


@pytest.fixture
def mock_asyncpg():
    with patch("app.services.aggregator.asyncpg.connect", new_callable=AsyncMock) as mock_connect:
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=_row({"total": 2309954, "n": 43}))
        mock_conn.fetch = AsyncMock(return_value=[_display_row(1, 500000.0)])
        mock_connect.return_value = mock_conn
        yield mock_conn


@pytest.mark.asyncio
async def test_aggregate_categories_bind_as_param_not_sql_string(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")
    plan = QueryPlan(intent="aggregate", categories=["Food"], flow="DB",
                     date_from="2024-04-01", date_to="2024-04-30")

    await service.aggregate(plan)

    sql = mock_asyncpg.fetchrow.call_args.args[0]
    params = mock_asyncpg.fetchrow.call_args.args[1:]
    assert "t.category = ANY(" in sql
    assert ["Food"] in params               # the list is a bound param...
    assert "Food" not in sql                 # ...never interpolated into the SQL


@pytest.mark.asyncio
async def test_aggregate_empty_plan_is_full_table_total(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")
    plan = QueryPlan(intent="aggregate", categories=[])

    await service.aggregate(plan)

    sql = mock_asyncpg.fetchrow.call_args.args[0]
    assert "WHERE 1=1" in sql
    assert "ANY(" not in sql
    assert "t.flow =" not in sql
    assert "t.date" not in sql


@pytest.mark.asyncio
async def test_aggregate_total_is_decimal(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")

    result = await service.aggregate(QueryPlan(intent="aggregate", categories=["Food"]))

    assert isinstance(result.total_idr, Decimal)
    assert result.total_idr == Decimal("2309954")
    assert result.count == 43


@pytest.mark.asyncio
async def test_aggregate_dates_bound_as_date_objects_not_strings(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")
    plan = QueryPlan(intent="aggregate", categories=["Food"],
                     date_from="2024-04-01", date_to="2024-04-30")

    await service.aggregate(plan)

    sql = mock_asyncpg.fetchrow.call_args.args[0]
    params = mock_asyncpg.fetchrow.call_args.args[1:]
    # Reason: asyncpg's ::date codec calls .toordinal() — a raw str would raise.
    assert date(2024, 4, 1) in params
    assert date(2024, 4, 30) in params
    assert "2024-04-01" not in sql
    assert "2024-04-30" not in sql


@pytest.mark.asyncio
async def test_aggregate_returns_display_rows_as_search_results(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")

    result = await service.aggregate(QueryPlan(intent="aggregate", categories=["Food"]))

    assert len(result.rows) == 1
    assert isinstance(result.rows[0], SearchResult)
    assert result.rows[0].similarity == 1.0
    assert result.rows[0].transaction_id == 1


@pytest.mark.asyncio
async def test_aggregate_closes_connection(mock_asyncpg):
    service = AggregationService(db_url="postgresql://test")

    await service.aggregate(QueryPlan(intent="aggregate", categories=[]))

    mock_asyncpg.close.assert_called_once()
