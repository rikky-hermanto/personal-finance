"""RetrievalService: pgvector cosine-similarity search over transaction embeddings."""
from __future__ import annotations

import logging

import asyncpg
from pgvector.asyncpg import register_vector

from app.models import SearchResult
from app.providers.embedding_base import EmbeddingProvider

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self, provider: EmbeddingProvider, db_url: str) -> None:
        self._provider = provider
        self._db_url = db_url

    async def search(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.0,
        category: str | None = None,
        account: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[SearchResult]:
        # 1. Embed the query with the same model used for storage.
        #    Always embed the query text as-is — no category/wallet addition.
        #    Those fields augment the stored docs; the query stays natural language.
        query_vector = await self._provider.embed_query(query)
        model = self._provider.model

        # 2. Run pgvector cosine-distance search.
        #    <=> = cosine distance (0 = identical, 2 = opposite).
        #    1 - distance = cosine similarity (1 = identical).
        #    WHERE te.model = $4 guards against cross-model comparisons during a
        #    provider switch (results shrink until backfill completes — never mixed).
        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            # ivfflat default probes=1 only searches 1 cluster → high miss rate on small
            # datasets. sqrt(lists) is the standard starting point; lists=100 → probes=10
            # gives ~99% recall on 4467 rows without meaningful latency cost.
            # SET (not SET LOCAL) — asyncpg uses autocommit; LOCAL needs an active txn.
            await conn.execute("SET ivfflat.probes = 10")

            # Compile optional filters to parametrized WHERE clauses.
            # NEVER interpolate values into SQL — parameters only ($5, $6, ...).
            # Filtering here (not post-filtering the rows) keeps LIMIT $2 meaningful:
            # post-filtering a fixed top-K can silently shrink the result set below top_k.
            where = ["te.model = $4", "1 - (te.embedding <=> $1::vector) >= $3"]
            params: list = [query_vector, top_k, min_similarity, model]

            def add(clause: str, value) -> None:
                params.append(value)
                where.append(clause.format(n=len(params)))

            if category:
                add("t.category ILIKE ${n}", category)
            if account:
                add("a.name ILIKE ${n}", account)
            if date_from:
                add("t.date >= ${n}::date", date_from)
            if date_to:
                add("t.date <= ${n}::date", date_to)

            sql = f"""
                SELECT
                    te.transaction_id,
                    1 - (te.embedding <=> $1::vector) AS similarity,
                    t.description,
                    t.date::text AS date,
                    t.amount_idr,
                    t.flow,
                    COALESCE(a.name, '') AS wallet
                FROM transaction_embeddings te
                JOIN transactions t ON t.id = te.transaction_id
                LEFT JOIN accounts a ON a.id = t.account_id
                WHERE {" AND ".join(where)}
                ORDER BY te.embedding <=> $1::vector
                LIMIT $2
                """
            rows = await conn.fetch(sql, *params)
        finally:
            await conn.close()

        return [
            SearchResult(
                transaction_id=row["transaction_id"],
                similarity=float(row["similarity"]),
                description=row["description"],
                date=row["date"],
                amount_idr=float(row["amount_idr"]),
                flow=row["flow"],
                wallet=row["wallet"],
            )
            for row in rows
        ]
