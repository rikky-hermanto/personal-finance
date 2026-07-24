from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.retriever import RetrievalService, _rrf_merge
from app.models import SearchResult


def test_rrf_merge_promotes_document_present_in_both_lists():
    # doc 3 appears in both lists at rank 2 and 1 respectively -> highest RRF
    vector_ids = [1, 3, 5]
    bm25_ids = [3, 2, 4]
    result = _rrf_merge(vector_ids, bm25_ids)
    assert result[0] == 3


def test_rrf_merge_documents_only_in_one_list_still_included():
    vector_ids = [1, 2]
    bm25_ids = [3, 4]
    result = _rrf_merge(vector_ids, bm25_ids)
    assert set(result) == {1, 2, 3, 4}


def test_rrf_merge_doc_in_both_lists_beats_rank_one_in_single_list():
    # 7 is rank-2 in BOTH lists -> 2/(60+2); 5 and 9 are rank-1 in ONE list each -> 1/(60+1)
    # co-occurrence beats a single top rank -- the heart of RRF
    result = _rrf_merge([5, 7], [9, 7])
    assert result[0] == 7


def test_rrf_merge_empty_bm25_falls_back_to_vector_order():
    vector_ids = [5, 3, 1]
    result = _rrf_merge(vector_ids, [])
    assert result == [5, 3, 1]


def _make_mock_row(transaction_id=1, similarity=0.0, description="TRANSFER PLN",
                    date="2026-03-01", amount_idr=250000.0, flow="DB", wallet="BCA"):
    data = {
        "transaction_id": transaction_id,
        "id": transaction_id,
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
async def test_search_bm25_mode_skips_embedding(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("tagihan listrik PLN", top_k=5, search_mode="bm25")

    provider.embed_query.assert_not_called()
    assert len(results) == 1
    assert isinstance(results[0], SearchResult)


@pytest.mark.asyncio
async def test_search_bm25_mode_uses_plainto_tsquery(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("tagihan listrik PLN", top_k=5, search_mode="bm25")

    # First fetch call is the bm25 id-ranking query; second is the by-id fetch
    first_sql = mock_conn.fetch.call_args_list[0].args[0]
    assert "plainto_tsquery" in first_sql
    assert "ts_rank" in first_sql
    assert "to_tsquery(" not in first_sql.replace("plainto_tsquery(", "")


@pytest.mark.asyncio
async def test_search_hybrid_mode_merges_vector_and_bm25(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    # vector search returns id=1, bm25 id-ranking returns id=1, then fetch-by-ids returns rows
    mock_conn.fetch = AsyncMock(side_effect=[
        [_make_mock_row(transaction_id=1, similarity=0.9)],   # vector search
        [_make_mock_row(transaction_id=1)],                    # bm25 id ranking
        [_make_mock_row(transaction_id=1)],                    # fetch by merged ids
    ])
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("tagihan listrik PLN", top_k=5, search_mode="hybrid")

    provider.embed_query.assert_called_once()
    assert len(results) == 1
    assert results[0].transaction_id == 1


@pytest.mark.asyncio
async def test_search_hybrid_mode_returns_empty_when_no_matches(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    mock_conn.fetch = AsyncMock(side_effect=[
        [],   # vector search: no rows
        [],   # bm25: no rows
    ])
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    results = await service.search("no match query", top_k=5, search_mode="hybrid")

    assert results == []


@pytest.mark.asyncio
async def test_search_default_mode_is_vector_unchanged(mock_provider_and_asyncpg):
    provider, mock_conn = mock_provider_and_asyncpg
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    await service.search("food spending", top_k=5)

    sql = mock_conn.fetch.call_args.args[0]
    assert "transaction_embeddings" in sql
    assert "ts_rank" not in sql
