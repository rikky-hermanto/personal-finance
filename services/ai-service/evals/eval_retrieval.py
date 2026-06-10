"""Retrieval benchmark: MRR@5 on 10 handwritten queries.

    PYTHONPATH=. python evals/eval_retrieval.py

Prerequisite: fill in search_queries.json with real transaction IDs,
then run backfill_embeddings.py to embed existing transactions.
"""
import asyncio
import json
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.retriever import RetrievalService

QUERIES_FILE = Path(__file__).parent / "search_queries.json"


def mrr_at_k(ranked_ids: list[int], relevant_ids: set[int], k: int = 5) -> float:
    """Mean Reciprocal Rank at K for a single query."""
    for rank, tid in enumerate(ranked_ids[:k], start=1):
        if tid in relevant_ids:
            return 1.0 / rank
    return 0.0


async def run() -> None:
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))

    unfilled = [q for q in queries if not q["expected_top5_ids"]]
    if unfilled:
        print(f"WARNING: {len(unfilled)} queries have no expected_top5_ids.")
        print("Edit evals/search_queries.json with real transaction IDs from Supabase Studio.")
        print("Then run: PYTHONPATH=. python scripts/backfill_embeddings.py")
        print()

    service = RetrievalService()

    rr_scores = []
    print(f"{'Query':<50}  {'MRR':>5}  {'Latency':>8}  Top-3 IDs")
    print("-" * 90)

    for q in queries:
        t0 = time.perf_counter()
        results = await service.search(q["query"], top_k=5)
        latency_ms = (time.perf_counter() - t0) * 1000

        ranked_ids = [r.transaction_id for r in results]
        relevant = set(q["expected_top5_ids"])
        rr = mrr_at_k(ranked_ids, relevant, k=5) if relevant else 0.0
        rr_scores.append(rr)

        top3 = ranked_ids[:3]
        print(f"{q['query'][:48]:<50}  {rr:5.2f}  {latency_ms:6.0f}ms  {top3}")

    mrr = sum(rr_scores) / len(rr_scores) if rr_scores else 0.0
    print(f"\n{'MRR@5 (macro avg)':<50}  {mrr:5.3f}")
    print(f"Target: >= 0.60 this week, >= 0.80 after Week 4 re-ranking")


if __name__ == "__main__":
    asyncio.run(run())
