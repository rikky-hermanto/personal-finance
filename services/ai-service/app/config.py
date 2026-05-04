from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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


    def validate_provider_key(self) -> None:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            print("WARNING: GEMINI_API_KEY is not set. AI features will fail.")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            print("WARNING: ANTHROPIC_API_KEY is not set. AI features will fail.")



settings = Settings()
settings.validate_provider_key()
