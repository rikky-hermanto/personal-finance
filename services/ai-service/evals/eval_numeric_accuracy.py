"""Numeric exact-match eval: /ask's figure vs SQL ground truth, same filters.

    PYTHONPATH=. python evals/eval_numeric_accuracy.py

Ground truth is computed live by THIS harness with its own parametrized SQL —
an independent code path from AggregationService, the same reason an integration
test never asserts against the code under test's own output. Exact match on integer
rupiah: money is right or it's wrong; there is no "close".

The service router is driven in-process (AnswerService.ask — the exact code path
POST /ask uses), so no uvicorn server needs to be running; only Supabase + the
provider key. The planner gets NO filter hints — it must extract the dates and
category from the raw question itself, which is the whole point.

Requires: Supabase up (embedded transactions), GEMINI_API_KEY (or the configured
provider). NOT part of pytest/CI — it makes real, paid LLM calls and hits the DB.
"""
import asyncio
import json
import time
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg

from app.config import settings
from app.models import AskRequest
from app.providers.embedding_factory import create_embedding_provider
from app.providers.factory import ProviderFactory
from app.services.aggregator import AggregationService
from app.services.answerer import AnswerService
from app.services.query_planner import QueryPlanner
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

QUESTIONS_FILE = Path(__file__).parent / "ask_numeric_questions.json"


def last_month_range(today: date) -> tuple[str, str]:
    first_this = today.replace(day=1)
    last_prev = first_this - timedelta(days=1)
    first_prev = last_prev.replace(day=1)
    return first_prev.isoformat(), last_prev.isoformat()


def resolve_filters(filters: dict, today: date) -> dict:
    """Expand a `relative` window into concrete date_from/date_to."""
    f = dict(filters)
    rel = f.pop("relative", None)
    if rel == "last_month":
        f["date_from"], f["date_to"] = last_month_range(today)
    return f


async def truth_total(conn: asyncpg.Connection, filters: dict) -> tuple[Decimal, int]:
    """Independent ground-truth SUM/COUNT — mirrors AggregationService's SQL shape
    but is deliberately a separate implementation (never trust the code under test)."""
    where = ["1=1"]
    params: list = []

    def add(clause: str, value) -> None:
        params.append(value)
        where.append(clause.format(n=len(params)))

    if filters.get("categories"):
        add("category = ANY(${n})", filters["categories"])
    if filters.get("flow"):
        add("flow = ${n}", filters["flow"])
    if filters.get("date_from"):
        add("date >= ${n}::date", date.fromisoformat(filters["date_from"]))
    if filters.get("date_to"):
        add("date <= ${n}::date", date.fromisoformat(filters["date_to"]))

    row = await conn.fetchrow(
        f"SELECT COALESCE(SUM(amount_idr), 0) AS total, COUNT(*) AS n "
        f"FROM transactions WHERE {' AND '.join(where)}",
        *params,
    )
    return Decimal(str(row["total"])), row["n"]


async def load_categories(conn: asyncpg.Connection) -> list[str]:
    rows = await conn.fetch(
        "SELECT DISTINCT category FROM transactions WHERE category <> '' ORDER BY category"
    )
    return [r["category"] for r in rows]


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    today = date.today()

    conn = await asyncpg.connect(settings.database_url)
    categories = await load_categories(conn)

    embed_provider = create_embedding_provider(settings)
    provider = ProviderFactory.create(settings)
    answerer = AnswerService(
        retriever=RetrievalService(provider=embed_provider, db_url=settings.database_url),
        reranker=RerankerService(),
        provider=provider,
        planner=QueryPlanner(provider=provider),
        aggregator=AggregationService(db_url=settings.database_url),
        categories=categories,
    )

    print(f"Provider: {settings.ai_provider} | Model: {settings.ai_model} | categories={len(categories)}")
    print(f"{'id':<28} {'intent':<10} {'truth':>14} {'got':>14} {'ok':>4} {'lat':>8}")
    print("-" * 84)

    numeric_total = 0
    numeric_pass = 0
    routing_pass = 0
    routing_total = len(questions)

    for q in questions:
        expected_intent = q.get("intent_expected", "aggregate")

        t0 = time.perf_counter()
        resp = await answerer.ask(AskRequest(query=q["query"]))
        latency_ms = (time.perf_counter() - t0) * 1000

        routed_ok = resp.intent == expected_intent
        routing_pass += int(routed_ok)

        if expected_intent == "lookup":
            # Control: must NOT be scored numerically — only that routing sent it here.
            mark = "✓" if routed_ok else "✗"
            print(f"{q['id']:<28} {resp.intent:<10} {'—':>14} {'—':>14} {mark:>4} {latency_ms:>6.0f}ms")
            continue

        filters = resolve_filters(q["truth_filters"], today)
        truth, _n = await truth_total(conn, filters)
        got = resp.total_idr
        numeric_total += 1
        exact = got is not None and int(got) == int(truth)
        ok = routed_ok and exact
        numeric_pass += int(ok)

        got_str = "None" if got is None else f"{int(got):,}"
        mark = "✓" if ok else "✗"
        print(f"{q['id']:<28} {resp.intent:<10} {int(truth):>14,} {got_str:>14} {mark:>4} {latency_ms:>6.0f}ms")

    await conn.close()

    print("-" * 84)
    print(f"Numeric exact-match: {numeric_pass}/{numeric_total}   (target >= 9/10 on the aggregate set)")
    print(f"Routing correct:     {routing_pass}/{routing_total}")


if __name__ == "__main__":
    asyncio.run(run())
