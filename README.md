# 💰 Personal Finance Platform

> **Finance should feel like a game you're winning, not a spreadsheet you're losing.**

A self-hosted personal finance platform. The mission: **make managing money genuinely enjoyable** — through clarity, progress, and a sense of level-up. Not another budgeting tool that guilts you. A compass that shows where you stand, what to do next, and celebrates when you move forward.

AI-powered ingestion handles the messy part — getting data out of bank CSVs, PDFs, and screenshots automatically so you spend time on decisions, not data entry.

**Implemented locally:** cashflow, assets/liabilities, investment reviews, Journey, Buckets budgeting, streaming transaction Q&A, Trading Desk foundations, and Macro Scenario Lab. Auth, durable async ingestion and deployment hardening remain unfinished. See [current code status](docs/STATUS.md), reviewed 2026-10-08; implemented does not mean production-deployed.

## 🧭 Who this is for

Most people aren't financially illiterate — they're **directionally lost**. They know saving is good. They know investing matters. But nobody handed them a map for *in what order* and *how much is enough at each step*.

This app is built for that person. Not the finance nerd with five brokerage accounts. The person who earns a decent salary, vaguely saves, occasionally invests, and still feels like they're not making real progress — because they don't have a framework, not because they lack money.

The Financial Pyramid gives them the framework. The app turns it into a game they can actually win.

## 🤔 The problem this solves

Most people don't have a money problem. They have a **clarity and direction problem.**

They earn, they spend, they occasionally invest — but without a coherent picture of where they stand or a framework for what to do next. Every financial tool they use answers a different slice of the question in isolation: a budgeting app here, a broker app there, a bank statement downloaded once a month that nobody reads. Plenty of data, no map.

The result is a financially active person who still feels stuck. Not because they're doing nothing — but because they don't know if what they're doing is the *right thing at their level*. Someone maxing out their investment portfolio while carrying high-interest debt. Someone diligently saving without knowing whether their emergency fund is adequate. Someone who opened a FIRE calculator before they've ever tracked a month of spending. Good intentions, wrong order.

That's the problem the **Financial Pyramid** is designed to fix. Financial health isn't a checklist — it's a hierarchy. Each level has prerequisites. You can't defend what you haven't yet built. You can't grow what you haven't defended. The pyramid makes the order explicit, so every decision has context: *this is the level you're on, this is what matters here, this is what unlocks next.*

This platform is built around that framework end-to-end. The data infrastructure (statement ingestion through supported parsers and AI fallback, unified cashflow + assets + investments in one place) exists to feed the framework — so your pyramid scores reflect reality, not estimates. The gamification layer exists to make progress feel like progress, not just another month of tracking. The whole system points at one question: **not "where did my money go?" but "how far up the pyramid am I, and what's my next move?"**

Let's make finance fun!


## 🏔️ The Backbone: Financial Pyramid

Every feature in this app is anchored to a single framework — the **financial pyramid hierarchy**. Think of it as a compass for your financial life: it tells you where you are, where you're headed, and what to do *right now* at your level — not in ten years.

You can't invest well without a safety net. You can't build a safety net without understanding your cashflow. Skipping levels is how people end up with crypto portfolios and no emergency fund. The pyramid makes the *correct order* explicit, so every decision has context.

```
                 ▲
               ████             L5 · Legacy
                                Estate Planning · Succession · Tax Planning
             ████████           L4 · Freedom
                                FIRE Calculator · Passive Income
           ████████████         L3 · Growth
                                Investments · Savings Goals
         ████████████████       L2 · Defense
                                Assets · Emergency Fund
       ████████████████████     L1 · Foundations
                                Cashflow · Budgeting · Recurring
```

Each level unlocks naturally from the one below. The app tracks your score across all five tiers and surfaces exactly where to focus next — no guessing, no overwhelm, no shame. Just: **here's your level, here's your next quest.**

## 🗺️ The Roadmap (by level)

### L1 · Foundations — *Know where your money goes*

| Feature | Status |
|---|---|
| Cashflow tracking (upload, categorize, review) | ✅ Live |
| Spending analysis (Safe-to-Spend, variance) | ✅ Live |
| RAG — semantic search, reranking, SQL-routed Q&A and SSE chat | ✅ Implemented; formal numeric eval pending |
| Buckets budgeting (Committed / Future / Free) | ✅ Implemented in Cashflow Analysis |
| Other budgeting methods (50/30/20, zero-based, envelope) | 🔜 Planned |
| Recurring (bills, subscriptions, due dates) | 🔜 Soon |

### L2 · Defense — *Protect what you have*

