"""Retrieval benchmark: set-based relevance (Hit@5, MRR@5, P@5).

    PYTHONPATH=. python evals/eval_retrieval.py                    # baseline (top-5 cosine)
    PYTHONPATH=. python evals/eval_retrieval.py --rerank           # retrieve top-10 -> FlashRank -> top-5
    PYTHONPATH=. python evals/eval_retrieval.py --mode bm25
    PYTHONPATH=. python evals/eval_retrieval.py --mode hybrid
    PYTHONPATH=. python evals/eval_retrieval.py --mode hybrid --rerank
    PYTHONPATH=. python evals/eval_retrieval.py --all              # run every variant, print comparison table

    Modes: "vector" (pgvector cosine, unchanged default), "bm25" (PostgreSQL
    tsvector/ts_rank), "hybrid" (RRF merge of both — see retriever.py::_rrf_merge).
    sentence_window / auto_merging are out of scope for this eval — deferred to
    PF-AI006-PART2 along with the statement_chunks document store.

Why set-based, not exact-ID:
    This corpus has many near-duplicate transactions (33 'Electricity', 317
    'Groceries', 32 'Salary'). Exact-ID ground truth scores a perfectly good
    retrieval as a miss whenever it surfaces a *different* valid transaction
    than the one hand-labeled. Set-based relevance asks the question that
    actually matters: "did the top-K surface a transaction of the right kind?"

    A query's relevant set is rule-defined in search_queries.json via:
        category : exact category match (e.g. ["Electricity"])
        ilike    : description ILIKE patterns (e.g. ["%listrik%"])
    The relevant set is the UNION of both, computed against the live DB.

Prerequisite: embeddings backfilled (scripts/backfill_embeddings.py).
"""
import argparse
import asyncio
import json
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg

from app.config import settings
from app.providers.embedding_factory import create_embedding_provider
from app.services.retriever import RetrievalService
from app.services.reranker import RerankerService

QUERIES_FILE = Path(__file__).parent / "search_queries.json"
K = 5
MODES = ("vector", "bm25", "hybrid")


async def relevant_ids(conn: asyncpg.Connection, rule: dict) -> set[int]:
    """Resolve a query's relevant transaction IDs from category + ILIKE rules."""
    cats = rule.get("category") or []
    pats = rule.get("ilike") or []
    clauses: list[str] = []
    args: list = []
    if cats:
        args.append(cats)
        clauses.append(f"category = ANY(${len(args)}::text[])")
    for p in pats:
        args.append(p)
        clauses.append(f"description ILIKE ${len(args)}")
    if not clauses:
        return set()
    rows = await conn.fetch(
        f"SELECT id FROM transactions WHERE {' OR '.join(clauses)}", *args
    )
    return {r["id"] for r in rows}


def mrr_at_k(ranked: list[int], relevant: set[int], k: int = K) -> float:
    for rank, tid in enumerate(ranked[:k], start=1):
        if tid in relevant:
            return 1.0 / rank
    return 0.0


def hit_at_k(ranked: list[int], relevant: set[int], k: int = K) -> float:
    return 1.0 if any(t in relevant for t in ranked[:k]) else 0.0


def precision_at_k(ranked: list[int], relevant: set[int], k: int = K) -> float:
    topk = ranked[:k]
    if not topk:
        return 0.0
    return sum(1 for t in topk if t in relevant) / len(topk)


async def run(rerank: bool, search_mode: str = "vector", quiet: bool = False) -> dict:
    provider = create_embedding_provider(settings)
    service = RetrievalService(provider=provider, db_url=settings.database_url)
    reranker = RerankerService() if rerank else None
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    conn = await asyncpg.connect(settings.database_url)

    label = f"{search_mode}" + ("+rerank" if rerank else "")
    mrrs, hits, precisions, latencies = [], [], [], []
    if not quiet:
        print(f"Provider: {settings.embedding_provider} | Model: {provider.model} | K={K} | mode={label}")
        print(f"{'Query':<40} {'|rel|':>5} {'Hit':>4} {'MRR':>5} {'P@5':>5} {'Lat':>8}")
        print("-" * 80)

    for q in queries:
        rel = await relevant_ids(conn, q.get("relevant", {}))
        if not rel:
            if not quiet:
                print(f"{q['query'][:38]:<40}  WARN: empty relevant set — check rules in search_queries.json")
            mrrs.append(0.0); hits.append(0.0); precisions.append(0.0)
            continue

        t0 = time.perf_counter()
        if reranker:
            candidates = await service.search(q["query"], top_k=10, search_mode=search_mode)   # wide funnel
            results = await reranker.rerank(q["query"], candidates, top_k=K)
        else:
            results = await service.search(q["query"], top_k=K, search_mode=search_mode)
        latency_ms = (time.perf_counter() - t0) * 1000
        latencies.append(latency_ms)

        ranked = [r.transaction_id for r in results]
        mrr = mrr_at_k(ranked, rel)
        hit = hit_at_k(ranked, rel)
        p = precision_at_k(ranked, rel)
        mrrs.append(mrr); hits.append(hit); precisions.append(p)

        if not quiet:
            print(f"{q['query'][:38]:<40} {len(rel):>5} {hit:>4.0f} {mrr:>5.2f} {p:>5.2f} {latency_ms:>6.0f}ms")

    await conn.close()

    n = len(queries) or 1
    latencies.sort()
    p50 = latencies[len(latencies) // 2] if latencies else 0.0
    result = {
        "mode": search_mode, "rerank": rerank,
        "mrr": sum(mrrs) / n, "p5": sum(precisions) / n,
        "hit": sum(hits) / n, "latency_p50_ms": p50,
    }

    if not quiet:
        print("-" * 80)
        print(f"{'MACRO AVG':<40} {'':>5} {result['hit']:>4.2f} {result['mrr']:>5.3f} {result['p5']:>5.2f}")
        print()
        print(f"Hit@{K}  = fraction of queries with >=1 relevant result in top-{K}")
        print(f"MRR@{K}  = mean reciprocal rank of the first relevant result")
        print(f"P@{K}    = fraction of top-{K} that are relevant")
        print(f"\nMRR@{K} [{label}]: {result['mrr']:.3f}")
        print(f"P@{K} [{label}]: {result['p5']:.3f}")
        print(f"Target: MRR@{K} >= 0.60 this chapter; >= 0.80 after Chapter 4 (re-ranking + hybrid search)")

    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rerank", action="store_true", help="retrieve top-10, then FlashRank-rerank to top-5")
    ap.add_argument("--mode", choices=MODES, default="vector", help="search mode: vector | bm25 | hybrid")
    ap.add_argument("--all", action="store_true", help="run vector/bm25/hybrid (+rerank variants) and print a comparison table")
    args = ap.parse_args()

    if not args.all:
        asyncio.run(run(args.rerank, args.mode))
    else:
        results = []
        for m in MODES:
            results.append(asyncio.run(run(rerank=False, search_mode=m, quiet=True)))
            if m in ("vector", "hybrid"):
                results.append(asyncio.run(run(rerank=True, search_mode=m, quiet=True)))

        print("\n## Retrieval Variant Comparison\n")
        print(f"{'Mode':<20} {'MRR@5':>7} {'P@5':>7} {'Hit@5':>7} {'p50 ms':>9}")
        print("-" * 55)
        for r in results:
            label = r["mode"] + ("+rerank" if r["rerank"] else "")
            print(f"{label:<20} {r['mrr']:>7.3f} {r['p5']:>7.3f} {r['hit']:>7.2f} {r['latency_p50_ms']:>8.1f}ms")
