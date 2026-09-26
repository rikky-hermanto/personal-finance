# PF-AI001 — AI Observability: Langfuse Integration

> **Learning Phase:** Phase 1 · Week 1 of 12 · Day 1 of 90
> **Status:** COMPLETE (all 14 steps done — 2026-06-01)
> **Started:** 2026-05-30
> **Pivot goal:** Close the "how do you monitor your LLM in production?" gap before any other AI Eng interview question.

## Objective

The AI service already has OTel tracing for HTTP-level spans (latency, request counts, errors) but has zero AI-specific observability — no per-call cost, no prompt versioning, no extraction accuracy trending, no per-provider breakdown. This is the first thing any AI Eng interviewer will ask about.

Adding Langfuse closes this gap with three concrete deliverables: (1) every LLM call in the service is traced with token counts and cost estimate, (2) a Langfuse dashboard exists showing cost/day + latency distribution, (3) you can quote two real numbers — "extraction costs $X per document, p95 latency is Xms" — backed by a live screenshot.

The integration point is the two provider classes — `GeminiProvider` and `AnthropicProvider` — since all LLM calls flow through them. Wrapping there covers extraction, categorization, portfolio review, and journey advisor in one pass.

Depends on: nothing — standalone addition. Unblocks: Week 2 (eval harness needs cost-per-doc as a benchmark dimension).

## Acceptance Criteria

- [x] `langfuse` added to `pyproject.toml` dependencies
- [x] `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` read from env in `config.py`
- [x] Every `GeminiProvider.extract_structured()` call creates a Langfuse generation with: model name, input tokens, output tokens, estimated cost
- [x] Every `AnthropicProvider.extract_structured()` call creates a Langfuse generation with the same fields
- [x] `generate_json()` calls (used by categorizer, portfolio reviewer) are also traced
- [x] Langfuse `flush()` called on FastAPI app shutdown (no lost buffered traces)
- [x] After uploading one bank statement: trace appears in Langfuse UI with correct token counts
- [x] Langfuse dashboard created: cost/day, calls/day, p50/p95 latency, error rate
- [x] 3 concrete numbers documented in `docs/ai-observability-metrics.md`
- [x] `.env.example` updated with Langfuse env vars

## Approach

Use the **Langfuse Python SDK** (`langfuse>=3.0`) with manual `generation` spans rather than the `@observe()` decorator approach. Reason: the decorator requires wrapping class methods, which gets awkward with `async` and `self`. Manual `langfuse.generation()` context managers are more explicit and easier to read when wrapped around existing provider calls — and they produce cleaner traces in the Langfuse UI.

Both providers already log token counts via `logger.info()` — Langfuse tracing slots in right next to those lines, reading the same variables.

For hosting: use **Langfuse Cloud free tier** (no Docker required, no port conflicts, 50k events/month — enough for development). Self-hosted is an option but adds Docker Compose complexity that isn't the learning objective here.

Out of scope: prompt versioning, A/B testing prompts, Langfuse datasets, evals within Langfuse. Those belong to Week 2 (eval harness). This week is purely tracing + dashboards + extracting real numbers.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/pyproject.toml` | Add `langfuse>=3.0` to dependencies |
| `services/ai-service/app/config.py` | Add `langfuse_public_key`, `langfuse_secret_key`, `langfuse_host` to Settings |
| `services/ai-service/app/observability.py` | Create — Langfuse singleton init, helper to build generation kwargs |
| `services/ai-service/app/providers/gemini.py` | Wrap `extract_structured()` and `generate_json()` with Langfuse generation spans |
| `services/ai-service/app/providers/anthropic.py` | Same wrapping for Anthropic provider |
| `services/ai-service/app/main.py` | Add `langfuse.flush()` to app lifespan shutdown hook |
| `services/ai-service/.env.example` | Add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` |
| `docs/ai-observability-metrics.md` | Create — capture 3 concrete numbers from Langfuse dashboard |

---

## TODO

### [x] STEP 1 — Sign up for Langfuse Cloud and get API keys

