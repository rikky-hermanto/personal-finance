"""AnswerService: grounded Q&A over transactions — routed by intent.

A temperature-0 QueryPlanner classifies each question, then this service routes:
  aggregate → deterministic SQL SUM/COUNT (AggregationService); the LLM narrates a
              number Postgres already computed — it never does arithmetic on money.
  lookup    → the PART 1 funnel: retrieve top-10 (filtered) → cross-encoder rerank
              → top-3 context → LLM synthesis with citations.

The number rides in the response payload (`total_idr`), not the prose — so even a
disobedient narration cannot corrupt what the UI shows.
"""
from __future__ import annotations

import datetime
import logging
import time

from app.config import settings
from app.models import AskRequest, AskResponse, Citation, SearchResult
from app.providers.base import LlmProvider
from app.services.aggregator import AggregationService
from app.services.query_planner import QueryPlanner
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

logger = logging.getLogger(__name__)

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "cited_transaction_ids": {"type": "array", "items": {"type": "integer"}},
        "confident": {"type": "boolean"},
    },
    "required": ["answer", "cited_transaction_ids", "confident"],
}

SYSTEM_PROMPT = """You are a personal finance assistant answering questions about \
the user's own bank transactions. Answer ONLY from the numbered transactions \
provided as context. Rules:
- If the context does not contain the answer, say so and set confident=false. \
Never estimate or invent amounts.
- Reference transactions inline as [1], [2] matching their context numbers. In \
cited_transaction_ids, list the numeric value shown after "id=" for each transaction \
you referenced — NOT the [1]/[2] marker number. Example: for context line \
"[2] id=24561 | ...", the marker is 2 but the cited id is 24561.
- Amounts are in IDR. Sum amounts yourself when the question asks for totals.
- Answer in the same language as the question (Indonesian or English)."""

NARRATE_PROMPT = """You present a precomputed financial result. The VERIFIED \
figures below were computed by SQL over the full transaction table. Rules:
- State the total EXACTLY as given — never recompute, round, or adjust it.
- Mention the transaction count. Reference example rows as [1], [2] if helpful.
- Answer in the question's language. One to three sentences."""


def _format_context(results: list[SearchResult]) -> str:
    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"[{i}] id={r.transaction_id} | {r.date} | {r.description} | "
            f"{r.flow} | Rp {r.amount_idr:,.0f} | {r.wallet}"
        )
    return "\n".join(lines)


def _citations_for(rows: list[SearchResult]) -> list[Citation]:
    """Aggregate-path display rows become citations, numbered [1], [2], ... in order.

    These are the largest matching rows shown as evidence — the SQL total is the
    actual answer, so all of them are "considered example rows" the narration may
    reference.
    """
    return [
        Citation(
            marker=i, transaction_id=r.transaction_id, date=r.date,
            description=r.description, amount_idr=r.amount_idr,
            flow=r.flow, wallet=r.wallet,
        )
        for i, r in enumerate(rows, start=1)
    ]


class AnswerService:
    def __init__(
        self,
        retriever: RetrievalService,
        reranker: RerankerService,
        provider: LlmProvider,
        planner: QueryPlanner,
        aggregator: AggregationService,
        categories: list[str] | None = None,
    ) -> None:
        self._retriever = retriever
        self._reranker = reranker
        self._provider = provider
        self._planner = planner
        self._aggregator = aggregator
        self._categories = categories or []

    async def ask(self, request: AskRequest) -> AskResponse:
        # One structured-extraction call classifies intent + extracts typed filters.
        today = datetime.date.today()
        plan = await self._planner.plan(request.query, today, self._categories)

        if plan.intent == "aggregate":
            return await self._answer_aggregate(request, plan)
        return await self._answer_lookup(request, plan)

    # ── aggregate: SQL computes the number, the LLM only narrates it ──────────
    async def _answer_aggregate(self, request: AskRequest, plan) -> AskResponse:
        t0 = time.perf_counter()
        agg = await self._aggregator.aggregate(plan)
        retrieval_ms = (time.perf_counter() - t0) * 1000

        if agg.count == 0:
            return AskResponse(
                answer="Tidak ada transaksi yang cocok dengan filter pertanyaan ini.",
                confident=False, citations=[], model="none", intent="aggregate",
                verified=True, total_idr=0.0,
                retrieval_ms=retrieval_ms, generation_ms=0.0,
            )

        t1 = time.perf_counter()
        user_prompt = (
            f"VERIFIED TOTAL: Rp {agg.total_idr:,.0f} from {agg.count} transactions\n"
            f"Filters: categories={plan.categories} {plan.date_from}..{plan.date_to} flow={plan.flow}\n"
            f"Largest rows:\n{_format_context(agg.rows)}\n\nQuestion: {request.query}"
        )
        raw = await self._provider.generate_json(NARRATE_PROMPT, user_prompt, ANSWER_SCHEMA)
        generation_ms = (time.perf_counter() - t1) * 1000

        # total_idr is set from the SQL result — the narration text cannot change it.
        return AskResponse(
            answer=raw["answer"], confident=True,
            citations=_citations_for(agg.rows), model=settings.ai_model,
            intent="aggregate", verified=True, total_idr=float(agg.total_idr),
            retrieval_ms=retrieval_ms, generation_ms=generation_ms,
        )

    # ── lookup: PART 1 funnel, now with planner-extracted filters ────────────
    async def _answer_lookup(self, request: AskRequest, plan) -> AskResponse:
        # Planner dates/category fill in where the request left them absent
        # (an explicit request filter always wins over an inferred one).
        category = request.category or (plan.categories[0] if plan.categories else None)
        date_from = request.date_from or plan.date_from
        date_to = request.date_to or plan.date_to

        t0 = time.perf_counter()
        candidates = await self._retriever.search(
            query=request.query, top_k=10,
            category=category, account=request.account,
            date_from=date_from, date_to=date_to,
            # search_mode intentionally omitted — the Ch6 eval measured "vector"
            # (the default) beating "hybrid" on this corpus; see advanced-rag-notes.md
        )
        contexts = await self._reranker.rerank(request.query, candidates, top_k=request.top_k)
        retrieval_ms = (time.perf_counter() - t0) * 1000

        if not contexts:
            return AskResponse(
                answer="Tidak ada transaksi yang cocok dengan pertanyaan ini.",
                confident=False, citations=[], model="none", intent="lookup",
                verified=False, retrieval_ms=retrieval_ms, generation_ms=0.0,
            )

        t1 = time.perf_counter()
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA)
        generation_ms = (time.perf_counter() - t1) * 1000

        # Validate citations: drop ids the LLM invented (hallucination guard).
        by_id = {r.transaction_id: (i + 1, r) for i, r in enumerate(contexts)}
        citations = []
        for tid in raw.get("cited_transaction_ids", []):
            if tid in by_id:
                marker, r = by_id[tid]
                citations.append(Citation(
                    marker=marker, transaction_id=r.transaction_id, date=r.date,
                    description=r.description, amount_idr=r.amount_idr,
                    flow=r.flow, wallet=r.wallet,
                ))
            else:
                logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)

        return AskResponse(
            answer=raw["answer"],
            confident=bool(raw.get("confident", False)),
            citations=citations,
            model=settings.ai_model,
            intent="lookup",
            verified=bool(citations),   # an uncited lookup answer is unverifiable
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
        )
