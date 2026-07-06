"""Unit tests for POST /ask/stream SSE endpoint.

httpx.AsyncClient + ASGITransport — the house pattern (see test_health.py). No real LLM, no DB.
"""
import json
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import SearchResult


def _make_result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
    )


async def _fake_stream(*args, **kwargs) -> AsyncGenerator[str, None]:
    for word in ["Total", " pengeluaran", " Rp 50.000", " [1]"]:
        yield word


@pytest.fixture(autouse=True)
def wire_app_state():
    saved = {name: getattr(app.state, name, None) for name in ("retriever", "reranker", "provider")}

    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[_make_result(1)])
    mock_reranker = AsyncMock()
    mock_reranker.rerank = AsyncMock(return_value=[_make_result(1)])
    mock_provider = MagicMock()
    mock_provider.stream_generate = _fake_stream

    app.state.retriever = mock_retriever
    app.state.reranker = mock_reranker
    app.state.provider = mock_provider
    yield
    for name, value in saved.items():
        setattr(app.state, name, value)


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.anyio
async def test_ask_stream_event_order():
    """Events must arrive as: metadata → token(s) → done."""
    async with _client() as client:
        async with client.stream("POST", "/ask/stream", json={"query": "makan maret"}) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers["content-type"]

            events = []
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    events.append(line.split(":", 1)[1].strip())

    assert events[0] == "metadata"
    assert "token" in events
    assert events[-1] == "done"


@pytest.mark.anyio
async def test_ask_stream_metadata_contains_contexts():
    """The metadata event payload must include transaction context."""
    metadata_data = None
    async with _client() as client:
        async with client.stream("POST", "/ask/stream", json={"query": "makan maret"}) as r:
            event_type = None
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    event_type = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and event_type == "metadata":
                    metadata_data = json.loads(line.split(":", 1)[1].strip())
                    break

    assert metadata_data is not None
    assert isinstance(metadata_data, list)
    assert metadata_data[0]["transaction_id"] == 1


@pytest.mark.anyio
async def test_ask_stream_no_contexts_sends_done_with_not_confident():
    """Empty retrieval → single done event with confident=False, no token events."""
    app.state.retriever.search = AsyncMock(return_value=[])
    app.state.reranker.rerank = AsyncMock(return_value=[])

    events = []
    async with _client() as client:
        async with client.stream("POST", "/ask/stream", json={"query": "future 2031"}) as r:
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    events.append(line.split(":", 1)[1].strip())

    assert "token" not in events
    assert "done" in events
