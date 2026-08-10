# PF-139 — Contextual AI follow-up suggestions in chat

> **GitHub Issue:** _(no issue — local plans are the working system)_
> **Status:** To Do
> **Started:** 2026-08-10
> **Planned from branch:** main

## Objective

The AI chat panel shows three suggestion chips after every answer, but they come from a hardcoded
array (`SUGGESTION_CHIPS`) that is identical no matter what was asked. Replace them with three
follow-up questions generated from the question + the answer that was just streamed, so the chips
drill into the topic the user actually landed on.

This also fixes a live correctness bug. The chat backend is stateless — `useChatSession.send()`
posts `{ query }` with no conversation history — so today's fragment chips ("Rinci per minggu")
reach `QueryPlanner` with no antecedent and plan an empty filter set. Every suggestion produced
here must be a self-contained question that names its own category and period.

## Acceptance Criteria

- [ ] After an answer finishes streaming, three chips generated from that Q&A appear below it
- [ ] Each generated chip is self-contained — names a category and/or a period, no bare "vs bulan lalu"
- [ ] Chips render only under the newest answer; asking again replaces them
- [ ] Clicking a chip fills the input; the user presses Enter to send (existing `setInput` behaviour)
- [ ] Chips are written in the same language as the question that produced them
- [ ] The empty state still shows 3 random picks from `EXAMPLE_QUESTIONS` — unchanged
- [ ] A provider failure, timeout, or unconfident answer falls back to static chips with no visible error
- [ ] The follow-up call never delays the answer: it is fired after the SSE `done` event
- [ ] A new question in flight discards any stale suggestion response
- [ ] `pytest` green in `services/ai-service`; `npm run lint` and `npm run build` clean in `apps/frontend`

## Approach

A new `POST /ask/followups` endpoint on the AI service takes the question, the answer text, and the
citation rows, and returns three short questions from one `generate_json` call capped at 200 output
tokens. The frontend fires it from `useChatSession`'s `onDone` handler — *after* the stream closes —
and stores the result on the message it belongs to (`ChatMessage.followUps`), mirroring how
`contexts` already ride per-message.

