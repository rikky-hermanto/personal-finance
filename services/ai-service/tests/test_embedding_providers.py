"""Tests for embedding provider factory, GeminiEmbeddingProvider normalization,
and backfill_embeddings.py confirmation logic.
"""
import math
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.providers.embedding_factory import create_embedding_provider
from app.providers.openai_embedding import OpenAIEmbeddingProvider
from app.providers.gemini_embedding import GeminiEmbeddingProvider, _l2_normalize
from app.config import Settings


# ── Factory tests ──────────────────────────────────────────────────────────────

def _settings(**overrides) -> Settings:
    base = {
        "ai_provider": "gemini",
        "gemini_api_key": "fake-gemini-key",
        "openai_api_key": "fake-openai-key",
        "anthropic_api_key": "",
        "embedding_provider": "gemini",
        "embedding_model": "",
        "database_url": "postgresql://test",
        "log_level": "WARNING",
    }
    base.update(overrides)
    return Settings(**base)


def test_factory_returns_gemini_provider_when_configured():
    s = _settings(embedding_provider="gemini")
    provider = create_embedding_provider(s)
    assert isinstance(provider, GeminiEmbeddingProvider)


def test_factory_returns_openai_provider_when_configured():
    s = _settings(embedding_provider="openai")
    provider = create_embedding_provider(s)
    assert isinstance(provider, OpenAIEmbeddingProvider)


def test_factory_gemini_uses_default_model_when_embedding_model_empty():
    s = _settings(embedding_provider="gemini", embedding_model="")
    provider = create_embedding_provider(s)
    assert provider.model == "gemini-embedding-001"


def test_factory_openai_uses_default_model_when_embedding_model_empty():
    s = _settings(embedding_provider="openai", embedding_model="")
    provider = create_embedding_provider(s)
    assert provider.model == "text-embedding-3-small"


def test_factory_respects_explicit_model_override():
    s = _settings(embedding_provider="openai", embedding_model="text-embedding-3-large")
    provider = create_embedding_provider(s)
    assert provider.model == "text-embedding-3-large"


def test_factory_raises_on_unsupported_provider():
    # Pydantic guards the Settings type, so use a plain namespace to test the factory's
    # defensive branch directly — the ValueError is the last line of defense.
    from types import SimpleNamespace
    s = SimpleNamespace(
        embedding_provider="cohere",
        embedding_model="",
        openai_api_key="",
        gemini_api_key="",
    )
    with pytest.raises(ValueError, match="Unsupported EMBEDDING_PROVIDER"):
        create_embedding_provider(s)  # type: ignore[arg-type]


# ── GeminiEmbeddingProvider normalization tests ────────────────────────────────

def test_l2_normalize_unit_vector():
    vec = [3.0, 4.0]
    result = _l2_normalize(vec)
    assert abs(result[0] - 0.6) < 1e-6
    assert abs(result[1] - 0.8) < 1e-6


def test_l2_normalize_result_has_unit_norm():
    vec = [1.0, 2.0, 3.0, 4.0]
    result = _l2_normalize(vec)
    norm = math.sqrt(sum(x * x for x in result))
    assert abs(norm - 1.0) < 1e-6


def test_l2_normalize_zero_vector_safe():
    vec = [0.0, 0.0, 0.0]
    result = _l2_normalize(vec)
    assert result == [0.0, 0.0, 0.0]


@pytest.mark.asyncio
async def test_gemini_provider_normalizes_embed_documents():
    """embed_documents output should have L2 norm ≈ 1.0 for each vector."""
    raw_vector = [3.0, 4.0]  # norm = 5.0, not normalized

    mock_embedding = MagicMock()
    mock_embedding.values = raw_vector

    mock_response = MagicMock()
    mock_response.embeddings = [mock_embedding]

    mock_client = MagicMock()
    mock_client.aio.models.embed_content = AsyncMock(return_value=mock_response)

    provider = GeminiEmbeddingProvider(api_key="fake-key")
    provider._client = mock_client

    result = await provider.embed_documents(["some text"])

    assert len(result) == 1
    norm = math.sqrt(sum(x * x for x in result[0]))
    assert abs(norm - 1.0) < 1e-6


@pytest.mark.asyncio
async def test_gemini_provider_embed_query_uses_retrieval_query_task_type():
    """embed_query must pass task_type=RETRIEVAL_QUERY (asymmetric embedding)."""
    from google.genai import types as gtypes

    mock_embedding = MagicMock()
    mock_embedding.values = [1.0, 0.0]

    mock_response = MagicMock()
    mock_response.embeddings = [mock_embedding]

    mock_client = MagicMock()
    mock_client.aio.models.embed_content = AsyncMock(return_value=mock_response)

    provider = GeminiEmbeddingProvider(api_key="fake-key")
    provider._client = mock_client

    await provider.embed_query("test query")

    call_kwargs = mock_client.aio.models.embed_content.call_args.kwargs
    config = call_kwargs["config"]
    assert config.task_type == "RETRIEVAL_QUERY"


