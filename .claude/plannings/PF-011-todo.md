# PF-011 — FastAPI AI Microservice Scaffold

> **GitHub Issue:** #19
> **Status:** In Progress
> **Started:** 2026-03-14

## Objective

Wrap the LLM parsing logic from PF-009/PF-010 into a proper FastAPI microservice. This creates the Python AI service that the .NET API will call in Sprint 1 for PDF/image bank statement extraction. It establishes the service contract (`POST /parse`), Pydantic models, Docker packaging, and structured logging from day one.

## Acceptance Criteria

- [ ] FastAPI app with `/health` and `POST /parse` endpoints
- [ ] Pydantic request model: `{ text: str, bank_hint?: str }`
- [ ] Pydantic response model: `{ transactions: list[TransactionResult] }`
- [ ] LLM call (Claude `tool_use`) integrated into the `/parse` endpoint
- [ ] Proper error handling: LLM failures → 502, invalid input → 422, unexpected → 500
- [ ] Structured JSON logging
- [ ] Runs via `uvicorn` on port 8000
- [ ] Dockerfile for the service

## Approach

Use FastAPI with Pydantic v2 and the Anthropic SDK's async client. The `POST /parse` endpoint receives pre-extracted text (not raw PDFs — that's Sprint 1), calls Claude via `tool_use` for structured extraction, and returns a list of `TransactionResult` objects. Pydantic models are shaped to match the live .NET `TransactionDto` field names (`flow`, `wallet`, `amount_idr`) so the response can be deserialized directly on the .NET side. No `ILLMProvider` abstraction yet — that's Sprint 1 when OpenAI fallback is needed.

Out of scope: PDF extraction, raw file handling, provider abstraction — Sprint 1 tasks.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/pyproject.toml` | Modify — add FastAPI, uvicorn, pydantic-settings, test deps |
| `services/ai-service/app/__init__.py` | Create |
| `services/ai-service/app/main.py` | Create — FastAPI app, lifespan, CORS, JSON logging, endpoints |
| `services/ai-service/app/models.py` | Create — ParseRequest, ParseResponse, TransactionResult |
| `services/ai-service/app/config.py` | Create — Settings via pydantic-settings |
| `services/ai-service/app/services/__init__.py` | Create |
| `services/ai-service/app/services/llm_parser.py` | Create — LlmParser, LlmParseError, EXTRACT_TOOL schema |
| `services/ai-service/tests/__init__.py` | Create |
| `services/ai-service/tests/test_health.py` | Create |
| `services/ai-service/tests/test_parse.py` | Create — 4 test cases with mocked Anthropic client |
| `services/ai-service/Dockerfile` | Create |
| `services/ai-service/.env.example` | Create/update |
| `services/ai-service/README.md` | Create |
| `docker-compose.yml` | Modify — add `ai-service` block + `AiService__BaseUrl` to `api` env |
| `.gitignore` | Modify — add `.env` if missing (SEC-04 fix) |

---

## TODO

### Phase 1 — Foundation

---

### STEP 1 — Update `pyproject.toml` with FastAPI dependencies

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
```

Then reinstall:
```bash
cd services/ai-service
source .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
```

> **Why each dep:**
> - `fastapi` — the web framework. Equivalent to ASP.NET Core Web API. Handles routing, request parsing, response serialization.
> - `uvicorn[standard]` — the ASGI HTTP server. Equivalent to Kestrel. The `[standard]` extra adds `uvloop` (faster event loop) and `httptools` (faster HTTP parser).
> - `pydantic>=2.11.0` — request/response schema validation. Equivalent to C# `record` types with FluentValidation built in.
> - `pydantic-settings` — reads environment variables into a typed `Settings` class. Equivalent to `IOptions<T>` + `appsettings.json`.
> - `pytest-asyncio` + `httpx` — async test support + HTTP client for testing FastAPI endpoints (like `WebApplicationFactory` + `HttpClient` in .NET).
>
> **Check:**
> ```bash
> pip list | grep -E "fastapi|uvicorn|pydantic"
> ```
> All three should appear with version numbers.

---

### STEP 2 — Create `app/config.py`

