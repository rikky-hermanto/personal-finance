# Skill: run-ai-service

Start, test, and verify the Python FastAPI AI service (`services/ai-service/`).

## Steps

### 1. Activate virtual environment

```bash
cd services/ai-service
# Windows (Git Bash):
source .venv/Scripts/activate
# Unix/macOS:
# source .venv/bin/activate
```

### 2. Verify environment variables

```bash
# Check that ANTHROPIC_API_KEY is set
pip show anthropic
# Confirm .env exists with ANTHROPIC_API_KEY (never commit real keys)
```

### 3. Start the service

```bash
uvicorn app.main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Application startup complete.
```

### 4. Verify health check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "ok", "service": "ai-service"}
```

### 5. Run the test suite

```bash
# From services/ai-service/ with venv active:
pytest
# Or with verbose output:
pytest -v
```

All tests must pass before any commit. Tests must not call the real Anthropic API (see `.claude/rules/ai-service.md`).

### 6. Test extraction endpoint (manual smoke test)

```bash
# Test PDF extraction (replace with a real statement file for manual testing)
curl -X POST http://localhost:8000/extract/pdf \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/statement.pdf" \
  -F "bank_id=superbank"
```

### 7. Via Docker (after PF-011 docker-compose integration)

```bash
# From repo root:
docker compose up --build ai-service
docker compose logs -f ai-service
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ModuleNotFoundError` | Run `pip install -e .` from `services/ai-service/` |
| `ANTHROPIC_API_KEY not set` | Copy `.env.example` to `.env`, add real key |
| Port 8000 already in use | `taskkill /F /IM uvicorn.exe` (Windows) or `pkill -f uvicorn` |
| `422 Unprocessable Entity` | Check request body matches Pydantic model in `app/models/` |

## Related

- Rules: `.claude/rules/ai-service.md`
- Add a new bank extractor: `/add-llm-extractor`
- Run all CI gates: `/ci-check`
