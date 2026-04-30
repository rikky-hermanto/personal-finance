# PF-011 — FastAPI AI Microservice Scaffold

> **GitHub Issue:** #19
> **Status:** Done
> **Started:** 2026-03-14
> **Completed:** 2026-04-30

## Objective

Wrap the LLM parsing logic into a proper FastAPI microservice. This creates the Python AI service that the .NET API will call in Sprint 1 for PDF/image bank statement extraction. It establishes the service contract (`POST /parse`), Pydantic models, Docker packaging, and structured logging from day one.

**Key design decision (updated 2026-04-30):** The LLM provider is abstracted behind a `LlmProvider` protocol so the service is not coupled to any single vendor. Swap providers by changing one env var — no code changes. Default is Gemini (current available key); Anthropic is fully implemented and ready to activate.

## Acceptance Criteria

- [x] FastAPI app with `/health` and `POST /parse` endpoints
- [x] Pydantic request model: `{ text: str, bank_hint?: str }`
- [x] Pydantic response model: `{ transactions: list[TransactionResult] }`
- [x] LLM provider is switchable via `AI_PROVIDER` env var (`gemini` | `anthropic`)
- [x] `GeminiProvider` and `AnthropicProvider` both implement the shared `LlmProvider` protocol
- [x] `LlmParser` depends only on the protocol — never imports a specific SDK directly
- [x] Running with `AI_PROVIDER=gemini` + `GEMINI_API_KEY` works out of the box
- [x] Proper error handling: LLM failures → 502, invalid input → 422, unexpected → 500 (FastAPI default)
- [x] Structured JSON logging
- [x] Runs via `uvicorn` on port 8000
- [x] Dockerfile for the service

## Approach

FastAPI with Pydantic v2. The `POST /parse` endpoint receives pre-extracted text, routes it through `LlmParser`, and returns a list of `TransactionResult` objects shaped to match the .NET `TransactionDto` field names.

`LlmParser` depends on a `LlmProvider` protocol — it knows nothing about Gemini or Anthropic. A `ProviderFactory` reads `AI_PROVIDER` from settings and constructs the right implementation. Both providers translate the same JSON schema into their native structured-output mechanism: Gemini uses `response_schema` + JSON mode; Anthropic uses `tool_use`.

Out of scope: PDF extraction, raw file handling, OpenAI provider, per-bank prompt templates — Sprint 1 tasks.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/pyproject.toml` | Modify — add FastAPI, uvicorn, pydantic-settings, test deps |
| `services/ai-service/app/__init__.py` | Create |
| `services/ai-service/app/main.py` | Create — FastAPI app, lifespan, CORS, JSON logging, endpoints |
| `services/ai-service/app/models.py` | Create — ParseRequest, ParseResponse, TransactionResult |
| `services/ai-service/app/config.py` | Create — multi-provider Settings via pydantic-settings |
| `services/ai-service/app/providers/__init__.py` | Create |
| `services/ai-service/app/providers/base.py` | Create — LlmProvider Protocol |
| `services/ai-service/app/providers/gemini.py` | Create — GeminiProvider (google-genai, JSON mode) |
| `services/ai-service/app/providers/anthropic.py` | Create — AnthropicProvider (tool_use) |
| `services/ai-service/app/providers/factory.py` | Create — ProviderFactory.create(settings) |
| `services/ai-service/app/services/__init__.py` | Create |
| `services/ai-service/app/services/llm_parser.py` | Create — LlmParser(provider: LlmProvider) |
| `services/ai-service/tests/__init__.py` | Create |
| `services/ai-service/tests/test_health.py` | Create |
| `services/ai-service/tests/test_parse.py` | Create — 4 test cases mocking at LlmProvider level |
| `services/ai-service/Dockerfile` | Create |
| `services/ai-service/.env.example` | Create |
| `docker-compose.yml` | Modify — add `ai-service` block |
| `.gitignore` | Modify — add `.env` if missing |

---

## TODO

### Phase 1 — Foundation

---

### STEP 1 — Update `pyproject.toml` with all dependencies

Replace the `[project]` and `[project.optional-dependencies]` sections in `services/ai-service/pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "ai-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "google-genai>=0.1.0",
    "anthropic>=0.49.0",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.11.0",
    "pydantic-settings>=2.8.0",
]