Create `services/ai-service/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-6"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:7208"]


settings = Settings()
```

> **Why `pydantic-settings`?**
> This is Python's equivalent of `IOptions<T>` + `appsettings.json` + environment variable overrides in one package. `Settings()` reads from `.env` first, then environment variables override. In Docker/production, env vars are injected externally — no `.env` file needed.
>
> **Why `anthropic_api_key: str` with no default?** Pydantic-settings will throw a `ValidationError` on startup if `ANTHROPIC_API_KEY` is missing from the environment. This is intentional — fail fast, loudly. Equivalent to throwing in `Program.cs` if a required config key is absent.
>
> **Check:** Import it in a Python REPL to verify it reads from `.env`:
> ```bash
> python -c "from app.config import settings; print(settings.anthropic_model)"
> # Expected: claude-sonnet-4-6
> ```

---

### STEP 3 — Create `app/models.py`

Create `services/ai-service/app/models.py`:

```python
from enum import Enum
from pydantic import BaseModel, Field


class FlowType(str, Enum):
    DB = "DB"   # Debit / withdrawal
    CR = "CR"   # Credit / deposit


class TransactionResult(BaseModel):
    date: str                           # ISO 8601: YYYY-MM-DD
    description: str
    flow: FlowType
    amount_idr: float
    currency: str = "IDR"
    wallet: str = ""
    category: str = "Untracked Expense" # .NET ICategoryRuleService re-categorizes this
    raw_text: str = ""                  # original line from bank statement (for audit)


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1)
    bank_hint: str | None = None        # e.g. "bca", "neobank" — used in system prompt


class ParseResponse(BaseModel):
    transactions: list[TransactionResult]
    total_parsed: int
    skipped_rows: int = 0               # rows Claude returned that failed Pydantic validation


class HealthResponse(BaseModel):
    status: str
    version: str
```

> **Why field names like `flow`, `wallet`, `amount_idr`?**
> These match the .NET `TransactionDto` property names exactly. The .NET API deserializes the JSON response directly into `TransactionDto` — no mapping layer needed. Changing these names = breaking the .NET integration.
>
> **Why `category = "Untracked Expense"` default?**
> The LLM doesn't categorize — it only extracts. Categorization is handled by `.NET`'s `ICategoryRuleService` using keyword rules (106 rules already seeded). This keeps the Python service's responsibility narrow: extract structured data, nothing more.
>
> **Why `skipped_rows`?**
> Row-level fault tolerance — if Claude extracts 50 rows but 2 fail Pydantic validation, we return 48 valid rows with `skipped_rows: 2` and log a warning, rather than failing the whole request. Equivalent to a partial success pattern in batch operations.

---

### STEP 4 — Create `app/main.py` (health endpoint only)

Create `services/ai-service/app/main.py`:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import HealthResponse

# JSON-structured logging (matches what .NET Serilog produces)
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("AI service starting up | model=%s", settings.anthropic_model)
    yield
    # Shutdown
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

Create the package init files:
```bash
touch services/ai-service/app/__init__.py
touch services/ai-service/app/services/__init__.py
```

> **Why `lifespan` instead of `@app.on_event("startup")`?**
> `on_event` is deprecated since FastAPI 0.99. `lifespan` is the modern pattern — it's a single async context manager that handles both startup and shutdown. Equivalent to `IHostedService.StartAsync/StopAsync` in .NET.
>
> **Why `getattr(logging, settings.log_level)`?**
> `settings.log_level` is the string `"INFO"`. `logging.INFO` is the integer `20`. `getattr(logging, "INFO")` converts `"INFO" → 20` at runtime. This lets you change log level via env var without code changes.

---

### STEP 5 — Smoke test: run the server and hit `/health`

```bash
# From services/ai-service/ with (.venv) active
uvicorn app.main:app --reload --port 8000
```

In a second terminal:
```bash
curl http://localhost:8000/health
```

**Expected output:**
```json
{"status":"healthy","version":"0.1.0"}
```

Also open the auto-generated API docs (free with FastAPI):
```
http://localhost:8000/docs
```