@pytest.mark.asyncio
async def test_gemini_provider_embed_documents_uses_retrieval_document_task_type():
    """embed_documents must pass task_type=RETRIEVAL_DOCUMENT."""
    mock_embedding = MagicMock()
    mock_embedding.values = [1.0, 0.0]

    mock_response = MagicMock()
    mock_response.embeddings = [mock_embedding]

    mock_client = MagicMock()
    mock_client.aio.models.embed_content = AsyncMock(return_value=mock_response)

    provider = GeminiEmbeddingProvider(api_key="fake-key")
    provider._client = mock_client

    await provider.embed_documents(["a document"])

    call_kwargs = mock_client.aio.models.embed_content.call_args.kwargs
    config = call_kwargs["config"]
    assert config.task_type == "RETRIEVAL_DOCUMENT"


# ── Backfill confirmation logic tests ─────────────────────────────────────────

def _make_asyncpg_row(row_id: int, model: str = "old-model") -> MagicMock:
    data = {
        "id": row_id, "description": "TEST", "remarks": "",
        "category": "Other", "wallet": "BCA", "stored_model": model,
    }
    row = MagicMock()
    row.__getitem__ = MagicMock(side_effect=lambda k: data[k])
    return row


@pytest.mark.asyncio
async def test_backfill_dry_run_reports_both_counts(capsys):
    """--dry-run must print missing + mismatch counts without calling embed_and_store."""
    import scripts.backfill_embeddings as script

    missing = [_make_asyncpg_row(1), _make_asyncpg_row(2)]
    mismatch = [_make_asyncpg_row(3, model="old-model")]

    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(side_effect=[missing, mismatch])

    with patch("scripts.backfill_embeddings.asyncpg.connect", return_value=mock_conn), \
         patch("scripts.backfill_embeddings.register_vector", new_callable=AsyncMock), \
         patch("scripts.backfill_embeddings.create_embedding_provider") as mock_factory, \
         patch("scripts.backfill_embeddings.EmbeddingService") as mock_svc_cls:

        mock_provider = MagicMock()
        mock_provider.model = "gemini-embedding-001"
        mock_factory.return_value = mock_provider

        await script.backfill(batch_size=50, dry_run=True, yes=False)

    out = capsys.readouterr().out
    assert "2" in out   # missing count
    assert "1" in out   # mismatch count
    assert "Dry run" in out
    mock_svc_cls.assert_not_called()


@pytest.mark.asyncio
async def test_backfill_prompts_confirmation_on_mismatch(capsys):
    """When mismatch rows exist and --yes is not set, must prompt and abort on 'n'."""
    import scripts.backfill_embeddings as script

    mismatch = [_make_asyncpg_row(3, model="old-model")]

    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(side_effect=[[], mismatch])  # no missing, 1 mismatch

    with patch("scripts.backfill_embeddings.asyncpg.connect", return_value=mock_conn), \
         patch("scripts.backfill_embeddings.register_vector", new_callable=AsyncMock), \
         patch("scripts.backfill_embeddings.create_embedding_provider") as mock_factory, \
         patch("scripts.backfill_embeddings.EmbeddingService") as mock_svc_cls, \
         patch("builtins.input", return_value="n"):

        mock_provider = MagicMock()
        mock_provider.model = "gemini-embedding-001"
        mock_factory.return_value = mock_provider

        await script.backfill(batch_size=50, dry_run=False, yes=False)

    out = capsys.readouterr().out
    assert "WARNING" in out
    assert "Aborted" in out
    mock_svc_cls.assert_not_called()


@pytest.mark.asyncio
async def test_backfill_yes_skips_confirmation_and_embeds(capsys):
    """--yes must skip the prompt and proceed to embed mismatch rows."""
    import scripts.backfill_embeddings as script

    mismatch = [_make_asyncpg_row(3, model="old-model")]

    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(side_effect=[[], mismatch])

    mock_service_instance = AsyncMock()
    mock_service_instance.embed_and_store = AsyncMock(return_value=(1, 0))

    with patch("scripts.backfill_embeddings.asyncpg.connect", return_value=mock_conn), \
         patch("scripts.backfill_embeddings.register_vector", new_callable=AsyncMock), \
         patch("scripts.backfill_embeddings.create_embedding_provider") as mock_factory, \
         patch("scripts.backfill_embeddings.EmbeddingService", return_value=mock_service_instance), \
         patch("builtins.input") as mock_input:

        mock_provider = MagicMock()
        mock_provider.model = "gemini-embedding-001"
        mock_factory.return_value = mock_provider

        await script.backfill(batch_size=50, dry_run=False, yes=True)

    mock_input.assert_not_called()
    mock_service_instance.embed_and_store.assert_called_once()