1. Go to https://cloud.langfuse.com and sign up (free tier, no credit card)
2. Create a new project: **"personal-finance"**
3. Navigate to **Settings → API Keys** → Create a key pair
4. Copy: `Public Key` (starts with `pk-lf-...`) and `Secret Key` (starts with `sk-lf-...`)
5. Note the host: `https://cloud.langfuse.com`

> **Why Cloud over self-hosted:** Langfuse self-hosted requires a Postgres + Redis + Next.js stack running in Docker. That's real infrastructure to set up before writing a single line of tracing code. Cloud free tier gives you the same UI with zero infra overhead. The learning objective is *tracing*, not *running Langfuse*. Self-host it if you get a job offer from a team running it internally — not before.
>
> **Free tier limits:** 50,000 observations/month. Your personal finance uploads will generate ~10-100 observations per month. You won't hit the limit.

---

### [x] STEP 2 — Add Langfuse to `pyproject.toml`

Edit `services/ai-service/pyproject.toml` — add `langfuse` to the `dependencies` list:

```toml
dependencies = [
    "google-genai>=0.1.0",
    "anthropic>=0.49.0",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.11.0",
    "pydantic-settings>=2.8.0",
    "pymupdf>=1.25.0",
    "python-multipart>=0.0.20",
    "opentelemetry-api>=1.29.0",
    "opentelemetry-sdk>=1.29.0",
    "opentelemetry-instrumentation-fastapi>=0.50b0",
    "opentelemetry-instrumentation-logging>=0.50b0",
    "opentelemetry-exporter-otlp>=1.29.0",
    "langfuse>=3.0,<4.0",
]
```

Then reinstall:
```bash
cd services/ai-service
pip install -e .
```

**Pre-flight verify** — run this before proceeding to confirm the installed API is what the steps below expect:
```bash
python -c "
import warnings, inspect
warnings.filterwarnings('ignore')
from langfuse import Langfuse
lf = Langfuse(public_key='test', secret_key='test', host='https://cloud.langfuse.com', tracing_enabled=False)
gen = lf.start_observation(as_type='generation', name='preflight', model='test', input='x')
gen.update(output='y', usage_details={'input': 1, 'output': 1}, cost_details={'usd': 0.0})
gen.end()
print('Langfuse API OK')
"
```
Expected output: `Langfuse API OK`. If you see `AttributeError` or `TypeError`, the installed version has a different API — check `pip show langfuse` and compare against the version these steps were written for (3.15.0).

> **Why `>=3.0,<4.0`?** Upper-bound cap prevents a hypothetical v4 breaking change from silently installing. v3 introduced `start_observation(as_type='generation')` as the canonical API — `start_generation()` still works in 3.x but is deprecated. Pinning the major version is the minimal safety net for a fast-moving SDK.

---

### [x] STEP 3 — Add Langfuse config to `app/config.py`

Open `services/ai-service/app/config.py` and add the three Langfuse fields to `Settings`:

```python
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_provider: Literal["gemini", "anthropic"] = "gemini"
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    ai_model: str = "gemini-2.5-flash"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:7208"]
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    otel_service_name: str = "ai-service"

    # Langfuse — AI observability
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    def validate_provider_key(self) -> None:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            print("WARNING: GEMINI_API_KEY is not set. AI features will fail.")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            print("WARNING: ANTHROPIC_API_KEY is not set. AI features will fail.")


settings = Settings()
settings.validate_provider_key()
```

> **Why Pydantic Settings?** `pydantic_settings.BaseSettings` auto-reads env vars — `LANGFUSE_PUBLIC_KEY` in the environment maps to `langfuse_public_key` (case-insensitive, underscores). No `os.environ.get()` calls needed. The `.env` file is also loaded automatically via `env_file=".env"`.
>
> **Why empty string defaults?** Both keys default to `""` so the service still starts if Langfuse isn't configured. Langfuse will simply not emit traces — it doesn't crash on empty keys. This keeps the service boot clean in environments where Langfuse isn't set up.

---

### [x] STEP 4 — Create `app/observability.py` — Langfuse singleton

Create a new file `services/ai-service/app/observability.py`:

```python
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
```