> **Why `--reload`?** Equivalent to `dotnet watch run` — restarts the server on file save during development. Never use in production.
>
> **What is `/docs`?** FastAPI auto-generates a Swagger UI from your Pydantic models and endpoint signatures. This is equivalent to Swashbuckle in .NET — you get interactive API docs for free. Use it to manually test `POST /parse` once you build it in Phase 2.
>
> Stop the server with `Ctrl+C` when done.

---

### STEP 6 — Create `Dockerfile`

Create `services/ai-service/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Copy dependency declaration first (Docker layer cache — only reinstall if pyproject.toml changes)
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy application code
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **Why `COPY pyproject.toml` before `COPY app/`?**
> Docker builds in layers. If you copy everything at once, every code change invalidates the `pip install` cache layer and reinstalls all packages. By copying `pyproject.toml` first and running `pip install`, that layer only re-runs when `pyproject.toml` changes — not when you edit a `.py` file. This makes rebuilds fast. Equivalent pattern to caching `dotnet restore` separately from `dotnet build` in .NET Dockerfiles.
>
> **Why no `--reload` in CMD?** `--reload` watches the filesystem for changes. In a container, no one is editing files — the container is immutable. `--reload` in production wastes CPU and can mask startup errors.
>
> **Check:** Build it locally to verify it works:
> ```bash
> docker build -t ai-service:dev .
> docker run --rm -p 8000:8000 -e ANTHROPIC_API_KEY=test ai-service:dev
> curl http://localhost:8000/health
> ```

---

### STEP 7 — Add `ai-service` to `docker-compose.yml`

Open `docker-compose.yml` (repo root). Add the `ai-service` block and update the `api` service environment:

```yaml
  ai-service:
    build:
      context: ./services/ai-service
      dockerfile: Dockerfile
    container_name: personalfinance-ai
    ports:
      - "8000:8000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LOG_LEVEL=INFO
    depends_on:
      - db
```

In the existing `api` service environment section, add:
```yaml
      - AiService__BaseUrl=http://ai-service:8000
```

> **Why `${ANTHROPIC_API_KEY}`?** Docker Compose reads `.env` from the same directory as `docker-compose.yml` and substitutes `${VAR}` syntax. This means your key lives in the root `.env` file and is injected into the container at runtime — never baked into the image.
>
> **Why `http://ai-service:8000` (not `localhost`)?** Inside Docker Compose, containers communicate via service names on the internal Docker network. `localhost` inside the `api` container refers to the `api` container itself, not the `ai-service` container. Service name `ai-service` resolves to the correct container.
>
> **Check:** `docker compose config` prints the resolved config with substitutions applied — use it to verify your YAML is valid.

---

### STEP 8 — Fix `.gitignore` and create `.env.example`

```bash
# From repo root — check if .env is already covered
git check-ignore -v .env
git check-ignore -v services/ai-service/.env
```

If either prints nothing (not ignored), add to root `.gitignore`:
```
.env
```

Create `services/ai-service/.env.example`:
```
ANTHROPIC_API_KEY=your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-6
LOG_LEVEL=INFO
```

> **Why:** SEC-04 compliance — the root `.gitignore` currently covers `*.local` but NOT `.env`. Until fixed, `git add .` could accidentally commit your API key. Always verify with `git check-ignore` before first commit.

---

### Phase 2 — LLM Integration

---

### STEP 9 — Understand `tool_use` (concept — read before coding)

`tool_use` is the mechanism to force Claude to return **structured JSON** matching an exact schema — instead of free text. This is the core pattern for all extraction work in this project.

| `tool_use` concept | Familiar analogy | What it does |
|---|---|---|
| Tool schema (`EXTRACT_TOOL`) | TypeScript interface / Pydantic model | Defines the exact JSON shape Claude must return |
| `tools=[EXTRACT_TOOL]` | Declaring an available function | Tells Claude "you can call this function" |
| `tool_choice={"type":"tool","name":"..."}` | Forcing a specific response format | Forces Claude to ALWAYS call this tool (no free text fallback) |
| `tool_use` block in response | Function call return value | Claude's structured output, guaranteed to match your schema |
| `block.input` | The returned JSON | The actual extracted data — pass directly to Pydantic for validation |

