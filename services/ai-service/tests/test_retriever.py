from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.retriever import RetrievalService
from app.models import SearchResult


def _make_mock_row(transaction_id=1, similarity=0.9, description="GOPAY FOOD",
                   date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA"):
    data = {
        "transaction_id": transaction_id,
        "similarity": similarity,
        "description": description,
        "date": date,
        "amount_idr": amount_idr,
        "flow": flow,
        "wallet": wallet,
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
    with patch("app.services.retriever.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.retriever.register_vector", new_callable=AsyncMock):

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[_make_mock_row()])
        mock_connect.return_value = mock_conn

        provider = _make_mock_provider()
        yield provider, mock_conn


@pytest.mark.asyncio
async def test_search_embeds_query_and_returns_results(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("food spending", top_k=5)

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

    results = await service.search("no match query", top_k=5)

    assert results == []


@pytest.mark.asyncio
async def test_search_closes_connection_on_success(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("test query")

    mock_conn.close.assert_called_once()


@pytest.mark.asyncio
async def test_search_closes_connection_on_db_error(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    mock_conn.fetch = AsyncMock(side_effect=Exception("DB error"))
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    with pytest.raises(Exception, match="DB error"):
        await service.search("test query")

    mock_conn.close.assert_called_once()


@pytest.mark.asyncio
async def test_search_sql_includes_model_filter(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    provider.model = "gemini-embedding-001"
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5)

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

    await service.search("query", top_k=5, category="Food & Dining")

    fetch_call = mock_conn.fetch.call_args
    sql = fetch_call.args[0]
    params = fetch_call.args[1:]
    assert "t.category ILIKE" in sql
    assert "Food & Dining" in params


@pytest.mark.asyncio
async def test_search_with_date_range_filters_use_parametrized_clauses(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5, date_from="2026-03-01", date_to="2026-03-31")

    fetch_call = mock_conn.fetch.call_args
    sql = fetch_call.args[0]
    params = fetch_call.args[1:]
    assert "t.date >=" in sql and "t.date <=" in sql
    assert "2026-03-01" in params
    assert "2026-03-31" in params
    # No value is ever interpolated directly into the SQL string
    assert "2026-03-01" not in sql
    assert "2026-03-31" not in sql


@pytest.mark.asyncio
async def test_search_without_filters_omits_optional_clauses(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("query", top_k=5)

    sql = mock_conn.fetch.call_args.args[0]
    assert "t.category ILIKE" not in sql
    assert "a.name ILIKE" not in sql
    assert "t.date >=" not in sql
    assert "t.date <=" not in sql
