# Project Status

> **Updated:** 2026-06-07
> This file contains the volatile project state. Update it instead of CLAUDE.md each sprint.
> Stable architectural facts live in CLAUDE.md and .claude/rules/.

## Current Phase

- **Setup phase (PF-001–PF-008):** COMPLETE
- **Cleanup sprint:** IN PROGRESS (8/18 done)
  - Done: PF-027, PF-028 (exception leaks), PF-029, PF-030, PF-031 (dashboard extraction), PF-032, PF-033, PF-041 (Playwright E2E)
  - Next: PF-051 (ILogger), PF-052 (TypeScript strict)
  - Backlog: PF-034–PF-038, PF-042, PF-043, PF-045
- **AI Ramp-Up:** COMPLETE — Python AI service live with Gemini/Anthropic
- **Observability:** COMPLETE — LGTM stack (PF-100) and Status Page (PF-101) live; Langfuse AI tracing added (PF-AI001)
- **Supabase Migration:** IN PROGRESS — 6 phases, tasks PF-S01–PF-S13
  - Done: PF-S01 through PF-S07 (EF Core removal)
  - Next: PF-S08 (Supabase Auth — JWT middleware + user_id + RLS policies)
  - See [docs/architecture/supabase-migration.md](architecture/supabase-migration.md) for full phase breakdown
- **Feature expansion:** COMPLETE for current sprint
  - **PF-114 COMPLETE** — Living Garden Hero redesign: LivingGardenHero.tsx + 5 plant SVG components + GroundBand + CloudAccent + dual-display indicators + journeyLabels.ts
  - **PF-122 COMPLETE** — Bulk AI categorization in upload preview (✦ Suggest button)
- **Infrastructure hardening:** COMPLETE (2026-05-27 → 2026-06-07)
  - **PF-103 COMPLETE** — 4-layer categorization engine: rule-match → presets → history cache → LLM fallback; full test coverage
  - **PF-104 COMPLETE** — Semantic-anchor BCA CSV parser (CsvTokenizer + BankKeys, format-drift tolerant)
  - **PF-105 COMPLETE** — Cold-start categorization fix: preset seed + Layer 3 LLM fallback for new users
  - **PF-124 COMPLETE** — BankIdentifier Matcher Registry: IBankSignature Chain of Responsibility replaces monolith (fixes ARCH-02)
  - **PF-125 COMPLETE** — `Wallet` → `AccountName` rename across full stack (ubiquitous language)
  - **PF-126 COMPLETE** — Pre-open-source security remediation: PII + credentials purged from git history
  - **PF-127 COMPLETE** — PII redaction in tracked files + untracked plan files
  - **PF-128 COMPLETE** — Superbank PDF parser: bank-specific LLM prompt + dispatch map in LlmPdfParser
  - **PF-129 COMPLETE** — Context Architecture: slim governance.md (~503→~120 lines), extract STATUS.md, create docs/INDEX.md
- **AI Learning Path (PF-AI series):** IN PROGRESS — 90-day backend → AI Engineering transition (started 2026-05-27)
  - **PF-AI001 COMPLETE** — AI Observability: Langfuse SDK wired into Gemini + Anthropic providers; cost/latency/token dashboard live
  - **PF-AI002 COMPLETE** — LLM Evaluation Framework: 20-fixture extraction harness; Gemini 2.5 Flash 100% row F1; caught real enum serialization bug
  - **PF-AI003 IN PROGRESS** — RAG Phase 1: embeddings + semantic search (pgvector, OpenAI text-embedding-3-small, `POST /embed-transactions` + `POST /search`)
  - **PF-AI004 PLANNED** — RAG Phase 2: chunking + reranking + LLM synthesis (`POST /ask`)
  - Progress log: [docs/mentor/progress.md](mentor/progress.md)

---

## What's Working

