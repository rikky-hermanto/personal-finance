"""AggregationService: exact totals over transactions via parametrized SQL.

Postgres computes the number. Decimal end-to-end — money never touches float.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

import asyncpg

from app.models import QueryPlan, SearchResult

logger = logging.getLogger(__name__)


class AggregateResult:
    def __init__(self, total_idr: Decimal, count: int, rows: list[SearchResult]) -> None:
        self.total_idr = total_idr
        self.count = count
        self.rows = rows          # top rows by amount, for the sources panel


class AggregationService:
    def __init__(self, db_url: str) -> None:
        self._db_url = db_url

    async def aggregate(self, plan: QueryPlan, display_rows: int = 5) -> AggregateResult:
        where = ["1=1"]
        params: list = []

        def add(clause: str, value) -> None:
            params.append(value)
            where.append(clause.format(n=len(params)))

        if plan.categories:
            add("t.category = ANY(${n})", plan.categories)
        if plan.flow:
            add("t.flow = ${n}", plan.flow)
        # asyncpg's ::date codec calls .toordinal() on the bound value — it needs a
        # datetime.date, not a str (the codec bug pinned in PF-AI004 STEP 10). The
        # Pydantic layer already validated the YYYY-MM-DD shape, so fromisoformat is safe.
        if plan.date_from:
            add("t.date >= ${n}::date", date.fromisoformat(plan.date_from))
        if plan.date_to:
            add("t.date <= ${n}::date", date.fromisoformat(plan.date_to))

        clause = " AND ".join(where)
        conn = await asyncpg.connect(self._db_url)
        try:
            agg = await conn.fetchrow(
                f"SELECT COALESCE(SUM(t.amount_idr), 0) AS total, COUNT(*) AS n "
                f"FROM transactions t WHERE {clause}",
                *params,
            )
            rows = await conn.fetch(
                f"""SELECT t.id AS transaction_id, t.description, t.date::text AS date,
                           t.amount_idr, t.flow, COALESCE(a.name, '') AS wallet
                    FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
                    WHERE {clause}
                    ORDER BY t.amount_idr DESC LIMIT {int(display_rows)}""",
                *params,
            )
        finally:
            await conn.close()

        return AggregateResult(
            total_idr=Decimal(str(agg["total"])),
            count=agg["n"],
            rows=[
                SearchResult(
                    transaction_id=r["transaction_id"], similarity=1.0,
                    description=r["description"], date=r["date"],
                    amount_idr=float(r["amount_idr"]), flow=r["flow"], wallet=r["wallet"],
                )
                for r in rows
            ],
        )
