import os

import pytest

# Set before any app module is imported so pydantic-settings picks these up
os.environ.setdefault("AI_PROVIDER", "anthropic")
os.environ["ANTHROPIC_API_KEY"] = "test-key-for-pytest"
os.environ["GEMINI_API_KEY"] = "test-key-for-pytest"
os.environ["GOOGLE_API_KEY"] = "test-key-for-pytest"
os.environ["OPENAI_API_KEY"] = "test-key-for-pytest"
os.environ["LANGFUSE_TRACING_ENABLED"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["OTEL_SDK_DISABLED"] = "true"


@pytest.fixture(autouse=True)
def no_live_http(monkeypatch):
    """Unit tests use mocks/ASGI transports, never a real HTTP endpoint."""
    import httpx

    def blocked(*args, **kwargs):
        raise AssertionError("Live HTTP is disabled in unit tests")

    async def async_blocked(*args, **kwargs):
        blocked()

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", async_blocked)
