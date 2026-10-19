# PF-S15 — Resume AI chat, RAG and agents with owner-scoped data

> **Issue:** none (local plan; GitHub issues are no longer used)
> **Status:** Done (2026-10-16, accepted by the owner after hands-on testing). Was: In Progress. One acceptance criterion (FIN-01 decimal end to end) stays open and is carried as a deferred follow-up; see "Deferred follow-ups" under Notes.
> **Started:** 2026-10-15
> **Planned from branch:** main
> **Depends on:** [PF-S08](PF-S08-auth-foundation-cashflow-ownership-todo.md) (Supabase Auth, `user_id` on every Cashflow table, `ICurrentUser`, internal API key)
> **Sensitive:** schema (one migration on `transaction_embeddings`), money (chat narrates totals)

## Objective

PF-S08 made Cashflow private per user but had to switch off every AI feature that reads the database, because those paths query Postgres directly with no owner filter. This plan brings them back so each signed-in user can only ever see their own transactions in chat answers, search results, totals, follow-up suggestions, embeddings, advisor replies and agent tool calls. Chat and RAG come back first; the advisor and the categorizer agent follow in a second phase.

## Acceptance Criteria

Phase 1 — chat and RAG

- [x] The browser never calls the AI service. Chat goes through authenticated .NET endpoints under `/api/chat/*`; a request without a valid Supabase token gets 401.
  > Verification note: `chatApi.ts` calls only `/api/chat/*` with the bearer token; `ChatRoutes_WithoutToken_ReturnUnauthorized` passes. `statusApi.ts` still pings the AI service `/health`, which reads no data.
- [x] Every AI-service route that reads or writes transactions requires the internal API key **and** a server-signed owner token. A missing key returns 401; a missing, malformed, wrongly signed or older-than-60-seconds owner token returns 401; and a route not enabled returns 404.
  > Verification note: `tests/test_owner_scope.py` covers flag off (404), no key, no token, tampered, wrongly signed and stale tokens (401), and a valid token reaching the service with that owner. Live check: `/search` without an owner token returned 401.
- [x] Every SQL statement in `retriever.py`, `aggregator.py`, `embedder.py` and the category-vocabulary loader filters by `t.user_id`, **and** runs inside a transaction as the `authenticated` role with that user's claims, so RLS blocks a missed filter.
  > Verification note: SQL-shape tests assert `t.user_id = $n` bound to the owner for all three search modes, aggregate and vocabulary; `owner_connection` is tested for `SET LOCAL ROLE authenticated` plus claims; a guard test fails if `asyncpg.connect` appears outside `owner.py` and the embedder write path.
- [x] Two-user A/B test: user B's chat (lookup and aggregate), search and follow-ups never return, count, sum or name any of user A's transactions or categories, and the reverse holds too. A test that fakes an id belonging to the other user returns nothing.
  > Verification note: `scripts/pf_s15_ai_isolation.py` passed live on the harness on 2026-10-15 (lookup, aggregate, follow-ups, `/search` in vector, bm25 and hybrid modes, recall at full `top_k`).
- [x] An embedding can only be stored for a transaction the caller owns. Trying to embed another user's transaction id stores nothing and is counted as skipped.
  > Verification note: live check returned `embedded=0, skipped=1` for B's id under A's token, and B's stored row was unchanged; unit test covers `INSERT 0 0`.
- [x] Submitting an import embeds the new transactions in the background again, for the importing user only.
  > Verification note: live check waited until both users' imported rows had embeddings after `/api/transactions/submit`.
- [x] With the flags off (`AiChat:Enabled=false`, `AI_CHAT_ENABLED=false`, `VITE_AI_CHAT_ENABLED=false`), behaviour is identical to today: `/chat` shows "AI chat is paused" and the AI service still returns 404 for chat routes.
  > Verification note: `test_owner_routes_404_when_flag_off`, `ChatRoutes_FlagOff_ReturnNotFound` and `App.tsx` falling back to `ChatUnavailable` when `VITE_AI_CHAT_ENABLED` isn't `true`. Gate tests now pin the flags off regardless of the local `.env`.
