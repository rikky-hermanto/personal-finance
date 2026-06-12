from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    @property
    def model(self) -> str: ...

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of documents for storage. Returns one vector per text."""
        ...

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query for search. May use a different task-type than embed_documents."""
        ...
