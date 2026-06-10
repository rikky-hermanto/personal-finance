"""RetrievalService: pgvector cosine-similarity search over transaction embeddings."""
from __future__ import annotations

import logging

import asyncpg
import openai
from pgvector.asyncpg import register_vector

from app.config import settings
from app.models import SearchResult

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self) -> None:
        self._embed_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.embedding_model
        self._db_url = settings.database_url

    async def search(
        self, query: str, top_k: int = 5, min_similarity: float = 0.0
    ) -> list[SearchResult]:
        # 1. Embed the query with the same model used for storage.
        #    Always embed the query text as-is — no category/wallet addition.
        #    Those fields augment the stored docs; the query stays natural language.
        embed_response = await self._embed_client.embeddings.create(
            model=self._model,
            input=[query],
            encoding_format="float",
        )
        query_vector = embed_response.data[0].embedding

        # 2. Run pgvector cosine-distance search.
        #    <=> = cosine distance (0 = identical, 2 = opposite).
        #    1 - distance = cosine similarity (1 = identical).
        #    LEFT JOIN accounts to resolve account_name as wallet display name.
        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            rows = await conn.fetch(
                """
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
                WHERE 1 - (te.embedding <=> $1::vector) >= $3
                ORDER BY te.embedding <=> $1::vector
                LIMIT $2
                """,
                query_vector,
                top_k,
                min_similarity,
            )
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