- [ ] The aggregate total shown in chat equals the sum of the same filtered rows on the Transactions page (FIN-01: decimal end to end).
  > Not met: the live check matched each chat total to a direct Decimal SQL sum, but `/ask/stream` sends `total_idr` as a float (`main.py`, `float(agg.total_idr)`) and the frontend holds it as a JS `number`. That is exact for IDR totals below 2^53, but not decimal end to end. Fixing it changes the SSE contract on all three sides; it needs its own step. The Transactions page comparison is step 3 of the owner smoke test.
- [x] `/compliance` has reviewed the chat answer wording and its disclosure (FIN-05) before the flags are turned on.
  > Verification note: gate verdict SHIP WITH CHANGES, applied: `ChatDisclaimer` under both chat inputs; the lookup prompt no longer sums amounts and both prompts forbid recommendations; the narrate prompt now says "the user's own transactions".

Phase 2 — advisor and categorizer agent

- [x] `/advisor` tool calls reach the .NET API with the caller's own bearer token. Conversation memory is keyed by user plus session, so one user can't resume another user's session id.
  > Verification note: `advisor_tools.py` reads the token from a ContextVar and sends `Authorization: Bearer`; with no token it raises before any HTTP call. `test_concurrent_requests_each_send_their_own_token` interleaves two callers, and `test_other_users_session_id_starts_an_empty_thread` covers the `{owner}:{session}` thread id. `/advisor` also needs `X-Pf-User-Token`, whose `sub` must match the owner token (401 otherwise). Live: the real tool code saw only each user's categories, B couldn't resume A's session (A's code word never appeared), A could, and a mismatched user token got 401. The advisor's own end-to-end answers were the fallback reply: Gemini 3 needs thought signatures that `langchain-google-genai` 2.1.12 drops. That provider limit is separate from ownership.
- [x] `/categorize-agent` uses only the caller's private rules plus the shared presets, only the caller's categories, and owner-scoped similarity search.
  > Verification note: `tests/test_agent_owner_scope.py` covers tools failing closed with no context, two owners in worker threads at once, `load_owner_rules` (own rules filtered by `user_id = $1` and winning over presets), the similarity tool passing `owner_id`, and the route binding that caller's context. Each run also gets a fresh `ToolCallingAgent`, so two callers never share agent memory. Live: B's merchant got B's private rule category, and A's run did not.
- [x] The two-user A/B test covers both routes.
  > Verification note: `scripts/pf_s15_ai_isolation.py --pace 12` passed on the harness on 2026-10-16 with `gemini-3.5-flash-lite`, Phase 1 checks included. It printed two `warn` lines: for the advisor's end-to-end answers only the no-leak half ran, because of the thought-signature limit above.

## Approach

Chat requests take this path: the browser sends `authenticatedFetch` to a new .NET `ChatController`. The controller resolves `ICurrentUser`, and `AiChatClient` forwards the request to FastAPI with `X-Internal-Api-Key` plus a server-derived `X-Pf-User-Id`. For the stream endpoint it copies the response through as SSE. On the FastAPI side, a `require_owner` dependency is the only way a route gets an owner id. A new `owner_connection(user_id)` helper opens a transaction, runs `SET LOCAL ROLE authenticated`, and sets `request.jwt.claims` to that user. The existing PF-S08 RLS policies therefore enforce ownership even if a query forgets its explicit `t.user_id` filter.

