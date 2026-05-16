# 💰 Personal Finance Platform

A self-hosted personal finance platform, built specifically for Indonesian users. The goal is a single place for the full financial picture — cashflow, net worth, investments, tax, goals, budgeting, debt, and more. AI-powered ingestion handles the messy part: getting data out of bank CSVs, PDFs, and screenshots automatically.

**Cashflow tracking, assets management, investment portfolio, and spending analysis are all live.** Everything else is being built out one piece at a time.

## 🤔 The problem this solves

Managing money in Indonesia means juggling 5+ bank accounts, each exporting data in a completely different format. BCA gives you a CSV. Superbank gives you a PDF. Bank Jago gives you a screenshot. Wise gives you a CSV in foreign currency. None of them talk to each other.

The usual workaround: copy-paste into ChatGPT, clean the output, dump into an ever-growing Excel file, repeat every month. It works until it doesn't — and it never scales.

This project automates the whole pipeline. Upload any bank statement in any format, get clean categorized data back, and see everything in one place.

## ✅ What's built so far

### Cashflow tracking

Upload bank statements from BCA, Superbank, NeoBank, Wise, or Bank Jago — CSV, PDF, or screenshot — and get a unified transaction history across all accounts.

- Hybrid parser: CSV files parsed directly (fast, zero AI cost); PDFs and screenshots go through Gemini / Claude for structured extraction
- 106-rule auto-categorization engine, longest-match priority, fully configurable from Settings
- 4-step upload wizard — drag/drop, file picker, or clipboard paste; PDF password support; inline editing before save
- Cashflow workspace: Overview, Transactions table (server-paginated, filterable, CSV export), Cash Flow Statement (quarterly/monthly), Wallet Statement, Upload
- Three-tier deduplication so nothing gets imported twice

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
- Variance explainer — highlights categories that deviated from the prior period and explains why
- Monthly spending breakdown with category drilldown

### 🖥️ Platform

- Dark/light theme with zen-mode UX — focus mode toggle, clean minimal interface (PF-106)
- System health dashboard at `/status` — polls all services every 30 seconds
- LGTM observability stack — OpenTelemetry traces, metrics, and logs across .NET API and Python AI service, surfaced in Grafana

![alt text](image-4.png)
![alt text](image-3.png)
![alt text](image-2.png)
![alt text](image-1.png)

## 🔭 What's coming

*Ordered from most essential to advanced.*

**📊 Budgeting**
Monthly spending limits per category, live budget vs actual from Cashflow data. Choose your method: 50/30/20, Zero-Based, or Envelope System. Alerts when you're approaching or over the limit. Rollover rules. Historical analysis — see which categories consistently go over budget.

**📅 Bills & subscriptions**
Due date calendar for utilities, internet, credit cards, and loan installments. Reminders 3 days before each due date. Subscription tracker — a full list of active services (Netflix, Spotify, gym, etc.) with the total monthly cost, so you can easily spot what to cut.

**🎯 Savings & goals**
Set a savings target (emergency fund, house down payment, vacation, new laptop, retirement) and link it to a real account or investment. Progress bar per goal. Estimated completion date based on your current saving rate. Scenario modelling: "if I save Rp X more per month, I'll hit this by..."

**💳 Debt management**
Register every debt (mortgage, personal loan, BNPL, credit card, private loan). See the interest vs principal split per payment. Simulate payoff using Avalanche or Snowball method. Due date alerts. Project the total interest cost over the life of each debt. Payments reconcile automatically with Cashflow.

**📉 Reports & analytics**
Deeper monthly and annual cash flow statements. Net worth over time — total assets minus total liabilities. Spending trends by category. Needs vs wants breakdown. Period-over-period comparison.

**🖥️ Unified home dashboard**
One screen: net worth snapshot, cashflow health, portfolio performance, goal progress, upcoming due dates, and alerts — all from live data across every feature.

**🧾 Personal tax** *(advanced)*
Pull income data from Cashflow (salary, freelance, dividends, interest, rental). Track deductibles: BPJS, pension contributions, zakat. Calculate income tax and non-taxable income threshold (PTKP). Pre-fill assets and liabilities for annual tax return (SPT Form 1770). Export compatible with DJP Online / e-SPT.

## 📋 Status

| Feature | Status |
|---|---|
| Cashflow tracking | ✅ Live |
| Assets management & balance sheet | ✅ Live |
| Investment portfolio | ✅ Live |
| Spending analysis | ✅ Live |
| Budgeting | 🔜 Planned |
| Bills & subscriptions | 🔜 Planned |
| Savings & goals | 🔜 Planned |
| Debt management | 🔜 Planned |
| Reports & analytics | 🔜 Planned |
| Unified dashboard | 🔜 Planned |
| Personal tax | 🔜 Planned |

