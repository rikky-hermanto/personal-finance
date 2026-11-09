# Personal Finance — Claude Code Guide

**Start here:** [ai/MAP.md](ai/MAP.md) maps every job (build, decide, write, learn, design) to its skills, templates, and examples.

@ai/shared/preferences.md

## Project Overview

> **"Finance should feel like a game you're winning, not a spreadsheet you're losing."**

Personal Finance is a **gamified personal finance platform** built around a five-tier **Financial Pyramid scoring engine** — showing where you stand (Foundations → Legacy) and what to do next, across transactions, assets, and investments. The mission: make managing money genuinely enjoyable through clarity, progress, and a sense of level-up. Not another budgeting tool. A compass.

Built on .NET 10 + React 18 + Supabase, with a Python FastAPI AI service for LLM extraction, semantic search, and financial advice. The bank statement parser is plumbing inside one module. It is not the product; the pyramid is.

## The Financial Pyramid

Most people aren't financially illiterate — they're **directionally lost**. They earn, spend, and occasionally invest without a coherent picture of where they stand or what to do next. The result: someone maxing out investments while carrying high-interest debt. Good intentions, wrong order.

The pyramid makes the correct order explicit. Each level has prerequisites; you can't defend what you haven't built, and you can't grow what you haven't defended.

```
                 ▲
               ████             L5 · Legacy       — Estate planning, succession, tax · no indicator yet
             ████████           L4 · Freedom      — FIRE, passive income · not scored yet (rubric: 35% cleared, 50% mastered of expenses)
           ████████████         L3 · Growth       — Cleared: savings rate ≥ 9% · Mastered: ≥ 15%
         ████████████████       L2 · Defense      — Cleared: cover ≥ 2.1 months and DTI ≤ 29.6% · Mastered: 3 months and ≤ 20%
       ████████████████████     L1 · Foundations  — Cleared: spending ≤ 89% of income · Mastered: ≤ 80%
```

Cleared = every live indicator scores ≥ 70; Mastered = score 100 (per indicator). Spending excludes money you invest or save. DTI is judged once debts are recorded or confirmed. Source: [scoring-rubric.md](docs/ideas/scoring-rubric.md).

`JourneyScoringService` reads across transactions, assets, and investments and computes indicator scores per tier. Recalculation is event-driven: `TransactionsSubmittedEvent` (once per import batch) and `AssetUpdatedEvent` (account, valuation, liability and asset writes) trigger it via MediatR handlers, and the quest engine runs inside the same pass. This scoring engine is the product's core, not a feature.

## Modules

| Module | Route | What it tracks | Detailed doc |
|--------|-------|----------------|--------------|
| Journey (home) | `/journey` | Pyramid tier scores, quest cards, achievements, Living Garden Hero | — |
| Cashflow | `/cashflow` | Statement ingestion (LLM + CSV hybrid), transactions, spending analysis, Safe-to-Spend | [cashflow-ingestion.md](docs/features/cashflow-ingestion.md) |
| Assets | `/assets` | Properties, vehicles, savings accounts, liabilities, net worth balance sheet | — |
| Investment | `/investment` | IDX stocks, mutual funds, SBN/ORI bonds, crypto, P2P; AI portfolio review | — |
| Settings | `/settings` | Category rules (106), banks, appearance, regional, data reset | — |

