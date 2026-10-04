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

## Residual transaction categorization

`POST /categorize` has an independent backend switch. The default is
`CATEGORIZATION_BACKEND=llm`, which reuses `AI_PROVIDER` and does not create a
TypeSafe client or send Jev requests. Extraction, category suggestions, advisors,
and embeddings are unaffected by this switch.

Jev remains opt-in. Before enabling it, deploy the updated .NET consumer guard,
run the versioned held-out evaluator, review the promotion gates in the PF-141
plan, and configure all of:

```text
CATEGORIZATION_BACKEND=jev
TYPESAFE_API_KEY=...
JEV_MODEL=jev-1.13.0
JEV_ACCEPTANCE_THRESHOLD=<held-out calibrated value>
JEV_TIMEOUT_SECONDS=5
```

The service fails startup when Jev is selected without a key, a calibrated
threshold, or a pinned model version. Jev abstains on no-match, low confidence,
invalid output, timeout, and provider failure; it never permits reusable rule
creation. Roll back by restoring `CATEGORIZATION_BACKEND=llm` and restarting the
AI service. Rollback does not change `AI_PROVIDER`, delete rules, or rewrite
historical categories. Container/staging variable injection must be verified
separately before rollout; PF-141 does not change deployment configuration.

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
