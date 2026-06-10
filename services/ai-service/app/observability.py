import logging
from langfuse import Langfuse
from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton — created once at import time, reused across all requests.
# If keys are empty, Langfuse client is still created but operates in disabled mode.
langfuse = Langfuse(
    public_key=settings.langfuse_public_key,
    secret_key=settings.langfuse_secret_key,
    host=settings.langfuse_host,
    tracing_enabled=bool(settings.langfuse_public_key and settings.langfuse_secret_key),
)

# Gemini 2.5 Flash cost per 1M tokens (as of 2026-05)
# Source: https://ai.google.dev/pricing
GEMINI_COST = {
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},   # $/1M tokens
    "gemini-2.0-flash": {"input": 0.075, "output": 0.30},
}

# Anthropic pricing per 1M tokens (as of 2026-05)
# Source: https://www.anthropic.com/pricing
ANTHROPIC_COST = {
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5":  {"input": 0.80, "output":  4.00},
}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    table = {**GEMINI_COST, **ANTHROPIC_COST}
    pricing = table.get(model)
    if not pricing:
        return 0.0
    return (
        input_tokens  * pricing["input"]  / 1_000_000
        + output_tokens * pricing["output"] / 1_000_000
    )


# OpenAI embedding pricing per 1M tokens (as of 2026-05)
# Source: https://openai.com/pricing
OPENAI_EMBED_COST: dict[str, float] = {
    "text-embedding-3-small": 0.02,   # $/1M tokens
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002":  0.10,
}


def estimate_embed_cost_usd(model: str, total_tokens: int) -> float:
    price = OPENAI_EMBED_COST.get(model, 0.0)
    return total_tokens * price / 1_000_000