Global startup state is replaced by per-request lookups keyed by owner. That covers the category vocabulary and the agent's rules and categories. Routes reopen behind one flag per service, each with A/B tests. We deliberately don't validate JWTs in FastAPI, because that would mean a second auth stack, and the browser never needs to reach the AI service.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/{ts}_pf_s15_embeddings_owner_read.sql` | Create — enable RLS on `transaction_embeddings`; `authenticated` may SELECT only rows whose transaction it owns |
| `services/ai-service/app/config.py` | Edit — add `ai_chat_enabled`, `ai_agents_enabled` |
| `services/ai-service/app/owner.py` | Create — `require_owner` dependency and `owner_connection` helper |
| `services/ai-service/app/main.py` | Edit — split gate into pilot routes, owner routes; per-request vocabulary; pass owner id into services |
| `services/ai-service/app/services/retriever.py` | Edit — `owner_id` parameter, `t.user_id` filter, `owner_connection` |
| `services/ai-service/app/services/aggregator.py` | Edit — same |
| `services/ai-service/app/services/embedder.py` | Edit — owner-checked upsert |
| `services/ai-service/app/services/vocabulary.py` | Create — per-owner category list with a short TTL cache |
| `services/ai-service/app/services/answerer.py` | Edit — take owner id and categories per call |
| `services/ai-service/tests/test_owner_scope.py` | Create — gate, dependency and SQL-shape tests (mocked DB) |
| `apps/api/src/PersonalFinance.Application/Interfaces/IAiChatClient.cs` | Create — stream, followups, embed contract |
| `apps/api/src/PersonalFinance.Infrastructure/External/AiChatClient.cs` | Create — typed HttpClient, adds owner header |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmSearchClient.cs` | Edit — send signed owner token |
| `apps/api/src/PersonalFinance.Infrastructure/External/OwnerTokenSigner.cs` | Create — HMAC-signed `<user>.<ts>.<sig>` token shared by the chat and search clients |
| `apps/api/src/PersonalFinance.Api/Controllers/ChatController.cs` | Create — `/api/chat/ask/stream`, `/api/chat/followups` |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — re-enable background embedding with captured owner id, behind flag |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register client, `AiChat:Enabled` flag |
| `apps/api/tests/PersonalFinance.Tests/Controllers/ChatControllerTests.cs` | Create |
| `apps/api/tests/PersonalFinance.Tests/External/AiChatClientTests.cs` | Create |
| `apps/frontend/src/api/chatApi.ts` | Edit — call `/api/chat/*` with the bearer token |
| `apps/frontend/src/components/AppShell.tsx`, `apps/frontend/src/App.tsx` | Edit — `VITE_AI_CHAT_ENABLED` replaces the hardcoded `false` |
| `scripts/pf_s15_ai_isolation.py` | Create — live two-user A/B check |
| `services/ai-service/app/agents/advisor_tools.py`, `services/advisor.py` | Edit (Phase 2) — per-request token, user-namespaced thread id |
| `services/ai-service/app/agents/tools/*.py`, `agents/categorizer_agent.py` | Edit (Phase 2) — per-request owner context |
| `.env.example`, `docs/runbooks/pf-s08-cashflow-pilot.md`, `plans/BOARD.md` | Edit — flags, enable order, rollback |

---

## TODO

### Phase 1 — Chat and RAG

### [x] STEP 1 — Spike: prove the AI service can act as the user inside Postgres
Run the following against the local Supabase database, using the connection string from `services/ai-service/.env` (`DATABASE_URL`). Use any real owner UUID; don't print it into the plan.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<owner-uuid>','role','authenticated')::text, true);
SELECT auth.uid(), count(*) FROM transactions;          -- expect the owner's count
SELECT count(*) FROM accounts;                            -- expect only owner's accounts
SELECT count(*) FROM transaction_embeddings;              -- expect permission denied today (UNVERIFIED: no migration revokes it)
ROLLBACK;
```

Repeat the `transaction_embeddings` check as `anon` (`SET LOCAL ROLE anon`) and also try an `INSERT` as `authenticated`. No migration revokes the default Supabase grants on this table, so it may be readable and writable through PostgREST today. If it is, fix it before anything else in this plan.

Also run `SELECT extversion FROM pg_extension WHERE extname = 'vector';`. Iterative scans (STEP 4) need pgvector 0.8 or later.

Record the results under Notes. If the connection role can't `SET ROLE authenticated`, stop and pick the fallback in Notes before writing any code.

> **Why:** The plan's safety net is reusing the PF-S08 RLS policies from the AI service's direct connection. This takes five minutes and either confirms the design or changes it before any code exists.

---

### [x] STEP 2 — Migration: owner-only read access to embeddings
Create the migration with the `db-migrate` skill.

```sql
-- PF-S15: authenticated users may read embeddings only for transactions they own.
REVOKE ALL ON public.transaction_embeddings FROM anon, authenticated;
ALTER TABLE public.transaction_embeddings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.transaction_embeddings TO authenticated;
DROP POLICY IF EXISTS pf_s15_embeddings_owner_read ON public.transaction_embeddings;
CREATE POLICY pf_s15_embeddings_owner_read ON public.transaction_embeddings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transactions t
                 WHERE t.id = transaction_embeddings.transaction_id
                   AND t.user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE grant: writes stay on the service connection (STEP 6).