[project.optional-dependencies]
dev = [
    "python-dotenv>=1.0.0",
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
    "anyio>=4.8.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

Then reinstall:
```bash
cd services/ai-service
source .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
```

> **Why both `google-genai` and `anthropic`?** Both providers are implemented. The one that's active depends on `AI_PROVIDER` in `.env` — you only need the matching API key. Having both packages installed costs nothing (they're small) and means switching providers requires zero reinstall.

---

### STEP 2 — Create `app/config.py`

Create `services/ai-service/app/config.py`:

```python
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ai_provider: Literal["gemini", "anthropic"] = "gemini"

    # Only the active provider's key is required — the other can stay empty
    gemini_api_key: str = ""
    anthropic_api_key: str = ""

    # Model name — set a sensible default per provider, override via env var
    ai_model: str = "gemini-2.5-flash"

    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:7208"]

    def validate_provider_key(self) -> None:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required when AI_PROVIDER=gemini")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic")


settings = Settings()
settings.validate_provider_key()
```

> **Why `validate_provider_key()` instead of making both keys required?** Making `anthropic_api_key: str` (no default) would force you to have an Anthropic key even when running Gemini. With both optional + runtime validation, you only need the key for the provider you're actually using. The service fails fast on startup with a clear message if the active provider's key is missing.
>
> **To switch from Gemini to Anthropic:** change `.env` to `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=your-key`. No code changes needed.
>
> **Check:**
> ```bash
> python -c "from app.config import settings; print(settings.ai_provider, settings.ai_model)"
> # Expected: gemini gemini-2.5-flash
> ```

---

### Phase 2 — Provider Abstraction Layer

---

### STEP 3 — Create `app/providers/base.py`

Create the package and protocol:

```bash
mkdir services/ai-service/app/providers
touch services/ai-service/app/providers/__init__.py
```

Create `services/ai-service/app/providers/base.py`:

```python
from typing import Protocol, runtime_checkable


@runtime_checkable
class LlmProvider(Protocol):
    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
    ) -> dict:
        """
        Extract structured data from user_text.

        Args:
            system_prompt: Instructions for the model (role, format rules).
            user_text: The bank statement text to extract from.
            schema: JSON Schema dict defining the expected output shape.

        Returns:
            dict matching the schema — ready for Pydantic validation.

        Raises:
            Exception: Any provider-level failure (API error, truncation, etc.).
        """
        ...
```

> **Why `Protocol` instead of `ABC`?**
> Python `Protocol` is structural typing — any class with a matching `extract_structured` method satisfies it, without inheriting from the base. This means `GeminiProvider` and `AnthropicProvider` don't need to import or inherit from `base.py`. Equivalent to C# interface but with duck typing. `runtime_checkable` lets you use `isinstance(obj, LlmProvider)` in tests.
>
> **Why a single `extract_structured` method?**
> Both providers do the same thing: take text + a schema, return structured JSON. The difference is *how* they enforce the schema — Gemini uses `response_schema` JSON mode; Anthropic uses `tool_use`. That difference lives inside each provider, not in the interface.

---

### STEP 4 — Create `app/providers/gemini.py`

Create `services/ai-service/app/providers/gemini.py`:

```python
import json
import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
    ) -> dict:
        config = types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=schema,
            system_instruction=system_prompt,
        )

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=user_text,
            config=config,
        )

        logger.info(
            "Gemini extract complete | model=%s | input_tokens=%d | output_tokens=%d",
            self._model,
            response.usage_metadata.prompt_token_count,
            response.usage_metadata.candidates_token_count,
        )

        return json.loads(response.text)
```

> **Why `response_mime_type="application/json"` + `response_schema`?**
> This is Gemini's structured output mechanism — equivalent to Anthropic's `tool_use`. Setting `response_mime_type` tells Gemini to return raw JSON (no markdown fences). Adding `response_schema` constrains the JSON to exactly match the given shape. Without `response_schema`, you'd get valid JSON but with unpredictable field names.
>
> **Why `client.aio.models.generate_content` (not `client.models.generate_content`)?**
> `client.aio` is the async namespace in `google-genai`. Using the sync version blocks FastAPI's event loop — same reason we use `AsyncAnthropic` not `Anthropic`. The `hello_llm.py` script used the sync version because it's a one-shot script, not a server.
>
> **Why `json.loads(response.text)`?**
> With `response_mime_type="application/json"`, `response.text` is a raw JSON string — no markdown wrapping. `json.loads` turns it into a dict. The Pydantic validation in `LlmParser` then validates the shape.

