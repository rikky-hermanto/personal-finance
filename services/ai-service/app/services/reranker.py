"""RerankerService: cross-encoder re-ranking over retrieved transactions.

FlashRank runs a local MiniLM cross-encoder on CPU — no API key, no rate
limit, deterministic. Swappable for Cohere Rerank later: this class is the seam.
"""
from __future__ import annotations

import asyncio
import logging

from flashrank import Ranker, RerankRequest

from app.models import SearchResult

logger = logging.getLogger(__name__)

# ms-marco-MiniLM-L-12-v2: ~34MB, best quality/size balance in FlashRank's table.
# Downloaded once to cache_dir on first use.
_MODEL_NAME = "ms-marco-MiniLM-L-12-v2"


class RerankerService:
    def __init__(self, cache_dir: str = "/tmp/flashrank") -> None:
        self._ranker = Ranker(model_name=_MODEL_NAME, cache_dir=cache_dir)

    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int = 3
    ) -> list[SearchResult]:
        """Re-score retrieved results with the cross-encoder; return top_k by new score."""
        if not results:
            return []

        passages = [
            {
                "id": r.transaction_id,
                # Same enrichment shape as the embedded search_text: give the
                # cross-encoder the same semantic signal the bi-encoder had.
                "text": f"{r.description} | {r.wallet} | {r.date} | {r.flow}",
            }
            for r in results
        ]
        request = RerankRequest(query=query, passages=passages)

        # FlashRank is synchronous CPU inference — run off the event loop so a
        # 50ms model call doesn't block every other request in the service.
        ranked = await asyncio.to_thread(self._ranker.rerank, request)

        by_id = {r.transaction_id: r for r in results}
        reranked = [by_id[p["id"]] for p in ranked if p["id"] in by_id]
        return reranked[:top_k]