```

Re-run STEP 1. The embeddings count should now be the owner's count. Also run it as `anon`, which must still be denied.

> **Why:** Vector search joins `transaction_embeddings`. Without a policy, the `authenticated` role can't read it at all; without an owner condition, RLS would offer no protection. Writes stay off so a browser token can never plant vectors.

---

### [x] STEP 3 — FastAPI owner dependency and connection helper
Create `services/ai-service/app/owner.py`:

```python
"""Caller identity for owner-scoped routes. The .NET API is the only caller."""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from contextlib import asynccontextmanager

import asyncpg
from fastapi import Header, HTTPException

from app.config import settings


_OWNER_TOKEN_MAX_AGE_SECONDS = 60


def _verify_owner_token(token: str) -> uuid.UUID:
    """Token format: '<user-uuid>.<unix-ts>.<hex hmac-sha256 of "<user-uuid>.<unix-ts>">'."""
    user_part, _, rest = token.partition(".")
    ts_part, _, signature = rest.partition(".")
    expected = hmac.new(
        settings.owner_signing_secret.encode(), f"{user_part}.{ts_part}".encode(), hashlib.sha256
    ).hexdigest()
    if not secrets.compare_digest(signature, expected):
        raise ValueError("bad signature")
    if abs(time.time() - int(ts_part)) > _OWNER_TOKEN_MAX_AGE_SECONDS:
        raise ValueError("stale token")
    return uuid.UUID(user_part)


async def require_owner(
    x_internal_api_key: str = Header(default=""),
    x_pf_owner_token: str = Header(default=""),
) -> uuid.UUID:
    if not settings.internal_api_key or not secrets.compare_digest(x_internal_api_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Internal authentication required")
    if not settings.owner_signing_secret:
        raise HTTPException(status_code=401, detail="Owner required")
    try:
        return _verify_owner_token(x_pf_owner_token)
    except ValueError:  # also covers a non-UUID or non-integer part
        raise HTTPException(status_code=401, detail="Owner required") from None


@asynccontextmanager
async def owner_connection(db_url: str, owner_id: uuid.UUID):
    """One transaction acting as the user, so RLS backs up every explicit filter."""
    conn = await asyncpg.connect(db_url)
    try:
        async with conn.transaction():
            await conn.execute("SET LOCAL ROLE authenticated")
            await conn.execute(
                "SELECT set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": str(owner_id), "role": "authenticated"}),
            )
            yield conn
    finally:
        await conn.close()
