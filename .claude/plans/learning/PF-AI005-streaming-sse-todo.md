# PF-AI005 — Streaming + Production UX (SSE)

> **Learning Phase:** Phase 2 · Chapter 5 of 12 · Day ~20+ of 90
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Pivot goal:** Ship token-by-token streaming. Every modern AI product streams — knowing how to implement SSE in FastAPI, wire it to both LLM providers, and consume it in React is a concrete differentiator. This chapter also replaces the polling-based upload status with Supabase Realtime, closing one of the oldest UX debt items in the codebase.

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

`POST /ask` (PF-AI004) already answers questions about your transactions — but it answers all at
once, after retrieval, reranking, and generation are *all* done. This chapter turns that into a
live stream: the server pushes retrieved context the instant retrieval finishes, then pushes the
answer one token at a time as the LLM generates it, over a single HTTP connection the browser
keeps open. The same pattern — push small updates to the client without the client asking again —
also replaces the upload-status polling loop with a real subscription.

```
Client (ChatPage)                    AI Service (FastAPI /ask/stream)
   |  POST /ask/stream {query}              |
   |---------------------------------------->|
   |                                         |-- retrieve (pgvector) + rerank (FlashRank)
   |   event: metadata {contexts: [...]}     |
   |<-----------------------------------------|   citations render NOW — before any token
   |                                         |-- provider.stream_generate() starts
   |   event: token "Total"                  |
   |<-----------------------------------------|
   |   event: token " pengeluaran"           |
   |<-----------------------------------------|
   |   event: token " Rp 50.000"             |
   |<-----------------------------------------|
   |   event: done                           |
   |<-----------------------------------------|
```

## Why stream + the SSE choice

**Rung 0 — the naive version that works.** `POST /ask` already returns a correct, grounded
answer: retrieve → rerank → generate → return one JSON blob. It's right, it's simple, and it
shipped last chapter.

> **The wall:** Gemini synthesis takes 2–6 seconds. Ask "berapa total pengeluaran makan bulan
> Maret?" and the UI just shows a spinner for that whole window. Every AI product you actually use
> day to day — ChatGPT, Claude.ai — never makes you stare at a blank screen that long; they show
> the answer building word by word. A blocking spinner reads as broken, even though the backend is
> working correctly.

**Rung 1 — stream the tokens.** Instead of waiting for the full answer, push each piece of text to
the client the moment the model produces it. The user sees the first word in ~150ms instead of
waiting 2–6s for the whole thing — perceived latency collapses even though total generation time
is unchanged.

> **The wall:** HTTP is normally one request → one response. How do you keep pushing more data to
> the client *after* the initial response has started, without the client re-asking?

**Rung 2 — Server-Sent Events.** **SSE** (a long-lived HTTP response the server keeps writing to)
is unidirectional (server → client), rides on plain HTTP (no protocol upgrade, no special proxy
config), and the browser auto-reconnects if the connection drops. For "client sends one query,
server streams tokens back," that's exactly the shape needed — no bidirectional channel required.

> **The wall:** the React chat UI needs to POST a JSON body (`{"query": "...", "category": "..."}`)
> to *start* the stream. The browser's native `EventSource` API is GET-only — it can't send a body
> or custom headers, so it can't kick off this request at all.

**Rung 3 — `@microsoft/fetch-event-source` (what ships).** This library wraps `fetch()` instead of
`EventSource`, so it supports POST bodies, custom headers, and an `AbortController` to cancel —
while keeping the same auto-reconnect semantics SSE promises. *This is what `chatApi.ts` ships.*

> **Teaser, not taught here:** WebSockets give you a full bidirectional channel — the client can
> push messages back at any time. That's the right tool for chat *rooms*, multiplayer, or
> collaborative editing, where both sides talk continuously. Here the client only ever sends one
> request and then listens — bidirectional is overhead this chapter doesn't need.