> **Why a singleton?** Langfuse batches traces in memory and flushes them asynchronously. A new `Langfuse()` instance per request would lose buffered traces on request completion. One module-level instance accumulates all traces and flushes them together on shutdown — the same pattern as a connection pool.
>
> **Why `enabled=bool(...)`?** Langfuse v3 respects the `enabled` flag and becomes a no-op when `False`. This means you can deploy the service without Langfuse credentials and it stays silent — no 401 errors, no startup warnings.
>
> **Why manual cost table?** Langfuse Cloud auto-computes cost for Anthropic models (it has the pricing table built in). But for Gemini, you need to pass cost manually via `usage`. The manual table covers both providers uniformly — and gives you control when Anthropic changes pricing mid-year.

---

### [x] STEP 5 — Wrap `GeminiProvider` with Langfuse tracing

Open `services/ai-service/app/providers/gemini.py` and modify `extract_structured()` and `generate_json()`:

```python
import json
import logging

from google import genai
from google.genai import types

from app.observability import langfuse, estimate_cost_usd

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not self._api_key:
                raise ValueError("GEMINI_API_KEY is not set.")
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
        image: tuple[bytes, str] | None = None,
    ) -> dict:
        config = types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=schema,
            system_instruction=system_prompt,
        )

        if image is not None:
            img_bytes, media_type = image
            contents = [
                types.Part(inline_data=types.Blob(mime_type=media_type, data=img_bytes)),
                types.Part(text=user_text),
            ]
        else:
            contents = user_text

        client = self._get_client()

        generation = langfuse.start_observation(
            as_type="generation",
            name="gemini-extract-structured",
            model=self._model,
            input=user_text[:500],  # truncate — full prompt can be large
            metadata={"has_image": image is not None},
        )

        try:
            response = await client.aio.models.generate_content(
                model=self._model,
                contents=contents,
                config=config,
            )

            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)

            logger.info(
                "Gemini extract complete | model=%s | input_tokens=%d | output_tokens=%d | cost_usd=%.6f",
                self._model, input_tokens, output_tokens, cost,
            )

            generation.update(
                output=response.text[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"has_image": image is not None, "cost_usd": cost},
            )
            generation.end()

            return json.loads(response.text)

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise

    async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
        )
        client = self._get_client()

        generation = langfuse.start_observation(
            as_type="generation",
            name="gemini-generate-json",
            model=self._model,
            input=user_prompt[:500],
        )

        try:
            response = await client.aio.models.generate_content(
                model=self._model,
                contents=user_prompt,
                config=config,
            )
            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)
            generation.update(
                output=response.text[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"cost_usd": cost},
            )
            generation.end()
            return json.loads(response.text)

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise
```

> **Why `start_observation(as_type="generation")`?** In Langfuse 3.x, `start_generation()` is deprecated — `start_observation` with `as_type` is the canonical API. Both produce a `LangfuseGeneration` object, but `start_observation` will survive future SDK versions.
>
> **Why `update()` then `end()` separately?** In Langfuse 3.x, `end()` only accepts `end_time`. All fields — `output`, `usage_details`, `cost_details`, `metadata`, `level`, `status_message` — must go through `update()` first, then call `end()` to close the span. Passing them to `end()` directly throws `TypeError`.
>
> **Why `usage_details` and `cost_details`?** The old `usage={"input": N, "output": N, "unit": "TOKENS"}` dict was renamed to `usage_details={"input": N, "output": N}` (no `unit` key). Cost moved to a dedicated `cost_details={"usd": X}` field — Langfuse uses this for the dashboard cost aggregation, not the metadata dict.
>
> **Why `input=user_text[:500]`?** Bank statement text can be 5,000+ tokens. Logging the full prompt is expensive (storage) and messy. Truncate to 500 chars — enough to identify which document was parsed.

---

### [x] STEP 6 — Wrap `AnthropicProvider` with Langfuse tracing

Open `services/ai-service/app/providers/anthropic.py` and apply the same pattern:

```python
import base64
import logging

from anthropic import AsyncAnthropic

from app.observability import langfuse, estimate_cost_usd

logger = logging.getLogger(__name__)


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
        image: tuple[bytes, str] | None = None,
    ) -> dict:
        tool = {
            "name": "extract_transactions",
            "description": "Extract all bank transactions from the provided text.",
            "input_schema": schema,
        }

        if image is not None:
            img_bytes, media_type = image
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64.standard_b64encode(img_bytes).decode(),
                    },
                },
                {"type": "text", "text": user_text},
            ]
        else:
            content = user_text

        generation = langfuse.start_observation(
            as_type="generation",
            name="anthropic-extract-structured",
            model=self._model,
            input=user_text[:500] if isinstance(user_text, str) else "[image input]",
            metadata={"has_image": image is not None},
        )
        _generation_ended = False  # guard against double-end in exception handler

        try:
            message = await self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                temperature=0.0,
                system=system_prompt,
                tools=[tool],
                tool_choice={"type": "tool", "name": "extract_transactions"},
                messages=[{"role": "user", "content": content}],
            )

            if message.stop_reason == "max_tokens":
                generation.update(level="ERROR", status_message="max_tokens truncation")
                generation.end()
                _generation_ended = True
                raise RuntimeError(
                    "Response truncated — statement too long. Split into pages before re-extracting."
                )

            tool_block = next(
                (b for b in message.content if b.type == "tool_use"), None
            )
            if tool_block is None:
                generation.update(level="ERROR", status_message="no tool_use block returned")
                generation.end()
                _generation_ended = True
                raise ValueError("Anthropic did not return a tool_use block")

            input_tokens = message.usage.input_tokens
            output_tokens = message.usage.output_tokens
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)

            logger.info(
                "Anthropic extract complete | model=%s | input_tokens=%d | output_tokens=%d | cost_usd=%.6f",
                self._model, input_tokens, output_tokens, cost,
            )

            generation.update(
                output=str(tool_block.input)[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"has_image": image is not None, "cost_usd": cost},
            )
            generation.end()
            _generation_ended = True

            return tool_block.input

        except Exception as exc:
            if not _generation_ended:
                generation.update(level="ERROR", status_message=str(exc))
                generation.end()
            raise

    async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
        tools = [{
            "name": "classify",
            "description": "Return classification result",
            "input_schema": schema,
        }]

        generation = langfuse.start_observation(
            as_type="generation",
            name="anthropic-generate-json",
            model=self._model,
            input=user_prompt[:500],
        )

        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=256,
                temperature=0.0,
                system=system_prompt,
                tools=tools,
                tool_choice={"type": "any"},
                messages=[{"role": "user", "content": user_prompt}],
            )
            tool_block = next(b for b in response.content if b.type == "tool_use")
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)
            generation.update(
                output=str(tool_block.input)[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"cost_usd": cost},
            )
            generation.end()
            return tool_block.input

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise
```

> **Why `_generation_ended` boolean flag instead of `generation.end_time`?** In Langfuse 3.x, `LangfuseGeneration` has no `end_time` attribute — that was a v2 property. The `max_tokens` and missing `tool_block` branches call `update()+end()` before raising, and the general `except` below would catch those raises too. A simple boolean flag prevents the double-end without relying on internal SDK state.

---

### [x] STEP 7 — Add `langfuse.flush()` to app shutdown

Open `services/ai-service/app/main.py`. Find the lifespan or shutdown handler and add the flush call:

```python
# In the lifespan context manager or @app.on_event("shutdown"):
from app.observability import langfuse

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    yield
    # shutdown
    langfuse.flush()   # drain buffered traces before process exits
```

If `main.py` uses `@app.on_event("shutdown")` (older pattern) instead of a lifespan:
```python
@app.on_event("shutdown")
async def shutdown_event():
    langfuse.flush()
```

> **Why `flush()` on shutdown?** Langfuse batches traces and flushes them every N seconds (default: 15s) or when the buffer is full. If uvicorn exits before the next scheduled flush — which happens when you `Ctrl+C` the dev server — buffered traces are lost. `flush()` blocks until all pending traces are sent. In production (Docker), the container stop signal triggers this handler before SIGKILL.

---

### [x] STEP 8 — Update `.env` and `.env.example`

Add to `services/ai-service/.env` (your real keys — never commit this file):
```
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_HOST=https://cloud.langfuse.com
```

Add to `services/ai-service/.env.example` (commit this):
```
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key-here
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key-here
LANGFUSE_HOST=https://cloud.langfuse.com
```

