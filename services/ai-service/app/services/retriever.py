"""RetrievalService: pgvector cosine-similarity search over transaction embeddings."""
from __future__ import annotations

import logging
from datetime import date

import asyncpg
from pgvector.asyncpg import register_vector

from app.models import SearchResult
from app.providers.embedding_base import EmbeddingProvider

logger = logging.getLogger(__name__)


def _rrf_merge(
    vector_ids: list[int],
    bm25_ids: list[int],
    k: int = 60,
) -> list[int]:
    """Reciprocal Rank Fusion over two ranked ID lists.

    RRF(d) = sum over lists of 1 / (k + rank(d, list)). Rank positions (always
    comparable integers 1, 2, 3, ...) are combined instead of raw scores —
    cosine similarity (0-1) and ts_rank (unbounded log-frequency) live on
    incomparable scales, so no fixed weighted sum works across queries.
    k=60 is the canonical constant from Cormack et al., SIGIR 2009.
    """
    scores: dict[int, float] = {}
    for rank, id_ in enumerate(vector_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    for rank, id_ in enumerate(bm25_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


class RetrievalService:
    def __init__(self, provider: EmbeddingProvider, db_url: str) -> None:
        self._provider = provider
        self._db_url = db_url

    def _build_where(
        self,
        base: list[str],
        params: list,
        category: str | None,
        account: str | None,
        date_from: str | None,
        date_to: str | None,
    ) -> tuple[list[str], list]:
        where = list(base)

        def add(clause: str, value) -> None:
            params.append(value)
            where.append(clause.format(n=len(params)))

        if category:
            add("t.category ILIKE ${n}", category)
        if account:
            add("a.name ILIKE ${n}", account)
        if date_from:
            add("t.date >= ${n}::date", date.fromisoformat(date_from))
        if date_to:
            add("t.date <= ${n}::date", date.fromisoformat(date_to))
        return where, params

    async def _search_bm25_ids(
        self,
        conn,
        query: str,
        top_k: int,
        category: str | None,
        account: str | None,
        date_from: str | None,
        date_to: str | None,
    ) -> list[int]:
        """Rank transaction IDs by PostgreSQL tsvector BM25 score (ts_rank).

        plainto_tsquery (not to_tsquery) is used because it parses natural-
        language input as AND-joined unquoted words — to_tsquery requires the
        caller to pre-format `&`/`:*` operators and fails on plain queries like
        "tagihan listrik PLN bulan lalu".
        """
        where, params = self._build_where(
            ["t.description_tsv @@ plainto_tsquery('simple', $1)"],
            [query],
            category, account, date_from, date_to,
        )
        params.append(top_k)
        top_k_param = len(params)
        sql = f"""
            SELECT t.id
            FROM transactions t
            LEFT JOIN accounts a ON a.id = t.account_id
            WHERE {" AND ".join(where)}
            ORDER BY ts_rank(t.description_tsv, plainto_tsquery('simple', $1)) DESC
            LIMIT ${top_k_param}
            """
        rows = await conn.fetch(sql, *params)
        return [r["id"] for r in rows]

    async def _fetch_results_by_ids(self, conn, ids: list[int]) -> list[SearchResult]:
        """Fetch full transaction rows for a fixed ID list, preserving its order.

        Used by the bm25/hybrid paths where ranking was already decided by
        ts_rank or RRF — the SQL result order must not silently re-sort by id.
        """
        if not ids:
            return []
        rows = await conn.fetch(
            """
            SELECT
                t.id AS transaction_id,
                0.0 AS similarity,
                t.description,
                t.date::text AS date,
                t.amount_idr,
                t.flow,
                COALESCE(a.name, '') AS wallet
            FROM transactions t
            LEFT JOIN accounts a ON a.id = t.account_id
            WHERE t.id = ANY($1::bigint[])
            """,
            ids,
        )
        by_id = {row["transaction_id"]: row for row in rows}
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
            for tid in ids
            if (row := by_id.get(tid)) is not None
        ]

    async def search(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.0,
        category: str | None = None,
        account: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        search_mode: str = "vector",
    ) -> list[SearchResult]:
        # 1. Embed the query with the same model used for storage.
        #    Always embed the query text as-is — no category/wallet addition.
        #    Those fields augment the stored docs; the query stays natural language.
        #    bm25-only mode skips embedding entirely — no vector call needed.
        query_vector = None if search_mode == "bm25" else await self._provider.embed_query(query)
        model = self._provider.model

        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            # ivfflat default probes=1 only searches 1 cluster → high miss rate on small
            # datasets. sqrt(lists) is the standard starting point; lists=100 → probes=10
            # gives ~99% recall on 4467 rows without meaningful latency cost.
            # SET (not SET LOCAL) — asyncpg uses autocommit; LOCAL needs an active txn.
            await conn.execute("SET ivfflat.probes = 10")

            if search_mode == "bm25":
                ids = await self._search_bm25_ids(
                    conn, query, top_k, category, account, date_from, date_to
                )
                return await self._fetch_results_by_ids(conn, ids)

            if search_mode == "hybrid":
                # Fetch top_k from EACH ranked list before merging — capping either
                # list to top_k/2 would drop a document ranked #8 in vector but #1
                # in bm25 (an exact keyword hit) before RRF ever sees it.
                vector_results = await self._search_vector(
                    conn, query_vector, model, top_k, min_similarity,
                    category, account, date_from, date_to,
                )
                vector_ids = [r.transaction_id for r in vector_results]
                bm25_ids = await self._search_bm25_ids(
                    conn, query, top_k, category, account, date_from, date_to
                )
                merged_ids = _rrf_merge(vector_ids, bm25_ids)[:top_k]
                return await self._fetch_results_by_ids(conn, merged_ids)

            # default: "vector" — existing path unchanged
            return await self._search_vector(
                conn, query_vector, model, top_k, min_similarity,
                category, account, date_from, date_to,
            )
        finally:
            await conn.close()

    async def _search_vector(
        self,
        conn,
        query_vector,
        model: str,
        top_k: int,
        min_similarity: float,
        category: str | None,
        account: str | None,
        date_from: str | None,
        date_to: str | None,
    ) -> list[SearchResult]:
        # pgvector cosine-distance search.
        # <=> = cosine distance (0 = identical, 2 = opposite).
        # 1 - distance = cosine similarity (1 = identical).
        # WHERE te.model = $4 guards against cross-model comparisons during a
        # provider switch (results shrink until backfill completes — never mixed).
        #
        # Compile optional filters to parametrized WHERE clauses.
        # NEVER interpolate values into SQL — parameters only ($5, $6, ...).
        # Filtering here (not post-filtering the rows) keeps LIMIT $2 meaningful:
        # post-filtering a fixed top-K can silently shrink the result set below top_k.
        where, params = self._build_where(
            ["te.model = $4", "1 - (te.embedding <=> $1::vector) >= $3"],
            [query_vector, top_k, min_similarity, model],
            category, account, date_from, date_to,
        )

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
