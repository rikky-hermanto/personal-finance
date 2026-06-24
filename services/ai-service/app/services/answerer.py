"""AnswerService: grounded Q&A over transactions.

Pipeline: retrieve top-10 (filtered) → cross-encoder rerank → top-3 context
→ LLM synthesis with citations via the existing provider abstraction.
"""
from __future__ import annotations

import logging
import time

from app.config import settings
from app.models import AskRequest, AskResponse, Citation, SearchResult
from app.providers.base import LlmProvider
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
- Reference transactions inline as [1], [2] matching their context numbers, and \
list their ids in cited_transaction_ids.
- Amounts are in IDR. Sum amounts yourself when the question asks for totals.
- Answer in the same language as the question (Indonesian or English)."""


def _format_context(results: list[SearchResult]) -> str:
    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"[{i}] id={r.transaction_id} | {r.date} | {r.description} | "
            f"{r.flow} | Rp {r.amount_idr:,.0f} | {r.wallet}"
        )
    return "\n".join(lines)


class AnswerService:
    def __init__(
        self,
        retriever: RetrievalService,
        reranker: RerankerService,
        provider: LlmProvider,
    ) -> None:
        self._retriever = retriever
        self._reranker = reranker
        self._provider = provider

    async def ask(self, request: AskRequest) -> AskResponse:
        # 1. Retrieve a wide candidate set (filtered), then rerank to top_k.
        t0 = time.perf_counter()
        candidates = await self._retriever.search(
            query=request.query,
            top_k=10,
            category=request.category,
            account=request.account,
            date_from=request.date_from,
            date_to=request.date_to,
        )
        contexts = await self._reranker.rerank(request.query, candidates, top_k=request.top_k)
        retrieval_ms = (time.perf_counter() - t0) * 1000

        if not contexts:
            return AskResponse(
                answer="Tidak ada transaksi yang cocok dengan pertanyaan ini.",
                confident=False, citations=[], model="none",
                retrieval_ms=retrieval_ms, generation_ms=0.0,
            )

        # 2. Grounded synthesis via the existing provider (Langfuse-traced).
        t1 = time.perf_counter()
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA)
        generation_ms = (time.perf_counter() - t1) * 1000

        # 3. Validate citations: drop ids the LLM invented (hallucination guard).
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
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
        )
