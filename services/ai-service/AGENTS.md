# Codex AI service instructions

Applies to `services/ai-service/`; also follow the root `AGENTS.md`.

## Implementation and providers

- Use `pyproject.toml` as the dependency/runtime source of truth (currently Python >=3.11.9), and preserve intentional dependency upper bounds.
- FastAPI entry point is `app/main.py`; inspect `app/routers/`, `app/services/`, `app/providers/`, and `app/agents/` for the relevant feature.
- Preserve async endpoint/provider behavior and the existing provider abstraction in `app/providers/factory.py`.
- Gemini extraction uses structured JSON output; Anthropic extraction uses forced tool use. Preserve provider-specific behavior instead of imposing one provider's schema or model settings on all providers.
- Validate structured results; do not parse free-form LLM prose with regex. Treat truncation and malformed extraction as errors rather than successful empty or partial results.
- Extract usable PDF text before LLM processing; use the existing vision path where text extraction is insufficient.
- Preserve error translation, tracing, token/cost observability, and bounded retries. Do not log credentials or raw private statements.

## Contracts and financial data

- Read `app/models.py`, `app/services/llm_parser.py`, the affected provider, and the .NET DTO/client mapping before changing extraction schemas.
- `TransactionResult.account_name` maps to .NET `TransactionDto.AccountName`. Some separate retrieval/chat models still use `wallet`; treat each contract independently.
- Keep DB/CR flow semantics, amount units, currency, exchange rates, and statement balances consistent across services.
- Use Pydantic v2. Existing extraction models contain float values and string dates; do not claim they already enforce Decimal/date validation. Prefer Decimal for new monetary calculations and explicitly assess serialization compatibility when changing existing models.
- For schema changes, document field types, sanitized example values, and consumer mappings, then update both sides and relevant tests together.

## Commands and tests

Run from `services/ai-service/` using the existing Windows virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pytest
# Focused tests:
.\.venv\Scripts\python.exe -m pytest tests/test_example.py
# Development server when needed:
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Replace the example test path with an existing test. If the environment is absent, create it with `py -m venv .venv` and install with `.\.venv\Scripts\python.exe -m pip install -e ".[dev]"` when dependency setup is within the task.

Use pytest/pytest-asyncio and mock external providers. Add sanitized fixtures and cover malformed/truncated output when changing extraction. Inspect evaluation requirements separately; do not launch paid LLM evaluations as ordinary unit tests.
