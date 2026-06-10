from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.embedder import EmbeddingService, EmbedItem


@pytest.fixture
def mock_openai_and_asyncpg():
    mock_embed_response = MagicMock()
    mock_embed_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
    mock_embed_response.usage.total_tokens = 10

    with patch("app.services.embedder.openai.AsyncOpenAI") as mock_openai_cls, \
         patch("app.services.embedder.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.embedder.register_vector", new_callable=AsyncMock):

        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_embed_response)
        mock_openai_cls.return_value = mock_client

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_connect.return_value = mock_conn

        yield mock_client, mock_conn


@pytest.mark.asyncio
async def test_embed_and_store_calls_openai_with_batch(mock_openai_and_asyncpg):
    mock_openai, _ = mock_openai_and_asyncpg
    service = EmbeddingService()
    items = [EmbedItem(transaction_id=1, description="GOPAY FOOD", category="Food & Dining")]

    embedded, skipped = await service.embed_and_store(items)

    mock_openai.embeddings.create.assert_called_once()
    assert embedded == 1
    assert skipped == 0


@pytest.mark.asyncio
async def test_embed_empty_list_returns_zeros(mock_openai_and_asyncpg):
    mock_openai, _ = mock_openai_and_asyncpg
    service = EmbeddingService()

    embedded, skipped = await service.embed_and_store([])

    mock_openai.embeddings.create.assert_not_called()
    assert embedded == 0 and skipped == 0


@pytest.mark.asyncio
async def test_embed_skips_on_db_error(mock_openai_and_asyncpg):
    mock_openai, mock_conn = mock_openai_and_asyncpg
    mock_conn.execute = AsyncMock(side_effect=Exception("DB error"))
    service = EmbeddingService()
    items = [EmbedItem(transaction_id=1, description="GOPAY FOOD")]

    embedded, skipped = await service.embed_and_store(items)

    assert embedded == 0
    assert skipped == 1


def test_embed_item_search_text_includes_category():
    item = EmbedItem(transaction_id=1, description="DEBIT TRANSFER", category="Food & Dining", wallet="BCA")
    text = item.search_text()
    assert "Food & Dining" in text
    assert "BCA" in text


def test_embed_item_search_text_skips_uncategorized():
    item = EmbedItem(transaction_id=1, description="DEBIT", category="Uncategorized")
    text = item.search_text()
    assert "Uncategorized" not in text


def test_embed_item_search_text_no_empty_parts():
    item = EmbedItem(transaction_id=1, description="Gofood", remarks="", category="", wallet="")
    text = item.search_text()
    assert text == "Gofood"


def test_embed_item_search_text_joins_with_pipe():
    item = EmbedItem(transaction_id=1, description="TRANSFER", remarks="ke teman", category="Transfer", wallet="BCA")
    text = item.search_text()
    assert " | " in text
    assert text.startswith("TRANSFER")