Feature specs: [docs/features/](docs/features/). Roadmap by pyramid level: [README.md](README.md#the-roadmap-by-level).

## Architecture

React 18 frontend → .NET 10 API (supabase-csharp) → Supabase (PostgreSQL 17 + pgvector, Auth, Storage, Realtime, Webhooks). PDF/image uploads are designed to be event-driven: Storage upload → Database Webhook → Python FastAPI AI service → results written back to Supabase → Realtime notifies frontend (PF-S11, not wired yet; the API calls the AI service directly today).

## Tech Stack

- **API:** .NET 10, C# 13, ASP.NET Core, CQRS via MediatR, FluentValidation, Clean Architecture; xUnit, Moq.
- **Data access:** `supabase-csharp` SDK (PostgREST). No EF Core, no DbContext.
- **Auth:** Supabase Auth, validated by `JwtBearer` middleware against the Supabase JWKS.
- **Supabase:** PostgreSQL 17 + pgvector, GoTrue, Storage (`bank-statements/`), Realtime, Database Webhooks. Local dev runs on the Supabase CLI.
- **AI service:** Python 3.12+, FastAPI, Gemini (`gemini-2.5-flash`, primary), Anthropic (`claude-sonnet-4-6`, alternate), PyMuPDF.
- **Frontend:** React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, `@supabase/supabase-js` for sign-in and transaction Realtime (upload-status Realtime, PF-S12, is planned).
- **Infrastructure:** Docker Compose; `ci.yml` runs dotnet build/test, ESLint, tsc, Vitest, vite build, pytest and gitleaks on push and PR, but not e2e. OpenTelemetry → Alloy → Prometheus + Loki + Tempo → Grafana. Cloud target: Supabase Cloud and Azure.

Read on demand:
- [docs/INDEX.md](docs/INDEX.md) — index of all docs
- [docs/SETUP.md](docs/SETUP.md) — local setup, ports, environment, migrations
- [docs/architecture/API-endpoints.md](docs/architecture/API-endpoints.md) · [API-backend.md](docs/architecture/API-backend.md) · [Front-End.md](docs/architecture/Front-End.md) · [architecture-diagram.md](docs/architecture/architecture-diagram.md) · [supabase-migration.md](docs/architecture/supabase-migration.md)
- [docs/features/cashflow-ingestion.md](docs/features/cashflow-ingestion.md) — parser routing, bank profiles, validation pipeline, master schema
- [docs/sprint-plan.md](docs/sprint-plan.md) — sprint breakdown
- [docs/reference/finance-domain/](docs/reference/finance-domain/) — formulas, Indonesian instruments, tax rates. Invariants are in [.claude/rules/finance-domain.md](.claude/rules/finance-domain.md); domain judgment routes to `/cio`, `/risk-officer`, `/compliance`

## Project Layout

```
apps/frontend/        React 18 + Vite app: src/ (api, components, components/ui, pages, lib, types), e2e/ (Playwright)
apps/api/             .NET 10: src/PersonalFinance.{Api,Application,Domain,Infrastructure}, tests/PersonalFinance.Tests
services/ai-service/  FastAPI: app/ (main.py, services, providers, prompts), evals/, tests/
supabase/             migrations/ — schema changes live here and nowhere else
docs/                 Product, architecture and reference docs
plans/                One plan per task in status folders, plus BOARD.md
ai/                   Job map, shared preferences, templates, audits
_archive/             Retired material; don't load it unless asked
```

## Quick Commands

- Start everything: `npm start` (Supabase, monitoring containers, then API + frontend + AI service). Skill: `docker-up`.
- Before a push: skill `ci-check` (all gates) or `ci-check quick` (tests + lint).
- Per-service commands, ports, environment variables, and migrations: [docs/SETUP.md](docs/SETUP.md). Variable names: `.env.example`.
- Key ports: frontend 8080 · API 7208 (`/health`) · AI service 8000 (`/health`) · Supabase Studio 54323 · Grafana 3000 (loopback-only, log in as `admin` / `GRAFANA_ADMIN_PASSWORD`). Compose supporting services (`db`, `ai-service`, monitoring stack) bind to `127.0.0.1` only; `api` and `frontend` stay on all interfaces.

## Key Patterns

Conventions for each area load automatically from [.claude/rules/](.claude/rules/) when you work in matching files. Money invariants are always loaded. These are the cross-cutting ones:

- **Clean Architecture:** Domain (no deps) → Application → Infrastructure → Api. CQRS via MediatR, all persistence via `supabase-csharp`.
- **Hybrid parsing:** deterministic formats use direct parsers; unstructured PDFs and screenshots use LLM extraction. All paths converge on the five-stage `ITransactionPipelineService` before persisting.
- **Auth:** Sign-in is required (PF-S08/S09, done 2026-10-16). The API validates the Supabase JWT, requires an authenticated user by default, and talks to PostgREST with a per-request client carrying the caller's token, so owner RLS policies on `user_id` apply. Take the owner from `ICurrentUser`, never from the request body. Public signup is off; the single owner account holds all legacy rows.
- **AI chat and agents:** The browser calls only `/api/chat/*`. The API forwards to the AI service with the internal API key and a signed 60-second owner token, and the AI service reads as that user under RLS (PF-S15). Flags: `AiChat:Enabled`, `AiChat:AgentsEnabled`, `AI_CHAT_ENABLED`, `AI_AGENTS_ENABLED`, `VITE_AI_CHAT_ENABLED`. Runbook: [docs/runbooks/pf-s08-cashflow-pilot.md](docs/runbooks/pf-s08-cashflow-pilot.md).
- **Quests (PF-152):** the catalog lives in code (`Application/Quests/QuestCatalog`), detectors are pure rules, completions are append-only rows in `quest_completions` (never deleted), and the engine runs inside the recalculation pass on the same snapshot as scoring. No LLM and no point values anywhere in the quest path; `GET /api/journey/quests` only reads stored state.
- **UI look:** see [ai/design/](ai/design/README.md) — the zen/theme skills plus Rikky's standing UI rules. Skip only if the user asks for a different style (landing page, marketing, creative).

## Testing

- **Backend:** xUnit + Moq from `apps/api/`. Many `CategoryRuleService` tests are `[Fact(Skip=...)]`; they pass but execute nothing (integration harness: PF-034).
- **AI service:** `pytest` from `services/ai-service/`; always mock LLM calls.
- **Frontend:** Vitest for pure logic in `src/lib/`, and Playwright for functional coverage. Component tests are not set up (PF-038). E2E needs the full stack running: either `docker compose up -d` or local `dotnet run` + `npm run dev`.

## Known Gotchas

- `apps/frontend/src/types/Transaction.ts` uses `id: string` but the API returns `id: number` — type mismatch
- `apps/frontend/.env` must point `VITE_API_URL` at `http://localhost:7208`; `npm start` serves no HTTPS port, so `https://localhost:7209` makes every page fail to reach the API
- AI chat totals still travel as JSON numbers, not decimals (FIN-01 follow-up from PF-S15)

## File Protection

- NEVER commit `.env` files with real credentials
- NEVER commit API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY) — use environment variables
- NEVER modify files in `src/components/ui/` (managed by `npx shadcn@latest add`)
- Schema changes go in `supabase/migrations/` as numbered SQL files — apply via `supabase db push`
- Use `docker compose` (V2 syntax), never `docker-compose` (V1)
- NEVER use the Supabase `service_role` key on the frontend — it bypasses RLS entirely

## Task Management

GitHub Project #4 remains the source of truth for GitHub-linked issue status; local-only tasks use the plan folder and board.

- **Plans:** `plans/backlog/`, `plans/in-progress/`, `plans/done/`, `plans/cancelled/` — one canonical plan per task; learning plans use each status folder's `learning/` subfolder. See `plans/README.md`.
- **Board:** `plans/BOARD.md`. The block between `<!-- loop:begin -->` and `<!-- loop:end -->` is generated from the plan files; do not hand-edit it.
- **New task:** create the plan in `plans/backlog/` (or `plans/backlog/learning/` for PF-AI) using `/plan`, with a `> **Board objective:** ...` header line, then regenerate the board with `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.
- **Moving a task:** move the plan to its status folder and update its header, links, and board row together. `Ready` and `Blocked` are flags, not folders. When done, move the plan and companions to `plans/done/` and keep historical notes and deferred follow-ups.
- **Next task ID:** check `plans/BOARD.md`, all status folders, and linked GitHub issues. Use the existing PF-, PF-S, and PF-AI series; do not rely on a hardcoded next number.

## Project Status

Current phase, active features, known tech debt, and sprint references: [docs/STATUS.md](docs/STATUS.md).
