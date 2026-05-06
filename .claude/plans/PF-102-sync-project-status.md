# Plan: Sync Documentation with Current Codebase State

## Context

The user observed (correctly) that `CLAUDE.md` and `.kanban/BOARD.md` lag behind the actual code, and asked for a documentation refresh based on a full end-to-end code analysis. Three downstream goals:

1. Analyze the entire code end-to-end.
2. Produce a hierarchical feature summary in `README.md` (root) so a new developer can understand the project state at a glance.
3. Update `CLAUDE.md` only where it has drifted from code.
4. Update `.kanban/BOARD.md` only where it has drifted from code.

Three Explore agents covered backend, frontend, and AI service + infra in parallel. Key findings + drift summary below.

---

## Drift Findings (what code says vs what docs say)

### A. README.md (root) — HEAVY drift, needs full rewrite
Current README is ~80 lines and badly stale:
- Claims `.NET 9 / EF Core 9` — actually `.NET 10` + `supabase-csharp` (PostgREST). EF Core fully removed in PF-S07.
- Claims "Anthropic/OpenAI" extractors — actually **Gemini (primary) + Anthropic (alternate)**. No OpenAI provider.
- Claims a "LangChain" stack — not used anywhere.
- Says "Settings → Bank Profiles" page exists — it doesn't. Real settings tabs are `Categories`, `Regional`, `Data` (with Banks/Rules/Profile shown as "soon").
- Says `./start-all.ps1` — file no longer exists at root; `npm start` is the orchestrator (uses `concurrently` + Supabase CLI + Docker).
- Missing: tabbed Cashflow workspace (Overview / Transactions / Upload / Statement), tabbed Settings, the LGTM monitoring stack (Alloy/Prometheus/Loki/Tempo/Grafana), Status page, file-hash + composite-key deduplication, CSV export, validation pipeline (5-stage), drag-drop / paste / template-CSV upload UX, PDF password modal, image upload via vision LLM.

### B. CLAUDE.md (root) — moderate drift
- "Project Overview" line: says `.NET 9` → actually .NET 10.
- "Tech Stack → Backend" says `.NET 9 / C# 13` and lists `Microsoft.AspNetCore.Authentication.JwtBearer` middleware — JWT not yet wired (PF-S08 pending).
- "Tech Stack → AI Services" says Anthropic primary + **OpenAI fallback** — actually **Gemini primary + Anthropic alternate**, no OpenAI.
- "Project Layout" lists `src/PersonalFinance.Persistence/` (already deleted in PF-S07) and lists AI service subdirectories `routers/`, `prompts/`, `config/`, `models/` (only `services/` + `providers/` exist; `models.py` is a single file; no per-bank prompt templates).
- "Run everything locally" instructions mention a separate Postgres — local stack is now via `supabase start` (Postgres 17 on 54322).
- "Current Phase" block says last updated 2026-04-11; code state is ahead by several tickets (PF-090, PF-100, PF-101 done).
- "What's Working / What's Not Built Yet" list is wrong: AI service is built, `/parse-pdf` and `/parse-image` are live, Docker container shipped, OpenTelemetry stack added, system health dashboard at `/status` exists.
- Background problem section refers to "GPT extract" — should be vendor-agnostic ("LLM extract").

### C. apps/api/CLAUDE.md — current, no change needed
Already says ".NET 10" and "EF Core removed in PF-S07." Spot-checked against `Program.cs` and `.slnx`. Leave it alone.

### D. BOARD.md — drift in Done list and next-ID
Three completed tickets are missing from `## Done`:
- **PF-090** — Robust deduplication & file hashing — committed `ffb97690`. Adds `bank_running_balance`, `uploaded_files` table, composite UNIQUE index migration.
- **PF-100** — LGTM Monitoring Stack (OpenTelemetry) — committed `5898e77f`. Adds Alloy/Prometheus/Loki/Tempo/Grafana to docker-compose, instruments .NET API + Python AI service.
- **PF-101** — System Health Status Dashboard — committed `781e958b`. Adds `/status` page + `statusApi.ts` + multi-target health checks (DB, AI service, Grafana).

