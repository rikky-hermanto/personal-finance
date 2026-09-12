---
name: ci-check
description: Check Personal Finance's local build, test, lint, and TypeScript readiness before a requested PR or push, or when explicitly asked for CI checks. Reports actual coverage without claiming checks are configured in remote CI.
---

# Local readiness checks

Read root and service `AGENTS.md` files and inspect the current diff. These are local
readiness checks, not a claim that GitHub workflows enforce them. Inspect actual
workflow files before describing remote CI. Running this skill alone does not
authorize a commit, push, PR publication, or deployment.

Use explicit working directories, not chained Bash `cd` commands:

| Directory | Check |
|---|---|
| `apps/api` | `dotnet build PersonalFinance.slnx` |
| `apps/api` | `dotnet test PersonalFinance.slnx` |
| `apps/frontend` | `npm run lint` |
| `apps/frontend` | `npx --no-install tsc --noEmit -p tsconfig.app.json` |
| `apps/frontend` | `npx --no-install tsc --noEmit -p tsconfig.node.json` |
| `apps/frontend` | `npm run build` |
| `apps/frontend` | `npm run test:desk` |
| `apps/frontend` | `npm run test:macro` |
| `services/ai-service` | `.\.venv\Scripts\python.exe -m pytest` |

The frontend root tsconfig is a references-only solution with `files: []`; target
the app and node configs explicitly so the type check examines source code.
Inspect Python tests first and exclude/report live-provider evaluations or integration
tests needing unavailable services. Ordinary checks must not call paid providers.
Run relevant browser specs when behavior changes require them and services exist;
report browser coverage separately. Do not silently count a skipped suite as a pass.

Inspect changed files for accidental secrets without printing secret values. If a
secret scanner is available and appropriate, run it with redacted output and report
its scope. Do not claim secret scanning occurred based only on a manual review.

Report each check as passed, failed, or not run, including warnings and skipped-test
counts. Fix task-related failures when authorized; otherwise explain the failure and
the smallest next step. Do not change lint rules, types, or tests just to suppress
failures. Preserve Claude configuration and workflows.
