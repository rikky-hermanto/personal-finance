# Codex project instructions

## Scope and isolation

- This file and the nested `AGENTS.md` files are the Codex instruction layer.
- Preserve Claude configuration: all `CLAUDE.md` files, `.claude/settings*`, `.claude/skills/`, `.claude/rules/`, `.claude/agents/`, `.claude/hooks/`, other non-plan Claude files, and Claude GitHub workflows. `.claude/plans/` is the explicitly authorized shared task workspace: Codex may create, edit, archive plans, maintain learning material, and update its board as part of active task management.
- Do not execute or import Claude settings, permissions, hooks, agent definitions, or model routing. Independently adapted Codex settings live in `.codex/config.toml`. Do not add `CLAUDE.md` as an instruction fallback. These Codex instructions are self-contained.
- Preserve the mentor curriculum and learning preferences, `.agents/.claude-plugin/plugin.json`, and `.agents/evals/` unless the task specifically concerns them. The Claude plugin manifest is not the Codex configuration file.
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

Use `.claude/plans/` and `BOARD.md` as the shared plan workspace for both agents. Edit the original plan directly; do not create a second Codex plan tree or board. Re-read before writing, preserve concurrent edits, and keep plan/board status consistent. Read the board's source-of-truth declaration for GitHub-linked tasks; local plan management does not itself authorize remote issue mutations. See `.agents/WORKFLOWS.md`.

## Codex workflows

All 32 Claude skill names have Codex counterparts in `.agents/skills/`. Read the
applicable skill and `.agents/WORKFLOWS.md` when using a workflow. Discovery and
capability mapping are documented in `docs/codex/skills-and-rules.md`.

Read `.agents/rules/governance.md` for cross-cutting implementation/review work and
`.agents/rules/finance-domain.md` for financial logic, specifications, and displays.
Read backend/frontend/ai-service rules for their corresponding service; read Docker
rules for Dockerfiles, compose, Supabase local startup, and monitoring changes.
Rule files are loaded through these explicit instructions, not Claude glob metadata.

For the migration inventory, settings rationale, and agent/hook review, see
`docs/codex/configuration.md`. No Claude hook or subagent configuration is enabled
by this adaptation.

## Jev decision support (shadow mode)

Before substantial browser research, repeating a failed approach, loading several
tools or skills, spawning agents, choosing between materially different execution
routes, or proposing a consequential action, consider whether a small bounded Jev
decision would change the next step. If yes, build a compact state without secrets
or personal financial records, call the installed router, interpret its action,
and continue the original task. Skip Jev for simple answers, deterministic
calculations, routine file edits, and situations where it adds no useful decision.
Respect `bypass jev` and `no jev`: do not invoke or log the router for that request.
Keep irreversible actions behind human confirmation; Jev does not grant permission
or authorize subagents. Existing task authorization and agent restrictions apply.

From the project root, pipe sanitized JSON to:
`rtk proxy tools/jev-router/.venv/Scripts/python.exe scripts/jev_route.py`.
Use `goal`, `kind`, `cached_artifact` (boolean), `cached_note`, `prior_error`,
`same_error_count`, `sources_found`, and `constraints`; include only relevant fields.
The wrapper uses the installed upstream router, records evidence in
`tools/jev-router/logs/agent-runs.jsonl`, and falls back on missing credentials or
API failure. Never interpret fallback as a Jev decision. Shadow recommendations
are advisory: retain normal judgment and record the actual action/outcome with
the wrapper's `--outcome` option. Do not switch to active mode automatically.
See `docs/codex/jev-setup.md` for invocation, private key setup, tests and limitations.
For API design/audits, read `.agents/skills/typesafe-ai/SKILL.md`.