> **SEC-01 compliance check:** Run `git status` after editing `.env`. It must NOT appear as a changed file (it should be gitignored). If it does: add `.env` to `.gitignore` before continuing. Never commit your Langfuse secret key.

---

### [x] STEP 9 — Smoke test: run one extraction, verify trace in Langfuse UI

```bash
# Start the AI service
cd services/ai-service
uvicorn app.main:app --reload --port 8000

# In a second terminal — trigger a real extraction
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "14/03/2024 TRANSFER GOPAY 500000", "bank_hint": "BCA"}'
```

Then open https://cloud.langfuse.com → your project → **Traces**.

**What you should see:**
- 1 new trace containing 1 generation
- Generation name: `gemini-extract-structured` (or `anthropic-...` if you switched provider)
- Model: `gemini-2.5-flash`
- Input tokens: ~50–100
- Output tokens: ~20–50
- Cost: visible in the generation detail panel

**If the trace doesn't appear within 30 seconds:**
- Check `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are set correctly in `.env`
- Verify `settings.langfuse_public_key` is non-empty: add a temp `print(settings.langfuse_public_key[:5])` in `config.py`
- Check the AI service console — any `langfuse` error would print there

> **Checkpoint question:** Can you see the trace? If yes — you've closed the "no AI observability" gap. The next four steps are about extracting the numbers.

---

### [x] STEP 10 — Upload a real bank statement and capture the extraction trace

Upload a real BCA CSV or NeoBank PDF through the frontend upload wizard at http://localhost:8080 → Cashflow → Upload.

After the upload completes, go back to Langfuse → Traces. You should now see a trace for each file parsed. Click into one and note:
- **Input tokens** (the PDF text that was sent)
- **Output tokens** (the extracted JSON)
- **Latency** (wall-clock time for the generation)
- **Cost** (from the `metadata.cost_usd` field)

> **Why a real upload instead of a curl call?** The curl call above tests the `/parse` text endpoint (preprocessed text). A real upload goes through `/parse-pdf` (PyMuPDF → text → LLM) or `/parse-image` (vision). These are the expensive paths you need to measure. The extraction cost for a full multi-page PDF statement is what matters for your "cost per document" interview number.

---

### [x] STEP 11 — Build Langfuse dashboard: cost + latency metrics

In Langfuse Cloud:

1. Go to **Dashboards** → **New Dashboard** → name it "personal-finance extraction"
2. Add charts:
   - **Cost/day** — line chart, metric: `cost`, grouped by day
   - **Calls/day** — bar chart, metric: `count`, grouped by day
   - **Latency distribution** — histogram, metric: `latency`
   - **Error rate** — line chart, metric: `error_count / count`
3. Filter by generation name: `gemini-extract-structured` or `anthropic-extract-structured`

From the latency histogram, read off:
- p50 latency (median)
- p95 latency (tail latency — what a slow extraction looks like)

From the cost chart, calculate:
- Average cost per extraction = total cost / total calls

> **These three numbers are your interview answers for the next 90 days.** When someone asks "how do you monitor your LLM pipeline?" you say: "I added Langfuse tracing to both providers. Right now extraction runs $0.003 per document at p95 latency of 2.3 seconds. When I benchmarked Gemini vs Anthropic in Week 2, Gemini was 38% cheaper for the same accuracy." That answer closes the observability question cold.

---

### [x] STEP 12 — Document 3 concrete numbers

Create `docs/ai-observability-metrics.md`:

```markdown
# AI Observability Metrics — Personal Finance Platform

