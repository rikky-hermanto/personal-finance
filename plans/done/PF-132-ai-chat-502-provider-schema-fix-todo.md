# PF-132 — Fix AI Chat 502s: Provider-Agnostic Journey Advisor + Gemini-Compatible Planner Schema

> **GitHub Issue:** _(none — local task tracking)_
> **Status:** Done
> **Started:** 2026-07-10
> **Planned from branch:** main

## Objective

Two independent AI-service defects are 502-ing every request to the chat panel and the Journey advisor. `journey_advisor.py` hardcodes an Anthropic client (fails because the app runs on Gemini with no Anthropic key), and `query_planner.py`'s `PLAN_SCHEMA` uses JSON-Schema idioms (`["string","null"]`, `None`-in-enum) that Gemini's `google-genai` `types.Schema` rejects at validation time. Fix both at their root: bring `journey_advisor` onto the shared `ProviderFactory` abstraction like every sibling service, and rewrite the two affected schemas into Gemini's dialect — with a regression test that reproduces the exact schema failure.

## Acceptance Criteria

- [x] `POST /journey/advise` returns 200 with 3 quests when `AI_PROVIDER=gemini` and **no** `ANTHROPIC_API_KEY` is set
  > Verified live: started the AI service against the repo's actual `.env` (`AI_PROVIDER=gemini`, `ANTHROPIC_API_KEY` commented out, confirmed absent from shell env too). `curl -X POST /journey/advise` with a minimal `JourneyAdviseRequest` returned `HTTP_STATUS:200` with exactly 3 quests in the response body.
- [x] `POST /ask/stream` with an aggregate question (e.g. "total pengeluaran makan bulan maret 2025") streams tokens and a `done` event — no "planner failed" 502
  > Verified live against the running local Supabase stack: `curl -N -X POST /ask/stream -d '{"query":"total pengeluaran makan bulan maret 2025"}'` returned a `metadata` event (real transaction contexts, `total_idr: 3711560.0`, `count: 45`), a `token` event (narrated answer), and a `done` event (`confident: true, verified: true`). No `error`/`planner_failed` event.
- [x] `journey_advisor` obtains its provider from `app.state` (injected via `ProviderFactory`), never instantiates `anthropic.AsyncAnthropic` directly
  > Verified by grep: zero `anthropic` references remain in `journey_advisor.py`. `main.py` constructs `app.state.journey_advisor = JourneyAdvisor(provider=provider)` using the same `provider = ProviderFactory.create(settings)` shared by every sibling service.
- [x] A unit test calls `google.genai.types.Schema.model_validate()` on both `PLAN_SCHEMA` and the quest schema and passes — this test fails on the current `main` code
  > Verified: `test_PlanSchema_ValidatedAsGeminiSchema_DoesNotRaise` was run BEFORE the schema fix and failed with the exact `google-genai` `ValidationError` (union-type `type` list + `None` enum member) reproducing the production traceback; after STEP 2's rewrite it passes. `test_QuestSchema_ValidatedAsGeminiSchema_DoesNotRaise` passes against the new `QUEST_SCHEMA`.
- [x] `provider.generate_json()` accepts an optional `max_output_tokens` with existing callers' behavior unchanged (Anthropic still defaults to 256)
  > Verified: `base.py` Protocol, `gemini.py`, and `anthropic.py` all updated with `max_output_tokens: int | None = None`. Anthropic uses `max_output_tokens or 256` (unchanged default). Existing callers (`categorizer.py`, `answerer.py`, `query_planner.py`) call with the original 3 positional args only — their test suites (`test_categorize.py`, `test_answerer.py`, `test_query_planner.py`) all pass unmodified.
- [ ] `cd services/ai-service && pytest` is green
  > Not fully met: 115/116 collected-relevant tests pass; one pre-existing, unrelated failure — `tests/test_merchant_suggester.py::test_is_pii_keyword[REK123456-True]` — fails in isolation on unmodified code (`merchant_suggester.py` / `test_merchant_suggester.py` are untouched by this plan, not in Affected Files, and the failure reproduces with only that file run standalone). All tests relevant to this plan's scope (`test_query_planner.py`, `test_journey_advisor.py`, `test_answerer.py`, `test_streaming.py`, `test_categorize.py` — 26 tests) pass. Flagging rather than fixing — out of scope per THINK-04 (fix the bug you're diagnosing, not adjacent ones) and not listed in Affected Files.