**Why not just ask Claude to "return JSON"?**
Asking in the prompt for JSON works ~95% of the time. `tool_use` makes it 100% — Claude's API guarantees a structured response matching the schema when `tool_choice` is forced. For a financial extraction pipeline, 5% failure rate means corrupted data. Always use `tool_use` for production extraction.

**The flow:**
```
Your request (text + tool schema)
    ↓
Claude processes text
    ↓
Claude "calls" the tool (returns structured JSON block)
    ↓
You extract block.input → validate with Pydantic → return ParseResponse
```

---

### STEP 10 — Create `app/services/llm_parser.py`

Create `services/ai-service/app/services/llm_parser.py`:

```python
import logging

from anthropic import AsyncAnthropic

from app.config import settings
from app.models import ParseRequest, ParseResponse, TransactionResult

logger = logging.getLogger(__name__)


class LlmParseError(Exception):
    """Raised when the LLM call fails or returns an unexpected response."""
    pass


# The tool schema defines the EXACT JSON structure Claude must return.
# Think of this as your API response contract — Claude is the service, this is the spec.
EXTRACT_TOOL = {
    "name": "extract_transactions",
    "description": "Extract all bank transactions from the provided bank statement text.",
    "input_schema": {
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
                        "currency":    {"type": "string", "default": "IDR"},
                        "wallet":      {"type": "string"},
                        "raw_text":    {"type": "string", "description": "Original line from statement"},
                    },
                    "required": ["date", "description", "flow", "amount_idr"],
                },
            }
        },
        "required": ["transactions"],
    },
}


class LlmParser:
    def __init__(self) -> None:
        # AsyncAnthropic reads ANTHROPIC_API_KEY from env automatically
        self._client = AsyncAnthropic()

    async def parse(self, request: ParseRequest) -> ParseResponse:
        try:
            message = await self._client.messages.create(
                model=settings.anthropic_model,
                max_tokens=4096,
                temperature=0.0,    # ALWAYS 0.0 for extraction — we want deterministic output
                system=(
                    "You are a financial data extraction assistant. "
                    "Extract ALL transactions from the bank statement text. "
                    "Normalize dates to YYYY-MM-DD format. "
                    "Use DB for debit/withdrawal, CR for credit/deposit. "
                    f"Bank context: {request.bank_hint or 'unknown'}."
                ),
                tools=[EXTRACT_TOOL],
                tool_choice={"type": "tool", "name": "extract_transactions"},  # force structured output
                messages=[{"role": "user", "content": request.text}],
            )
        except Exception as e:
            logger.error("Anthropic API call failed: %s", e)
            raise LlmParseError(f"LLM API error: {e}") from e

        # Extract the tool_use block from the response content list
        tool_block = next(
            (block for block in message.content if block.type == "tool_use"),
            None,
        )
        if tool_block is None:
            # Should not happen when tool_choice forces tool use — but defensive check
            raise LlmParseError("Claude did not return a tool_use block")

        raw_rows = tool_block.input.get("transactions", [])

        parsed, skipped = [], 0
        for row in raw_rows:
            try:
                parsed.append(TransactionResult(**row))
            except Exception as e:
                # Row-level fault tolerance: skip bad rows, don't fail the whole request
                logger.warning("Skipping invalid row | row=%s | error=%s", row, e)
                skipped += 1

        logger.info(
            "Parse complete | parsed=%d | skipped=%d | input_tokens=%d | output_tokens=%d",
            len(parsed), skipped,
            message.usage.input_tokens, message.usage.output_tokens,
        )

        return ParseResponse(
            transactions=parsed,
            total_parsed=len(parsed),
            skipped_rows=skipped,
        )
```

> **Why `AsyncAnthropic` (not `Anthropic`)?**
> FastAPI runs on an async event loop (uvloop). Using the sync `Anthropic()` client blocks the event loop during the LLM call — meaning no other requests can be processed while waiting for Claude to respond. `AsyncAnthropic` uses `await` so the event loop stays free. Equivalent to using `HttpClient` with `await` in .NET rather than `.Result` or `.Wait()`.
>
> **Why log `input_tokens` and `output_tokens` on every call?**
> Token usage is the cost tracking unit for LLM APIs. Logging it on every parse call gives you visibility into cost per request, which compounds at scale (500 statements × tokens per page = real money). Build this habit now — it's cheap to add and expensive to retrofit.

