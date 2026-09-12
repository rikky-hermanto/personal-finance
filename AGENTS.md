# Codex project instructions

## Scope and isolation

- This file and the nested `AGENTS.md` files are the Codex instruction layer.
- Preserve `CLAUDE.md`, all nested `CLAUDE.md` files, `.claude/`, and Claude GitHub workflows. Do not edit, move, synchronize, or auto-update them unless the user explicitly requests it.
- Do not execute or import Claude settings, permissions, hooks, agent definitions, or model routing. Independently adapted Codex settings live in `.codex/config.toml`. Do not add `CLAUDE.md` as an instruction fallback. These Codex instructions are self-contained.
- Preserve existing mentor content, `.agents/.claude-plugin/plugin.json`, and `.agents/evals/` unless the task specifically concerns them. The Claude plugin manifest is not the Codex configuration file.
- Before editing a service, read its `AGENTS.md`, including when working from the repository root: `apps/api/AGENTS.md`, `apps/frontend/AGENTS.md`, and `services/ai-service/AGENTS.md`.

## Product and architecture

Personal Finance is a gamified finance platform centered on a five-tier Financial Pyramid: Foundations, Defense, Growth, Freedom, Legacy. Journey, Cashflow, Assets, Investment, and Settings contribute to that experience. Bank statement ingestion is one supporting feature.

- `apps/frontend/`: React 18, TypeScript, Vite, Tailwind.
- `apps/api/`: .NET 10, MediatR, FluentValidation, Supabase/PostgREST.
- `services/ai-service/`: Python FastAPI, provider-based extraction, retrieval and advisor services.
- `supabase/migrations/`: timestamped SQL schema migrations.
- `docs/`: shared product, architecture, setup, and domain references.

Read relevant code and manifests before relying on status claims in older documentation. Start with `docs/STATUS.md`, `docs/SETUP.md`, and `docs/architecture/architecture-diagram.md` as needed; they are context, not proof of implemented behavior.

## Working conventions

- Keep changes scoped to the requested task. Preserve unrelated working-tree changes.
- Do not use destructive Git cleanup/reset, force-push, database deletion, or Docker volume pruning without explicit task authorization. Do not append an AI co-author trailer unless requested.
- Inspect existing patterns before adding abstractions or dependencies.
- Use PowerShell-compatible commands in this Windows workspace. Prefer explicit working directories; do not use Bash activation commands or `&&` in Windows PowerShell.
- Run checks relevant to the changed behavior. Report failures, skipped tests, and unavailable dependencies accurately; do not describe skipped integration tests as functional coverage.
- Mock external LLM calls in ordinary tests. Do not turn tests into paid provider calls.
- Do not commit secrets or expose service-role credentials to the browser. Use `.env.example` for variable names; avoid printing actual secret values.
- Use `docker compose` V2. Inspect current compose and Supabase configuration before changing startup behavior; do not assume EF Core auto-migrations exist.
- Add schema changes as SQL migrations. Database reset, volume removal, and applying migrations to remote databases are separate actions from writing a migration.

## Financial correctness

- Use C# `decimal` and Python `Decimal` for new financial calculations; use integer minor units or decimal strings with explicit arithmetic in TypeScript. Existing float/number contracts are compatibility constraints, not a reason to introduce more imprecise calculations. Change serialization deliberately across producers and consumers.
- Preserve debit/credit meaning, currency units, rounding, and date semantics. Test financial boundary cases when changing calculations or parsers.
- Cite the source of financial thresholds and formulas. Consult `docs/reference/finance-domain/` and `docs/ideas/scoring-rubric.md` for relevant methodology.
- Label return methods (TWR versus MWR/XIRR); do not mix incompatible methods.
- Unevaluated risk or health checks must display as unevaluated, never as a passing green state.
- For recommendation, sizing, or projection features, retain appropriate disclosures and review financial/regulatory assumptions. Verify time-sensitive tax and regulatory claims against primary sources, including the verification dates in `docs/reference/finance-domain/tax-id.md`.

## Commands and task context

From the repository root, frontend checks are `npm run lint` and `npm run build`. Service-specific test commands are in the nested instructions.

`npm start` launches Supabase, monitoring containers, API, frontend, and AI service; use it when the task needs the full stack, not for instruction-only edits. Playwright starts the frontend itself; relevant backend services must still be available.

Existing `.claude/plans/` and its board may be read for task context, but Codex must not mutate them under the isolation policy. Keep routine plans in the conversation. If a persistent Codex plan is requested, use `docs/codex/plans/` and a descriptive filename; do not hardcode the next PF ticket number or create a duplicate task board.

## Codex workflows

Selected independent skills live in `.agents/skills/`: `data-oriented-zenmode` for
frontend UX, `test-all` for a test sweep, `ci-check` for build/type/test readiness,
and `add-endpoint` for REST implementation. Read the applicable skill when using
that workflow. Existing `mentor` remains available with its own scope.

For the migration inventory, settings rationale, and agent/hook review, see
`docs/codex/configuration.md`. No Claude hook or subagent configuration is enabled
by this adaptation.
