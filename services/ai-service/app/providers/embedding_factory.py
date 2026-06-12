from app.config import Settings
from app.providers.embedding_base import EmbeddingProvider
from app.providers.openai_embedding import OpenAIEmbeddingProvider
from app.providers.gemini_embedding import GeminiEmbeddingProvider


def create_embedding_provider(settings: Settings) -> EmbeddingProvider:
    """Create the active embedding provider from config.

    Per-provider model defaults:
      openai → text-embedding-3-small
      gemini → gemini-embedding-001

    EMBEDDING_MODEL in .env overrides the default for either provider.
    """
    provider = settings.embedding_provider

    if provider == "openai":
        model = settings.embedding_model or "text-embedding-3-small"
        return OpenAIEmbeddingProvider(api_key=settings.openai_api_key, model=model)

    if provider == "gemini":
        model = settings.embedding_model or "gemini-embedding-001"
        return GeminiEmbeddingProvider(api_key=settings.gemini_api_key, model=model)

    raise ValueError(f"Unsupported EMBEDDING_PROVIDER: '{provider}'")