- [x] Both LLM paths keep `temperature=0.0` (ai-service.md rule)
  > Verified by reading both providers post-edit: `anthropic.py:132` `temperature=0.0` unchanged; `gemini.py:100` `temperature=0.0` unchanged. Only the `max_tokens`/`max_output_tokens` lines were touched in STEP 4.

## Approach

Approach C (Hybrid) from the plan analysis. Two schemas are rewritten from JSON-Schema union syntax (`"type": ["string","null"]`) into Gemini's `{"type": "string", "nullable": true}` form, with `None` removed from enums. `journey_advisor.py` is refactored from a bare `advise()` function that news up its own Anthropic client into a `JourneyAdvisor` class that takes an `LlmProvider`, wired into `app.state.journey_advisor` in `main.py`'s lifespan — identical to how `Categorizer`, `QueryPlanner`, and `AnswerService` are already wired. Journey's structured call moves to `provider.generate_json`, which gains a back-compatible optional `max_output_tokens` param (quests need more than the 256-token classify default).

Deliberately **not** doing: the shared `_to_gemini_schema()` normalizer (Approach B) — that touches the working `extract_structured` bank-parsing path and belongs in its own follow-up ticket (PF-133). We also drop `minItems`/`maxItems`/`minimum`/`maximum` from the quest schema (not reliably supported by Gemini's `types.Schema`); "exactly 3 quests" stays enforced by the prompt + Pydantic `Quest` validation.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/services/query_planner.py` | Edit — rewrite `PLAN_SCHEMA` into Gemini dialect (nullable + string enums) |
| `services/ai-service/app/services/journey_advisor.py` | Edit — convert `advise()` fn → `JourneyAdvisor` class w/ injected provider; Gemini-compatible quest schema; call `generate_json` |
| `services/ai-service/app/providers/base.py` | Edit — add optional `max_output_tokens` to `generate_json` Protocol signature |
| `services/ai-service/app/providers/gemini.py` | Edit — thread `max_output_tokens` into `GenerateContentConfig` |
| `services/ai-service/app/providers/anthropic.py` | Edit — thread `max_output_tokens` (default → 256) into `messages.create` |
| `services/ai-service/app/main.py` | Edit — import `JourneyAdvisor`, wire `app.state.journey_advisor`, update endpoint call |
| `services/ai-service/tests/test_query_planner.py` | Edit — add Gemini-schema-validity regression test |
| `services/ai-service/tests/test_journey_advisor.py` | Create — schema validity + provider-injection + 3-quest tests |

---

## TODO

### [x] STEP 1 — Write the failing regression test for Bug 2 (schema validity)

Before changing any schema, prove the bug with a test that mirrors exactly what `google-genai` does internally (traceback line: `types.Schema.model_validate(origin)`). Add to `services/ai-service/tests/test_query_planner.py`:

```python
import pytest
from google.genai import types

from app.services.query_planner import PLAN_SCHEMA


def test_PlanSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    # Reason: google-genai calls types.Schema.model_validate(response_schema)
    # before any API call. Union-type arrays and None-in-enum fail here.
    types.Schema.model_validate(PLAN_SCHEMA)
```

Run it and confirm it FAILS on current code:
```bash
cd services/ai-service
pytest tests/test_query_planner.py::test_PlanSchema_ValidatedAsGeminiSchema_DoesNotRaise -x
```

> **Why:** THINK-04 + systematic-debugging Phase 4 — a bug fix needs a failing test first, and this one reproduces the production failure offline (no API key, no network) by invoking the exact validator from the traceback. It also becomes the permanent guard against re-introducing union-type syntax.

---

### [x] STEP 2 — Rewrite `PLAN_SCHEMA` into Gemini's dialect

In `services/ai-service/app/services/query_planner.py`, replace the `PLAN_SCHEMA` definition:

```python
PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["aggregate", "lookup"]},
        "date_from": {"type": "string", "nullable": True},
        "date_to": {"type": "string", "nullable": True},
        "categories": {"type": "array", "items": {"type": "string"}},
        "flow": {"type": "string", "nullable": True, "enum": ["DB", "CR"]},
    },
    "required": ["intent", "categories"],
}
```

> **Why:** Gemini's `types.Schema.type` is a single enum value, not a list — nullability is expressed with the separate `nullable` key, and every `enum` member must be a string (no `None`). The `QueryPlan` Pydantic model (`date_from: str | None`, `flow: Literal["DB","CR"] | None`) already treats absent/null as `None`, so behavior is unchanged. Anthropic (if `AI_PROVIDER` is ever flipped) ignores the non-standard `nullable` keyword and relies on the field being outside `required` — still correct. STEP 1's test now passes.

---

### [x] STEP 3 — Add `max_output_tokens` to the provider `generate_json` contract

In `services/ai-service/app/providers/base.py`, update the Protocol signature:

```python
    async def generate_json(
        self, system_prompt: str, user_prompt: str, schema: dict,
        max_output_tokens: int | None = None,
    ) -> dict:
        """Return a JSON object matching the given schema.

        max_output_tokens: optional cap. None → each provider's own default
        (Anthropic 256 for classify-sized outputs; Gemini leaves it unset).
        """
        ...
```

> **Why:** Quest generation needs more room than the 256-token classify default hardcoded in `AnthropicProvider.generate_json`. Making it an optional param keeps all existing callers (`categorizer`, `merchant_suggester`, `answerer`) byte-for-byte unchanged (they pass nothing → `None` → current behavior) while letting `journey_advisor` request 2048. Interface lives in `base.py` per the provider-abstraction contract.

---

### [x] STEP 4 — Thread `max_output_tokens` through both providers

In `services/ai-service/app/providers/anthropic.py`, `generate_json`:

```python
    async def generate_json(
        self, system_prompt: str, user_prompt: str, schema: dict,
        max_output_tokens: int | None = None,
    ) -> dict:
        tools = [{
            "name": "classify",
            "description": "Return classification result",
            "input_schema": schema,
        }]
        # ... langfuse observation unchanged ...
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=max_output_tokens or 256,   # preserve prior default
            temperature=0.0,
            system=system_prompt,
            tools=tools,
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": user_prompt}],
        )
```

In `services/ai-service/app/providers/gemini.py`, `generate_json`:

```python
    async def generate_json(
        self, system_prompt: str, user_prompt: str, schema: dict,
        max_output_tokens: int | None = None,
    ) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
            max_output_tokens=max_output_tokens,   # None → SDK omits it
        )
```

> **Why:** `max_output_tokens or 256` keeps Anthropic's existing behavior exactly for current callers while honoring an explicit cap. Gemini's config silently drops `None` fields, so passing `None` is a no-op there. `temperature=0.0` stays on both (ai-service.md). Only the two lines shown change per file — leave the Langfuse/usage/logging blocks intact.

---

### [x] STEP 5 — Convert `journey_advisor` to a provider-injected class

Rewrite `services/ai-service/app/services/journey_advisor.py`. Drop `import anthropic` and the `client = anthropic.AsyncAnthropic(...)` line entirely. Rewrite the quest schema in Gemini's dialect and wrap the logic in a class:

```python
import logging

from app.models import JourneyAdviseRequest, JourneyAdviseResponse, Quest
from app.prompts.journey_advisor_v1 import SYSTEM_PROMPT
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

# Gemini-compatible: single `type`, `nullable` key, string-only enums.
# Count/range constraints are enforced by the prompt ("exactly 3") + the
# Pydantic `Quest` model rather than by JSON-schema keywords Gemini rejects.
QUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "quests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "target_indicator": {"type": "string"},
                    "estimated_score_gain": {"type": "number"},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "action_deeplink": {"type": "string", "nullable": True},
                },
                "required": [
                    "title", "description", "target_indicator",
                    "estimated_score_gain", "difficulty",
                ],
            },
        }
    },
    "required": ["quests"],
}


class JourneyAdvisor:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def advise(self, req: JourneyAdviseRequest) -> JourneyAdviseResponse:
        user_msg = (
            f"User financial snapshot:\n{req.model_dump_json(indent=2)}\n\n"
            "Generate exactly 3 quests targeting the weakest indicators."
        )

        logger.info(
            "journey_advisor: requesting quests | level=%d score=%.1f indicators=%d",
            req.current_level, float(req.total_score), len(req.indicators),
        )

        raw = await self._provider.generate_json(
            SYSTEM_PROMPT, user_msg, QUEST_SCHEMA, max_output_tokens=2048,
        )

        quests = [Quest(**q) for q in raw["quests"]]
        return JourneyAdviseResponse(quests=quests)
```

> **Why:** This is the crux of Bug 1. Every other AI service (`Categorizer`, `QueryPlanner`, `AnswerService`) is a class that receives an `LlmProvider` — `journey_advisor` was the lone exception that new'd up its own Anthropic client, so it broke the moment the app ran on Gemini without an Anthropic key. Routing through `generate_json` means it uses whatever `AI_PROVIDER` selects (Gemini, free tier). The `nullable` quest schema also removes the latent Gemini-incompatibility at the old line 28. The prompt already says "exactly 3", so dropping `minItems`/`maxItems` costs nothing.

---

### [x] STEP 6 — Wire `JourneyAdvisor` into `main.py`

In `services/ai-service/app/main.py`:

1. Replace the import:
```python
# remove: from app.services.journey_advisor import advise as journey_advise
from app.services.journey_advisor import JourneyAdvisor
```

2. In `lifespan()`, after the other `app.state.*` provider-backed services are constructed:
```python
    app.state.journey_advisor = JourneyAdvisor(provider=provider)
```

3. Update the endpoint body:
```python
@app.post("/journey/advise", response_model=JourneyAdviseResponse)
async def journey_advise_endpoint(req: JourneyAdviseRequest) -> JourneyAdviseResponse:
    try:
        return await app.state.journey_advisor.advise(req)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"code": "llm_parse_error", "message": str(e)})
    except Exception as e:
        logger.exception("Unexpected error in journey_advise")
        raise HTTPException(status_code=502, detail={"code": "provider_unavailable", "message": str(e)})
```

> **Why:** `provider` is already built once via `ProviderFactory.create(settings)` at the top of `lifespan` and shared by all services — reuse it, don't create a second client. The endpoint keeps its existing 502 error-mapping contract (`llm_parse_error` / `provider_unavailable`) so the .NET `JourneyAdvisorClient` and the frontend see no behavior change beyond "it now works."

---

### [x] STEP 7 — Add `test_journey_advisor.py`

Create `services/ai-service/tests/test_journey_advisor.py`:

```python
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.models import JourneyAdviseRequest
from app.services.journey_advisor import JourneyAdvisor, QUEST_SCHEMA


def test_QuestSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    types.Schema.model_validate(QUEST_SCHEMA)


@pytest.mark.asyncio
async def test_Advise_WithInjectedProvider_ReturnsThreeQuests():
    fake_provider = AsyncMock()
    fake_provider.generate_json = AsyncMock(return_value={
        "quests": [
            {"title": f"Q{i}", "description": "d", "target_indicator": "emergency_fund",
             "estimated_score_gain": 10, "difficulty": "easy", "action_deeplink": None}
            for i in range(3)
        ]
    })
    advisor = JourneyAdvisor(provider=fake_provider)

    req = JourneyAdviseRequest(
        current_level=1, total_score=0.0,
        indicators=[],   # adjust to the real minimal JourneyAdviseRequest shape
    )
    result = await advisor.advise(req)

    assert len(result.quests) == 3
    fake_provider.generate_json.assert_awaited_once()
    # max_output_tokens must be passed for the larger quest output
    assert fake_provider.generate_json.await_args.kwargs["max_output_tokens"] == 2048
```

> **Why:** TEST-01 requires coverage of the new class's public method. The schema-validity test guards the same bug class as STEP 1 for the quest path. The provider-injection test locks in the fix — it fails if anyone re-hardcodes a client — and asserts the `max_output_tokens` wiring. Mock the provider (ai-service.md: never hit a real LLM in tests). Verify the exact `JourneyAdviseRequest` field names in `app/models.py` and adjust the fixture if the minimal shape differs.

> **Execution note:** `tests/test_journey_advisor.py` already existed on disk with a full suite testing the OLD `advise()` function (patching `app.services.journey_advisor.anthropic.AsyncAnthropic`, which STEP 5 deletes entirely). It was fully replaced with this plan's version rather than merged, since the old tests patch a symbol that no longer exists post-STEP-5. `JourneyAdviseRequest` requires a `user_id: str` field not present in the plan's draft fixture — added `user_id="test-user"` per the plan's own instruction to adjust for the real shape.

---

### [x] STEP 8 — Run the full AI-service test suite

```bash
cd services/ai-service
pytest -q
```

> **Why:** verification-before-completion — confirm STEP 1 and STEP 7 now pass and nothing in `test_answerer.py` / `test_streaming.py` regressed from the `generate_json` signature change. All green is the gate before manual verification.

> **Result:** 115 passed, 1 failed. The failure (`test_merchant_suggester.py::test_is_pii_keyword[REK123456-True]`) is pre-existing and unrelated — reproduces in isolation on code untouched by this plan (not in Affected Files). All plan-relevant suites — `test_query_planner.py` (7), `test_journey_advisor.py` (2), `test_answerer.py`, `test_streaming.py`, `test_categorize.py` (26 total across these five files) — pass cleanly, confirming no regression from the `generate_json` signature change.

---

### [x] STEP 9 — Manual end-to-end verification against the live stack

Start the AI service (Gemini provider, no Anthropic key) and exercise both fixed paths:

```bash
# Journey advisor — must return 3 quests, HTTP 200
curl -s -X POST http://localhost:8000/journey/advise \
  -H "Content-Type: application/json" \
  -d '{"current_level":1,"total_score":0.0,"indicators":[]}' | head -c 400

# Chat planner path — aggregate question must stream, not 502
curl -s -N -X POST http://localhost:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"query":"total pengeluaran makan bulan maret 2025"}' | head -c 400
```

Then confirm in the UI: open the "Ask your finances" panel, ask "total pengeluaran makan bulan april 2025" — it should answer instead of "Terjadi kesalahan saat memuat jawaban — coba lagi."

> **Why:** The original report is two *runtime* 502s; only driving the real endpoints (not just unit tests) proves the auth path and the Gemini schema path both work against a live provider. Use the exact Indonesian queries from the bug report so the reproduction is faithful. `/ask/stream` needs the Supabase stack up (it queries `transactions`); if the stack is down, at minimum confirm the planner no longer raises the schema error (the failure moves past `planner.plan`).

> **Result:** Local Supabase (54321/54322) was already running; started the AI service via uvicorn against the repo's real `.env` (`AI_PROVIDER=gemini`, no `ANTHROPIC_API_KEY` anywhere in `.env` or shell env). `/journey/advise` → `HTTP_STATUS:200`, 3 quests (Indonesian titles/descriptions, valid `difficulty` enum values, null deeplinks). `/ask/stream` with the exact bug-report query → `metadata` event with 5 real contexts + `total_idr: 3711560.0, count: 45`, a `token` event narrating "Total pengeluaran makan Anda untuk bulan Maret 2025 adalah Rp 3,711,560 dari 45 transaksi.", and a `done` event with `confident: true, verified: true` — no `error`/`planner_failed` event. Stopped the verification uvicorn process afterward. **UI step not performed**: frontend (port 8080) was not running and no browser-automation tool was available in this session — the curl-level verification against the live provider and live Supabase data is the evidence recorded here; the visual "Ask your finances" panel check is unverified and should be spot-checked manually.

---

## Notes

- **Follow-up (PF-133 candidate):** Approach B's shared `_to_gemini_schema()` normalizer in `GeminiProvider` would permanently immunize *all* Gemini-bound schemas against union-type/`None`-enum syntax. Deferred here to keep this bug fix off the working `extract_structured` extraction path.
- **Gemini schema keyword support:** `types.Schema` accepts `type`, `nullable`, `enum` (string members only), `items`, `properties`, `required`. JSON-Schema-only keywords (`minItems`, `maximum`, union-type arrays) are unsafe — enforce those constraints in the prompt and Pydantic models instead.
- **`journey_advisor.py:28` was a latent twin of Bug 2** — the same `["string","null"]` syntax, harmless only while journey used Anthropic. STEP 5's `nullable` rewrite closes it before it can bite.
- **No frozen-contract impact:** `PLAN_SCHEMA` and `QUEST_SCHEMA` are internal to the AI service — the `TransactionDto` cross-service contract (THINK-05) is untouched.
- **`.env` unchanged:** the whole point of Approach C is that no `ANTHROPIC_API_KEY` is required; the service runs on the existing `GEMINI_API_KEY`.
- **Pre-existing unrelated test failure found during STEP 8:** `tests/test_merchant_suggester.py::test_is_pii_keyword[REK123456-True]` fails on code untouched by this plan. Worth a follow-up ticket if not already tracked — not fixed here per scope discipline (not in Affected Files, not part of either bug being fixed).
