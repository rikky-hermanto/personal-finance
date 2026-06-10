"""EmbeddingService: generate and store transaction embeddings via OpenAI.

Stores vectors directly to Postgres via asyncpg (bypasses PostgREST —
pgvector requires raw SQL <=> operator).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import asyncpg
import openai

from app.config import settings
from app.observability import langfuse, estimate_embed_cost_usd

logger = logging.getLogger(__name__)

from pgvector.asyncpg import register_vector


@dataclass
class EmbedItem:
    transaction_id: int
    description: str
    remarks: str = ""
    category: str = ""
    wallet: str = ""

    def search_text(self) -> str:
        """Compose the text that will be embedded.
        Include category + wallet so semantic search works even when
        the raw description is a terse code like 'DEBIT TRANSFER BCA'.
        """
        parts = [self.description]
        if self.remarks:
            parts.append(self.remarks)
        if self.category and self.category != "Uncategorized":
            parts.append(self.category)
        if self.wallet:
            parts.append(self.wallet)
        return " | ".join(parts)


class EmbeddingService:
    def __init__(self) -> None:
        self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.embedding_model
        self._db_url = settings.database_url

    async def embed_and_store(self, items: list[EmbedItem]) -> tuple[int, int]:
        """Embed a batch of transactions and upsert into transaction_embeddings.

        Returns (embedded, skipped) counts.
        """
        if not items:
            return 0, 0

        texts = [item.search_text() for item in items]

        generation = langfuse.start_observation(
            as_type="generation",
            name="openai-embed-batch",
            model=self._model,
            input=f"{len(texts)} texts",
        )
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=texts,
                encoding_format="float",
            )
        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise

        tokens = response.usage.total_tokens
        cost = estimate_embed_cost_usd(self._model, tokens)
        generation.update(
            usage_details={"input": tokens, "output": 0},
            cost_details={"usd": cost},
        )
        generation.end()

        logger.info(
            "Embeddings generated | model=%s | texts=%d | tokens=%d | cost_usd=%.6f",
            self._model, len(texts), tokens, cost,
        )

        vectors = [e.embedding for e in response.data]

        conn = await asyncpg.connect(self._db_url)
        await register_vector(conn)
        try:
            embedded = 0
            skipped = 0
            for item, text, vector in zip(items, texts, vectors):
                try:
                    await conn.execute(
                        """
                        INSERT INTO transaction_embeddings
                            (transaction_id, embedding, search_text, model)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (transaction_id) DO UPDATE
                            SET embedding = EXCLUDED.embedding,
                                search_text = EXCLUDED.search_text,
                                model = EXCLUDED.model
                        """,
                        item.transaction_id,
                        vector,
                        text,
                        self._model,
                    )
                    embedded += 1
                except Exception as exc:
                    logger.warning("Failed to store embedding for tx %d: %s", item.transaction_id, exc)
                    skipped += 1
        finally:
            await conn.close()

        return embedded, skipped
