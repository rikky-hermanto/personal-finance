from unittest.mock import MagicMock, patch
import pytest
from app.models import SearchResult


def _result(tid: int, desc: str) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=desc,
        date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
    )


@pytest.fixture
def mock_ranker():
    with patch("app.services.reranker.Ranker") as mock_cls:
        instance = MagicMock()
        mock_cls.return_value = instance
        yield instance


@pytest.mark.asyncio
async def test_rerank_reorders_by_cross_encoder_score(mock_ranker):
    from app.services.reranker import RerankerService
    # Cross-encoder says tx 2 beats tx 1, reversing the retrieval order
    mock_ranker.rerank.return_value = [
        {"id": 2, "text": "...", "score": 0.99},
        {"id": 1, "text": "...", "score": 0.40},
    ]
    service = RerankerService()
    results = await service.rerank("kopi", [_result(1, "TRANSFER"), _result(2, "STARBUCKS")], top_k=2)
    assert [r.transaction_id for r in results] == [2, 1]


@pytest.mark.asyncio
async def test_rerank_truncates_to_top_k(mock_ranker):
    from app.services.reranker import RerankerService
    mock_ranker.rerank.return_value = [
        {"id": i, "text": "...", "score": 1.0 - i / 10} for i in range(1, 6)
    ]
    service = RerankerService()
    results = await service.rerank("q", [_result(i, f"tx{i}") for i in range(1, 6)], top_k=3)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_rerank_empty_input_returns_empty(mock_ranker):
    from app.services.reranker import RerankerService
    service = RerankerService()
    assert await service.rerank("q", [], top_k=3) == []
