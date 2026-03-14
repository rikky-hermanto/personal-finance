# PF-009 — Hello LLM: First Anthropic API Call

> **GitHub Issue:** #17
> **Status:** In Progress
> **Started:** 2026-03-14

## Objective

Write a minimal Python script that calls the Anthropic API, receives a response, and demonstrates core LLM API concepts (tokens, temperature, system vs user prompt, API key management). This is Day 0-1 of the AI learning path — a quick win to establish the foundation before building the full FastAPI extraction service.

## Acceptance Criteria

- [ ] Python 3.12+ virtual environment set up under `services/ai-service/`
- [ ] Anthropic SDK installed (`pip install anthropic`)
- [ ] Script `services/ai-service/scripts/hello_llm.py` calls Claude API with a system prompt and user message
- [ ] Successfully receives and prints a response
- [ ] Token usage logged from response metadata
- [ ] API key read from `ANTHROPIC_API_KEY` environment variable (never hardcoded)
- [ ] Script is runnable: `python scripts/hello_llm.py`

## Approach

Create a standalone learning script (not part of the FastAPI app yet). Set up the Python virtual environment and `pyproject.toml` for the ai-service project at the same time — this scaffolding is needed anyway for Sprint 1. The script will call Claude with a financial-domain system prompt and a sample user message, then pretty-print the response and token stats.

Out of scope: FastAPI app, LLM extraction, PDF parsing — those are Sprint 1 tasks (PF-010+).

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/scripts/hello_llm.py` | Create — main learning script |
| `services/ai-service/pyproject.toml` | Create — project + dependency declaration |
| `services/ai-service/.env.example` | Create — template for API key env var |
| `services/ai-service/README.md` | Create (optional) — setup instructions |

## TODO

- [ ] 1. Scaffold `pyproject.toml` for `ai-service` (Python 3.12+, anthropic dependency)
- [ ] 2. Set up virtual environment: `python -m venv .venv`
- [ ] 3. Install dependencies: `pip install -e .` (or `pip install anthropic python-dotenv`)
- [ ] 4. Create `.env.example` with `ANTHROPIC_API_KEY=your-key-here`
- [ ] 5. Write `scripts/hello_llm.py`:
  - Load `ANTHROPIC_API_KEY` from environment (using `python-dotenv` for local dev)
  - Instantiate `anthropic.Anthropic()` client
  - Call `client.messages.create()` with:
    - `model`: `claude-sonnet-4-6` (latest efficient model)
    - `max_tokens`: 1024
    - `system`: financial assistant persona
    - `messages`: sample user message (e.g. summarize a transaction description)
  - Print response text
  - Print token usage: `input_tokens`, `output_tokens`, estimated cost
  - Demonstrate `temperature` parameter with a comment
- [ ] 6. Test the script locally (requires real `ANTHROPIC_API_KEY`)
- [ ] 7. Verify `.env` is in `.gitignore` (SEC-01 compliance)

## Notes

- **Model ID:** Use `claude-sonnet-4-6` (current efficient model per environment context). Issue references `claude-sonnet-4-20250514` but `claude-sonnet-4-6` is the correct current ID.
- **`python-dotenv`:** Add as a dev dependency so the script reads from a local `.env` file without polluting the shell — keeps the learning experience clean.
- **ai-service directory:** `services/ai-service/` exists but is empty (only has `scripts/` dir with no files). Full FastAPI scaffold (`app/`, `Dockerfile`, etc.) is Sprint 1 work — this ticket only needs `pyproject.toml` + the script.
- **`.gitignore`:** The root `.gitignore` should already cover `.env` — verify before committing.
- **Cost note:** `claude-sonnet-4-6` is the cost-efficient choice for learning experiments.