**Captured:** YYYY-MM-DD  
**Tool:** Langfuse Cloud (https://cloud.langfuse.com)  
**Provider:** Gemini 2.5 Flash (primary) / Claude Sonnet 4.6 (alternate)

## Extraction Pipeline Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Average cost per document | $X.XXX | Full PDF statement, ~Xk tokens input |
| p50 latency | Xms | Median extraction time |
| p95 latency | Xms | Tail latency (slow statements) |
| Error rate | X% | Captured in Langfuse error level |

## Provider Comparison (preliminary)

| Provider | Cost/doc | p50 Latency | p95 Latency |
|----------|----------|-------------|-------------|
| Gemini 2.5 Flash | $X.XXX | Xms | Xms |
| Claude Sonnet 4.6 | $X.XXX | Xms | Xms |

## Interview-ready numbers

1. "Extraction costs **$X.XXX per document** on Gemini 2.5 Flash"
2. "p95 extraction latency is **Xms** — measured via Langfuse tracing on real bank statements"
3. "Gemini is **X% cheaper** than Anthropic on our structured extraction workload"

_Numbers will be refined in Week 2 eval harness benchmarks._
```

Fill in the `X` values from your Langfuse dashboard.

> **Why a doc?** Because you need to quote these numbers 6 weeks from now in a job interview and you won't remember the exact figures. This doc is also evidence you *designed* the measurement, not just stumbled onto it.

---

### [x] STEP 13 — Commit the changes

```bash
cd c:\workspaces\personal-finance
git add services/ai-service/pyproject.toml
git add services/ai-service/app/config.py
git add services/ai-service/app/observability.py
git add services/ai-service/app/providers/gemini.py
git add services/ai-service/app/providers/anthropic.py
git add services/ai-service/app/main.py
git add services/ai-service/.env.example
git add docs/ai-observability-metrics.md
git status  # verify .env is NOT listed
git commit -m "PF-AI001: add Langfuse tracing to Gemini and Anthropic providers"
```

> **Verify .env is gitignored before committing.** If `services/ai-service/.env` appears in `git status`, stop — add it to `.gitignore` first.

---

### [x] STEP 14 — Log progress and advance the Week 1 checklist

```
/mentor log Added Langfuse to AI service — GeminiProvider and AnthropicProvider both traced. Verified traces appear in Langfuse UI. Extraction costs $X.XXX/doc, p95 latency Xms.
```

Then update `mentor/progress.md` — mark the first 3 Week 1 tasks as done:
- [x] Add Langfuse to personal-finance AI service
- [x] Wrap existing Anthropic and Gemini calls with Langfuse tracing
- [ ] Create Langfuse dashboard: cost/day, calls/day, latency distribution, error rate ← mark this done after Step 11

---

## Notes

- **Langfuse v3 API (verified against 3.15.0):** Use `langfuse.start_observation(as_type="generation", ...)` — returns a `LangfuseGeneration`. `start_generation()` still works but is deprecated. The key v3 change: `end()` only accepts `end_time`. All span data (`output`, `usage_details`, `cost_details`, `metadata`, `level`, `status_message`) must go through `update()` first, then call `end()`. Passing them to `end()` throws `TypeError`.
- **`usage` → `usage_details`, no `unit` key:** The old `usage={"input": N, "output": N, "unit": "TOKENS"}` dict is gone. Use `usage_details={"input": N, "output": N}`. Cost goes in a separate `cost_details={"usd": X}` field — Langfuse uses this for dashboard aggregation.
- **`tracing_enabled` (not `enabled`):** The Langfuse constructor parameter to disable tracing when keys are empty is `tracing_enabled`, not `enabled`. Check `inspect.signature(Langfuse.__init__)` if unsure — the constructor signature is the authoritative source.
- **Gemini cost table:** Gemini 2.5 Flash charges $0.075/1M input tokens and $0.30/1M output tokens (as of 2026-05). These rates change — check https://ai.google.dev/pricing before quoting numbers in an interview.
- **Thread safety:** The module-level `langfuse` singleton is thread-safe. FastAPI runs on asyncio so multiple concurrent requests safely share it.
- **`generate_json()` volume:** This method is called by the categorizer (once per uncategorized transaction) and by `portfolio_reviewer` and `journey_advisor`. Categorization is your highest-volume LLM call — probably 10-50x more calls than extraction. Track it separately in Langfuse by filtering on generation name `gemini-generate-json`.
- **OTel vs Langfuse:** OTel captures HTTP-level metrics (request latency, status codes, DB query time). Langfuse captures LLM-specific metrics (token cost, prompt content, generation quality). They're complementary. OTel → Grafana for infra dashboards. Langfuse → Langfuse UI for AI-specific dashboards. Don't try to merge them.
- **Next week (Week 2):** The eval harness will reuse the `estimate_cost_usd()` function from `observability.py` to compute benchmark cost-per-doc across providers. Don't delete or rename it.
- **Deferred:** Langfuse datasets, prompt versioning, A/B test prompts — all Week 2+. Don't scope-creep this week.

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Why LLM-specific observability? (Databricks · Azure AI-102)

*Scenario:* Your FastAPI service already has standard APM — request latency, error rate, throughput — but you can't answer "which extractions cost the most" or "is output quality drifting?"

*Question:* What does LLM-specific observability (e.g., Langfuse) add that traditional APM does not?

- **A.** Lower request latency
- **B.** Automatic horizontal autoscaling of the service
- **C.** Per-call token usage, cost, captured prompt/response, and quality signals attached to each generation
- **D.** Database query execution plans

<details>
<summary>Show answer</summary>

**C** — APM measures the HTTP/infra layer; LLM observability captures token count, cost, prompt/response content, and quality per *generation*.
*Maps to: Databricks GenAI Engineer Associate · Deployment & Monitoring; Azure AI-102 · Monitor generative AI solutions*
</details>

### 2. Reporting cost per document (AWS ML Engineer · Databricks)

*Scenario:* One extraction uses ~8,000 input + ~1,200 output tokens against a model priced per 1M tokens.

*Question:* The most reliable way to report cost-per-document is to:

- **A.** Multiply each call's actual input/output token counts by the model's per-token price and log it on the trace
- **B.** Estimate it from wall-clock latency
- **C.** Divide the monthly invoice by the number of API keys
- **D.** Assume a flat cost regardless of statement length

<details>
<summary>Show answer</summary>

**A** — cost-per-doc must come from per-call token usage × price, recorded at trace time (exactly what `estimate_cost_usd()` does).
*Maps to: AWS Certified ML Engineer – Associate · Monitoring & cost optimization; Databricks GenAI Engineer Associate · Monitoring*
</details>

### 3. Percentiles vs the mean (Azure AI-102 · Google Cloud PMLE)

*Scenario:* Mean extraction latency is a healthy 900 ms, yet some users report slow uploads.

*Question:* Why track p50 and p95 latency instead of the mean alone?

- **A.** The mean can't be computed for LLM calls
- **B.** p95 always equals the mean for LLMs
- **C.** Percentiles reduce token cost
- **D.** Percentiles expose the tail latency the mean hides — p95 reflects the experience of the slowest 5% of calls

<details>
<summary>Show answer</summary>

**D** — the mean smooths over tail behavior; p95 captures worst-case user experience, which is what users actually complain about.
*Maps to: Azure AI-102 · Optimize & monitor solutions; Google Cloud PMLE · Monitor ML solutions*
</details>

### 4. Structuring a trace (Databricks · LLMOps)

*Scenario:* A single upload runs PDF text extraction → LLM extraction → categorization.

*Question:* The cleanest way to model this in an observability tool is:

- **A.** One log line with everything concatenated
- **B.** One trace for the upload with nested spans/generations (pdf-extract, llm-extract, categorize) so cost and latency are attributable per step
- **C.** A separate database table per request
- **D.** Log only the final result, nothing intermediate

<details>
<summary>Show answer</summary>

**B** — a trace with nested spans/generations makes per-step cost and latency attributable and debuggable.
*Maps to: Databricks GenAI Engineer Associate · Deployment & Monitoring (LLMOps)*
</details>

### 5. Catching silent quality drift (Databricks · AWS ML Engineer)

*Scenario:* The extraction model is unchanged, but accuracy on new uploads quietly degrades over a month.

*Question:* Which is the most practical production signal to catch this?

- **A.** Input-distribution drift (e.g., a new bank format) plus output-quality proxies and user-correction/feedback rates
- **B.** The LLM's training loss
- **C.** The number of GPUs in the cluster
- **D.** The Docker image size

<details>
<summary>Show answer</summary>

**A** — you don't train the LLM, so you monitor input drift + quality proxies + user-correction feedback, not training internals.
*Maps to: Databricks GenAI Engineer Associate · Monitoring; AWS Certified ML Engineer – Associate · Monitoring & data/model drift*
</details>