| Feature | Status |
|---|---|
| Assets & balance sheet (net worth, liabilities) | ✅ Live |
| Emergency Fund tracker | 🔜 Soon |

### L3 · Growth — *Make money work*

| Feature | Status |
|---|---|
| Investment portfolio (IDX, funds, bonds, crypto, P2P) | ✅ Live |
| Savings Goals | 🔜 Soon |

### L4 · Freedom — *Build passive income*

| Feature | Status |
|---|---|
| FIRE Calculator | 🔜 Soon |
| Passive Income tracker | 🔜 Soon |

### L5 · Legacy — *Leave a mark*

| Feature | Status |
|---|---|
| Estate Planning (hibah, warisan, wills, trusts) | 🔜 Soon |
| Succession (business ownership transfer) | 🔜 Soon |
| Tax Planning (SPT, PTKP, deductibles) | 🔜 Soon |
 
## ✅ What's live now

### Cashflow tracking

Import supported BCA/standard CSVs, NeoBank PDFs, other readable PDFs through AI, or PNG/JPEG/WebP screenshots, then review and submit a unified transaction history. A dedicated Wise CSV+FX parser is still missing.

- Hybrid parsing: BCA/standard CSV and NeoBank PDF are deterministic; other readable PDFs and images use Gemini or Anthropic. Superbank-specific Python prompting exists, but the normal .NET PDF path currently passes no bank hint.
- IBankSignature registry (Chain of Responsibility) detects the bank from file content and dispatches to the correct parser — adding a new bank = adding one class
- History/rule/preset categorization is called by BCA/standard/LLM PDF parsers. A fuller batch-plus-residual AI cascade exists in TransactionPipelineService, currently used only by the experimental CSV upload path; standard upload does not call that service.
- Bulk AI categorization in upload preview — select uncategorized rows and hit ✦ Suggest for batch Gemini classification
- 4-step upload wizard — drag/drop, file picker, or clipboard paste; PDF password support; inline editing before save
- Cashflow workspace: Overview, Transactions table (server-paginated, filterable, CSV export), Cash Flow Statement (quarterly/monthly)
- File hash, in-memory duplicate checks and database uniqueness guard against repeat imports

→ **Engineering details:** parser routing, bank detection (IBankSignature chain), validation pipeline, and master schema — [docs/features/cashflow-ingestion.md](docs/features/cashflow-ingestion.md)

### 🏦 Assets management & balance sheet

Track everything you own and owe in one place.

- Asset registry: property, vehicles, savings accounts, cash, valuables, and other assets with current valuations
- Liability tracking: loans, mortgages, BNPL, and other debts
- Live net worth calculation — total assets minus total liabilities, updated as you add or edit entries
- Balance sheet view with categorized breakdown

### 📈 Investment portfolio

Track your full investment picture across Indonesian market instruments.

- Stocks (IDX), mutual funds, government bonds (SBN/ORI), crypto, P2P lending
- Portfolio overview with allocation breakdown and total valuation
- Return tracking per instrument

### 📊 Spending analysis

Understand where your money actually goes.

- Safe-to-Spend indicator — compares income vs committed expenses to show discretionary headroom
- Variance explainer — highlights categories that deviated from the prior period
- Monthly spending breakdown with category drilldown

### 🪣 Buckets, Trading Desk and Macro Scenario Lab

- **Buckets** on Cashflow Analysis: Committed/Future/Free spending guidance, persisted Future plans and commitment overrides, month-close and variable-income views.
- **Trading Desk**: Command/Portfolio/Mandate/Reconcile, mandate presets/versioning, multi-portfolio exposure and tested calculation mirror. Pre-Trade/Journal and some risk checks remain deferred.
- **Macro Scenario Lab** at /lab: deterministic scenarios personalized against available holdings, spending and liabilities, comparisons and backend-persisted saves. Scenario estimates are assumptions, not validated forecasts.

### 🗺️ Financial Journey

The gamification layer that ties everything together. Progress through the five pyramid levels, earn scores, complete quests.

- Five tiers: **Foundations → Defense → Growth → Freedom → Legacy** — each with 2–3 scored indicators
- Living Garden Hero — 5 animated plants grow as your scores improve; each plant has 4 growth stages tied to your level progress
- No-decay rule — plants never shrink when scores dip (peak stage persisted in localStorage)
- Quest cards with actionable next steps per tier, activity streak heatmap
- The journey page is the home screen — it always shows where you are in the pyramid and what to do next

### 🤖 AI Learning & Evaluation

The platform doubles as the implementation vehicle for a 90-day AI Engineering learning path.

