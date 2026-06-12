from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    ai_provider: Literal["gemini", "anthropic"] = "gemini"

    # Only the active provider's key is required — the other can stay empty
    gemini_api_key: str = ""
    anthropic_api_key: str = ""

    # Model name — set a sensible default per provider, override via env var
    ai_model: str = "gemini-2.5-flash"

    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:7208"]
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    otel_service_name: str = "ai-service"

    # Langfuse — AI observability
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # Embedding provider — separate from AI_PROVIDER (extraction vs. embedding are independent)
    # openai → text-embedding-3-small (requires OPENAI_API_KEY)
    # gemini → gemini-embedding-001  (requires GEMINI_API_KEY, free tier)
    embedding_provider: Literal["openai", "gemini"] = "gemini"

    # OpenAI key (embeddings when EMBEDDING_PROVIDER=openai)
    openai_api_key: str = ""

    # Embedding model override — empty string = use per-provider default
    # openai default: text-embedding-3-small
    # gemini default: gemini-embedding-001
    embedding_model: str = ""

    # Direct Postgres URL for asyncpg (pgvector operations bypass PostgREST)
    # Local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres
    # Supabase Cloud: from Project Settings → Database → Connection string → URI
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

    def validate_provider_key(self) -> None:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            print("WARNING: GEMINI_API_KEY is not set. AI features will fail.")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            print("WARNING: ANTHROPIC_API_KEY is not set. AI features will fail.")

    def validate_embedding_provider_key(self) -> None:
        if self.embedding_provider == "openai" and not self.openai_api_key:
            print("WARNING: EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set. Embedding features will fail.")
        if self.embedding_provider == "gemini" and not self.gemini_api_key:
            print("WARNING: EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is not set. Embedding features will fail.")



settings = Settings()
settings.validate_provider_key()
settings.validate_embedding_provider_key()
