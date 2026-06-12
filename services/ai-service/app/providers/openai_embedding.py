from __future__ import annotations

import openai


class OpenAIEmbeddingProvider:
    """Embedding provider backed by OpenAI text-embedding-* models.

    OpenAI normalizes vectors internally — no post-processing needed.
    Does not support task_type; documents and queries use the same call.

    Sets `last_token_count` after each embed call so EmbeddingService can
    report cost via estimate_embed_cost_usd() — matches the GeminiProvider.last_usage pattern.
    """

    def __init__(self, api_key: str, model: str = "text-embedding-3-small") -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key)
        self._model = model
        self.last_token_count: int = 0

    @property
    def model(self) -> str:
        return self._model

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
            encoding_format="float",
        )
        self.last_token_count = response.usage.total_tokens
        return [e.embedding for e in response.data]

    async def embed_query(self, text: str) -> list[float]:
        response = await self._client.embeddings.create(
            model=self._model,
            input=[text],
            encoding_format="float",
        )
        self.last_token_count = response.usage.total_tokens
        return response.data[0].embedding
