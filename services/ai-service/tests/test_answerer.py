from decimal import Decimal
from unittest.mock import AsyncMock
import pytest
from app.models import AskRequest, QueryPlan, SearchResult
from app.services.aggregator import AggregateResult
from app.services.answerer import AnswerService


def _result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=10000.0, flow="DB", wallet="BCA",
    )


def _service(
    provider_json: dict,
    contexts: list[SearchResult],
    plan: QueryPlan | None = None,
    agg: AggregateResult | None = None,
) -> AnswerService:
    retriever = AsyncMock()
    retriever.search = AsyncMock(return_value=contexts)
    reranker = AsyncMock()
    reranker.rerank = AsyncMock(return_value=contexts)
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value=provider_json)
    planner = AsyncMock()
    planner.plan = AsyncMock(return_value=plan or QueryPlan(intent="lookup", categories=[]))
    aggregator = AsyncMock()
    aggregator.aggregate = AsyncMock(return_value=agg)
    return AnswerService(retriever, reranker, provider, planner, aggregator, categories=["Food"])


# ── lookup path (PART 1 behavior, unchanged semantics) ───────────────────────

@pytest.mark.asyncio
async def test_ask_returns_grounded_answer_with_citations():
    service = _service(
        {"answer": "Total Rp 10.000 [1]", "cited_transaction_ids": [1], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="makan maret"))
    assert response.intent == "lookup"
    assert response.confident is True
    assert response.verified is True
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
    assert response.verified is False
    service._provider.generate_json.assert_not_called()


# ── aggregate path (PART 2 — the number rides in the payload, not the prose) ──

@pytest.mark.asyncio
async def test_aggregate_total_comes_from_sql_not_prose():
    """The AC's key case: a disobedient narration cannot corrupt total_idr."""
    agg = AggregateResult(total_idr=Decimal("2309954"), count=43, rows=[_result(1)])
    service = _service(
        {"answer": "Totalnya sekitar Rp 999.999", "cited_transaction_ids": [1], "confident": True},
        [_result(1)],
        plan=QueryPlan(intent="aggregate", categories=["Food"], flow="DB",
                       date_from="2024-04-01", date_to="2024-04-30"),
        agg=agg,
    )
    response = await service.ask(AskRequest(query="berapa pengeluaran makan bulan april?"))
    assert response.intent == "aggregate"
    assert response.total_idr == 2309954.0        # SQL total — NOT the prose's 999999
    assert response.verified is True
    assert response.confident is True


@pytest.mark.asyncio
async def test_aggregate_zero_rows_refuses_without_narration():
    agg = AggregateResult(total_idr=Decimal("0"), count=0, rows=[])
    service = _service(
        {"answer": "unused", "cited_transaction_ids": [], "confident": True},
        [],
        plan=QueryPlan(intent="aggregate", categories=["Food"], flow="DB"),
        agg=agg,
    )
    response = await service.ask(AskRequest(query="berapa pengeluaran makan bulan depan?"))
    assert response.intent == "aggregate"
    assert response.confident is False
    assert response.total_idr == 0.0
    service._provider.generate_json.assert_not_called()   # no narration on empty result