▶ **Watch/read for this concept:** https://github.com/sysid/sse-starlette and
[MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

## Provider streaming (async generators)

**Rung 0 — the naive version that works.** `provider.generate_json()` already calls the LLM and
returns the complete answer as one return value, once the model is fully done generating.

> **The wall:** to stream to the client, the *provider* needs to hand back text incrementally too
> — there's no way to stream out of FastAPI tokens you don't have yet. A function that `return`s
> once, at the very end, can't feed an SSE generator that needs to `yield` repeatedly while
> generation is still in progress.

**Rung 1 — an async generator.** Write `stream_generate()` as `async def` with `yield` instead of
`return`: each `yield text` hands one chunk to whoever is iterating with `async for`, before the
function continues to the next chunk. Typed as `AsyncGenerator[str, None]` — text out, nothing
sent in.

> **The wall:** if the underlying SDK call inside that `async def` is actually synchronous and
> blocking (e.g. a plain `client.generate_content(...)` that doesn't return until the whole answer
> is ready), it freezes the entire event loop for that whole duration — every other concurrent
> request on the service (health checks, another user's search, another user's stream) stalls
> until it returns. Wrapping a blocking call in `async def` doesn't make it non-blocking.

**Rung 2 — native async streaming, with a thread-pool fallback (what ships).** Use the SDK's real
async streaming entry point — `client.messages.stream()` for Anthropic, `client.aio.models.
generate_content_stream()` for Gemini — so the event loop stays free while tokens arrive. Where the
installed SDK version doesn't expose async streaming yet, `asyncio.to_thread(...)` pushes the
blocking call onto a worker thread instead of the event loop — it loses true incremental
streaming (all text still arrives at once) but at least stops it from stalling other requests.
*This is what `AnthropicProvider.stream_generate()` / `GeminiProvider.stream_generate()` ship.*

▶ **Watch/read for this concept:** https://docs.anthropic.com/en/api/messages-streaming

## Realtime vs polling (upload status)

**Rung 0 — the naive version that works.** The upload wizard polls `GET /api/uploads/{id}/status`
every 2 seconds and updates the UI when the status changes. Simple, and it's been working.

> **The wall:** that's up to 2 seconds of pure waiting between the backend actually finishing and
> the UI noticing, *plus* the client is firing a request every 2 seconds for the entire processing
> window even when nothing has changed yet — wasted requests, wasted load, for a one-time status
> flip.

**Rung 1 — Supabase Realtime.** Instead of asking repeatedly, open one subscription on the
`uploads` table and let Postgres push the change the moment it happens — a `postgres_changes`
event arrives in ~50ms instead of up to 2000ms, and there's no polling loop running at all.

> **The wall:** subscribe with the anon key in local dev and... nothing arrives. No error, no
> exception — the channel reports "subscribed" successfully, but zero events ever fire. The
> subscription is silently filtered: Row Level Security quietly drops any row the subscribing role
> can't `SELECT`, and the failure is invisible unless you already know to suspect RLS.

**Rung 2 — RLS scoped to actually allow the read (what ships).** A permissive `USING (true)`
policy on `uploads` for local dev lets the anon key read (and therefore receive change events for)
every row; in production this narrows to a policy scoped to the authenticated owner of the upload.
*This is the fix `useUploadStatus.ts` ships with for local dev — production scoping is called out
explicitly as a follow-up.*

▶ **Watch/read for this concept:** https://supabase.com/docs/guides/realtime


# 🔧 Implementation

## 🎯 Objective

PF-AI004 built `POST /ask` — a grounded Q&A endpoint that returns a complete answer after retrieval + generation. The UX problem: Gemini synthesis takes 2–6s per response; the user stares at a spinner. Token streaming collapses perceived latency to near-zero — the first token appears within ~150ms and the answer builds in front of the user.

This chapter:
1. **Adds `stream_generate()` to the `LlmProvider` protocol** — Anthropic and Gemini both support async streaming; this wires it into the existing provider abstraction without touching anything that calls `generate_json`.
2. **Builds `POST /ask/stream`** — an SSE endpoint that streams tokens from the retrieval + generation pipeline. Three event types: `metadata` (retrieved contexts, sent before generation so citations appear immediately), `token` (each text chunk as it arrives), `done` (signal with grounding summary).
3. **Builds the React chat UI** on `/chat` — `@microsoft/fetch-event-source` (POST support, header support, auto-reconnect) consuming the SSE stream; token-by-token rendering with a blinking cursor; citation panel that populates from the `metadata` event.
4. **Replaces polling upload status with Supabase Realtime** — installs `@supabase/supabase-js` (pre-empting PF-S09), subscribes to the `uploads` table for real-time processing status. The polling loop in the upload wizard becomes a subscription.

**Depends on:** PF-AI004 (`POST /ask`, `AnswerService`, `RerankerService`, `app.state.reranker`, `app.state.answerer` — must be wired before `POST /ask/stream` can be built in Step 5)
**Unblocks:** Chapter 8 (LangGraph agent needs a streaming interface); Chapter 10 demo Loom (the "RAG chat: ask and see it stream" segment requires this chapter)

## ✅ Acceptance Criteria

- [ ] `LlmProvider` protocol (base.py) has `stream_generate(system_prompt, user_prompt) -> AsyncGenerator[str, None]`
- [ ] `AnthropicProvider.stream_generate()` yields tokens via `client.messages.stream()` async context manager
- [ ] `GeminiProvider.stream_generate()` yields tokens via async streaming call; tested against the installed SDK version
- [ ] `POST /ask/stream` exists; emits `metadata`, `token`, and `done` SSE events in that order; never buffers; returns `text/event-stream` content type
- [ ] Connection drop is handled cleanly: the generator checks `request.is_disconnected()` each yield and exits without error
- [ ] React `chatApi.ts` uses `@microsoft/fetch-event-source` (POST-capable); `onToken`, `onMetadata`, `onDone`, `onError` handlers; `AbortController` exposed to callers
- [ ] `/chat` route exists in `App.tsx` and renders `ChatPage`
- [ ] `ChatPage` streams tokens into the assistant bubble in real-time; citations render from the `metadata` event; a blinking cursor shows while streaming
- [ ] Upload wizard replaces polling with a Supabase Realtime subscription (channel on the `uploads` table); `@supabase/supabase-js` installed
- [ ] `tests/test_streaming.py` passes (mocked `stream_generate`, verifies event order + payload shape via `httpx.AsyncClient`)
- [ ] `pyproject.toml` updated: `sse-starlette>=2.1`
- [ ] `apps/frontend/package.json`: `@microsoft/fetch-event-source`, `@supabase/supabase-js`
- [ ] No buffering verified: `curl --no-buffer` shows tokens arriving progressively, not in a single burst

## 🧭 Approach

**SSE over WebSockets — why.** SSE is unidirectional (server → client), standard HTTP (no upgrade handshake, no proxy issues), auto-reconnects on drop, and works with any CDN. WebSockets are bidirectional — justified for chat rooms, multiplayer, collaborative editing; overkill for token streaming. The only gap SSE has vs WebSockets is POST support in the browser — native `EventSource` is GET-only. `@microsoft/fetch-event-source` closes that gap.

**React calls the Python AI service directly for SSE** — not through the .NET API proxy. Streaming proxying through ASP.NET Core requires an extra async forward layer, and auth isn't wired yet anyway. Direct SSE from React to FastAPI is simpler, CORS-configured, and defers the proxy question to PF-S08 (auth). This is a scoped decision — note it for the PF-S08 auth integration story.

**Citation design for streaming: `metadata` event, not a `done` event.** In the non-streaming `/ask`, the LLM returns `cited_transaction_ids` in the structured response — we can validate them post-generation. In streaming mode, we don't have structured output until the stream finishes. The solution: send the retrieved contexts as a `metadata` event *before* generation starts. The React UI renders them immediately as "Sources" — the user sees citations before the answer begins. This is better UX than the non-streaming version anyway. The `done` event is purely a signal (no payload needed).

**Why the `metadata`-first pattern works:** The retrieval step (pgvector + rerank) is already complete before the first token is yielded. We know the top-3 contexts. Surfacing them immediately lets the user see *where the answer will come from* — trust-building, not just UX. This pattern is the right mental model for grounded RAG chat.

**CORS for the AI service.** `CORS_ORIGINS` env var is already in `app/config.py`. Add `http://localhost:8080` (the frontend dev server) to allow the direct SSE call.

**Supabase Realtime for upload status.** The upload wizard currently polls `GET /api/uploads/{id}/status` every 2s. Replacing it with a Supabase Realtime subscription on the `uploads` table eliminates the polling loop and surfaces status changes in ~50ms instead of up to 2s. This also installs `@supabase/supabase-js` on the frontend (pre-empting PF-S09's Supabase Auth work — acceptable, it's the same package).

Out of scope: conversation memory (Chapter 8), streaming the categorization step (not needed), hybrid BM25 search (Chapter 6), .NET proxy for `/ask/stream` with auth (PF-S08).

## 📂 Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/providers/base.py` | Edit — add `stream_generate()` to `LlmProvider` Protocol |
| `services/ai-service/app/providers/anthropic.py` | Edit — implement `stream_generate()` via messages.stream() |
| `services/ai-service/app/providers/gemini.py` | Edit — implement `stream_generate()` via async streaming |
| `services/ai-service/app/main.py` | Edit — add `POST /ask/stream`; wire `app.state.provider` in lifespan |
| `services/ai-service/app/config.py` | Edit — verify `cors_origins` includes frontend origin |
| `services/ai-service/pyproject.toml` | Edit — add `sse-starlette>=2.1` |
| `services/ai-service/tests/test_streaming.py` | Create — unit tests for SSE event order + payload shape |
| `apps/frontend/src/api/chatApi.ts` | Create — `streamAsk()` using fetch-event-source |
| `apps/frontend/src/pages/ChatPage.tsx` | Create — streaming chat UI |
| `apps/frontend/src/App.tsx` | Edit — add `/chat` route |
| `apps/frontend/package.json` | Edit — add `@microsoft/fetch-event-source`, `@supabase/supabase-js` |
| `apps/frontend/src/lib/supabase.ts` | Create — Supabase client singleton |
| `apps/frontend/src/hooks/useUploadStatus.ts` | Edit — replace polling with Realtime subscription |


## 📋 TODO

### [ ] STEP 0 — Prerequisite gate: PF-AI004 done + theory pre-read (30 min)

Verify Chapter 4 is complete before building:

```bash
cd services/ai-service
# Confirm /ask endpoint is live
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | head -5
```

If that returns `{"answer":...}`, the gate is open.

**Theory pre-read (in this order — active retrieval after each):**

1. FastAPI `StreamingResponse` → https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse (5 min — skim the generator pattern)
2. `sse-starlette` README → https://github.com/sysid/sse-starlette (10 min — focus on `EventSourceResponse` and the event dict format `{"event": "...", "data": "..."}`)
3. Anthropic streaming → https://docs.anthropic.com/en/api/messages-streaming (10 min — find the `client.messages.stream()` async context manager and `.text_stream`)

**Active-retrieval task:** Close all tabs. Write from memory:
- Why does SSE auto-reconnect but WebSockets don't?
- Why is native `EventSource` insufficient for this use case?
- What are the three SSE event types in the `POST /ask/stream` design and what does each contain?

> **Why theory here:** SSE has two non-obvious rules that bite beginners: (1) the content type must be exactly `text/event-stream` with no charset suffix, (2) `data:` lines must end with `\n\n` (double newline) to be parsed as a complete event. `sse-starlette` handles both — but knowing the protocol helps debug when the browser EventSource shows no events.

> **The interview frame:** "I chose SSE over WebSockets for token streaming because it's unidirectional (server → client is all I need), standard HTTP (no upgrade, no proxy issues, CDN-compatible), and auto-reconnects. The only limitation is POST support — native `EventSource` is GET-only, so I used `@microsoft/fetch-event-source` on the React side, which wraps `fetch()` with the same reconnection semantics."


### [ ] STEP 1 — Extend `LlmProvider` protocol: add `stream_generate()`

Edit `services/ai-service/app/providers/base.py`:

```python
from __future__ import annotations
from collections.abc import AsyncGenerator
from typing import Protocol, runtime_checkable


@runtime_checkable
class LlmProvider(Protocol):
    async def extract_structured(
        self, system_prompt: str, user_text: str, schema: dict, image=None
    ) -> dict: ...

    async def generate_json(
        self, system_prompt: str, user_prompt: str, schema: dict
    ) -> dict: ...

    async def stream_generate(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncGenerator[str, None]: ...
```

> **Why `AsyncGenerator[str, None]` and not `AsyncIterable`?** Both work for `async for` consumption, but `AsyncGenerator` makes it explicit that this is a generator (supports `asend`, `athrow`, `aclose`) — important when the caller needs to cancel mid-stream. The `None` is the `send()` type; generators that only yield (never receive) use `None` for send and return types.

> **Why not add a return value annotation?** The generator finishes when the LLM stream ends — no return value semantics needed. The `done` SSE event is the caller's responsibility, not the generator's.


### [ ] STEP 2 — Implement `stream_generate()` in `AnthropicProvider`

Edit `services/ai-service/app/providers/anthropic.py`:

```python
from collections.abc import AsyncGenerator

class AnthropicProvider:
    # ... existing __init__, extract_structured, generate_json unchanged ...

    async def stream_generate(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncGenerator[str, None]:
        """Stream raw tokens from the Anthropic messages API."""
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
```

The Anthropic SDK's `messages.stream()` async context manager returns a `Stream` object whose `.text_stream` is an async iterator of text deltas. The context manager handles cleanup on exit — including on cancelled/aborted streams.

```bash
# Quick smoke test (service running, not the main test suite)
python -c "
import asyncio
from app.config import settings
from app.providers.anthropic import AnthropicProvider

async def test():
    p = AnthropicProvider(settings.anthropic_api_key)
    async for tok in await p.stream_generate('You are brief.', 'Say hi in one word.'):
        print(tok, end='', flush=True)
    print()

asyncio.run(test())
"
```

> **Why `max_tokens=1024` and not higher?** Chat answers are short (1–3 sentences with citations); 1024 tokens gives ~750 words. The extraction pipeline uses 4096 because statements can be long. For streaming answers, budget 1024 — it's cheaper and the stop signal comes naturally from the model when the answer is complete.

> **C# equivalent of `async foreach` over a stream:**
>
> ```csharp
> // Anthropic Python: async for text in stream.text_stream
> // C# equivalent using HttpClient streaming:
> await foreach (var chunk in httpClient.GetFromJsonAsAsyncEnumerable<TokenChunk>(url, ct))
>     yield return chunk.Text;
> // Same pattern: async generator in Python ↔ IAsyncEnumerable<T> in C#
> ```


### [ ] STEP 3 — Implement `stream_generate()` in `GeminiProvider`

Edit `services/ai-service/app/providers/gemini.py`:

```python
from collections.abc import AsyncGenerator
from google import genai

class GeminiProvider:
    # ... existing methods unchanged ...

    async def stream_generate(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncGenerator[str, None]:
        """Stream raw tokens from the Gemini async streaming API."""
        client = self._get_client()
        async for chunk in await client.aio.models.generate_content_stream(
            model=self._model,
            contents=user_prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        ):
            if chunk.text:
                yield chunk.text
```

> **⚠ SDK version note:** The `client.aio.models.generate_content_stream()` call is the async variant in `google-genai>=1.0`. If your installed version uses a different async pattern (`generate_content_async` or the old `GenerativeModel` class), adjust accordingly. Run `pip show google-generativeai google-genai` to confirm which package and version is installed.
>
> If the async streaming call isn't available in the installed version, fall back:
> ```python
> # Sync fallback — runs off the event loop to avoid blocking
> import asyncio
> chunks = await asyncio.to_thread(
>     client.models.generate_content,
>     model=self._model, contents=user_prompt,
>     config=genai.types.GenerateContentConfig(system_instruction=system_prompt, temperature=0.7),
>     # Note: this loses true streaming — all tokens arrive at once after generation
> )
> yield chunks.text
> ```
> If you hit this, document it in `docs/performances/ai-observability-metrics.md` and note that Gemini streaming will be a no-op until the SDK supports async streaming in your version.


### [ ] STEP 4 — Install `sse-starlette`; expose `app.state.provider`

```bash
cd services/ai-service && pip install sse-starlette
```

Add to `pyproject.toml` dependencies:
```toml
    "sse-starlette>=2.1",
```

Edit `app/main.py` lifespan to expose the provider instance on `app.state`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    embedding_provider = create_embedding_provider(settings)
    # ... existing state registrations ...
    app.state.provider = provider   # ← ADD THIS (AnswerService needs it too)
    yield
```

`app.state.provider` is needed by `POST /ask/stream` to call `provider.stream_generate()`.


### [ ] STEP 5 — Build `POST /ask/stream` SSE endpoint

Edit `services/ai-service/app/main.py`:

```python
import json
from sse_starlette.sse import EventSourceResponse

@app.post("/ask/stream")
async def ask_stream(request: AskRequest, req: Request) -> EventSourceResponse:
    """Stream the RAG answer token-by-token over SSE.

    Event protocol:
      metadata  → JSON: {contexts: [{transaction_id, date, description, amount_idr, flow, wallet},...]}
      token     → string: one text chunk from the LLM
      done      → empty string: generation complete
    """
    async def event_generator():
        # 1. Retrieval + reranking (fast, synchronous-ish, ~100ms)
        candidates = await app.state.retriever.search(
            query=request.query, top_k=10,
            category=request.category, account=request.account,
            date_from=request.date_from, date_to=request.date_to,
        )
        contexts = await app.state.reranker.rerank(
            request.query, candidates, top_k=request.top_k or 3
        )

        if not contexts:
            yield {"event": "done", "data": json.dumps({"confident": False, "contexts": []})}
            return

        # 2. Send contexts BEFORE generation — client can render citations immediately
        context_payload = [
            {
                "transaction_id": r.transaction_id,
                "date": r.date,
                "description": r.description,
                "amount_idr": r.amount_idr,
                "flow": r.flow,
                "wallet": r.wallet,
            }
            for r in contexts
        ]
        yield {"event": "metadata", "data": json.dumps({"contexts": context_payload})}

        # 3. Build the same user prompt as AnswerService
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )

        # 4. Stream generation tokens
        try:
            async for token in app.state.provider.stream_generate(SYSTEM_PROMPT, user_prompt):
                if await req.is_disconnected():
                    break       # client closed — stop generation, avoid wasteful LLM call
                yield {"event": "token", "data": token}
        except Exception:
            logger.exception("stream_generate failed")
            yield {"event": "error", "data": json.dumps({"detail": "generation_failed"})}
            return

        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())
