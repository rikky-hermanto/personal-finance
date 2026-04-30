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
GEMINI_API_KEY=test-key pytest tests/ -v
```
