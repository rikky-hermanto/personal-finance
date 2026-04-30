# AI Service — Endpoint Testing Guide

How to test the FastAPI AI microservice (`services/ai-service/`) introduced in PF-011.

Two paths: **automated tests** (no API key, no server) and **live manual tests** (real LLM call).

---

## Prerequisites

```bash
cd services/ai-service
pip install -e ".[dev]"   # if not already installed
```

---

## Path 1 — Automated Tests

No API key or running server needed. The LLM provider is replaced by a mock.

```bash
cd services/ai-service
GEMINI_API_KEY=test-key .venv/Scripts/python -m pytest tests/ -v
```

> `GEMINI_API_KEY=test-key` is only needed to satisfy the startup key-presence check — no real API call is made.

### What each test covers

| Test | Covers |
|------|--------|
| `test_health_returns_200` | `GET /health` returns `{"status":"healthy","version":"0.1.0"}` |
| `test_parse_happy_path` | Valid text → 200, transactions returned |
| `test_parse_empty_text_returns_422` | Empty string → 422 before the LLM is called |
| `test_parse_provider_error_returns_502` | LLM throws → 502 Bad Gateway |
| `test_parse_skips_invalid_rows` | One malformed row from LLM → `skipped_rows=1`, valid rows still returned |

Expected output:

```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_provider_error_returns_502 PASSED
tests/test_parse.py::test_parse_skips_invalid_rows PASSED

5 passed
```

---

## Path 2 — Live Manual Tests

Makes real calls to Gemini or Anthropic. Requires an API key.

### Step 1 — Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Gemini (default)
AI_PROVIDER=gemini
GEMINI_API_KEY=your-real-key-here
AI_MODEL=gemini-2.5-flash

# Anthropic (alternative — change AI_PROVIDER to activate)
# AI_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-anthropic-key-here
# AI_MODEL=claude-sonnet-4-6
```

### Step 2 — Start the server

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Expected startup log:

```json
{"level":"INFO","logger":"app.main","msg":"AI service starting up | provider=gemini | model=gemini-2.5-flash"}
```

### Step 3 — Health check

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"healthy","version":"0.1.0"}
```

### Step 4 — Parse endpoint (happy path)

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{
    "text": "14/03/2024 TRANSFER TO GOFOOD GEPREK BENSU 85000.00\n15/03/2024 GAJI MASUK PT CONTOH 10000000.00\n16/03/2024 GRAB-GRABCAR BALI 35000.00",
    "bank_hint": "bca"
  }'
```

Expected response:

```json
{
  "transactions": [
    {"date": "2024-03-14", "description": "TRANSFER TO GOFOOD GEPREK BENSU", "flow": "DB", "amount_idr": 85000.0, "currency": "IDR", "wallet": "", "category": "Untracked Expense", "raw_text": ""},
    {"date": "2024-03-15", "description": "GAJI MASUK PT CONTOH",            "flow": "CR", "amount_idr": 10000000.0, ...},
    {"date": "2024-03-16", "description": "GRAB-GRABCAR BALI",               "flow": "DB", "amount_idr": 35000.0, ...}
  ],
  "total_parsed": 3,
  "skipped_rows": 0
}
```

Server logs will include token usage:

```json
{"msg":"Gemini extract complete | model=gemini-2.5-flash | input_tokens=... | output_tokens=..."}
{"msg":"Parse complete | parsed=3 | skipped=0"}
```

### Step 5 — Error case: empty text → 422

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": ""}'
```

Expected: HTTP 422 with Pydantic validation detail — the LLM is never called.

### Step 6 — Error case: missing body → 422

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: HTTP 422.

---

## Swagger UI

With the server running, open `http://localhost:8000/docs` in a browser. FastAPI auto-generates an interactive UI — useful for exploring request/response shapes without writing curl commands.

---

## Switching Providers

No code changes needed. Edit `.env` and restart:

| Provider | `.env` settings |
|----------|----------------|
| Gemini (default) | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`, `AI_MODEL=gemini-2.5-flash` |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`, `AI_MODEL=claude-sonnet-4-6` |

---

## Quick Reference

| Task | Command |
|------|---------|
| Automated tests | `GEMINI_API_KEY=test-key pytest tests/ -v` |
| Start server | `uvicorn app.main:app --reload --port 8000` |
| Health check | `curl http://localhost:8000/health` |
| Parse (happy path) | `curl -X POST http://localhost:8000/parse -H "Content-Type: application/json" -d '{"text":"..."}'` |
| Swagger UI | `http://localhost:8000/docs` |