- **Langfuse AI observability** — cost/day, calls/day, p50/p95 latency, and token counts per LLM call; Gemini and Anthropic provider traces visible in Langfuse dashboard (PF-AI001)
- **20-fixture extraction eval harness** — benchmarks Gemini 2.5 Flash vs Claude Sonnet 4.6 on real anonymized bank statement fixtures; row-level F1 + field-level accuracy; results auto-saved to `evals/results/YYYYMMDD.json` (PF-AI002; dated results are retained separately, not a current universal accuracy guarantee)
- **RAG and streaming Q&A implemented** — pgvector embeddings, vector/full-text/hybrid retrieval, FlashRank, `/ask`, `/ask/stream`, SQL aggregates and contextual follow-ups. Vector remains default after the historical benchmark; formal numeric evaluation remains pending.
- **Agents implemented separately** — smolagents `/categorize-agent` (partial live smoke validation) and LangGraph `/advisor` (accepted September 15 with deferred checks); the transaction chat uses `/ask/stream`, not the stateful advisor.
- **Jev residual categorization (PF-141)** — opt-in backend and 100-case evaluator implemented; live evaluation/promotion pending. Default remains `llm`, and Jev cannot seed reusable category rules.

### 🖥️ Platform

- Dark/light theme with zen-mode UX — focus mode toggle, clean minimal interface
- System health dashboard at `/status` — polls all services every 30 seconds
- LGTM observability stack — OpenTelemetry traces, metrics, and logs across .NET API and Python AI service, surfaced in Grafana

 

## 🚀 Getting started

Install Docker Desktop, Node.js 20+, .NET 10 SDK and Python >=3.11.9; install root/frontend dependencies and the AI service virtual environment. Configure the frontend, API and AI service from their example files, including required frontend Supabase URL/anon key. Follow [SETUP.md](docs/SETUP.md) for first-run commands.

From the configured repository root:

```powershell
rtk npm start
```

The script starts Supabase CLI, standalone Compose database/monitoring and host application processes. Its prestart hook stops conflicting application processes; component-by-component startup is documented in the setup guide. Docker-only configuration is not yet complete for current Supabase/AI/realtime requirements.

| URL | What |
|---|---|
| http://localhost:8080 | The app |
| http://localhost:8080/journey | Your pyramid progress |
| http://localhost:8080/status | Service health |
| http://localhost:54323 | Supabase Studio |
| http://localhost:3000 | Grafana |

Go to **Cashflow → Upload**, drop in a BCA CSV or any PDF, review the preview, hit Submit.
 

## 🏗️ Architecture

The implemented paths are React → .NET REST → Supabase/PostgREST; .NET → FastAPI for AI operations; React → FastAPI directly for SSE chat/follow-ups; and React → Supabase Realtime for transaction INSERT notifications. FastAPI queries Supabase Postgres through asyncpg and uses configured generation/embedding providers. LangGraph advisor tools call back to .NET.

Auth and extraction webhooks are planned; no statement_uploads table/worker completes asynchronous imports. Compose's standalone Postgres 16 remains separate from Supabase Postgres 17. See the [current architecture](docs/architecture/architecture-diagram.md) and [migration scope](docs/architecture/supabase-migration.md).

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui |
| Backend API | .NET 10 · ASP.NET Core · CQRS via MediatR · Clean Architecture |
| Persistence | Supabase (PostgreSQL 17 + pgvector) via supabase-csharp — no ORM |
| AI Service | Python >=3.11.9 (Docker 3.12) · FastAPI · Gemini 2.5 Flash (primary) · Claude Sonnet 4.6 (alternate) |
| Document parsing | PyMuPDF (pre-LLM PDF extraction) · LLM vision (images) |
| Observability | OpenTelemetry → Alloy → Prometheus + Loki + Tempo → Grafana |
| Containers | Docker Compose V2 |

```
apps/
  frontend/          # React 18 + Vite — api/, components/, pages/, types/
  api/               # .NET 10 Clean Architecture — Api, Application, Domain, Infrastructure
services/
  ai-service/        # FastAPI — extraction, retrieval, streaming, agents, evaluators
supabase/
  migrations/        # SQL migrations
docs/                # Architecture, sprint plan, bank format reference
```

```powershell
# Repository root
rtk npm start
rtk npm --prefix apps/frontend run dev
rtk dotnet run --project apps/api/src/PersonalFinance.Api
rtk proxy services/ai-service/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir services/ai-service
rtk npm run e2e
rtk dotnet test apps/api/PersonalFinance.slnx
rtk npm --prefix apps/frontend run test:desk
rtk npm --prefix apps/frontend run test:macro
```