```

**Key: `req: Request` injection.** FastAPI injects the Starlette `Request` object alongside the Pydantic body. `await req.is_disconnected()` polls the ASGI transport — when the client closes the connection (browser tab closed, `AbortController.abort()`), this returns `True` and the generator exits cleanly. Without this check, the LLM call continues burning tokens for a disconnected client.

**CORS config.** In `app/main.py`, verify `CORSMiddleware` allows the frontend origin:

```python
# In main.py (already present — add the Vite dev server if not there)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),  # env: CORS_ORIGINS=http://localhost:8080
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Add `CORS_ORIGINS=http://localhost:8080` to `.env` for local dev.

Smoke test (service running, embeddings backfilled):

```bash
curl -N --no-buffer -X POST http://localhost:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "berapa total pengeluaran makan bulan Maret?"}'
```

Expected output: `metadata` event first, then a stream of `token` events, then `done`. The `-N --no-buffer` flag is essential — without it, curl buffers the response and you see nothing until the stream ends.

> **Why check `is_disconnected()` after each yield, not before?** The yield itself blocks until the token is sent. If the client disconnects *during* the yield, the ASGI server raises a `BrokenPipeError` or similar, which the generator catches at the `async for` level. The `is_disconnected()` check catches the case where the client disconnects *between* tokens — the more common scenario (user presses Stop).