---

### STEP 5 — Create `app/providers/anthropic.py`

Create `services/ai-service/app/providers/anthropic.py`:

```python
import logging

from anthropic import AsyncAnthropic

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
    ) -> dict:
        tool = {
            "name": "extract_transactions",
            "description": "Extract all bank transactions from the provided text.",
            "input_schema": schema,
        }

        message = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            temperature=0.0,
            system=system_prompt,
            tools=[tool],
            tool_choice={"type": "tool", "name": "extract_transactions"},
            messages=[{"role": "user", "content": user_text}],
        )

        if message.stop_reason == "max_tokens":
            raise RuntimeError(
                "Response truncated — statement too long. Split into pages before re-extracting."
            )

        tool_block = next(
            (b for b in message.content if b.type == "tool_use"), None
        )
        if tool_block is None:
            raise ValueError("Anthropic did not return a tool_use block")

        logger.info(
            "Anthropic extract complete | model=%s | input_tokens=%d | output_tokens=%d",
            self._model,
            message.usage.input_tokens,
            message.usage.output_tokens,
        )

        return tool_block.input
```

> **Why `tool_choice={"type": "tool", "name": "extract_transactions"}`?**
> This forces Claude to always call this specific tool — it cannot respond with free text. Without `tool_choice`, Claude might decide the input doesn't need a tool call and return prose instead. For extraction, we need 100% structured output, not ~95%. See `.claude/rules/ai-service.md` for the full rationale.
>
> **Why check `stop_reason == "max_tokens"` before looking for the tool block?**
> A truncated response may have no tool block at all, or a partial one. Treating truncation as an error (rather than returning partial data) prevents phantom duplicates — partial data + re-extraction = duplicate rows in the DB.
>
> **Activate this provider:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=your-key` in `.env`.

---

### STEP 6 — Create `app/providers/factory.py`

Create `services/ai-service/app/providers/factory.py`:

```python
from app.config import Settings
from app.providers.base import LlmProvider
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider


class ProviderFactory:
    @staticmethod
    def create(settings: Settings) -> LlmProvider:
        if settings.ai_provider == "gemini":
            return GeminiProvider(
                api_key=settings.gemini_api_key,
                model=settings.ai_model,
            )
        if settings.ai_provider == "anthropic":
            return AnthropicProvider(
                api_key=settings.anthropic_api_key,
                model=settings.ai_model,
            )
        raise ValueError(f"Unsupported AI_PROVIDER: '{settings.ai_provider}'")
```

> **Why a static factory method (not a function)?**
> Consistent with how factories are used in tests — `ProviderFactory.create(mock_settings)` reads clearly. A module-level function would work too; the class just groups it semantically.
>
> **Why does the factory return `LlmProvider` (the protocol type)?**
> The return type annotation enforces that whatever `create()` returns must satisfy the protocol. If you add a new provider that's missing `extract_structured`, mypy/pyright will catch it at the factory, not at the callsite.

---

### Phase 3 — Models & FastAPI App

---

### STEP 7 — Create `app/models.py`

Create `services/ai-service/app/models.py`:

```python
from enum import Enum
from pydantic import BaseModel, Field


class FlowType(str, Enum):
    DB = "DB"   # Debit / withdrawal
    CR = "CR"   # Credit / deposit


class TransactionResult(BaseModel):
    date: str                            # ISO 8601: YYYY-MM-DD
    description: str
    flow: FlowType
    amount_idr: float
    currency: str = "IDR"
    wallet: str = ""
    category: str = "Untracked Expense"  # .NET ICategoryRuleService re-categorizes this
    raw_text: str = ""                   # original line from bank statement (for audit)


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1)
    bank_hint: str | None = None         # e.g. "bca", "neobank" — used in system prompt


