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

    # OpenAI (embeddings only — extraction still uses Gemini/Anthropic)
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"

    # Direct Postgres URL for asyncpg (pgvector operations bypass PostgREST)
    # Local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres
    # Supabase Cloud: from Project Settings → Database → Connection string → URI
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

    def validate_provider_key(self) -> None:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            print("WARNING: GEMINI_API_KEY is not set. AI features will fail.")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            print("WARNING: ANTHROPIC_API_KEY is not set. AI features will fail.")



settings = Settings()
settings.validate_provider_key()
