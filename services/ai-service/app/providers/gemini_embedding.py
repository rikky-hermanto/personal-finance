from __future__ import annotations

import math

from google import genai
from google.genai import types


_OUTPUT_DIMS = 1536


def _l2_normalize(vec: list[float]) -> list[float]:
    """L2-normalize a vector in pure Python (no numpy dependency).

    Required when output_dimensionality is non-default: gemini-embedding-001
    truncates the native 3072-dim vector to the requested size but does NOT
    re-normalize, so cosine similarity is only meaningful after normalization.
    """
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-9:
        return vec
    return [x / norm for x in vec]


class GeminiEmbeddingProvider:
    """Embedding provider backed by Google Gemini embedding models.

    Uses `output_dimensionality=1536` to match the existing vector(1536) column.
    Applies L2 normalization because non-default output_dimensionality returns
    un-normalized vectors (truncated from native 3072 dims).

    Uses asymmetric task_type:
      - RETRIEVAL_DOCUMENT for stored document embeddings
      - RETRIEVAL_QUERY for query embeddings at search time
    This asymmetry is the Gemini-recommended approach for retrieval use cases.

    last_token_count is always 0 (Gemini embedding API does not expose token usage
    in the response, and the free tier costs $0.00 regardless).
    """

    def __init__(self, api_key: str, model: str = "gemini-embedding-001") -> None:
        self._api_key = api_key
        self._model = model
        self._client: genai.Client | None = None
        self.last_token_count: int = 0  # Gemini embedding API doesn't expose token count

    @property
    def model(self) -> str:
        return self._model

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not self._api_key:
                raise ValueError("GEMINI_API_KEY is not set.")
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        client = self._get_client()
        response = await client.aio.models.embed_content(
            model=self._model,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=_OUTPUT_DIMS,
            ),
        )
        return [_l2_normalize(list(emb.values)) for emb in response.embeddings]

    async def embed_query(self, text: str) -> list[float]:
        client = self._get_client()
        response = await client.aio.models.embed_content(
            model=self._model,
            contents=[text],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=_OUTPUT_DIMS,
            ),
        )
        return _l2_normalize(list(response.embeddings[0].values))
