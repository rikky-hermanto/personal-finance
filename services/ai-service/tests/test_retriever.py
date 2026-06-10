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


@pytest.fixture
def mock_openai_and_asyncpg():
    mock_embed_response = MagicMock()
    mock_embed_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]

    with patch("app.services.retriever.openai.AsyncOpenAI") as mock_openai_cls, \
         patch("app.services.retriever.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.retriever.register_vector", new_callable=AsyncMock):

        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_embed_response)
        mock_openai_cls.return_value = mock_client

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[_make_mock_row()])
        mock_connect.return_value = mock_conn

        yield mock_client, mock_conn


@pytest.mark.asyncio
async def test_search_embeds_query_and_returns_results(mock_openai_and_asyncpg):
    mock_openai, mock_conn = mock_openai_and_asyncpg
    service = RetrievalService()

    results = await service.search("food spending", top_k=5)

    mock_openai.embeddings.create.assert_called_once()
    call_kwargs = mock_openai.embeddings.create.call_args
    assert call_kwargs.kwargs["input"] == ["food spending"]

    assert len(results) == 1
    assert isinstance(results[0], SearchResult)
    assert results[0].transaction_id == 1
    assert results[0].similarity == 0.9


@pytest.mark.asyncio
async def test_search_returns_empty_when_no_rows(mock_openai_and_asyncpg):
    mock_openai, mock_conn = mock_openai_and_asyncpg
    mock_conn.fetch = AsyncMock(return_value=[])
    service = RetrievalService()

    results = await service.search("no match query", top_k=5)

    assert results == []


@pytest.mark.asyncio
async def test_search_closes_connection_on_success(mock_openai_and_asyncpg):
    _, mock_conn = mock_openai_and_asyncpg
    service = RetrievalService()

    await service.search("test query")

    mock_conn.close.assert_called_once()


@pytest.mark.asyncio
async def test_search_closes_connection_on_db_error(mock_openai_and_asyncpg):
    _, mock_conn = mock_openai_and_asyncpg
    mock_conn.fetch = AsyncMock(side_effect=Exception("DB error"))
    service = RetrievalService()

    with pytest.raises(Exception, match="DB error"):
        await service.search("test query")

    mock_conn.close.assert_called_once()