class ParseResponse(BaseModel):
    transactions: list[TransactionResult]
    total_parsed: int
    skipped_rows: int = 0                # rows that failed Pydantic validation


class HealthResponse(BaseModel):
    status: str
    version: str
```

> **Why field names like `flow`, `wallet`, `amount_idr`?** These match the .NET `TransactionDto` property names exactly — changing them breaks .NET deserialization. Frozen contract per `THINK-05` in governance.md.
>
> **Why `category = "Untracked Expense"` default?** The LLM only extracts. Categorization is .NET's job via `ICategoryRuleService` (106 keyword rules already seeded).

---

### STEP 8 — Create `app/main.py` (health endpoint only)

Create the package init files:
```bash
touch services/ai-service/app/__init__.py
touch services/ai-service/app/services/__init__.py
```

Create `services/ai-service/app/main.py`:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import HealthResponse

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI service starting up | provider=%s | model=%s", settings.ai_provider, settings.ai_model)
    yield
    logger.info("AI service shutting down")


app = FastAPI(
    title="Personal Finance AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="healthy", version="0.1.0")
```

---

### STEP 9 — Smoke test: run the server and hit `/health`

```bash
# From services/ai-service/ with (.venv) active
uvicorn app.main:app --reload --port 8000
```

In a second terminal:
```bash
curl http://localhost:8000/health
```

**Expected:**
```json
{"status":"healthy","version":"0.1.0"}
```

Also open: `http://localhost:8000/docs` — Swagger UI auto-generated by FastAPI.

Stop the server with `Ctrl+C`.

---

### STEP 10 — Create `Dockerfile`

Create `services/ai-service/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **Why `COPY pyproject.toml` before `COPY app/`?** Docker layer cache — `pip install` only reruns when `pyproject.toml` changes, not when `.py` files change. Equivalent to caching `dotnet restore` separately from `dotnet build`.

---

### STEP 11 — Add `ai-service` to `docker-compose.yml`

Add the `ai-service` block and update the `api` environment:

```yaml
  ai-service:
    build:
      context: ./services/ai-service
      dockerfile: Dockerfile
    container_name: personalfinance-ai
    ports:
      - "8000:8000"
    environment:
      - AI_PROVIDER=${AI_PROVIDER:-gemini}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - AI_MODEL=${AI_MODEL:-gemini-2.5-flash}
      - LOG_LEVEL=INFO
    depends_on:
      - db
```

In the existing `api` service environment section, add:
```yaml
      - AiService__BaseUrl=http://ai-service:8000
```

> **Why `${AI_PROVIDER:-gemini}`?** The `:-` syntax provides a default if the variable is unset. This means `docker compose up` works without any `.env` file as long as `GEMINI_API_KEY` is set.

---

### STEP 12 — Fix `.gitignore` and create `.env.example`

```bash
git check-ignore -v .env
git check-ignore -v services/ai-service/.env
```

If either prints nothing, add to root `.gitignore`:
```
.env
```

Create `services/ai-service/.env.example`:
```
# Active provider: gemini | anthropic
AI_PROVIDER=gemini

# Gemini (default — get key at aistudio.google.com)
GEMINI_API_KEY=your-gemini-key-here
AI_MODEL=gemini-2.5-flash

# Anthropic (set AI_PROVIDER=anthropic to use)
# ANTHROPIC_API_KEY=your-anthropic-key-here
# AI_MODEL=claude-sonnet-4-6

LOG_LEVEL=INFO
```

---

### Phase 4 — LLM Integration

---

### STEP 13 — Create `app/services/llm_parser.py`

Create `services/ai-service/app/services/llm_parser.py`:

```python
import logging

from app.providers.base import LlmProvider
from app.models import ParseRequest, ParseResponse, TransactionResult

logger = logging.getLogger(__name__)


class LlmParseError(Exception):
    pass


# Shared extraction schema — both providers receive this exact dict.
# Gemini maps it to response_schema; Anthropic maps it to tool input_schema.
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "transactions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date":        {"type": "string", "description": "ISO 8601: YYYY-MM-DD"},
                    "description": {"type": "string"},
                    "flow":        {"type": "string", "enum": ["DB", "CR"]},
                    "amount_idr":  {"type": "number"},
                    "currency":    {"type": "string"},
                    "wallet":      {"type": "string"},
                    "raw_text":    {"type": "string"},
                },
                "required": ["date", "description", "flow", "amount_idr"],
            },
        }
    },
    "required": ["transactions"],
}

