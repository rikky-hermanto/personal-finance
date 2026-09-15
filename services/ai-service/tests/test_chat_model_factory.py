"""Exercise provider selection and real adapter serialization with fake transports."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage

from app.agents import chat_model_factory as factory
from app.config import Settings


def config(provider="gemini", model="gemini-2.5-flash", **overrides):
    values = dict(ai_provider=provider, ai_model=model, gemini_api_key="fake-gemini",
                  anthropic_api_key="", _env_file=None)
    values.update(overrides)
    return Settings(**values)


@pytest.mark.parametrize("provider,model,key,active,inactive", [
    ("gemini", "gemini-2.5-flash", "fake-gemini", "_BoundedChatGoogleGenerativeAI", "ChatAnthropic"),
    ("anthropic", "claude-haiku-4-5", "fake-anthropic", "ChatAnthropic", "_BoundedChatGoogleGenerativeAI"),
])
def test_selects_only_active_adapter(provider, model, key, active, inactive):
    settings = config(provider, model, **{f"{provider}_api_key": key,
                                        f"{'anthropic' if provider == 'gemini' else 'gemini'}_api_key": ""})
    with patch.object(factory, active) as selected, patch.object(factory, inactive) as unused:
        assert factory.create_chat_model(settings) is selected.return_value
        selected.assert_called_once_with(model=model, api_key=key, temperature=0.0,
                                         max_tokens=2048, timeout=30, max_retries=0)
        unused.assert_not_called()


@pytest.mark.parametrize("provider,model,key,error", [
    ("gemini", "gemini-custom-future", "", "GEMINI_API_KEY"),
    ("anthropic", "claude-custom-future", " ", "ANTHROPIC_API_KEY"),
    ("gemini", "claude-haiku-4-5", "fake", "does not match"),
    ("anthropic", "models/gemini-2.5-flash", "fake", "does not match"),
    ("gemini", " ", "fake", "AI_MODEL is required"),
])
def test_invalid_configuration_constructs_no_clients(provider, model, key, error):
    settings = config(provider, model, **{f"{provider}_api_key": key})
    with patch.object(factory, "_BoundedChatGoogleGenerativeAI") as google, patch.object(factory, "ChatAnthropic") as anthropic:
        with pytest.raises(ValueError, match=error):
            factory.create_chat_model(settings)
        google.assert_not_called()
        anthropic.assert_not_called()


def test_unsupported_provider_defensive_factory_validation():
    settings = config().model_copy(update={"ai_provider": "unsupported"})
    with pytest.raises(ValueError, match="Unsupported AI_PROVIDER"):
        factory.create_chat_model(settings)


def test_default_settings_without_env_are_gemini(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    settings = Settings(_env_file=None)
    assert (settings.ai_provider, settings.ai_model) == ("gemini", "gemini-2.5-flash")


@pytest.mark.parametrize("failure", [ResourceExhausted("quota exhausted"), ServiceUnavailable("unavailable")])
async def test_real_gemini_adapter_does_not_retry_transport(failure):
    # Mock Google client construction: actual adapter prepares messages and limits,
    # but no gRPC channel, discovery, credentials lookup or provider call occurs.
    sync_client = MagicMock()
    async_client = MagicMock()
    rpc = AsyncMock(side_effect=failure)
    async_client.generate_content = rpc
    with patch("langchain_google_genai.chat_models.genaix.build_generative_service", return_value=sync_client), patch(
        "langchain_google_genai.chat_models.genaix.build_generative_async_service", return_value=async_client
    ):
        chat = factory.create_chat_model(config())
        assert isinstance(chat, BaseChatModel)
        assert chat.max_output_tokens == 2048
        assert chat.timeout == 30
        assert chat.max_retries == 0
        expected = factory.AdvisorQuotaError if isinstance(failure, ResourceExhausted) else type(failure)
        with pytest.raises(expected):
            await chat.ainvoke([HumanMessage(content="Synthetic test")])
        rpc.assert_awaited_once()
        assert rpc.await_args.kwargs["retry"] is None
        assert rpc.await_args.kwargs["timeout"] == 30
        assert rpc.await_args.kwargs["request"].generation_config.max_output_tokens == 2048
        sync_client.generate_content(request="test")
        assert sync_client.generate_content.func.call_args.kwargs["retry"] is None


async def test_gemini_quota_retry_after_never_blocks_event_loop():
    failure = ResourceExhausted("daily quota exhausted")
    failure.retry_after = 45
    async_client = MagicMock()
    rpc = AsyncMock(side_effect=failure)
    async_client.generate_content = rpc
    with patch("langchain_google_genai.chat_models.genaix.build_generative_service"), patch(
        "langchain_google_genai.chat_models.genaix.build_generative_async_service", return_value=async_client
    ), patch("langchain_google_genai.chat_models.time.sleep") as sleep:
        chat = factory.create_chat_model(config())
        with pytest.raises(factory.AdvisorQuotaError):
            await chat.ainvoke([HumanMessage(content="Synthetic test")])
        rpc.assert_awaited_once()
        sleep.assert_not_called()


async def test_real_anthropic_adapter_maps_limits_without_network():
    with patch("langchain_anthropic.chat_models.anthropic.Client") as sync_sdk, patch(
        "langchain_anthropic.chat_models.anthropic.AsyncClient"
    ) as async_sdk:
        chat = factory.create_chat_model(config("anthropic", "claude-haiku-4-5",
                                               gemini_api_key="", anthropic_api_key="fake-anthropic"))
        assert isinstance(chat, BaseChatModel)
        assert chat.max_tokens == 2048
        assert chat.default_request_timeout == 30
        assert chat.max_retries == 0
        rpc = AsyncMock(side_effect=RuntimeError("synthetic failure"))
        async_sdk.return_value.messages.create = rpc
        with pytest.raises(RuntimeError, match="synthetic failure"):
            await chat.ainvoke([HumanMessage(content="Synthetic test")])
        rpc.assert_awaited_once()
        assert rpc.await_args.kwargs["max_tokens"] == 2048
        assert async_sdk.call_args.kwargs["max_retries"] == 0
        assert async_sdk.call_args.kwargs["timeout"] == 30