Other drift:
- "Next task ID: **PF-060**" → must be **PF-102**.
- "Last synced: 2026-05-02" → must be 2026-05-06.
- Progress bars and totals slightly off because three Done items are missing.

---

## Plan

### Step 1 — Rewrite `c:\workspaces\personal-finance\README.md` (full rewrite)

Target audience: a new developer landing on the repo, who needs a hierarchical map of "what this app can do today."

**Structure (sections, in order):**

1. **Project Overview** — one paragraph. The hybrid-parser cashflow tracker for 5 Indonesian banks (BCA / Superbank / NeoBank / Wise / Bank Jago).
2. **Tech Stack at a Glance** — table form. Frontend / Backend API / AI Service / Database / Observability / Containers / CI.
3. **Architecture** — text + ascii diagram. Frontend (React 18 + Vite) → .NET 10 API (Clean Arch + CQRS + supabase-csharp) → Supabase (PostgreSQL 17 + Storage). Python AI service for PDF/image extraction. LGTM stack for traces/metrics/logs.
4. **Feature Inventory (Hierarchical)** — the heart of the rewrite. Three top-level groups (Frontend / Backend API / AI Service), each with sub-bullets for every shipped capability:
   - **Frontend (React 18, port 8080)**
     - Layout: `AppShell` with collapsible Sidebar + ActivityPanel rail
     - Dashboard `/dashboard` — Cashflow section (Net Cashflow card, Top Categories, Monthly chart) + Portfolio/Debts placeholders
     - Cashflow workspace `/cashflow` (tabbed)
       - Overview — date-range selector (1M/3M/6M/1Y/2Y/YTD), Net Cashflow + Top Categories + composed chart
       - Transactions — server-paged table (50/page, infinite scroll), Excel-style column filter menus, search, date sort, inline category edit, Upload + Export CSV
       - Upload — 4-step wizard (drag-drop, file picker, **clipboard paste**), CSV/PDF/PNG/JPG/WebP, **PDF password input + no-password confirmation guard**, bank-name hint for images, Download Template CSV, two-table preview (Ready to Save / Duplicates) with inline edit
       - Statement — quarterly/monthly toggle, full Cash Flow Statement table (Operating / Investing / Financing) with subtotals
     - Settings `/settings` (tabbed)
       - Categories — CRUD over category rules with longest-keyword-match
       - Regional — date format select persisted to localStorage
       - Data — Danger Zone: type-to-confirm "delete all" reset
     - Status page `/status` — polls every 30s; shows DB, AI Service, Grafana, Frontend health
     - E2E coverage — 5 Playwright specs (health, dashboard, upload, category-rules, deduplication)
   - **Backend API (.NET 10, port 7208)**
     - Clean Architecture (Domain → Application → Infrastructure → Api) with CQRS via MediatR
     - Persistence: `supabase-csharp` (PostgREST) — entities use `[Table]/[Column]` annotations, no EF Core, no Persistence project
     - Endpoints (REST):
       - `POST /api/transactions/upload-preview` (legacy multi-format upload)
       - `POST /api/transactions/upload-preview-new` (Storage-first flow with `processing_id` for async)
       - `POST /api/transactions/submit` (filters duplicates, bulk insert, registers file hash)
       - `GET /api/transactions` (paged + filtered)
       - `GET /api/transactions/aggregated` (dashboard data)
       - `GET /api/transactions/statement` (cashflow statement)
       - `GET /api/transactions/export` (CSV export)
       - `DELETE /api/transactions/reset` (wipe transactions + uploaded_files)
       - `GET/POST/PUT/DELETE /api/categoryrules` (CRUD)
       - `GET /health` (multi-target: DB / AI service / Grafana)
     - Bank parsers (hybrid strategy):
       - BCA CSV — direct (deterministic header sniff)
       - NeoBank PDF — direct (PdfPig + regex)
       - Default CSV — direct (auto-delimiter, Indonesian decimal)
       - LLM PDF (any unrecognized PDF) — routed to AI service
       - Image — bypasses identifier, sent to AI service vision endpoint
     - **Robust deduplication (PF-090)** — Tier 1 file-hash table (`uploaded_files`), Tier 2/3 composite UNIQUE index `(date, amount_idr, description, wallet, flow, COALESCE(bank_running_balance,-999999999))`, plus `BankRunningBalance` tie-break in service layer
     - 5-stage validation pipeline: DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck
     - Categorization: 106 seeded category rules, longest-keyword-match
     - **OpenTelemetry (PF-100)**: tracing + metrics + logs via OTLP to Alloy at `localhost:4317`, AspNetCore + HttpClient + Npgsql + Runtime instrumentation
   - **AI Service (Python 3.12 FastAPI, port 8000)**
     - Endpoints:
       - `GET /health`
       - `POST /parse` (text → structured JSON)
       - `POST /parse-pdf` (multipart, optional password — PyMuPDF text extract → LLM)
       - `POST /parse-image` (multipart, 10MB cap — Claude vision)
     - Provider abstraction (`app/providers/`):
       - **Gemini (primary, default `gemini-2.5-flash`)** via `google.genai`
       - **Anthropic (alternate, `claude-sonnet-4-6`)** via `tool_use` forced extraction
     - Single shared `SYSTEM_PROMPT` + JSON Schema (no per-bank prompt templates yet)
     - Observability: OTel tracing/metrics + `LoggingInstrumentor`, FastAPI auto-instrumentation
     - Test coverage: `test_health`, `test_parse`, `test_parse_pdf`, `test_pdf_extractor`
   - **Database (Supabase / PostgreSQL 17)**
     - Tables: `transactions`, `category_rules`, `uploaded_files`
     - Storage bucket: `bank-statements/` (private, per-user folders, RLS-ready)
     - Migrations: 5 files in `supabase/migrations/` (initial schema, RLS placeholder, storage, deduplication upgrades, composite UNIQUE)
     - `pgvector` extension enabled (RAG-ready)
   - **Observability — LGTM stack (PF-100)**
     - Alloy (OTLP collector, ports 4317/4318)
     - Prometheus (metrics, port 9090)
     - Loki (logs, port 3100)
     - Tempo (traces, port 3200)
     - Grafana (UI, port 3000)
   - **Repo-level**
     - `npm start` — starts Supabase + LGTM containers + .NET API + Python AI service + frontend in one terminal via `concurrently`
     - `npm run start:no-api` — UI + AI variant
     - GitHub workflows: `claude.yml` (mention bot), `claude-code-review.yml` (auto PR review)
     - `.claude/rules/` — 5 rule files (ai-service / backend / frontend / docker / governance)
     - `.claude/skills/` — 9 project skills (add-bank-parser, add-endpoint, datatable, etc.) + 2 theme skills