```

In `config.py`, add `ai_chat_enabled: bool = False`, `ai_agents_enabled: bool = False` and `owner_signing_secret: str = ""`. The signing secret is a separate value from `internal_api_key`; add both to `.env.example` as names only (SEC-01, SEC-04).

> **Why:** Making the owner id a FastAPI dependency means a route can't read data without declaring that it has one. `SET LOCAL` and `set_config(..., true)` end with the transaction, so a pooled or reused connection never carries a previous user's identity. The owner id travels as a signed, 60-second token rather than a plain header, so someone who obtains only the internal key can't choose which user to act as; they would also need the signing secret. A replayed token can only act as the same user for under a minute.

---

### [x] STEP 4 — Owner-scope the retriever and aggregator
- Add `owner_id: uuid.UUID` as a required keyword argument to `RetrievalService.search`, `_search_vector`, `_search_bm25_ids`, `_fetch_results_by_ids` and `AggregationService.aggregate`.
- Start every `where` list with `t.user_id = $n`, bound as a parameter. `_fetch_results_by_ids` gets `AND t.user_id = $2`.
- Replace `asyncpg.connect(...)` with `async with owner_connection(self._db_url, owner_id) as conn:`. Keep `SET ivfflat.probes = 10`, but make it `SET LOCAL` now that a transaction exists, and call `register_vector(conn)` inside the block. If STEP 1 found pgvector 0.8 or later, also run `SET LOCAL ivfflat.iterative_scan = relaxed_order`: ivfflat applies the owner filter after the index scan, so without it a user can get fewer than `top_k` results once a second user's rows share the index.
- Tests in `tests/test_owner_scope.py`: patch `asyncpg.connect`, capture the SQL and arguments, and assert that every statement contains `t.user_id = $` with the owner UUID bound. Run them for all three search modes and for aggregate.
- Add a guard test: scan `services/ai-service/app/` and fail if `asyncpg.connect` appears anywhere except `owner.py` and the embedder's service-connection write path. This keeps an unscoped connection from being added later.

```bash
cd services/ai-service && .venv/Scripts/python.exe -m pytest tests/test_owner_scope.py tests -q
```

> **Why:** There are two locks on purpose. The explicit filter keeps `LIMIT` meaningful and makes intent visible in code review; RLS catches the query someone adds next year without the filter. Swapping `SET` for `SET LOCAL` matters because the old comment noted that `LOCAL` needs a transaction, and there now is one.

---

### [x] STEP 5 — Per-owner category vocabulary
Create `services/ai-service/app/services/vocabulary.py`. Its `CategoryVocabulary.for_owner(owner_id)` method runs `SELECT DISTINCT category FROM transactions WHERE user_id = $1 AND category <> ''` through `owner_connection`, and caches the result per owner for 5 minutes in a bounded dict (at most 256 owners).

- Remove `app.state.categories` and `_load_categories` from the lifespan.
- `AnswerService.ask`, the `/ask/stream` planner call and `FollowUpSuggester.suggest` receive `categories` per call.
- Tests cover two owners getting different lists, cache expiry, and the empty list for a new user.

> **Why:** The planner prompt contains the category list. A global list would leak user A's custom category names into user B's prompt and follow-up suggestions. That is a real leak, even though no transaction row crosses over.

---

### [x] STEP 6 — Owner-checked embedding writes
In `embedder.py`, `embed_and_store(items, owner_id)` writes with:

```sql
INSERT INTO transaction_embeddings (transaction_id, embedding, search_text, model)
SELECT t.id, $2, $3, $4 FROM transactions t
WHERE t.id = $1 AND t.user_id = $5
ON CONFLICT (transaction_id) DO UPDATE
  SET embedding = EXCLUDED.embedding, search_text = EXCLUDED.search_text, model = EXCLUDED.model
