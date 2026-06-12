from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.embedder import EmbeddingService, EmbedItem


def _make_mock_provider(model: str = "test-model", vectors: list | None = None):
    provider = MagicMock()
    provider.model = model
    provider.last_token_count = 10
    provider.embed_documents = AsyncMock(return_value=vectors or [[0.1, 0.2, 0.3]])
    return provider


@pytest.fixture
def mock_provider_and_asyncpg():
    with patch("app.services.embedder.asyncpg.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.services.embedder.register_vector", new_callable=AsyncMock):

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_connect.return_value = mock_conn

        provider = _make_mock_provider()
        yield provider, mock_conn


@pytest.mark.asyncio
async def test_embed_and_store_calls_provider_with_batch(mock_provider_and_asyncpg):
    provider, _ = mock_provider_and_asyncpg
    service = EmbeddingService(provider=provider, db_url="postgresql://test")
    items = [EmbedItem(transaction_id=1, description="GOPAY FOOD", category="Food & Dining")]

    embedded, skipped = await service.embed_and_store(items)

    provider.embed_documents.assert_called_once()
    assert embedded == 1
    assert skipped == 0


@pytest.mark.asyncio
async def test_embed_empty_list_returns_zeros(mock_provider_and_asyncpg):
    provider, _ = mock_provider_and_asyncpg
    service = EmbeddingService(provider=provider, db_url="postgresql://test")

    embedded, skipped = await service.embed_and_store([])

    provider.embed_documents.assert_not_called()
    assert embedded == 0 and skipped == 0


@pytest.mark.asyncio
async def test_embed_skips_on_db_error(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    mock_conn.execute = AsyncMock(side_effect=Exception("DB error"))
    service = EmbeddingService(provider=provider, db_url="postgresql://test")
    items = [EmbedItem(transaction_id=1, description="GOPAY FOOD")]

    embedded, skipped = await service.embed_and_store(items)

    assert embedded == 0
    assert skipped == 1


@pytest.mark.asyncio
async def test_embed_stores_provider_model_in_db(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    provider.model = "gemini-embedding-001"
    service = EmbeddingService(provider=provider, db_url="postgresql://test")
    items = [EmbedItem(transaction_id=1, description="DEBIT TRANSFER")]

    await service.embed_and_store(items)

    call_args = mock_conn.execute.call_args.args
    assert "gemini-embedding-001" in call_args


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
