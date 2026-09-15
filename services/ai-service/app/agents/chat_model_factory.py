"""Small, unbound chat-model factory; extraction has a separate contract.

Learning limits are ceilings, not a monetary budget. Disable retries (0 <= 1)
so quota exhaustion stops the turn instead of spending more attempts.
"""
from functools import partial

from google.api_core.exceptions import ResourceExhausted
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import Settings

MAX_MODEL_CALLS = 4
MAX_OUTPUT_TOKENS = 2048
MODEL_TIMEOUT_SECONDS = 30
MAX_RETRIES = 0
# Agent/tool steps plus room for a controlled fallback, not an LLM call count.
GRAPH_RECURSION_LIMIT = 2 * MAX_MODEL_CALLS + 3


class AdvisorQuotaError(RuntimeError):
    """Stop immediately; no retry-after sleep or alternate provider."""


async def _google_async_call(method, **kwargs):
    try:
        return await method(**kwargs, retry=None)
    except ResourceExhausted:
        # The 2.x adapter can use blocking time.sleep(retry_after) even when
        # max_retries=0. Translate before it sees the exception so asyncio's
        # per-invocation deadline remains effective and quota errors stop now.
        raise AdvisorQuotaError("Advisor provider quota exhausted") from None


def _disable_google_rpc_retry(client):
    """2.x filters out invocation-level `retry`; disable it on this client only."""
    method = client.generate_content
    if not isinstance(method, partial) or "retry" not in method.keywords or method.keywords["retry"] is not None:
        client.generate_content = partial(method, retry=None)
    return client


class _BoundedChatGoogleGenerativeAI(ChatGoogleGenerativeAI):
    """Keep the 2.x adapter's lazy async client, with GAPIC retries disabled."""

    @property
    def async_client(self):
        client = super().async_client
        if client is not None:
            method = client.generate_content
            if not isinstance(method, partial) or method.func is not _google_async_call:
                client.generate_content = partial(_google_async_call, method)
        return client


def create_chat_model(config: Settings) -> BaseChatModel:
    """Select only the configured vendor. No discovery or provider fallback."""
    provider = config.ai_provider
    model = config.ai_model.strip()
    if provider not in ("gemini", "anthropic"):
        raise ValueError("Unsupported AI_PROVIDER; choose gemini or anthropic")
    if not model:
        raise ValueError("AI_MODEL is required")
    model_family = model.removeprefix("models/").lower()
    if (provider == "gemini" and model_family.startswith("claude")) or (
        provider == "anthropic" and model_family.startswith("gemini")
    ):
        raise ValueError("AI_MODEL does not match AI_PROVIDER")

    common = dict(
        model=model, temperature=0.0, max_tokens=MAX_OUTPUT_TOKENS,
        timeout=MODEL_TIMEOUT_SECONDS, max_retries=MAX_RETRIES,
    )
    if provider == "gemini":
        if not config.gemini_api_key.strip():
            raise ValueError("GEMINI_API_KEY is required for AI_PROVIDER=gemini")
        chat = _BoundedChatGoogleGenerativeAI(api_key=config.gemini_api_key, **common)
        _disable_google_rpc_retry(chat.client)
        return chat
    if not config.anthropic_api_key.strip():
        raise ValueError("ANTHROPIC_API_KEY is required for AI_PROVIDER=anthropic")
    return ChatAnthropic(api_key=config.anthropic_api_key, **common)