> **The interview frame:** "SSE generators in FastAPI need explicit disconnect detection — unlike WebSockets, there's no close event pushed to the server. I check `request.is_disconnected()` between token yields. That stops the LLM call when the user closes the tab, which saves ~$0.001 per aborted stream at personal volume but adds up at production scale."


### [ ] STEP 6 — Write `tests/test_streaming.py`

```python
"""Unit tests for POST /ask/stream SSE endpoint.

Uses httpx.AsyncClient with the FastAPI test transport — no real LLM, no DB.
"""
import json
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import httpx
from fastapi.testclient import TestClient

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
def wire_app_state(monkeypatch):
    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[_make_result(1)])
    mock_reranker = AsyncMock()
    mock_reranker.rerank = AsyncMock(return_value=[_make_result(1)])
    mock_provider = MagicMock()
    mock_provider.stream_generate = _fake_stream

    app.state.retriever = mock_retriever
    app.state.reranker = mock_reranker
    app.state.provider = mock_provider


def test_ask_stream_event_order():
    """Events must arrive as: metadata → token(s) → done."""
    client = TestClient(app)
    with client.stream("POST", "/ask/stream", json={"query": "makan maret"}) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]

        events = []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())

    assert events[0] == "metadata"
    assert "token" in events
    assert events[-1] == "done"


def test_ask_stream_metadata_contains_contexts():
    """The metadata event payload must include transaction context."""
    client = TestClient(app)
    metadata_data = None
    with client.stream("POST", "/ask/stream", json={"query": "makan maret"}) as r:
        event_type = None
        for line in r.iter_lines():
            if line.startswith("event:"):
                event_type = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and event_type == "metadata":
                metadata_data = json.loads(line.split(":", 1)[1].strip())
                break

    assert metadata_data is not None
    assert "contexts" in metadata_data
    assert metadata_data["contexts"][0]["transaction_id"] == 1


def test_ask_stream_no_contexts_sends_done_with_not_confident():
    """Empty retrieval → single done event with confident=False, no token events."""
    app.state.retriever.search = AsyncMock(return_value=[])
    app.state.reranker.rerank = AsyncMock(return_value=[])

    client = TestClient(app)
    events = []
    with client.stream("POST", "/ask/stream", json={"query": "future 2031"}) as r:
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())

    assert "token" not in events
    assert "done" in events
```

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_streaming.py -v
```


### [ ] STEP 7 — React: install deps + `chatApi.ts`

```bash
cd apps/frontend
npm install @microsoft/fetch-event-source @supabase/supabase-js
```

Create `apps/frontend/src/api/chatApi.ts`:

```typescript
import { fetchEventSource } from "@microsoft/fetch-event-source";

