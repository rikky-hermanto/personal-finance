from unittest.mock import AsyncMock
import pytest
from app.models import AskRequest, SearchResult
from app.services.answerer import AnswerService


def _result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=10000.0, flow="DB", wallet="BCA",
    )


def _service(provider_json: dict, contexts: list[SearchResult]) -> AnswerService:
    retriever = AsyncMock()
    retriever.search = AsyncMock(return_value=contexts)
    reranker = AsyncMock()
    reranker.rerank = AsyncMock(return_value=contexts)
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value=provider_json)
    return AnswerService(retriever, reranker, provider)


@pytest.mark.asyncio
async def test_ask_returns_grounded_answer_with_citations():
    service = _service(
        {"answer": "Total Rp 10.000 [1]", "cited_transaction_ids": [1], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="makan maret"))
    assert response.confident is True
    assert response.citations[0].transaction_id == 1
    assert response.citations[0].marker == 1


@pytest.mark.asyncio
async def test_ask_drops_hallucinated_citation_ids():
    service = _service(
        {"answer": "x [1]", "cited_transaction_ids": [1, 999], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="q"))
    assert [c.transaction_id for c in response.citations] == [1]   # 999 dropped


@pytest.mark.asyncio
async def test_ask_no_contexts_returns_not_confident_without_llm_call():
    service = _service({"answer": "", "cited_transaction_ids": [], "confident": False}, [])
    response = await service.ask(AskRequest(query="q"))
    assert response.confident is False
    service._provider.generate_json.assert_not_called()