- Full upload-preview-submit pipeline — BCA CSV (semantic-anchor parser), NeoBank PDF (direct parser), Superbank PDF (bank-specific LLM prompt), Default CSV, any unrecognized PDF (LLM-routed), PNG/JPG/WebP (LLM vision)
- 4-step upload wizard: drag-drop, file picker, clipboard paste, PDF password guard, two-table preview (Ready to Save / Duplicates), inline edit, bulk AI categorization (✦ Suggest button, PF-122)
- 4-layer auto-categorization: rule-match (106 rules) → category presets → history cache → LLM fallback (Gemini). Cold-start safe via preset seed.
- Python FastAPI AI service: `/parse`, `/parse-pdf`, `/parse-image`, `/categorize`, `/suggest-categories`, `/portfolio-review`, `/journey/advise` — Gemini (primary) and Anthropic (alternate)
- Robust three-tier deduplication: file-hash table + composite UNIQUE index on `(date, amount_idr, description, account_name, flow, bank_running_balance)` (PF-090)
- LGTM Observability stack (Alloy, Prometheus, Loki, Tempo, Grafana) with OTel instrumentation on .NET API + Python service (PF-100)
- Langfuse AI observability: cost/day, calls/day, p50/p95 latency, error rate per provider (PF-AI001)
- LLM Evaluation Harness: 20-fixture extraction benchmark; Gemini 2.5 Flash 100% row F1 confirmed; results in `services/ai-service/evals/results/` (PF-AI002)
- System Health Status Dashboard at `/status` — polls every 30 s (PF-101)
- IBankSignature registry: Chain of Responsibility dispatch replaces monolith BankIdentifier (PF-124)
- Cashflow workspace: Overview, Transactions (server-paged, Excel-style filters, CSV export), Upload, Statement (quarterly/monthly)
- Dashboard: Net Cashflow, Top Categories, Monthly chart
- Settings: Category CRUD, Regional (date format), Data (reset)
- Assets management: asset registry, liability tracking, live net worth calculation, balance sheet view
- Investment portfolio: stocks (IDX), mutual funds, government bonds, crypto, P2P; allocation breakdown + return tracking
- Spending analysis (PF-108): Safe-to-Spend indicator, variance explainer, monthly category drilldown
- Financial Journey gamification: 5-tier scoring system (Foundations → Defense → Growth → Freedom → Legacy), quest cards, streak heatmap, `/journey` page
  - PF-114 COMPLETE: Living Garden Hero (5 animated plant SVGs replacing static pyramid hero, no-decay localStorage, dual-display indicator labels)
- Dark/light theme + zen-mode UX focus toggle (PF-106)
- Docker Compose full-stack orchestration
- GitHub Projects v2 board ([Project #4](https://github.com/users/rikky-hermanto/projects/4))
- Playwright E2E test infrastructure (`e2e/` with 5 spec files + BCA CSV fixture)

---

## What's Not Built Yet

- Auth (PF-S08 Supabase Auth)
- Event-driven AI pipeline (PF-S11 Supabase Database Webhook → Python AI)
- Realtime (PF-S12 live AI processing status)
- RAG pipeline Phase 1: embeddings + semantic search (PF-AI003, in progress)
- RAG pipeline Phase 2: chunking + re-ranking + `/ask` endpoint (PF-AI004, planned)
- Wise CSV parser (with FX rate conversion)
- Bank profile config system (YAML-driven)
- Budgeting, Bills & subscriptions, Savings & goals, Debt management, Reports & analytics, Unified dashboard, Personal tax

---

## Known Tech Debt

- TypeScript strict mode disabled (PF-052)
- Partial ILogger coverage (PF-051) — `TransactionsController` and `TransactionService` now use ILogger; `DashboardService`, `SpendingAnalysisService` still missing it
- Backend test coverage expanded (20+ files) but many core service tests are `[Fact(Skip="Requires Supabase integration")]` — PF-034 integration harness not yet built
- No frontend unit tests (PF-038)
- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- `TransactionService.cs` missing `namespace` declaration — in global namespace, inconsistent with all other services
- `upload-preview-new` experimental endpoint in `TransactionsController` is dead code — documented as PF-S11 stub; async Supabase Storage path never completes (returns 202 then nothing)

---

## Sprint Plan References

→ AI Learning Path progress log: [docs/mentor/progress.md](mentor/progress.md)
→ Revised sprint plan interleaving AI + Supabase: [docs/architecture/supabase-migration.md](architecture/supabase-migration.md)
→ Original Sprint 1-4 AI breakdown: [docs/sprint-plan.md](sprint-plan.md)