---

### STEP 11 — Add `POST /parse` to `main.py`

Add these imports at the top of `app/main.py`:
```python
from fastapi import HTTPException
from app.models import ParseRequest, ParseResponse
from app.services.llm_parser import LlmParser, LlmParseError
```

Add parser initialization to the `lifespan` function:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — initialize shared resources
    app.state.parser = LlmParser()
    logger.info("AI service starting up | model=%s", settings.anthropic_model)
    yield
    # Shutdown
    logger.info("AI service shutting down")
```

Add the endpoint after the `/health` route:
```python
@app.post("/parse", response_model=ParseResponse)
async def parse_transactions(request: ParseRequest) -> ParseResponse:
    try:
        return await app.state.parser.parse(request)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))
```

> **Why `app.state.parser`?**
> `AsyncAnthropic()` initializes an HTTP connection pool. Creating it once at startup (via lifespan) and reusing it on every request is more efficient than creating a new client per request. `app.state` is FastAPI's equivalent of a singleton registered in `IServiceCollection` — shared across requests.
>
> **Why 502 for `LlmParseError`?**
> 502 Bad Gateway = upstream service failed. Anthropic is an upstream dependency of this service, so its failures are gateway errors from the caller's perspective — not the caller's fault (400) and not our server's fault (500). This gives the .NET side a clear signal to retry or fallback.

---

### STEP 12 — Manual end-to-end test

With the server running (`uvicorn app.main:app --reload --port 8000`):

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{
    "text": "14/03/2024 TRANSFER TO GOFOOD GEPREK BENSU 85000.00\n15/03/2024 GAJI MASUK PT CONTOH 10000000.00\n16/03/2024 GRAB-GRABCAR BALI 35000.00",
    "bank_hint": "bca"
  }'
```

**Expected output (structure — values will vary):**
```json
{
  "transactions": [
    {"date": "2024-03-14", "description": "TRANSFER TO GOFOOD GEPREK BENSU", "flow": "DB", "amount_idr": 85000.0, "currency": "IDR", "wallet": "", "category": "Untracked Expense", "raw_text": "..."},
    {"date": "2024-03-15", "description": "GAJI MASUK PT CONTOH", "flow": "CR", "amount_idr": 10000000.0, "currency": "IDR", "wallet": "", "category": "Untracked Expense", "raw_text": "..."},
    {"date": "2024-03-16", "description": "GRAB-GRABCAR BALI", "flow": "DB", "amount_idr": 35000.0, "currency": "IDR", "wallet": "", "category": "Untracked Expense", "raw_text": "..."}
  ],
  "total_parsed": 3,
  "skipped_rows": 0
}
```

> **What to verify:**
> - All 3 transactions extracted
> - Dates normalized to ISO 8601
> - `flow` values are `"DB"` or `"CR"` (not "debit"/"credit")
> - `skipped_rows: 0` — no validation failures
> - Server logs show `input_tokens` and `output_tokens`

---

### Phase 3 — Tests & Docs

---

### STEP 13 — Create `tests/test_health.py`

Create `services/ai-service/tests/__init__.py` (empty) and `tests/test_health.py`:

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

Add pytest-asyncio config to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

> **Why `ASGITransport` + `AsyncClient` instead of `TestClient`?**
> FastAPI's `TestClient` is a synchronous wrapper. Our endpoints are async — using `AsyncClient` with `ASGITransport` tests them as async properly. Equivalent to `WebApplicationFactory<Program>` + `HttpClient` in .NET integration tests.

---

### STEP 14 — Create `tests/test_parse.py`