5. **Quick Start** — corrected commands (`npm start`, what URLs to open, where to upload).
6. **Project Layout** — accurate tree (no Persistence project; AI service shows actual `services/` + `providers/` only).
7. **Roadmap** — short, points to GitHub Project #4. Next: PF-S08 Auth, then PF-S09–S13.

**Verification:** the file should describe only features that exist in the read-only inventory above; no aspirational language. Reference paths use clickable `[path](path)` markdown.

### Step 2 — Patch `c:\workspaces\personal-finance\CLAUDE.md`

Targeted edits (no full rewrite):
- Project Overview: ".NET 9" → ".NET 10"
- Tech Stack → Backend Primary: ".NET 9 / C# 13" → ".NET 10 / C# 13"; remove the JwtBearer line or mark "(planned in PF-S08)".
- Tech Stack → AI Services: change "Anthropic SDK (primary), OpenAI SDK (secondary/fallback)" → **"Gemini (primary, `gemini-2.5-flash`), Anthropic (alternate, `claude-sonnet-4-6`)"**. Drop the OpenAI bullet.
- Project Layout: delete the `src/PersonalFinance.Persistence/` line; rewrite the `services/ai-service/` subtree to match reality (only `app/main.py` + `app/services/{llm_parser,pdf_extractor}.py` + `app/providers/{base,factory,gemini,anthropic}.py` + `app/config.py` + `app/models.py`; **no `routers/`, no `prompts/`, no `models/` folder**).
- Background problem section: replace "GPT extract" → "LLM extract" (vendor-neutral).
- "Run everything locally": Terminal 1 description already mentions `supabase start` — confirm it's correct, drop any stale `docker compose up db` instruction.
- "Current Phase" block:
  - Bump "Last updated" from 2026-04-11 → 2026-05-06.
  - Move PF-090 / PF-100 / PF-101 into "What's Working" (file-hash dedup, LGTM observability, status dashboard).
  - Update "What's Not Built Yet": remove items already shipped (Python AI service, LLM extraction for PDF — `/parse-pdf` is live; image extraction — `/parse-image` is live). Keep: Auth (PF-S08), event-driven webhook (PF-S11), realtime (PF-S12), RAG (PF-S13), Wise CSV parser, bank profile YAML loader.
  - Cleanup: "5/18 done" → "6/18 done" (PF-029 also closed per board).