SYSTEM_PROMPT = (
    "You are a financial data extraction assistant. "
    "Extract ALL transactions from the bank statement text. "
    "Normalize dates to YYYY-MM-DD format. "
    "Use DB for debit/withdrawal, CR for credit/deposit. "
)


class LlmParser:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def parse(self, request: ParseRequest) -> ParseResponse:
        system = SYSTEM_PROMPT + f"Bank context: {request.bank_hint or 'unknown'}."

        try:
            result = await self._provider.extract_structured(
                system_prompt=system,
                user_text=request.text,
                schema=EXTRACT_SCHEMA,
            )
        except Exception as e:
            logger.error("LLM extraction failed: %s", e)
            raise LlmParseError(f"LLM extraction error: {e}") from e

        raw_rows = result.get("transactions", [])
        parsed, skipped = [], 0
        for row in raw_rows:
            try:
                parsed.append(TransactionResult(**row))
            except Exception as e:
                logger.warning("Skipping invalid row | row=%s | error=%s", row, e)
                skipped += 1

        logger.info("Parse complete | parsed=%d | skipped=%d", len(parsed), skipped)
        return ParseResponse(
            transactions=parsed,
            total_parsed=len(parsed),
            skipped_rows=skipped,
        )
```

> **Why does `LlmParser` not import `AsyncAnthropic` or `genai` anywhere?**
> This is the point of the abstraction. `LlmParser` owns the schema definition, prompt construction, and row-level validation. The provider owns the API call mechanics. If you add a third provider tomorrow, `LlmParser` doesn't change.
>
> **Why define `EXTRACT_SCHEMA` here (not in each provider)?**
> The schema is a product-level concern — it defines what data we want out of the statement. It belongs with the parsing logic, not with the transport layer.

---

### STEP 14 — Add `POST /parse` to `main.py`

Add imports at the top of `app/main.py`:
```python
from fastapi import HTTPException
from app.models import ParseRequest, ParseResponse
from app.providers.factory import ProviderFactory
from app.services.llm_parser import LlmParser, LlmParseError
```

Update `lifespan` to initialize the parser:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
    logger.info("AI service starting up | provider=%s | model=%s", settings.ai_provider, settings.ai_model)
    yield
    logger.info("AI service shutting down")
```

Add the endpoint after `/health`:
```python
@app.post("/parse", response_model=ParseResponse)
async def parse_transactions(request: ParseRequest) -> ParseResponse:
    try:
        return await app.state.parser.parse(request)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))
```

---

### STEP 15 — Manual end-to-end test

With the server running:

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{
    "text": "14/03/2024 TRANSFER TO GOFOOD GEPREK BENSU 85000.00\n15/03/2024 GAJI MASUK PT CONTOH 10000000.00\n16/03/2024 GRAB-GRABCAR BALI 35000.00",
    "bank_hint": "bca"
  }'
```

**Expected:**
```json
{
  "transactions": [
    {"date": "2024-03-14", "description": "TRANSFER TO GOFOOD GEPREK BENSU", "flow": "DB", "amount_idr": 85000.0, ...},
    {"date": "2024-03-15", "description": "GAJI MASUK PT CONTOH", "flow": "CR", "amount_idr": 10000000.0, ...},
    {"date": "2024-03-16", "description": "GRAB-GRABCAR BALI", "flow": "DB", "amount_idr": 35000.0, ...}
  ],
  "total_parsed": 3,
  "skipped_rows": 0
}
```

Server logs should show `provider=gemini` (or `anthropic`) and the parse complete line.

---

### Phase 5 — Tests

---

### STEP 16 — Create `tests/test_health.py`

Create `services/ai-service/tests/__init__.py` (empty) and `services/ai-service/tests/test_health.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.anyio
async def test_health_returns_200():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "version": "0.1.0"}
```

---

### STEP 17 — Create `tests/test_parse.py`

Tests mock at the `LlmProvider` protocol level — no SDK mocking needed, provider-agnostic.

Create `services/ai-service/tests/test_parse.py`:

```python
import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.llm_parser import LlmParser


