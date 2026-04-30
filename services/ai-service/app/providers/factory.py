from app.config import Settings
from app.providers.base import LlmProvider
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider


class ProviderFactory:
    @staticmethod
    def create(settings: Settings) -> LlmProvider:
        if settings.ai_provider == "gemini":
            return GeminiProvider(
                api_key=settings.gemini_api_key,
                model=settings.ai_model,
            )
        if settings.ai_provider == "anthropic":
            return AnthropicProvider(
                api_key=settings.anthropic_api_key,
                model=settings.ai_model,
            )
        raise ValueError(f"Unsupported AI_PROVIDER: '{settings.ai_provider}'")
