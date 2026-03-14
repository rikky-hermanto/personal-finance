# PF-011 — FastAPI AI Microservice Scaffold

> **GitHub Issue:** #19
> **Status:** In Progress
> **Started:** 2026-03-14

## Objective

Wrap the LLM parsing logic from PF-010 (standalone script) into a proper FastAPI microservice. This creates the Python AI service that the .NET API will call in Sprint 1 for PDF/image bank statement extraction. It establishes the service contract (`POST /parse`), Pydantic models, Docker packaging, and structured logging from day one.

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

## Affected Files

| File | Change |
|------|--------|
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
| `services/ai-service/pyproject.toml` | Create |
| `services/ai-service/.env.example` | Create |
| `services/ai-service/README.md` | Create |
| `docker-compose.yml` | Modify — add `ai-service` block + `AiService__BaseUrl` to `api` env |
| `.gitignore` | Modify — add `.env` (SEC-04 fix) |

## TODO

### Phase 1: Foundation
- [ ] Create `pyproject.toml` with Poetry (fastapi, uvicorn[standard], anthropic, pydantic, pydantic-settings; dev: pytest, pytest-asyncio, httpx, anyio)
- [ ] Create `app/config.py` — Settings reading ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default: claude-sonnet-4-6), LOG_LEVEL, CORS_ORIGINS
- [ ] Create `app/models.py` — ParseRequest, ParseResponse, TransactionResult, HealthResponse with FlowType/TransactionType enums
- [ ] Create `app/main.py` — GET /health only, JSON logging (JsonFormatter), CORS middleware, lifespan context manager
- [ ] Create `Dockerfile` — python:3.12-slim, Poetry --only main, uvicorn CMD
- [ ] Update `docker-compose.yml` — add ai-service service + AiService__BaseUrl to api environment
- [ ] Update `.gitignore` — add .env; create .env.example
- [ ] Smoke test: GET http://localhost:8000/health → {"status":"healthy","version":"0.1.0"}

### Phase 2: LLM Integration
- [ ] Create `app/services/llm_parser.py` — LlmParseError, EXTRACT_TOOL dict, LlmParser class
- [ ] Implement LlmParser.parse() — AsyncAnthropic call with tool_use, extract tool block, validate rows (skip invalid rows with WARNING log)
- [ ] Add POST /parse to main.py — wire LlmParser via app.state.parser
- [ ] Manual end-to-end test: POST /parse with sample NeoBank text + real ANTHROPIC_API_KEY

### Phase 3: Tests & Docs
- [ ] tests/test_health.py — smoke test
- [ ] tests/test_parse.py — 4 cases: happy path, LLM error→502, empty text→422, no tool_use block→502
- [ ] README.md — setup commands and local dev workflow

## Notes

- `TransactionResult` fields use .NET naming (`flow: DB/CR`, `wallet`, `amount_idr`) not the CLAUDE.md master schema naming — this ensures .NET side can deserialize directly
- Use 502 (Bad Gateway) for LLM API failures — Anthropic is an upstream dependency
- Row-level skip on Pydantic validation failure (don't fail the full request for one bad row)
- `category` defaults to "Untracked Expense" — .NET ICategoryRuleService will re-categorize using keyword rules
- lifespan context manager is the modern FastAPI pattern (on_event is deprecated since 0.99)
- SEC-04: .gitignore currently missing `.env` — fix this in the same PR
