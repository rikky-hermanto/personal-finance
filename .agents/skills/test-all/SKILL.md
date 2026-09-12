---
name: test-all
description: Run Personal Finance's local backend, AI service, and frontend unit tests plus lint checks and summarize failures. Use for a requested test sweep; use ci-check for broader build and type-check readiness.
---

# Test all

Read root and relevant service `AGENTS.md` files. Check installed tools and environments
before running; report unavailable checks without presenting them as passes.

Run commands with the indicated working directory using PowerShell-compatible syntax:

| Directory | Command |
|---|---|
| `apps/api` | `dotnet test PersonalFinance.slnx --verbosity normal` |
| `apps/frontend` | `npm run lint` |
| `apps/frontend` | `npm run test:desk` |
| `apps/frontend` | `npm run test:macro` |
| `services/ai-service` | `.\.venv\Scripts\python.exe -m pytest` |

Inspect Python tests for live-provider/evaluation requirements before a broad pytest
run. Use the normal mocked test scope; explicitly exclude and report tests requiring
paid providers or unavailable integration services. Do not install dependencies,
start databases, or enable real provider calls merely to conceal an environment gap.
If the user requested setup as well, carry out the authorized setup.

Browser tests are a separate integration stage: inspect `apps/frontend/e2e/` and
run `npm run e2e` from `apps/frontend` when the requested scope includes E2E and the
supporting services are available. Report whether this stage ran.

Record exit status, passed/failed/skipped counts when available, and actionable
failure evidence. Distinguish existing failures from regressions where evidence
allows. A test-only request is not authorization for unrelated code rewrites;
fix failures when the surrounding task includes fixing them. Never weaken assertions
or resurrect EF Core fixtures to get a green result.

Do not modify Claude plans, hooks, or configuration. End with a concise per-suite
result and any missing coverage.