Create `services/ai-service/tests/test_parse.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app


def _make_tool_use_response(transactions: list[dict]):
    """Build a fake Anthropic response with a tool_use block."""
    block = MagicMock()
    block.type = "tool_use"
    block.input = {"transactions": transactions}

    usage = MagicMock()
    usage.input_tokens = 100
    usage.output_tokens = 50

    response = MagicMock()
    response.content = [block]
    response.usage = usage
    return response


@pytest.mark.anyio
async def test_parse_happy_path():
    """Valid text → returns parsed transactions."""
    fake_tx = {
        "date": "2024-03-14", "description": "GOPAY MERCHANT",
        "flow": "DB", "amount_idr": 85000.0,
    }
    mock_response = _make_tool_use_response([fake_tx])

    with patch("app.services.llm_parser.AsyncAnthropic") as MockClient:
        MockClient.return_value.messages.create = AsyncMock(return_value=mock_response)
        app.state.parser = None  # reset so lifespan re-creates with mock

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["transactions"][0]["description"] == "GOPAY MERCHANT"


@pytest.mark.anyio
async def test_parse_empty_text_returns_422():
    """Empty text fails Pydantic validation before reaching LLM."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": ""})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_parse_llm_error_returns_502():
    """Anthropic API failure → 502 Bad Gateway."""
    with patch("app.services.llm_parser.AsyncAnthropic") as MockClient:
        MockClient.return_value.messages.create = AsyncMock(side_effect=Exception("API down"))
        app.state.parser = None

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 502


@pytest.mark.anyio
async def test_parse_no_tool_block_returns_502():
    """Claude returns no tool_use block → 502."""
    response_no_tool = MagicMock()
    response_no_tool.content = []  # no tool_use block
    response_no_tool.usage = MagicMock(input_tokens=10, output_tokens=5)

    with patch("app.services.llm_parser.AsyncAnthropic") as MockClient:
        MockClient.return_value.messages.create = AsyncMock(return_value=response_no_tool)
        app.state.parser = None

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 502
```

> **Why mock `AsyncAnthropic` at the class level (not instance)?**
> We patch where the class is imported (`app.services.llm_parser.AsyncAnthropic`), not where it's defined. This is the Python mock equivalent of replacing an interface registration in `IServiceCollection` for test isolation — we never hit the real Anthropic API in tests.

---

### STEP 15 — Run the tests

```bash
cd services/ai-service
pytest tests/ -v
```

**Expected output:**
```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_llm_error_returns_502 PASSED
tests/test_parse.py::test_parse_no_tool_block_returns_502 PASSED

5 passed in X.XXs
```

> If tests fail, check the error message. Common issues:
> - `anyio_mode` not set in pyproject.toml → `asyncio_mode = "auto"` needed
> - `ASGITransport` import error → update `httpx` version

---

### STEP 16 — Create `README.md`

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
# Edit .env — add your ANTHROPIC_API_KEY
```

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

## Run via Docker Compose (full stack)

```bash
docker compose up --build ai-service
```
```

---

### STEP 17 — Commit

```bash
# From repo root
git add services/ai-service/pyproject.toml
git add services/ai-service/app/
git add services/ai-service/tests/
git add services/ai-service/Dockerfile
git add services/ai-service/.env.example
git add services/ai-service/README.md
git add docker-compose.yml
git add .gitignore
git status  # verify .env is NOT listed
git commit -m "PF-011: FastAPI AI service scaffold with /health and /parse endpoints"
```

---

## Notes

- `TransactionResult` fields use .NET naming (`flow: DB/CR`, `wallet`, `amount_idr`) — changing these names breaks .NET deserialization
- 502 (Bad Gateway) for LLM failures — Anthropic is an upstream dependency, not our server's fault
- Row-level skip on Pydantic validation failure — don't fail the full request for one bad row
- `category` defaults to `"Untracked Expense"` — .NET `ICategoryRuleService` re-categorizes using 106 keyword rules
- `lifespan` context manager is the modern FastAPI pattern — `on_event` deprecated since FastAPI 0.99
- `AsyncAnthropic` required (not sync `Anthropic`) — FastAPI runs async; sync client blocks the event loop
- `temperature=0.0` always for extraction — deterministic output for financial data
- Always log `input_tokens`/`output_tokens` — builds cost visibility from day one
- SEC-04: root `.gitignore` was missing `.env` — fixed in STEP 8
