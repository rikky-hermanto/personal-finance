"""Unit tests for POST /ask/stream SSE endpoint.

httpx.AsyncClient + ASGITransport — the house pattern (see test_health.py). No real LLM, no DB.
The endpoint routes by planner intent: lookup → retrieve/rerank/cite (with a post-stream
marker guard); aggregate → SQL total first, narration second.
"""
import json
import logging
from collections.abc import AsyncGenerator
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import QueryPlan, SearchResult
from app.services.aggregator import AggregateResult


def _make_result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
    )


def _stream_of(tokens: list[str]):
    async def _s(*args, **kwargs) -> AsyncGenerator[str, None]:
        for t in tokens:
            yield t
    return _s


async def _fake_stream(*args, **kwargs) -> AsyncGenerator[str, None]:
    for word in ["Total", " pengeluaran", " Rp 50.000", " [1]"]:
        yield word


@pytest.fixture(autouse=True)
def wire_app_state():
    names = ("retriever", "reranker", "provider", "planner", "aggregator", "categories")
    saved = {name: getattr(app.state, name, None) for name in names}

    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[_make_result(1)])
    mock_reranker = AsyncMock()
    mock_reranker.rerank = AsyncMock(return_value=[_make_result(1)])
    mock_provider = MagicMock()
    mock_provider.stream_generate = _fake_stream
    mock_planner = AsyncMock()
    mock_planner.plan = AsyncMock(return_value=QueryPlan(intent="lookup", categories=[]))
    mock_aggregator = AsyncMock()

    app.state.retriever = mock_retriever
    app.state.reranker = mock_reranker
    app.state.provider = mock_provider
    app.state.planner = mock_planner
    app.state.aggregator = mock_aggregator
    app.state.categories = ["Food"]
    yield
    for name, value in saved.items():
        setattr(app.state, name, value)


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _collect(query: str = "makan maret") -> list[tuple[str, str]]:
    """Return [(event, data), ...] pairs from the SSE stream."""
    events: list[tuple[str, str]] = []
    current = None
    async with _client() as client:
        async with client.stream("POST", "/ask/stream", json={"query": query}) as r:
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    current = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    events.append((current, line.split(":", 1)[1].strip()))
    return events


def _done_payload(events: list[tuple[str, str]]) -> dict:
    for event, data in reversed(events):
        if event == "done":
            return json.loads(data)
    raise AssertionError("no done event found")


def _metadata_payload(events: list[tuple[str, str]]) -> dict:
    for event, data in events:
        if event == "metadata":
            return json.loads(data)
    raise AssertionError("no metadata event found")


@pytest.mark.anyio
async def test_ask_stream_event_order():
    """Lookup events must arrive as: metadata → token(s) → done."""
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
    events = await _collect()
    meta = _metadata_payload(events)
    assert "contexts" in meta
    assert meta["contexts"][0]["transaction_id"] == 1
    assert meta["intent"] == "lookup"


@pytest.mark.anyio
async def test_ask_stream_no_contexts_sends_done_with_not_confident():
    """Empty retrieval → single done event with confident=False, no token events."""
    app.state.reranker.rerank = AsyncMock(return_value=[])
    app.state.retriever.search = AsyncMock(return_value=[])

    events = await _collect("future 2031")
    assert not any(e == "token" for e, _ in events)
    done = _done_payload(events)
    assert done["confident"] is False
    assert done["verified"] is False


# ── STEP 5: post-stream citation guard (lookup path) ─────────────────────────

@pytest.mark.anyio
async def test_ask_stream_valid_marker_is_verified():
    """A [1] marker that maps to a sent context → verified=True."""
    app.state.provider.stream_generate = _stream_of(["Jawaban ", "[1]"])
    done = _done_payload(await _collect())
    assert done["verified"] is True
    assert done["intent"] == "lookup"


@pytest.mark.anyio
async def test_ask_stream_unknown_marker_is_unverified(caplog):
    """Citing [7] with only 3 contexts → verified=False + warning logged."""
    app.state.retriever.search = AsyncMock(return_value=[_make_result(i) for i in (1, 2, 3)])
    app.state.reranker.rerank = AsyncMock(return_value=[_make_result(i) for i in (1, 2, 3)])
    app.state.provider.stream_generate = _stream_of(["Lihat ", "[7]"])

    with caplog.at_level(logging.WARNING):
        done = _done_payload(await _collect())

    assert done["verified"] is False
    assert any("unknown markers" in r.message for r in caplog.records)


@pytest.mark.anyio
async def test_ask_stream_no_markers_is_unverified():
    """An answer that cites nothing is unverifiable by definition → verified=False."""
    app.state.provider.stream_generate = _stream_of(["Tidak ada kutipan di sini."])
    done = _done_payload(await _collect())
    assert done["verified"] is False


# ── STEP 4: aggregate path streams the SQL total, not model arithmetic ───────

@pytest.mark.anyio
async def test_ask_stream_aggregate_carries_sql_total_in_payload():
    """Aggregate: metadata + done both carry total_idr from SQL; verified=True."""
    app.state.planner.plan = AsyncMock(
        return_value=QueryPlan(intent="aggregate", categories=["Food"], flow="DB"))
    app.state.aggregator.aggregate = AsyncMock(
        return_value=AggregateResult(total_idr=Decimal("2309954"), count=43,
                                     rows=[_make_result(1)]))
    app.state.provider.stream_generate = _stream_of(["Totalnya ", "Rp 999.999"])  # disobeys

    events = await _collect("berapa pengeluaran makan april?")
    meta = _metadata_payload(events)
    done = _done_payload(events)

    assert meta["intent"] == "aggregate"
    assert meta["total_idr"] == 2309954.0
    assert meta["count"] == 43
    assert done["intent"] == "aggregate"
    assert done["total_idr"] == 2309954.0      # SQL total — not the prose's 999999
    assert done["verified"] is True


@pytest.mark.anyio
async def test_ask_stream_aggregate_zero_rows_refuses():
    """Aggregate with no matching rows → confident=False, total_idr 0, no tokens."""
    app.state.planner.plan = AsyncMock(
        return_value=QueryPlan(intent="aggregate", categories=["Food"]))
    app.state.aggregator.aggregate = AsyncMock(
        return_value=AggregateResult(total_idr=Decimal("0"), count=0, rows=[]))

    events = await _collect("pengeluaran makan bulan depan?")
    assert not any(e == "token" for e, _ in events)
    done = _done_payload(events)
    assert done["confident"] is False
    assert done["total_idr"] == 0.0