Deliberately not done: no conversation history is added to `/ask`, and no `suggestions` SSE event is
added to `/ask/stream`. The stream aborts its controller on `done`
([chatApi.ts:70](../../apps/frontend/src/api/chatApi.ts#L70)), and emitting before `done` would hold
the UI in streaming state — blinking cursor and Stop button — for ~700ms after the answer is already
readable. Suggestions are decorative, so the endpoint never raises: on any failure it returns `[]`
and the panel falls back to static chips.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/models.py` | Edit — add `FollowUpContext`, `FollowUpRequest`, `FollowUpResponse` |
| `services/ai-service/app/services/followup_suggester.py` | Create — `FollowUpSuggester` + prompt + output guard |
| `services/ai-service/app/main.py` | Edit — imports, `app.state.followup_suggester`, `POST /ask/followups` |
| `services/ai-service/tests/test_followup_suggester.py` | Create — mocked-provider unit tests |
| `apps/frontend/src/api/chatApi.ts` | Edit — add `fetchFollowUps()` |
| `apps/frontend/src/hooks/useChatSession.ts` | Edit — `followUps` on `ChatMessage`, fire after `done`, abort guard |
| `apps/frontend/src/components/chat/AiChatPanel.tsx` | Edit — render dynamic chips, rewrite fallback to be self-contained |

---

## TODO

### [ ] STEP 1 — Add the request/response models

Append to `services/ai-service/app/models.py`, after the `AskResponse` block:

```python
# ── PF-139: Contextual follow-up suggestions ─────────────────────────────────

class FollowUpContext(BaseModel):
    """One citation row, trimmed to what the suggester needs.

    Accepts the frontend's full ContextItem — Pydantic drops transaction_id and
    wallet, which add tokens without steering the suggestions.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    date: str = ""
    description: str = ""
    amount_idr: float = 0.0
    flow: str = ""


class FollowUpRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=4000)
    intent: str = "lookup"                  # "aggregate" | "lookup"
    total_idr: float | None = None          # aggregate path — the SQL total
    contexts: list[FollowUpContext] = Field(default_factory=list, max_length=5)


class FollowUpResponse(BaseModel):
    questions: list[str]
```

> **Why:** `max_length=4000` on `answer` and `max_length=5` on `contexts` bound the prompt size so a
> long aggregate narration can't quietly triple the cost of what is meant to be a cheap call.
> `ConfigDict(str_strip_whitespace=True)` is mandatory on every model per
> [.claude/rules/ai-service.md](../rules/ai-service.md). No `Decimal` here — these values are only
> read into a prompt, never summed or displayed, so FIN-01 does not apply.

---

### [ ] STEP 2 — Create the FollowUpSuggester service

Create `services/ai-service/app/services/followup_suggester.py`:

```python
"""FollowUpSuggester: propose the next questions the user is likely to ask.

One cheap structured call, fired AFTER the answer has already streamed — so it
costs nothing in time-to-first-token and nothing at all when it fails.

Suggestions must be SELF-CONTAINED. `/ask` receives a bare query with no
conversation history, so a chip like "rinci per minggu" reaches QueryPlanner
with no antecedent: it plans empty categories and no date range, and the answer
is wrong. Every suggestion therefore names its own category and period.
"""
from __future__ import annotations

import logging

from app.models import FollowUpRequest
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 3
MAX_CHARS = 80
MAX_OUTPUT_TOKENS = 200

FOLLOWUP_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["questions"],
}

SYSTEM_PROMPT = """You propose the next questions a user is likely to ask about \
their own bank transactions, given the question they just asked and the answer \
they received. Rules:
- Return exactly 3 questions.
- Each question MUST be self-contained. It is sent to a stateless backend with \
no conversation history, so name the category and the time period explicitly. \
Write "Bandingkan Room rent Juli vs Juni", never "Bandingkan vs bulan lalu".
- Build on what the ANSWER revealed. If it named a category or merchant, drill \
into that one rather than repeating the question's own framing.
- Each question must be answerable from transaction data alone — dates, \
descriptions, amounts, categories, accounts. Never ask about investments, \
assets, net worth, or for advice.
- Prefer category names from the provided list, verbatim.
- Never repeat the question the user just asked.
- Maximum 80 characters each. Write in the same language as the question."""


def _clean(raw: object, original: str) -> list[str]:
    """Drop anything unusable, then cap at MAX_QUESTIONS.

    Mirrors the closed-vocabulary guard in QueryPlanner and the citation guard in
    AnswerService: the model's output is filtered by trusted code before it can
    reach the UI.
    """
    if not isinstance(raw, list):
        logger.warning("follow-up payload was %s, not a list — discarded", type(raw).__name__)
        return []

    asked = original.strip().casefold()
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        q = item.strip()
        key = q.casefold()
        if not q or len(q) > MAX_CHARS or key == asked or key in seen:
            continue
        seen.add(key)
        out.append(q)
        if len(out) == MAX_QUESTIONS:
            break
    return out


class FollowUpSuggester:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def suggest(self, request: FollowUpRequest, categories: list[str]) -> list[str]:
        try:
            raw = await self._provider.generate_json(
                SYSTEM_PROMPT,
                self._build_prompt(request, categories),
                FOLLOWUP_SCHEMA,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            )
        except Exception:
            # Suggestions are decorative: a failure here must never surface as an
            # error next to a perfectly good answer. The client falls back to its
            # own static chips when the list comes back empty.
            logger.exception("follow-up generation failed — returning no suggestions")
            return []
        return _clean(raw.get("questions"), request.question)

    @staticmethod
    def _build_prompt(request: FollowUpRequest, categories: list[str]) -> str:
        lines = [f"Known categories: {', '.join(categories)}"] if categories else []
        lines.append(f"Question the user asked: {request.question}")
        lines.append(f"Answer they received: {request.answer}")
        if request.intent == "aggregate" and request.total_idr is not None:
            lines.append(f"Verified total: Rp {request.total_idr:,.0f}")
        if request.contexts:
            rows = "\n".join(
                f"- {c.date} | {c.description} | {c.flow} | Rp {c.amount_idr:,.0f}"
                for c in request.contexts
            )
            lines.append(f"Transactions cited in the answer:\n{rows}")
        return "\n\n".join(lines)
```

> **Why:** `max_output_tokens=MAX_OUTPUT_TOKENS` is the cost-discipline requirement from
> [.claude/rules/ai-service.md](../rules/ai-service.md) — three short strings need nowhere near the
> provider default. Feeding `app.state.categories` in keeps suggestions inside the same closed
> vocabulary `QueryPlanner` can actually filter on, so a chip the model invents a category for
> can't produce an empty result set. `_clean` is a separate module-level function so it is testable
> without constructing a provider.

---

### [ ] STEP 3 — Wire the service and the endpoint

Three edits in `services/ai-service/app/main.py`.

**3a.** Add to the `from app.models import ...` line (keep it one line, matching the existing style):

```python
FollowUpRequest, FollowUpResponse
```

**3b.** Add next to the other service imports:

```python
from app.services.followup_suggester import FollowUpSuggester
```

**3c.** In the lifespan block, immediately after `app.state.planner = QueryPlanner(provider=provider)`:

```python
    app.state.followup_suggester = FollowUpSuggester(provider=provider)
```

**3d.** Add the endpoint directly after the existing `/ask` handler (before `_context_payload`):

```python
@app.post("/ask/followups", response_model=FollowUpResponse)
async def ask_followups(request: FollowUpRequest) -> FollowUpResponse:
    """Suggest 3 self-contained follow-up questions for the answer just streamed.

    Deliberately never raises. Suggestions are decorative — a provider failure
    returns an empty list and the client falls back to its static chips, rather
    than painting an error beside an answer that succeeded.
    """
    questions = await app.state.followup_suggester.suggest(request, app.state.categories)
    return FollowUpResponse(questions=questions)
```

> **Why:** reusing the same `provider` instance keeps Langfuse tracing (PF-AI001) on this call for
> free, so the added cost shows up in the existing dashboard instead of being invisible. Registering
> in the lifespan block matches how every other service on `app.state` is built. The endpoint returns
> 200-with-empty rather than 502 — an intentional departure from the error table in
> [.claude/rules/ai-service.md](../rules/ai-service.md), which governs the extraction path where an
> empty result would silently corrupt data; here an empty result is a valid, harmless outcome.

---

### [ ] STEP 4 — Unit tests for the suggester

Create `services/ai-service/tests/test_followup_suggester.py`:

```python
"""Unit tests for FollowUpSuggester — mocked provider, no real LLM calls.

The service's job is narrow: build a prompt from the Q&A and filter the model's
output down to at most 3 usable, non-duplicate, self-contained questions.
"""
import logging
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.models import FollowUpContext, FollowUpRequest
from app.services.followup_suggester import FOLLOWUP_SCHEMA, FollowUpSuggester

CATEGORIES = ["Room rent", "Food and drinks", "Electricity"]


def _request(**overrides) -> FollowUpRequest:
    base = {
        "question": "Kategori apa yang paling boros?",
        "answer": "Kategori 'Room rent' adalah yang paling boros, Rp 1.800.000 per bulan.",
        "intent": "aggregate",
        "total_idr": 17860000.0,
        "contexts": [FollowUpContext(date="2026-07-02", description="Room rent",
                                     amount_idr=1800000.0, flow="DB")],
    }
    return FollowUpRequest(**{**base, **overrides})


def _suggester(raw) -> tuple[FollowUpSuggester, AsyncMock]:
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value={"questions": raw})
    return FollowUpSuggester(provider), provider


def test_FollowupSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    # Reason: google-genai calls types.Schema.model_validate(response_schema)
    # before any API call — the same guard PLAN_SCHEMA needed after PF-132.
    types.Schema.model_validate(FOLLOWUP_SCHEMA)


@pytest.mark.asyncio
async def test_suggest_returns_three_cleaned_questions():
    suggester, _ = _suggester([
        "Bandingkan Room rent Juli vs Juni",
        "Rinci Food and drinks per minggu Juli 2026",
        "Transaksi Room rent terbesar tahun 2026?",
    ])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert len(result) == 3
    assert result[0] == "Bandingkan Room rent Juli vs Juni"


@pytest.mark.asyncio
async def test_suggest_drops_echo_of_original_question():
    suggester, _ = _suggester([
        "  kategori apa yang paling boros?  ",      # same question, different case/space
        "Bandingkan Room rent Juli vs Juni",
    ])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["Bandingkan Room rent Juli vs Juni"]


@pytest.mark.asyncio
async def test_suggest_dedupes_and_caps_at_three():
    suggester, _ = _suggester(["A?", "a?", "B?", "C?", "D?"])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["A?", "B?", "C?"]


@pytest.mark.asyncio
async def test_suggest_drops_over_length_and_empty_entries():
    suggester, _ = _suggester(["", "   ", "x" * 81, "Rinci Room rent per minggu"])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["Rinci Room rent per minggu"]


@pytest.mark.asyncio
async def test_suggest_returns_empty_list_when_provider_fails(caplog):
    provider = AsyncMock()
    provider.generate_json = AsyncMock(side_effect=RuntimeError("quota exhausted"))
    with caplog.at_level(logging.ERROR):
        result = await FollowUpSuggester(provider).suggest(_request(), CATEGORIES)
    assert result == []                                   # never raises to the caller
    assert any("follow-up generation failed" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_suggest_prompt_carries_answer_categories_and_citations():
    suggester, provider = _suggester(["Bandingkan Room rent Juli vs Juni"])
    await suggester.suggest(_request(), CATEGORIES)
    user_prompt = provider.generate_json.call_args.args[1]
    assert "Room rent" in user_prompt                     # answer content reached the model
    assert "Food and drinks" in user_prompt               # closed vocab injected
    assert "2026-07-02" in user_prompt                    # citation row injected


@pytest.mark.asyncio
async def test_suggest_caps_output_tokens():
    suggester, provider = _suggester(["Rinci Room rent per minggu"])
    await suggester.suggest(_request(), CATEGORIES)
    assert provider.generate_json.call_args.kwargs["max_output_tokens"] == 200
```

> **Why:** TEST-01 requires coverage of every public method, and TEST-02 fixes the naming shape.
> The Gemini schema-validation test exists because PF-132 was a production 502 caused by a schema
> that `types.Schema.model_validate` rejected before the API was ever called — cheap insurance.
> The `max_output_tokens` assertion pins the cost cap so a later refactor can't silently drop it.
> Per [.claude/rules/ai-service.md](../rules/ai-service.md), no test may reach a real provider.

---

### [ ] STEP 5 — Add the API client function

In `apps/frontend/src/api/chatApi.ts`, append after `streamAsk`:

```typescript
export interface FollowUpParams {
  question: string;
  answer: string;
  intent?: string;
  total_idr?: number;
  contexts: ContextItem[];
}

const FOLLOWUP_TIMEOUT_MS = 8000;

/** Suggestions are optional garnish — every failure resolves to [], never throws. */
export async function fetchFollowUps(
  params: FollowUpParams,
  signal: AbortSignal
): Promise<string[]> {
  try {
    const res = await fetch(`${AI_URL}/ask/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.any([signal, AbortSignal.timeout(FOLLOWUP_TIMEOUT_MS)]),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { questions?: string[] };
    return data.questions ?? [];
  } catch {
    return [];
  }
}
```

> **Why:** swallowing the rejection here rather than in the hook keeps the caller free of
> try/catch and guarantees the UI can only ever see a `string[]`. `AbortSignal.any` combines the
> caller's cancel signal with a hard timeout, so a hung provider can't leave chips pending forever —
> after 8s the list resolves empty and the static fallback renders.

---

### [ ] STEP 6 — Fetch follow-ups after the stream closes

In `apps/frontend/src/hooks/useChatSession.ts`:

**6a.** Add the field to `ChatMessage`:

```typescript
  followUps?: string[];       // undefined = still loading, [] = none (use static fallback)
```

**6b.** Add the import and a second abort ref:

```typescript
import { streamAsk, fetchFollowUps, type ContextItem } from '@/api/chatApi';
```

```typescript
  const followUpAbortRef = useRef<AbortController | null>(null);
```

**6c.** Rewrite `send` so the answer is buffered locally and the follow-up call fires from `onDone`:

```typescript
  const send = (query?: string) => {
    const q = (query ?? input).trim();
    if (!q || streaming) return;

    // A new question invalidates any in-flight suggestion request. Without this,
    // a late response would land on the wrong message via patchLast.
    followUpAbortRef.current?.abort();

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    // Buffered alongside the state updates: onDone needs the finished text and the
    // contexts synchronously, and reading them back out of setMessages would race.
    const answerBuffer: string[] = [];
    let contextSnapshot: ContextItem[] = [];
    let intentSnapshot: string | undefined;
    let totalSnapshot: number | undefined;

    const loadFollowUps = () => {
      const controller = new AbortController();
      followUpAbortRef.current = controller;
      fetchFollowUps(
        {
          question: q,
          answer: answerBuffer.join(''),
          intent: intentSnapshot,
          total_idr: totalSnapshot,
          contexts: contextSnapshot,
        },
        controller.signal
      ).then(questions => {
        if (controller.signal.aborted) return;
        patchLast(() => ({ followUps: questions }));
      });
    };

    abortRef.current = streamAsk(
      { query: q },
      {
        onMetadata: (meta) => {
          contextSnapshot = meta.contexts;
          intentSnapshot = meta.intent;
          totalSnapshot = meta.total_idr;
          patchLast(() => ({
            contexts: meta.contexts,
            intent: meta.intent,
            totalIdr: meta.total_idr,
            count: meta.count,
          }));
        },
        onToken: (token) => {
          answerBuffer.push(token);
          patchLast(last => ({ content: last.content + token }));
        },
        onDone: (payload) => {
          setStreaming(false);
          intentSnapshot = payload?.intent ?? intentSnapshot;
          totalSnapshot = payload?.total_idr ?? totalSnapshot;
          patchLast(last => {
            const patch: Partial<ChatMessage> = {
              verified: payload?.verified,
              intent: payload?.intent ?? last.intent,
              totalIdr: payload?.total_idr ?? last.totalIdr,
            };
            if (payload?.confident === false && last.content === '')
              patch.content = 'Tidak ada transaksi yang relevan untuk pertanyaan itu.';
            return patch;
          });

          // Nothing was answered — skip the call rather than pay for suggestions
          // about an empty result. [] resolves the loading state to the fallback.
          if (payload?.confident === false || answerBuffer.length === 0) {
            patchLast(() => ({ followUps: [] }));
            return;
          }
          loadFollowUps();
        },
        onError: () => {
          setStreaming(false);
          patchLast(last => ({
            error: true,
            followUps: [],
            content: last.content === ''
              ? 'Terjadi kesalahan saat memuat jawaban — coba lagi.'
              : last.content,
          }));
        },
      }
    );
  };
```

**6d.** Abort the follow-up request in `stop` too:

```typescript
  const stop = () => {
    abortRef.current?.abort();
    followUpAbortRef.current?.abort();
    setStreaming(false);
  };
```

> **Why:** the buffered `answerBuffer` mirrors the backend's own buffer-while-forwarding pattern in
> `/ask/stream` — reading the completed text out of React state inside `onDone` would race with the
> pending token updates. The abort-on-new-send guard is what makes `patchLast` safe: without it, a
> response arriving after the user has asked again would attach yesterday's suggestions to today's
> answer. `stop` aborts both so a cancelled answer doesn't still bill a suggestion call.

---

### [ ] STEP 7 — Render dynamic chips in the panel

In `apps/frontend/src/components/chat/AiChatPanel.tsx`:

**7a.** Replace `SUGGESTION_CHIPS` (line 28) with a self-contained fallback:

```typescript
// Fallback only — shown when the LLM suggestion call fails, times out, or the
// answer was unconfident. Each one is a complete question: /ask is stateless, so
// a fragment like "Rinci per minggu" reaches the planner with no antecedent.
const FALLBACK_CHIPS = [
  'Bandingkan pengeluaran bulan ini vs bulan lalu',
  'Rincikan pengeluaran bulan ini per minggu',
  'Kategori apa yang paling boros bulan ini?',
];
```

**7b.** Replace the `showChips` line (line 100) with:

```typescript
  const lastMessage = messages[messages.length - 1];
  const answered = !streaming && lastMessage?.role === 'assistant' && lastMessage.content !== '';
  // undefined = suggestions still in flight; render nothing rather than flashing
  // the fallback and swapping it out a moment later.
  const chips = !answered
    ? null
    : lastMessage.followUps === undefined
      ? null
      : lastMessage.followUps.length > 0
        ? lastMessage.followUps
        : FALLBACK_CHIPS;
```

**7c.** Replace the chip block (lines 191–203) with:

```tsx
        {chips && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="text-[11px] text-left text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:text-foreground hover:border-foreground/25 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
```

> **Why:** the three-way `undefined` / `[]` / populated check is what keeps the chips from flickering
> — rendering the fallback during the ~700ms fetch and then swapping it for real suggestions reads as
> a glitch. `text-left` is added because generated questions are longer than the old fixed chips and
> will wrap to two lines in the 420px panel. `setInput` is kept rather than `send` so the user can
> edit before submitting.

---

### [ ] STEP 8 — Verify

```bash
cd services/ai-service && pytest tests/test_followup_suggester.py -v && pytest
cd apps/frontend && npm run lint && npm run build
```

Then run the stack (`npm start`) and check by hand in the chat panel:

1. Ask "Kategori apa yang paling boros?" — the three chips that appear must name a real category
   from the answer, not the generic fallback text
2. Click a chip, press Enter — the answer must be about that category (proves self-containment)
3. Ask again while chips are still loading — no stale chips attach to the new answer
4. Stop `services/ai-service`'s provider access (unset `GEMINI_API_KEY` and restart) — chips must
   fall back to `FALLBACK_CHIPS` with no error banner
5. Check Langfuse: each answered question now shows one extra small generation trace

> **Why:** steps 2 and 4 are the two acceptance criteria that no unit test can prove — self-contained
> phrasing is a prompt-quality property, and the fallback path only shows up under real provider
> failure. Step 5 confirms the added cost is observable rather than hidden (PF-AI001).

---

## Notes

- **Cost:** one extra `generate_json` per answered question, ~150 output tokens on
  `gemini-2.5-flash`. Skipped entirely for unconfident/empty answers. If the Gemini free-tier
  20 req/day quota that currently blocks PF-AI005-PART2's eval is in play, this roughly halves the
  number of chat questions possible per day — worth knowing before testing manually.
- **Gemini schema constraint:** `FOLLOWUP_SCHEMA` must pass `types.Schema.model_validate` before any
  API call. Union types and `None`-in-enum fail there; that was the root cause of the PF-132 502s.
  The schema here is deliberately flat (object → array of string) to stay clear of it.
- **`ChatPage.tsx` is untouched.** The full-page `/chat` view has never rendered chips. The state
  lives on `ChatMessage` in the shared `useChatSession` provider, so adding chips there later is a
  render-only change with no plumbing.
- **THINK-05 not triggered:** no `TransactionDto` field is added or renamed, so no paired C#/Python
  contract update is required. `FollowUpContext` accepts the frontend's existing `ContextItem` shape
  and ignores the extra fields.
- The `.NET` API is not involved — the frontend already calls the AI service directly for chat via
  `VITE_AI_SERVICE_URL`.
