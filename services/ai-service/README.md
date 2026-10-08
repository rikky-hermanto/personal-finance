# Personal Finance — AI Service

FastAPI service for bank extraction, categorization, portfolio/Journey advice, transaction embeddings/retrieval, SQL-routed Q&A/SSE, follow-up suggestions, and separate smolagents/LangGraph endpoints.

> **Source reviewed:** 2026-10-08. Implemented routes are not a claim of live/deployment readiness. See [project status](../../docs/STATUS.md) and the [complete endpoint reference](../../docs/architecture/API-endpoints.md).

## Setup

Run from services/ai-service in PowerShell; reuse an existing virtual environment and preserve any existing .env:

```powershell
rtk proxy py -m venv .venv
rtk proxy .venv/Scripts/python.exe -m pip install -e '.[dev]'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Python >=3.11.9 is required. The package uses setuptools/pip and deliberately bounded LangGraph/LangChain/eval dependencies, not Poetry. Configure generation, embeddings and database access independently; see [full setup](../../docs/SETUP.md).

## Providers

| AI_PROVIDER | Key needed | Default model |
|-------------|-----------|---------------|
| `gemini` (default) | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |

Switch generation provider with `AI_PROVIDER`, the matching key and a matching `AI_MODEL`, then restart. The coded model default is Gemini; selecting Anthropic also requires selecting an Anthropic model. Portfolio review supports per-request provider/model override.

Embedding provider is separate: `EMBEDDING_PROVIDER=gemini` by default (`gemini-embedding-001`), or `openai` (`text-embedding-3-small`). `EMBEDDING_MODEL` optionally overrides it. `DATABASE_URL` points to Supabase Postgres for asyncpg; `NET_API_BASE_URL` points to .NET for advisor tools. Keep vectors compatible with the 1536-dimensional schema and backfill when switching model.

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

## Implemented HTTP surface

| Group | Routes |
|---|---|
| Extraction | POST /parse, /parse-pdf, /parse-image |
| Categorization | POST /categorize, /suggest-categories; separate /categorize-agent |
| Reviews/advice | POST /portfolio-review, /journey/advise; separate /advisor |
| Retrieval/chat | POST /embed-transactions, /search, /ask, /ask/stream, /ask/followups |
| Liveness | GET /health |

RAG uses one transaction per indexed unit, local FlashRank and vector/full-text/hybrid search. Vector is the default. SQL aggregate answers calculate totals before LLM narration; JSON monetary contracts still contain numbers/floats. Chunking helpers exist, but statement sentence-window/auto-merging retrieval is deferred.

The React chat calls /ask/stream directly and requests optional follow-ups. It does not call /advisor or send conversation history. LangGraph /advisor has process-local session memory, four .NET-backed tools, bounded model calls and fallback; requested dates enter prompts rather than structured tool inputs. /categorize-agent is a separate smolagents demo/debug endpoint, not the upload pipeline.

There is no /webhooks/process route or durable ingestion worker. The .NET PDF parser currently sends no bank_hint, so the Superbank prompt is reached only by Python callers supplying the hint.

## Run locally

From services/ai-service:

```powershell
rtk proxy .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

- Health: http://localhost:8000/health (liveness only).
- Docs: http://localhost:8000/docs; schema: http://localhost:8000/openapi.json.
- Missing provider keys are warned about in settings; feature calls and provider-specific startup paths can still fail. Health does not prove DB/LLM readiness.

## Tests and evaluation

From services/ai-service, ordinary tests mock external generation:

```powershell
rtk proxy .venv/Scripts/python.exe -m pytest
```

Tests cover extraction, providers, categorization/Jev/evaluation scoring, embeddings/retrieval/reranking, query routing/aggregation/streaming, follow-ups and agents. Live evaluations are separate and can incur cost or exhaust quotas. See [evals/README.md](evals/README.md) and original plans for authorization/budgets and historical results.

Recorded gaps include the merchant-suggester PII test failure and advisor/eval dependency conflicts in prior runs; no fresh test run was possible during the October 8 documentation sync. OTel and Langfuse are instrumented, but collectors and dashboards were not checked today.