def _fake_extraction(transactions: list[dict]) -> dict:
    return {"transactions": transactions}


@pytest.mark.anyio
async def test_parse_happy_path():
    """Valid text + provider returns data → 200 with parsed transactions."""
    fake_tx = {
        "date": "2024-03-14",
        "description": "GOPAY MERCHANT",
        "flow": "DB",
        "amount_idr": 85000.0,
    }
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(return_value=_fake_extraction([fake_tx]))
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["transactions"][0]["description"] == "GOPAY MERCHANT"


@pytest.mark.anyio
async def test_parse_empty_text_returns_422():
    """Empty text fails Pydantic min_length=1 before reaching the provider."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": ""})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_parse_provider_error_returns_502():
    """Provider raises an exception → 502 Bad Gateway."""
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(side_effect=Exception("provider down"))
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 502


@pytest.mark.anyio
async def test_parse_skips_invalid_rows():
    """Provider returns a malformed row → skipped_rows=1, valid rows returned."""
    valid_tx = {"date": "2024-03-14", "description": "VALID", "flow": "DB", "amount_idr": 1000.0}
    invalid_tx = {"date": "bad-date", "flow": "UNKNOWN", "amount_idr": "not-a-number"}
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(
        return_value=_fake_extraction([valid_tx, invalid_tx])
    )
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["skipped_rows"] == 1
```

> **Why mock at `LlmProvider` level (not `AsyncAnthropic` or `genai.Client`)?**
> These tests verify the HTTP + parsing orchestration layer — not the Gemini or Anthropic SDKs. Mocking at the protocol boundary is simpler (one mock for all providers), faster (no SDK internals), and provider-agnostic. If you switch from Gemini to Anthropic, the tests don't change.

---

### STEP 18 — Run the tests

```bash
cd services/ai-service
pytest tests/ -v
```

**Expected:**
```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_provider_error_returns_502 PASSED
tests/test_parse.py::test_parse_skips_invalid_rows PASSED

5 passed in X.XXs
```

---

### STEP 19 — Create `README.md`

Create `services/ai-service/README.md`:

```markdown
# Personal Finance — AI Service

FastAPI microservice for LLM-powered bank statement extraction.

## Setup

```bash
cd services/ai-service
python -m venv .venv
source .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
cp .env.example .env
# Edit .env — set AI_PROVIDER and the matching API key
```

## Providers

| AI_PROVIDER | Key needed | Default model |
|-------------|-----------|---------------|
| `gemini` (default) | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |

Switch provider: change `AI_PROVIDER` in `.env`. No code changes needed.

## Run locally

```bash
uvicorn app.main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Docs: http://localhost:8000/docs

## Run tests

```bash
pytest tests/ -v
```
```

---

### STEP 20 — Commit

```bash
git add services/ai-service/pyproject.toml
git add services/ai-service/app/
git add services/ai-service/tests/
git add services/ai-service/Dockerfile
git add services/ai-service/.env.example
git add services/ai-service/README.md
git add docker-compose.yml
git add .gitignore
git status  # verify .env is NOT listed
git commit -m "PF-011: FastAPI AI service scaffold with switchable LLM provider (Gemini/Anthropic)"
```

---

## Notes

- `TransactionResult` fields use .NET naming (`flow: DB/CR`, `wallet`, `amount_idr`) — changing these breaks .NET deserialization (THINK-05)
- 502 for LLM failures — the provider is an upstream dependency, not our server's fault
- Row-level skip on Pydantic validation failure — partial success beats full failure for batch extraction
- `category` defaults to `"Untracked Expense"` — .NET `ICategoryRuleService` re-categorizes
- `EXTRACT_SCHEMA` lives in `llm_parser.py` — it's a product concern, not a transport concern
- Tests mock at `LlmProvider` protocol level — provider-agnostic, no SDK mocking needed
- PF-012 (PDF extraction) builds directly on top of this: `PdfExtractor` → text → `LlmParser.parse()` unchanged
- Adding OpenAI: implement `OpenAIProvider` in `providers/openai.py`, add `"openai"` branch to `ProviderFactory`, add `openai_api_key` to `Settings`