export interface ContextItem {
  transaction_id: number;
  date: string;
  description: string;
  amount_idr: number;
  flow: "DB" | "CR";
  wallet: string;
}

export interface AskStreamParams {
  query: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  account?: string;
  top_k?: number;
}

const AI_URL = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

export function streamAsk(
  params: AskStreamParams,
  handlers: {
    onMetadata: (contexts: ContextItem[]) => void;
    onToken: (token: string) => void;
    onDone: () => void;
    onError: (err: unknown) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetchEventSource(`${AI_URL}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
    openWhenHidden: true,   // don't pause when tab is hidden
    onmessage(msg) {
      if (msg.event === "metadata") {
        const data = JSON.parse(msg.data) as { contexts: ContextItem[] };
        handlers.onMetadata(data.contexts ?? []);
      } else if (msg.event === "token") {
        handlers.onToken(msg.data);
      } else if (msg.event === "done") {
        handlers.onDone();
      } else if (msg.event === "error") {
        handlers.onError(new Error(msg.data));
      }
    },
    onerror(err) {
      handlers.onError(err);
      throw err;    // stops fetch-event-source from auto-retrying on errors
    },
  });

  return controller;
}
```

Add `VITE_AI_SERVICE_URL=http://localhost:8000` to `apps/frontend/.env` (or `.env.local`).

> **Why `openWhenHidden: true`?** By default `fetch-event-source` pauses the connection when the browser tab is hidden (Page Visibility API). For a finance chat, the user might switch tabs while waiting — we don't want to lose the streaming answer mid-sentence. Set `openWhenHidden: true` to keep the connection open.

> **Why `throw err` in `onerror`?** `fetch-event-source` auto-retries on network errors. For a chat app, silent retries are bad UX — the user already sees the chat stuck. Throw to break the retry loop; the `onError` handler surfaces the error to the UI.


### [ ] STEP 8 — Build `ChatPage.tsx` and wire the `/chat` route

Create `apps/frontend/src/pages/ChatPage.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { streamAsk, type ContextItem } from "@/api/chatApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!input.trim() || streaming) return;
    const query = input.trim();

    setMessages(prev => [...prev, { role: "user", content: query }, { role: "assistant", content: "" }]);
    setContexts([]);
    setInput("");
    setStreaming(true);

    abortRef.current = streamAsk(
      { query },
      {
        onMetadata: setContexts,
        onToken: (token) => {
          setMessages(prev => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") last.content += token;
            return [...msgs];
          });
        },
        onDone: () => setStreaming(false),
        onError: () => setStreaming(false),
      }
    );
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat with your finances</h1>
        {streaming && (
          <button onClick={stop} className="text-xs text-muted-foreground hover:text-foreground">
            Stop
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Tanyakan tentang pengeluaran, tabungan, atau investasimu.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "p-3 rounded-lg text-sm",
                m.role === "user" ? "bg-muted ml-8" : "bg-card border mr-8"
              )}
            >
              {m.content}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          ))}

          {contexts.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 pl-1">
              <p className="font-medium text-foreground/60">Sumber transaksi</p>
              {contexts.map((c, i) => (
                <p key={c.transaction_id}>
                  [{i + 1}] {c.date} · {c.description} ·{" "}
                  <span className={c.flow === "DB" ? "text-destructive" : "text-green-600"}>
                    {c.flow === "DB" ? "−" : "+"}Rp {c.amount_idr.toLocaleString("id-ID")}
                  </span>
                </p>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Berapa pengeluaran makan bulan ini?"
          disabled={streaming}
          className="flex-1"
        />
        <Button onClick={send} disabled={streaming || !input.trim()} size="sm">
          Kirim
        </Button>
      </div>
    </div>
  );
}
```

Edit `apps/frontend/src/App.tsx` — add the `/chat` route:

```tsx
import ChatPage from "@/pages/ChatPage";

// Inside <Routes>:
<Route path="/chat" element={<ChatPage />} />
```

Also add "Chat" to the sidebar nav in the layout component.

> **Lazy import:** if the frontend grows, wrap `ChatPage` in `React.lazy()` + `Suspense` to avoid adding it to the initial bundle. Not needed now.


### [ ] STEP 9 — Supabase Realtime: replace upload status polling

Create `apps/frontend/src/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(url, key);
```

Add to `apps/frontend/.env`:
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-local-anon-key>
```

(The local anon key is in `apps/api/appsettings.Development.json` or output from `supabase status`.)

Edit `apps/frontend/src/hooks/useUploadStatus.ts` — replace the polling interval with a Realtime subscription:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UploadStatus = "processing" | "done" | "failed";

export function useUploadStatus(uploadId: string | null) {
  const [status, setStatus] = useState<UploadStatus | null>(null);

  useEffect(() => {
    if (!uploadId) return;

    // Subscribe to changes on the uploads row
    const channel = supabase
      .channel(`upload-${uploadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "uploads",
          filter: `id=eq.${uploadId}`,
        },
        (payload) => {
          setStatus((payload.new as { status: UploadStatus }).status);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [uploadId]);

  return status;
}
```

> **Supabase Realtime prerequisites:** the `uploads` table must have Realtime enabled. In Supabase Studio → Table Editor → `uploads` → Realtime toggle. For local dev, also ensure `supabase start` is running (it includes the Realtime service).

> **If the `uploads` table doesn't track processing status yet:** the current upload flow writes to a Supabase bucket but doesn't write a `status` column back (this is the PF-S11 dead-code stub). The Realtime hook will silently never fire. For now, wire the hook but keep the existing polling as a fallback — the hook is the right direction, and it will activate when PF-S11 wires the webhook → status update flow.

> **The interview frame:** "I replaced polling-based upload status with a Supabase Realtime subscription. The client opens a WebSocket channel to Supabase and receives table-change events within ~50ms of the backend writing a status update, instead of the previous 2-second polling interval. This also installed `@supabase/supabase-js` on the frontend, pre-empting the Supabase Auth integration work."


### [ ] STEP 10 — No-buffer verification + load test check

Verify the stream is not buffered:

```bash
# Must see tokens arriving progressively — not all at once
curl -N --no-buffer -X POST http://localhost:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "berapa pengeluaran makan bulan Maret?"}'
```

If all tokens arrive simultaneously at the end, buffering is happening. Check:
1. **Nginx/reverse proxy:** ensure `proxy_buffering off` and `X-Accel-Buffering: no`
2. **Python stdout buffering:** `PYTHONUNBUFFERED=1` in Docker/env
3. **sse-starlette version:** ensure `>=2.1` (earlier versions had buffering bugs)

Test dropped connection — open the stream in curl, press Ctrl+C mid-stream, then check the service logs:

```bash
# In one terminal — start the stream
curl -N --no-buffer -X POST http://localhost:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "pengeluaran tahun ini?"}'
# In ~2 seconds, Ctrl+C
```

Expected: service log shows the generator exited cleanly (no stack trace, just a log line about disconnect). If you see a `BrokenPipeError` in the logs, add better exception handling around the `async for token in ...` loop.


### [ ] STEP 11 — Record metrics + commit

Record in `docs/performances/ai-observability-metrics.md`:

```markdown
## Streaming / SSE (PF-AI005)

| Metric | Value |
|--------|-------|
| Time-to-first-token (TTFT) — /ask/stream p50 | ~XXXms |
| Time-to-first-token (TTFT) — /ask/stream p95 | ~XXXms |
| Total stream duration p50 (chat-length answer) | ~X.Xs |
| vs /ask (non-streaming) p50 | ~X.Xs (same work, different UX) |
| Tokens streamed per second (Gemini 2.5 Flash) | ~XX tok/s |
| Connection drop handled cleanly | ✅ verified (curl Ctrl+C test) |
| No-buffer verified | ✅ curl --no-buffer shows progressive arrival |
```

Measure TTFT by noting the wall time between sending the `curl` POST and seeing the first `token` event. The key number is TTFT — this is the number that justifies streaming: `POST /ask` blocks for ~3s before returning anything; `/ask/stream` starts delivering within ~150ms.

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_streaming.py -v
cd apps/frontend && npm run build && npm run lint    # no type errors in chatApi.ts / ChatPage
```

Commit:
```bash
cd c:\workspaces\personal-finance
git add services/ai-service/app/providers/base.py
git add services/ai-service/app/providers/anthropic.py
git add services/ai-service/app/providers/gemini.py
git add services/ai-service/app/main.py
git add services/ai-service/app/config.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_streaming.py
git add apps/frontend/src/api/chatApi.ts
git add apps/frontend/src/pages/ChatPage.tsx
git add apps/frontend/src/App.tsx
git add apps/frontend/src/lib/supabase.ts
git add apps/frontend/src/hooks/useUploadStatus.ts
git add apps/frontend/package.json
git add docs/performances/ai-observability-metrics.md
git status    # verify no .env files
git commit -m "PF-AI005: streaming SSE — /ask/stream, React chat UI, Supabase Realtime upload status"
```


### [ ] STEP 12 — Log progress

```
/mentor log Built streaming SSE chapter: stream_generate() on Anthropic+Gemini providers, POST /ask/stream (metadata→token→done event protocol, disconnect guard), React chat UI with @microsoft/fetch-event-source (TTFT ~XXXms), Supabase Realtime upload status replacing polling. Chapter 5 complete.
```


## 📌 Notes

- **Chapter 4 gate.** `POST /ask/stream` reuses `SYSTEM_PROMPT` and `_format_context()` from `answerer.py`. Make sure PF-AI004 is committed and the functions are importable before Step 5.
- **`app.state.provider` vs `app.state.answerer.provider`.** The streaming endpoint calls `provider.stream_generate()` directly — not via `AnswerService`. That's fine: `AnswerService.ask()` returns a complete `AskResponse`; a streaming variant would need a different return type. For now, keep them separate. If a streaming `AnswerService.stream_ask()` method is added later, it's the right seam.
- **Gemini streaming maturity.** As of early 2026, Gemini's async streaming API is stable but the exact method path differs across `google-genai` SDK versions. If `client.aio.models.generate_content_stream()` doesn't exist, check the installed SDK changelog and adjust. Note the installed version in the metrics doc.
- **VITE_AI_SERVICE_URL env var.** The frontend's `.env` needs this for direct AI service access. It's new — add it to `.env.example` as well. Don't commit real values.
- **TTFT is the demo metric.** For the Chapter 10 Loom demo, the streaming segment is most effective if you visibly delay the question and let the viewer watch the first token appear in ~150ms. Quote TTFT in the demo narration.
- **Supabase Realtime + RLS.** The `postgres_changes` subscription on `uploads` will silently return no events if RLS is enabled and the anon key can't read the row. For local dev with permissive `USING (true)` RLS policies, this works. In production, either use the service role key (server-side only) or scope the policy.
- **Deferred:** streaming the categorization step (not needed — it's fast), streaming the portfolio review (Chapter 10 demo), conversation history (Chapter 8), .NET `/ask/stream` proxy with auth (PF-S08).
- **THINK-05 (frozen contract):** `AskRequest` / `AskResponse` / `Citation` were frozen when `.NET` could proxy `/ask`. The streaming endpoint introduces a new SSE protocol — document it separately if `.NET` ever proxies `/ask/stream`.


## 📚 Resources / Theory to Learn

Organized by concept — pull when building the relevant step, not all upfront.

### Concept 1 — SSE protocol and FastAPI streaming (Steps 0 + 5)
- **FastAPI `StreamingResponse`** → https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse — the core pattern; `StreamingResponse` takes an async generator, `sse-starlette` wraps it with correct headers
- **`sse-starlette` README** → https://github.com/sysid/sse-starlette — the `EventSourceResponse` API, event dict format (`{"event": "...", "data": "..."}`), and the double-newline protocol
- **MDN — Server-Sent Events** → https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — the browser protocol spec; useful when debugging why events aren't arriving (usually: wrong content-type or missing `\n\n`)

### Concept 2 — LLM provider streaming (Steps 2–3)
- **Anthropic streaming** → https://docs.anthropic.com/en/api/messages-streaming — `client.messages.stream()` async context manager and `.text_stream` iterator; the `.input_tokens` / `.output_tokens` usage is in the final `stream.get_final_message()` call if you need cost tracking
- **Gemini streaming** → https://ai.google.dev/gemini-api/docs/text-generation#streaming — `generate_content_stream()`; note the difference between sync and async variants (`client.aio.models.generate_content_stream` vs `client.models.generate_content_stream`)

### Concept 3 — React SSE consumption (Steps 7–8)
- **`@microsoft/fetch-event-source`** → https://github.com/Azure/fetch-event-source — the `fetchEventSource()` API; key options: `openWhenHidden`, `onerror` (throw to stop retries), `signal` (AbortController)
- **MDN `EventSource`** → https://developer.mozilla.org/en-US/docs/Web/API/EventSource — read this to understand why native `EventSource` falls short (GET-only, no custom headers, no body)

### Concept 4 — Supabase Realtime (Step 9)
- **Supabase Realtime docs** → https://supabase.com/docs/guides/realtime — `postgres_changes` channel type; enabling Realtime on a table; the filter format (`id=eq.XXX`)
- **`@supabase/supabase-js` quickstart** → https://supabase.com/docs/reference/javascript/introduction — `createClient`, `channel`, `on`, `subscribe`


## 🧠 Learning Strategy

**Daily loop for Chapter 5:**
- **Day 1 (3h):** Steps 0–4 — theory pre-read + provider streaming. Finish when both `stream_generate()` impls pass a smoke test.
- **Day 2 (3h):** Steps 5–6 — `POST /ask/stream` endpoint + `test_streaming.py`. Finish when `pytest tests/test_streaming.py` is green and `curl --no-buffer` shows progressive tokens.
- **Day 3 (3h):** Steps 7–9 — React chat UI + Supabase Realtime. Finish when `/chat` renders in the browser with streaming, and the upload wizard uses the Realtime hook.
- **Day 4 (1h):** Steps 10–12 — metrics + commit.

**The 5 principles applied to Chapter 5:**

1. **Active retrieval:** Step 0's three questions, written from memory. The non-obvious one: why does `is_disconnected()` need to be polled between yields rather than caught as an exception?
2. **Project-first:** Don't read the FastAPI docs front-to-back — install `sse-starlette`, try `EventSourceResponse` in a test endpoint, read the docs only when something doesn't work.
3. **Same-day shipping:** Each day's work is a commit. Three commits, not one mega-PR.
4. **Interleaving:** While FlashRank downloads or tests run, draft the React EventSource handler. While `npm install` runs, write the SSE endpoint test.
5. **Teach-back:** Say out loud, without notes: "The `metadata` event fires before any token. It contains the retrieved contexts. The React UI renders citations before the answer begins — the user sees *where the answer will come from* before it arrives."

**Anti-patterns to avoid this chapter:**
- ❌ Using `asyncio.sleep(0)` as a yield point in the SSE generator. Not needed — FastAPI flushes on each `yield` automatically with `sse-starlette`.
- ❌ Native browser `EventSource` for this use case. It's GET-only — POST with a JSON body requires `fetch-event-source`.
- ❌ Buffering the full answer before streaming. The whole point is that the first token arrives in ~150ms. If you accumulate into a list and yield once, it's not streaming.
- ❌ Skipping the `is_disconnected()` check. The LLM call continues after the client closes without it — burning tokens and event-loop time.
- ❌ Sending citation ids in the `done` event. The grounding step requires knowing which contexts were provided — send them in `metadata` before generation starts.
- ❌ Importing `supabase` client in `app/` code. It's frontend-only; the AI service has no Supabase dependency (all DB access is via asyncpg directly).

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target: *"I built SSE streaming for our RAG chat endpoint — `/ask/stream` emits contexts before generation starts so citations render before the first token, which is better UX and better architecture than post-generation citation validation. Time-to-first-token dropped from ~3s (blocking `/ask`) to ~150ms. I also handled connection drops by polling `request.is_disconnected()` between yields, which stops the LLM call when the user closes the tab — a concrete cost-control pattern. On the React side I used `@microsoft/fetch-event-source` because native `EventSource` is GET-only, then wired Supabase Realtime to replace a 2-second upload polling loop."*


## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. SSE vs WebSockets — when to use which (Azure AI-102 · Databricks)

*Scenario:* You're building a token-by-token AI chat feature. A colleague suggests WebSockets because "they're more real-time."

*Question:* Which statement best explains why Server-Sent Events (SSE) is the better choice here?

- **A.** SSE supports bidirectional communication, which makes it faster than WebSockets for half-duplex use cases
- **B.** WebSockets require a CDN upgrade; SSE works over standard HTTP — both have the same latency characteristics once connected
- **C.** SSE is unidirectional (server → client), uses standard HTTP with no upgrade handshake, auto-reconnects on disconnect, and is CDN-compatible — all advantages for a half-duplex token stream where the client only sends one request then receives a stream of tokens
- **D.** SSE cannot handle more than one concurrent connection, so it should only be used for single-user applications

<details>
<summary>Show answer</summary>

**C** — SSE's value over WebSockets for token streaming is the combination of standard HTTP (no CONNECT upgrade, proxy-compatible), automatic reconnection semantics, and unidirectionality — WebSockets add bidirectional overhead not needed when the client sends one request and the server pushes tokens back.
*Maps to: Azure AI-102 · Responsible AI integration patterns; Databricks GenAI Engineer Associate · Application Development*
</details>


### 2. POST body + SSE — why native EventSource falls short (Databricks · Google Cloud PMLE)

*Scenario:* The React chat UI needs to POST a JSON body `{"query": "...", "date_from": "...", "category": "..."}` to start a streaming response, but a colleague suggests using native browser `EventSource`.

*Question:* What is the critical limitation of native `EventSource` that makes it unsuitable here?

- **A.** Native `EventSource` doesn't parse JSON event payloads
- **B.** Native `EventSource` only supports GET requests — it cannot send a POST body or custom headers, which means query parameters can't include a request body with filters
- **C.** Native `EventSource` closes the connection after the first event is received
- **D.** Native `EventSource` requires the server to use WebSocket protocol under the hood

<details>
<summary>Show answer</summary>

**B** — native `EventSource` is GET-only by spec; `@microsoft/fetch-event-source` wraps `fetch()` with the same reconnection semantics but supports POST + custom headers, enabling JSON bodies and Authorization headers.
*Maps to: Databricks GenAI Engineer Associate · Application Development; Google Cloud PMLE · MLOps / Serving*
</details>


### 3. Disconnect handling in async SSE generators (AWS ML Engineer · Azure AI-102)

*Scenario:* A user starts a streaming chat query and closes the browser tab after 1 second. Without proper handling, the FastAPI service continues generating tokens for 5 more seconds.

*Question:* What is the correct way to detect and respond to this early disconnect in FastAPI + sse-starlette?

- **A.** Wrap the entire generator in `try/except BrokenPipeError` and exit on catch
- **B.** Set a server-side timeout of 2 seconds on all SSE responses
- **C.** Inject `Request` into the endpoint, poll `await request.is_disconnected()` between each `yield`, and `break` the generator loop when it returns `True` — this stops the LLM call and frees the event-loop slot
- **D.** Use a background task that kills the generator after the first `done` event is yielded

<details>
<summary>Show answer</summary>

**C** — `await request.is_disconnected()` is the ASGI-idiomatic way to detect client disconnects between yields; the generator simply `break`s, and Python's async cleanup (generator `aclose`) handles the rest. This stops the LLM call and saves the token cost.
*Maps to: AWS Certified ML Engineer – Associate · ML infrastructure / cost optimization; Azure AI-102 · Implement solutions using Azure OpenAI (streaming patterns)*
</details>


### 4. Citation design for streaming — metadata-first vs done-event (Databricks · Google Cloud PMLE)

*Scenario:* In the non-streaming `/ask` endpoint, the LLM returns `cited_transaction_ids` in the structured JSON response, which you then validate. In `/ask/stream`, you're streaming raw text tokens with no structured output mid-stream.

*Question:* What is the correct design for surfacing citations in a streaming response?

- **A.** Parse the token stream in real-time for `[1]`, `[2]` patterns and look up the transaction ids when detected
- **B.** Send the retrieved contexts as a `metadata` SSE event *before* generation starts — the UI renders citations immediately; the `done` event is a pure signal. No structured LLM output needed mid-stream.
- **C.** Buffer all tokens server-side until generation completes, then send citations + tokens together in a single event
- **D.** Ask the LLM to output `[CITE:42]` markers in the stream and post-process them in the browser

<details>
<summary>Show answer</summary>

**B** — the retrieval step (pgvector + rerank) completes before the first token is yielded; sending those contexts upfront as `metadata` means citations appear before the answer, which is better UX and avoids the need for structured output mid-stream. The `done` event is a bare signal.
*Maps to: Databricks GenAI Engineer Associate · Application Development (RAG UX patterns); Google Cloud PMLE · Serving patterns*
</details>


### 5. `asyncio.to_thread` vs native async streaming (Databricks · AWS ML Engineer)

*Scenario:* The Gemini SDK only offers a synchronous `generate_content()` call in the installed version — no async streaming. A colleague suggests calling it inside `async def stream_generate()` directly.

*Question:* What is the problem with calling a synchronous, blocking LLM call inside an `async def` without wrapping it?

- **A.** It will raise a `RuntimeError` because async functions cannot call synchronous code
- **B.** The synchronous call blocks the event loop for the entire generation duration — every other concurrent request (health checks, search, extraction) stalls until the LLM call returns, eliminating the concurrency benefit of the async service
- **C.** Python's GIL prevents synchronous LLM calls from completing inside async functions
- **D.** It will silently time out after 30 seconds due to FastAPI's default async request limit

<details>
<summary>Show answer</summary>

**B** — calling a synchronous blocking function inside `async def` without `asyncio.to_thread()` (or equivalent) monopolizes the event loop; this is the same issue as calling FlashRank inline in the reranker (Step 3 of PF-AI004). `asyncio.to_thread()` pushes the sync work to the default thread pool, freeing the loop for other coroutines.
*Maps to: Databricks GenAI Engineer Associate · Application Development (async patterns); AWS Certified ML Engineer – Associate · ML infrastructure*
</details>


### 6. Supabase Realtime vs polling — tradeoffs (Azure AI-102 · Google Cloud PMLE)

*Scenario:* The upload wizard previously polled `GET /api/uploads/{id}/status` every 2 seconds. After switching to a Supabase Realtime subscription on the `uploads` table, a user reports they sometimes see no status update even when the backend finishes processing.

*Question:* What is the most likely cause of the silent Realtime subscription failure?

- **A.** Supabase Realtime does not support table-level subscriptions — only row-level
- **B.** Realtime `postgres_changes` subscriptions are silently filtered by RLS policies — if the anon key cannot read the row, the subscription succeeds but no events arrive; enabling permissive RLS or using a service-role JWT (server-side only) resolves it
- **C.** The `@supabase/supabase-js` client caches subscription results for 30 seconds
- **D.** Supabase Realtime requires WebSocket protocol version 13 which is not supported in all browsers

<details>
<summary>Show answer</summary>

**B** — Supabase Realtime respects RLS; a subscription with the anon key returns no events for rows the anon role cannot `SELECT`. This is a common silent failure. The fix for local dev is permissive `USING (true)` RLS; for production, scope the policy to the authenticated user.
*Maps to: Azure AI-102 · Security and responsible AI (data access controls); Google Cloud PMLE · MLOps / data governance*
</details>