```

A result of `INSERT 0 0` counts as skipped and is logged at warning level with the transaction id only. This stays on the service connection: it is a write, and STEP 2 grants no writes to `authenticated`.

> **Why:** The caller supplies `transaction_id`. Without the ownership join, a bug or a forged request could attach vectors, along with the description text, to someone else's row. Then their search results would contain text the caller wrote.

---

### [x] STEP 7 — Reopen chat routes behind the flag
In `main.py`:
- Keep `_PILOT_INTERNAL_ROUTES`, and add `_OWNER_CHAT_ROUTES = {"/ask", "/ask/stream", "/ask/followups", "/search", "/embed-transactions"}`.
- The middleware lets those through only when `settings.ai_chat_enabled` is true. Authentication then happens in `require_owner`, so a request without the key still gets 401.
- Add `owner_id: uuid.UUID = Depends(require_owner)` to each of the five handlers and pass it down.
- Tests cover: flag off returns 404; flag on with no key returns 401; key without an owner token returns 401; a tampered, wrongly signed or stale token returns 401; key plus a valid token reaches a mocked service with that owner; a pilot route still works unchanged.

> **Why:** Reopening per route behind its own flag means a rollback is a config change, not a revert. That is the same pattern as `CashflowPilot:Enabled`.

---

### [x] STEP 8 — .NET chat client and controller
- `Application/Interfaces/IAiChatClient.cs`: `Task StreamAskAsync(AskChatRequest req, Stream destination, CancellationToken ct)` and `Task<IReadOnlyList<string>> FollowUpsAsync(FollowUpChatRequest req, CancellationToken ct)`.
- `Infrastructure/External/AiChatClient.cs`: inject `HttpClient` and `ICurrentUser`, and set `X-Pf-Owner-Token` on every request: `"{caller.UserId}.{unixSeconds}.{hex HMAC-SHA256 of that prefix with AiChat:OwnerSigningSecret}"`. Put the signing in one small `OwnerTokenSigner` helper in Infrastructure so `LlmSearchClient` and the advisor path reuse it. For the stream, use `HttpCompletionOption.ResponseHeadersRead` and `CopyToAsync(destination, ct)`. A non-success status logs the body and throws a generic exception (ERR-01).
- `Api/Controllers/ChatController.cs`: `[Authorize]`, `[Route("api/chat")]`. The stream action sets `Content-Type: text/event-stream`, `Cache-Control: no-cache` and disables response buffering, then calls the client with `HttpContext.RequestAborted`, so closing the tab cancels the upstream FastAPI call. If response compression is registered in `Program.cs`, exclude `text/event-stream` from it. Each action stays at 15 lines or fewer (ARCH-04). When `AiChat:Enabled` is false it returns 404.
- Register the typed client in `Program.cs` with the internal key and a 2-minute timeout.
- Tests: the controller returns 404 when the flag is off; the client sets a verifiable owner token from `ICurrentUser` (a C# test and a Python test agree on the same fixture token); a 502 from FastAPI does not leak the body.

> **Why:** The .NET side already verifies the JWT and owns `ICurrentUser`. Proxying keeps one auth boundary and removes the browser's need to reach port 8000. The owner id comes from the verified token, never from the request body.

---

### [x] STEP 9 — Re-enable background embedding on import
In the submit path of `TransactionsController.cs`:
- Capture `var ownerId = caller.UserId;` before the background task starts.
- Call `ILlmSearchClient.EmbedTransactionsAsync(items, ownerId)`. Change the interface to take the owner explicitly and send the header.
- Run it only when `AiChat:Enabled` is true. Failures are logged as warnings and never fail the import.

> **Why:** The request scope, and so `ICurrentUser`, may be gone by the time the fire-and-forget task runs. Passing the id explicitly avoids an empty owner. If PF-130 lands first, this moves into `SubmitTransactionsCommandHandler`.

---

### [x] STEP 10 — Frontend: chat through the API
- In `chatApi.ts`, change the base URL to the API (`/api/chat/ask/stream`, `/api/chat/followups`). `fetchEventSource` gets an `Authorization: Bearer <token>` header from `supabase.auth.getSession()`, and `fetchFollowUps` uses `authenticatedFetch`. Delete `VITE_AI_SERVICE_URL` from chat code.
- Replace `AI_CHAT_AVAILABLE = false` with `import.meta.env.VITE_AI_CHAT_ENABLED === 'true'`. Under the same flag, `App.tsx` renders the chat page instead of `ChatUnavailable`.
- On sign-out or a user switch, the existing `AuthProvider` remount already clears chat state; check it once by hand.

```bash
cd apps/frontend && npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm run build
```

> **Why:** Once the AI service requires the internal key, a browser call can only fail, so the frontend must move first or together. `VITE_*` is baked in at build time and holds no secret, just a boolean.

---

### [x] STEP 11 — Live two-user isolation check
Create `scripts/pf_s15_ai_isolation.py`, following `scripts/pf_s08_module_isolation.py`, against a disposable local stack:
1. Provision users A and B, and import a different small CSV for each. B gets a unique merchant name and a unique category.
2. As A and as B, run a lookup question, an aggregate question, follow-ups and `/search` through the .NET endpoints.
3. Assert that neither sees the other's merchant, category, transaction ids or totals, and that each aggregate equals a direct SQL sum for that owner.
4. Call FastAPI directly with the internal key and A's id, but ask about B's transaction id via `/embed-transactions`. The result must be `embedded=0`.
5. Recall check: with both users' rows present, a lookup for A's known transaction still returns it in the top results, and `/search` returns the full `top_k` for A. Isolation tests can't catch recall loss from post-filtering.

> **Why:** Mocked tests prove SQL shape, not isolation. PF-S08 only accepted live A/B evidence, and so does this plan. The LLM may phrase answers differently, so the assertions check ids, amounts and names in `metadata` and `contexts`, not prose.

---

### [x] STEP 12 — Compliance check, enable and record
- Run `/compliance` on the chat answer wording (FIN-05). Add any required disclosure line to the chat panel.
- Enable the flags locally in this order: AI service `AI_CHAT_ENABLED=true`, then API `AiChat:Enabled=true`, then the frontend build with `VITE_AI_CHAT_ENABLED=true`. To roll back, apply them in reverse order.
- Add the enable order and rollback to `docs/runbooks/pf-s08-cashflow-pilot.md` and `.env.example`, update `plans/BOARD.md`, and write an owner smoke test (sign in, ask one lookup question and one total, sign out). Include a streaming check: tokens appear incrementally rather than all at once, and closing the tab mid-answer stops the FastAPI request (watch the AI service log).

> **Why:** Turning the AI service on first means the API never calls a route that returns 404. Turning the frontend on last means users only see chat once the backend is ready.

---

### Phase 2 — Advisor and categorizer agent

### [x] STEP 13 — Advisor: per-user token and memory
- `.NET`: add `/api/chat/advisor` to `ChatController` and `AiChatClient`. It forwards `ICurrentUser.AccessToken` as `X-Pf-User-Token` alongside the owner header.
- `advisor_tools.py`: replace the shared module-level `_CLIENT` headers with a `contextvars.ContextVar` holding the caller's token. Each tool sends `Authorization: Bearer <token>`, so the .NET endpoints apply their normal owner scoping.
- `services/advisor.py`: use `thread_id = f"{owner_id}:{session_id}"`. A session id that belongs to another user then starts empty instead of resuming someone else's memory.
- `/advisor` joins a new `_OWNER_AGENT_ROUTES` set behind `ai_agents_enabled`. Add tests for the contextvar isolation (two concurrent requests) and the thread namespacing.

> **Why:** The advisor reads data through the .NET API, which already enforces ownership, but only if it carries the user's token. The in-memory `MemorySaver` is keyed only by `session_id` today, so a guessed id would replay another user's conversation.

---

### [x] STEP 14 — Categorizer agent: per-request owner context
- Replace the startup `load_rules`, `load_categories` and `configure_similarity_tool` globals with a `ContextVar[OwnerContext]` set per request. The rules come from the caller's private rules plus the shared presets, the categories from `CategoryVocabulary.for_owner`, and the similarity tool calls `retriever.search(owner_id=...)`.
- The agent runs in `asyncio.to_thread`. Copy the context with `contextvars.copy_context().run` so the thread sees the caller's values.
- `/categorize-agent` joins `_OWNER_AGENT_ROUTES`. It has no UI or .NET caller today, so it stays internal-only; add a .NET client only when a feature needs it.

> **Why:** The smolagents tools read module globals that were loaded once for the whole database. Per-request context is the smallest change that makes every tool call owner-scoped without rewriting the agent.

---

### [x] STEP 15 — Extend the isolation check and close
Add advisor and agent cases to `scripts/pf_s15_ai_isolation.py`, enable `AI_AGENTS_ENABLED` locally, and update the runbook and the board.

> **Why:** This is the same evidence standard as Phase 1. The agents are the riskiest paths because their data access is indirect.

---

## Notes

- **STEP 1 results (2026-10-15, main local DB, after the STEP 2 migration):** the AI service connects as `postgres`, which is a member of `authenticated`, so `SET LOCAL ROLE authenticated` works and the fallback below isn't needed. As the owner, `auth.uid()` matched and the counts were 24 transactions, 13 accounts and 24 embeddings. A stranger UUID saw 0 transactions and 0 embeddings. `INSERT` into `transaction_embeddings` as `authenticated` and `SELECT` as `anon` were both denied. pgvector is 0.8.0, so `ivfflat.iterative_scan = relaxed_order` is on. The migration is in the main ledger (`20261015000000`); the harness has the same policy applied by hand.
- **STEP 11 run note:** the configured `gemini-2.5-flash` hit its free daily quota (20 requests), and `gemini-2.5-flash-lite` is retired for new keys. The passing run used `AI_MODEL=gemini-3.5-flash-lite --pace 5` for that run only.
- **STEP 12:** flags are on in the gitignored local config files with a fresh signing secret. The owner smoke test is [owner-smoke-test-PF-S15.md](owner-smoke-test-PF-S15.md). Rikky tested chat by hand on 2026-10-16 and accepted the plan.
- **Fallback if STEP 1 fails** (the connection role can't switch to `authenticated`): create a non-login role `pf_ai_reader`, grant it to the connection role, and add policies that use `current_setting('app.owner_id')::uuid`. This adds one more migration; the rest of the plan is unchanged.
- `/journey/advise` and `/portfolio-review` are already allowed and only see request-body data. They are not touched here.
- Existing embeddings need no backfill: PF-S08 gave every legacy transaction to the owner, and embeddings join through `transactions`. Rebuild only if the embedding model changes.
- Evals (`evals/eval_retrieval.py` and others) call FastAPI directly. Once STEP 7 lands they need the internal key and an owner id: add `--owner` and read the key from `.env`. Re-baseline before comparing: run them against the same owner's data and compare to the earlier numbers (e.g. MRR@5 0.771) only after confirming the dataset matches.
- PF-130 (moving submit logic into a handler) touches the same code as STEP 9. Do whichever lands second as a rebase, not a redesign.
- PF-AI005-PART2's open accuracy checks need chat to be running, so they unblock after STEP 12.
- Cost: Phase 1 is about 3–5 days and Phase 2 about 2 days, mostly spent on live A/B checks.
- **Owner test, 2026-10-16:** chat answered "no relevant transactions" for April 2025 and for this month versus last month. That is correct: the owner's 24 transactions run from 2026-05-01 to 2026-08-03, all 24 are owned by the owner's Auth user and all 24 have embeddings in the current model. A direct owner-scoped search for July 2026 returned rows. No re-embedding was needed.

### Deferred follow-ups (open when the plan closed)

- **FIN-01 decimal end to end:** `/ask/stream` sends `total_idr` as a float and the frontend holds it as a JS `number`. Make it a string or integer minor units on all three sides in one change.
- **Advisor on Gemini 3:** the advisor's second model call fails because `langchain-google-genai` 2.1.12 drops Gemini 3 thought signatures, so `/advisor` returns its fallback reply. Upgrade the package, or run the advisor on a Gemini 2.5 model or Anthropic.
- **Keep-alive race:** the API's pooled HttpClient can reuse a connection that uvicorn closed after its 5-second keep-alive, which gave a chat 500 under fast repeated calls. Set `PooledConnectionIdleTimeout` below 5 seconds, or raise uvicorn's keep-alive.
- **Agent stdout:** smolagents `verbosity_level=1` prints transaction text to stdout. Lower it outside development; it is also the source of the Windows cp1252 crash fixed with ASCII output.
- **Agent category check:** `_parse_result` takes the `CATEGORY:` line without checking it against the caller's vocabulary, so a decorated answer such as `** Groceries / Shopping (...)` passes through. Validate it against the bound categories.
- **Chat header label:** the chat panel header names a model that the AI service doesn't use. Show the configured model, or no model name.

## Execution Notes

### Phase 1 — Chat and RAG

Model: **Opus 5.5** · Effort: **high**. The plan is marked Sensitive (RLS, a migration, signed owner tokens, money narration), and a wrong guess there is silent.
Before you start: bring up the local Supabase stack (`docker-up`) so the STEP 1 spike and STEP 11 live check can run.

```
/execute plans/in-progress/PF-S15-resume-ai-chat-owner-scoped-todo.md phase 1
```

### Phase 2 — Advisor and categorizer agent

Model: **Sonnet 5.5** · Effort: **high**. It reuses Phase 1's helpers, though the contextvar work still needs care.
Before you start: Phase 1's isolation check has passed and `/compliance` has cleared the chat wording.

```
/execute plans/in-progress/PF-S15-resume-ai-chat-owner-scoped-todo.md phase 2
```

### Stop and ask if

- The STEP 1 spike shows the connection role can't `SET ROLE authenticated`. Take the Notes fallback only with the owner's say-so.
- `transaction_embeddings` turns out to be open to `anon` or `authenticated` today. Fix that in its own migration first.
