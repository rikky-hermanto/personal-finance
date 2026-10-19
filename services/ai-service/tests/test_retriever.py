import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.retriever import RetrievalService
from app.models import SearchResult
from tests.conftest import make_owner_conn

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")


def _make_mock_row(transaction_id=1, similarity=0.9, description="GOPAY FOOD",
                   date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
                   category="Food & Dining"):
    data = {
        "transaction_id": transaction_id,
        "similarity": similarity,
        "description": description,
        "date": date,
        "amount_idr": amount_idr,
        "flow": flow,
        "wallet": wallet,
        "category": category,
    }
    row = MagicMock()
    row.__getitem__ = MagicMock(side_effect=lambda key: data[key])
    return row


def _make_mock_provider(model: str = "test-model", query_vector: list | None = None):
    provider = MagicMock()
    provider.model = model
    provider.embed_query = AsyncMock(return_value=query_vector or [0.1, 0.2, 0.3])
    return provider


@pytest.fixture
def mock_provider_and_asyncpg():
    with patch("app.owner.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.retriever.register_vector", new_callable=AsyncMock):

        mock_conn = make_owner_conn()
        mock_conn.fetch = AsyncMock(return_value=[_make_mock_row()])
        mock_connect.return_value = mock_conn

        provider = _make_mock_provider()
        yield provider, mock_conn


@pytest.mark.asyncio
async def test_search_embeds_query_and_returns_results(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("food spending", top_k=5, owner_id=OWNER)

    provider.embed_query.assert_called_once_with("food spending")
    assert len(results) == 1
    assert isinstance(results[0], SearchResult)
    assert results[0].transaction_id == 1
    assert results[0].similarity == 0.9


@pytest.mark.asyncio
async def test_search_returns_empty_when_no_rows(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    mock_conn.fetch = AsyncMock(return_value=[])
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("no match query", top_k=5, owner_id=OWNER)

    assert results == []


@pytest.mark.asyncio
async def test_search_closes_connection_on_success(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("test query", owner_id=OWNER)

    mock_conn.close.assert_called_once()


@pytest.mark.asyncio
async def test_search_closes_connection_on_db_error(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    mock_conn.fetch = AsyncMock(side_effect=Exception("DB error"))
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    with pytest.raises(Exception, match="DB error"):
        await service.search("test query", owner_id=OWNER)

    mock_conn.close.assert_called_once()


@pytest.mark.asyncio
async def test_search_sql_includes_model_filter(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    provider.model = "gemini-embedding-001"
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5, owner_id=OWNER)

    fetch_call = mock_conn.fetch.call_args
    sql = fetch_call.args[0]
    assert "te.model" in sql
    # Verify the model value is passed as a positional param
    params = fetch_call.args[1:]
    assert "gemini-embedding-001" in params


@pytest.mark.asyncio
async def test_search_with_category_filter_adds_where_clause_and_param(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5, category="Food & Dining", owner_id=OWNER)

    fetch_call = mock_conn.fetch.call_args
    sql = fetch_call.args[0]
    params = fetch_call.args[1:]
    assert "t.category ILIKE" in sql
    assert "Food & Dining" in params


@pytest.mark.asyncio
async def test_search_with_date_range_filters_use_parametrized_clauses(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5, date_from="2026-03-01", date_to="2026-03-31", owner_id=OWNER)

    fetch_call = mock_conn.fetch.call_args
    sql = fetch_call.args[0]
    params = fetch_call.args[1:]
    assert "t.date >=" in sql and "t.date <=" in sql
    # Reason: dates are bound as datetime.date, not str — asyncpg's ::date codec
    # calls .toordinal() on the value and rejects a raw string.
    assert date(2026, 3, 1) in params
    assert date(2026, 3, 31) in params
    # No value is ever interpolated directly into the SQL string
    assert "2026-03-01" not in sql
    assert "2026-03-31" not in sql


@pytest.mark.asyncio
async def test_search_without_filters_omits_optional_clauses(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5, owner_id=OWNER)

    sql = mock_conn.fetch.call_args.args[0]
    assert "t.category ILIKE" not in sql
    assert "a.name ILIKE" not in sql
    assert "t.date >=" not in sql
    assert "t.date <=" not in sql