## 🚀 Getting started

**Prerequisites:** Docker Desktop, Node.js 20+, .NET 10 SDK, Python 3.12+, Supabase CLI

```bash
# 1. Configure environment
cp .env.example .env
# Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) and Supabase keys

cp services/ai-service/.env.example services/ai-service/.env
# Add AI_PROVIDER=gemini and GEMINI_API_KEY

# 2. Start everything
npm start
```

| URL | What |
|---|---|
| http://localhost:8080 | The app |
| http://localhost:8080/status | Service health |
| http://localhost:54323 | Supabase Studio |
| http://localhost:3000 | Grafana |

Go to **Cashflow → Upload**, drop in a BCA CSV or any PDF, review the preview, hit Submit. A sample CSV is available via the Download Template button.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React 18 Frontend                           │
│  ┌──────────────────┐    ┌────────────────────────────────────┐ │
│  │ @supabase/js     │    │ REST calls via fetch()             │ │
│  │  - Auth (login)  │    │  - CRUD, upload, dashboard, etc.  │ │
│  │  - Realtime sub  │    │  - Bearer token from Supabase Auth │ │
│  └────────┬─────────┘    └───────────────┬────────────────────┘ │
└───────────┼──────────────────────────────┼──────────────────────┘
            │ direct                       │ via .NET API
            ▼                              ▼
┌───────────────────────┐   ┌──────────────────────────────────────┐
│   Supabase Platform   │   │        .NET 10 Web API (C#)          │
│                       │   │  Controllers → MediatR (CQRS)        │
│  Auth (GoTrue/JWT)    │   │  FluentValidation                    │
│  Storage (buckets)  ◄─┼───┤  Infrastructure:                     │
│  Realtime (WS)        │   │   - supabase-csharp (PostgREST)      │
│  Database Webhooks ───┼─┐ │   - StorageService (Supabase Storage)│
│                       │ │ │   - CSV Parsers (BCA, Wise, Default) │
│  ┌─────────────────┐  │ │ │   - Validation Pipeline              │
│  │ PostgreSQL 17   │  │ │ └──────────────────────────────────────┘
│  │ + pgvector      │  │ │
│  │ transactions    │  │ │       Webhook POST on INSERT
│  │ category_rules  │  │ │         to statement_uploads
│  │ statement_      │  │ │
│  │   uploads       │  │ │  ┌──────────────────────────────────┐
│  │ embeddings      │  │ └──►  Python AI Service (FastAPI)     │
│  │ (RLS enforced)  │◄─┼──────┤  1. Download from Storage      │
│  └─────────────────┘  │      │  2. PyMuPDF / Claude Vision    │
│                       │      │  3. Claude tool_use extraction  │
└───────────────────────┘      │  4. Write results via supabase-py│
                               │  5. Update status → "done"     │
                               │                                │
                               │  RAG / Embeddings (Sprint 2+)  │
                               └────────────────────────────────┘
```

```
  .NET 10 API  ──┐
                 │  OTLP (traces · metrics · logs)
  Python AI   ───┼──► Alloy (collector)
                 │         │
                 │    ┌────┼────────┐
                 │    ▼    ▼        ▼
                 │  Prometheus    Loki     Tempo
                 │    └────────────┬────────┘
                 │                 ▼
                 └──────────► Grafana :3000
```

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui |
| Backend API | .NET 10 / C# 13 · ASP.NET Core · CQRS via MediatR · Clean Architecture |
| Persistence | Supabase (PostgreSQL 17 + pgvector) via supabase-csharp — no ORM |
| AI Service | Python 3.12 · FastAPI · Gemini 2.5 Flash (primary) · Claude Sonnet 4.6 (alternate) |
| Document parsing | PyMuPDF (pre-LLM PDF extraction) · LLM vision (images) |
| Observability | OpenTelemetry → Alloy → Prometheus + Loki + Tempo → Grafana |
| Containers | Docker Compose V2 |

```
apps/
  frontend/          # React 18 + Vite — api/, components/, pages/, types/
  api/               # .NET 10 Clean Architecture — Api, Application, Domain, Infrastructure
services/
  ai-service/        # Python FastAPI — providers (Gemini, Anthropic), LlmParser, PdfExtractor
supabase/
  migrations/        # SQL migrations
docs/                # Architecture, sprint plan, bank format reference
```

```bash
npm start                                                            # everything
cd apps/frontend && npm run dev                                      # frontend only
cd apps/api && dotnet run --project src/PersonalFinance.Api         # backend only
cd services/ai-service && uvicorn app.main:app --reload --port 8000 # AI service only
npm run e2e                                                          # Playwright E2E
cd apps/api && dotnet test                                           # backend unit tests
```