- Add a short paragraph mentioning the LGTM observability stack so future Claude sessions know it exists.

### Step 3 — Patch `c:\workspaces\personal-finance\.kanban\BOARD.md`

- Update header `Last synced: 2026-05-02` → `2026-05-06`.
- Add three rows to **Done**:
  - `PF-090` — Robust deduplication & file hashing
  - `PF-100` — LGTM Monitoring Stack (OpenTelemetry)
  - `PF-101` — System Health Status Dashboard
  - (Issue numbers unknown — leave as `_(no issue)` or look up if user wants; safer to omit URLs and note "committed but not GitHub-tracked")
- Update progress block: Done count 30 → 33; recalculate percentages.
- Update footer: `Next task ID: **PF-060**` → `Next task ID: **PF-102**` (PF-S series unchanged at PF-S14).

### Step 4 — Leave `apps/api/CLAUDE.md` untouched
Verified current. No edits.

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `c:\workspaces\personal-finance\README.md` | Full rewrite (Step 1) |
| `c:\workspaces\personal-finance\CLAUDE.md` | Targeted Edit calls (Step 2) |
| `c:\workspaces\personal-finance\.kanban\BOARD.md` | Targeted Edit calls (Step 3) |

## Files to Read While Implementing

For exact wording verification:
- `apps/api/src/PersonalFinance.Api/Program.cs` (already read)
- `services/ai-service/app/main.py`, `app/providers/factory.py`
- `supabase/migrations/*.sql`
- `package.json` (root) — for the `npm start` script verbatim
- `apps/frontend/src/App.tsx` — for the route list verbatim

## Verification

1. After edits, re-read each modified file end-to-end to confirm:
   - `README.md` mentions only features I confirmed exist (no aspirational claims like "Wise FX", "RAG", "Auth").
   - `CLAUDE.md` no longer says ".NET 9", "EF Core", "OpenAI fallback", or references the deleted Persistence project.
   - `BOARD.md` shows PF-090 / PF-100 / PF-101 in Done, header date is 2026-05-06, "Next ID" is PF-102.
2. Spot-check links: `[path](path)` references should resolve to real files.
3. Memory update: append a one-line entry to `MEMORY.md` noting the doc sync (date 2026-05-06).
4. Ask the user before committing — README + CLAUDE + BOARD changes are doc-only and safe, but the user may want to review before any `git add`.

## Out of Scope

- Not touching `docs/*.md` (per user's instruction — only README, CLAUDE, BOARD).
- Not touching `apps/api/CLAUDE.md` (current).
- Not changing any code.
- Not creating GitHub issues for PF-090/100/101 retroactively (will note them as "committed but not GitHub-tracked"; user can decide).
