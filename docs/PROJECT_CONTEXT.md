# PROJECT_CONTEXT.md — Personal Finance Platform

## Table of Contents

1. [Problem Background](#1-problem-background)
2. [Current Manual Workflow](#2-current-manual-workflow)
3. [Pain Points Analysis](#3-pain-points-analysis)
4. [Objectives](#4-objectives)
5. [Architecture Decision: Parser Strategy](#5-architecture-decision-parser-strategy)
6. [Proposed Architecture](#6-proposed-architecture)
7. [Bank Profiles (Real Data Sources)](#7-bank-profiles-real-data-sources)
8. [Master Cash Flow Schema](#8-master-cash-flow-schema)
9. [Sprint Plan (Revised)](#9-sprint-plan-revised)
10. [AI Learning Goals](#10-ai-learning-goals)
11. [Tech Stack Reference](#11-tech-stack-reference)
12. [Code Conventions](#12-code-conventions)

---

## 1. Problem Background

I manage multiple bank accounts across conventional and digital banks in Indonesia. Since 2024, I track monthly cash flow in an Excel spreadsheet by manually reconciling bank statements from each account.

The core issue: **each bank provides statements in a different format** (CSV, PDF, or even screenshots), and converting them all into a single standardized format is a tedious, error-prone, monthly ritual.

I've tried expense tracking apps (per-transaction input). I gave up — too tedious, requires discipline I don't have for that approach. Monthly statement reconciliation is more sustainable for me, but the conversion process is the bottleneck.

This project automates that entire pipeline and makes the data scalable beyond Excel.

---

## 2. Current Manual Workflow

```
BANK SOURCES (5 accounts, 3 format types)
│
├── BCA ──────────── CSV ──── Column mapping ──────────────────┐
├── Superbank ────── PDF ──── GPT extract → Formatted-CSV ────┤
├── NeoBank ──────── PDF ──── GPT extract → Formatted-CSV ────┤── Manual validate
├── Wise ─────────── CSV ──── Mapping + FX rate conversion ───┤   → Fix dates
├── Bank Jago ────── Screenshot → GPT extract → Formatted-CSV ┤   → Fix decimals
│                                                              │   → Fix currency
│                                                              │
│                                                              ▼
│                                                    ┌─────────────────┐
└────────────────────────────────────────────────────│  Master Cash    │
                                                     │  Flow (Excel)   │
                                                     └─────────────────┘
```

### Step-by-Step (repeated monthly, per bank):

1. **Download** bank statement (format varies by bank)
2. **For CSV banks** (BCA, Wise): map columns to my standard format
3. **For PDF banks** (Superbank, NeoBank): copy-paste into ChatGPT, ask it to extract and convert to CSV
4. **For screenshot banks** (Bank Jago): screenshot → ChatGPT → CSV
5. **Validate output**: check dates, decimal formats (dot vs comma), currency codes, debit/credit correctness against original statement
6. **Fix formatting errors**: date format mismatches, wrong decimal separators, encoding issues
7. **Copy to Master Cash Flow**: paste validated data into the master Excel sheet
8. **Repeat for next bank** (x5 accounts)

Total time: 2-4 hours per month, depending on how many conversion errors need fixing.

---

## 3. Pain Points Analysis

### Pain Point 1 — Format Chaos (Input Heterogeneity)
Every bank has its own statement format. No two banks use the same date format, column order, decimal separator, or even file type. Adding a new bank means learning its format from scratch.

### Pain Point 2 — Manual Conversion Loop
PDF and screenshot sources require manual AI-assisted conversion (copy-paste to ChatGPT, massage the output). This is the highest time cost and the most error-prone step.

### Pain Point 3 — Validation Overhead
LLM output is non-deterministic. Dates come back in wrong formats. Amounts get decimal separators swapped. Currency codes are missing or wrong. Every conversion needs manual spot-checking against the original.

### Pain Point 4 — Excel Scalability Ceiling
After 1+ year of data, the Excel file is getting slow. Formulas bog down. This is a data volume problem that Excel was never designed to handle for growing time-series financial data.

### Pain Point 5 — Repetitive Monthly Ritual
The entire process repeats every month, for every bank. 5 banks × 12 months = 60 conversion cycles per year. Same steps, same errors, same tedium.

---

## 4. Objectives

### Primary Objectives

**Objective 1 — Automate the Statement-to-Master-Cashflow Pipeline**
Upload a bank statement (any format: CSV, PDF, screenshot) → system automatically extracts, normalizes, validates, and persists structured transactions into a centralized database. No manual copy-paste. No manual format fixing.

**Objective 2 — Make It Scalable**
Replace Excel with PostgreSQL. Support growing data volume (years of transaction history, multiple accounts) without performance degradation. Enable querying, aggregation, and analysis at scale.

**Objective 3 — Handle Multi-Bank Format Diversity**
Each bank has a "profile" that defines its format quirks (date format, decimal separator, column mapping, currency, file type). Adding a new bank = adding a profile config, not writing new code.

**Objective 4 — Smart Validation, Not Blind Trust**
Post-extraction validation layer that catches common LLM errors: invalid dates, mismatched amounts, wrong debit/credit classification, missing fields. Flag low-confidence rows for human review instead of silently accepting bad data.

### Secondary Objectives

**Objective 5 — Natural Language Querying**
Ask questions about financial data in plain language: "How much did I spend on food in January?", "What's my average monthly transport cost?", "Show me all Wise transactions above $100."

**Objective 6 — Auto-Categorization**
LLM-based transaction categorization (food, transport, salary, transfer, subscription, etc.) with ability to learn from corrections.

**Objective 7 — Multi-Currency Normalization**
Wise account operates in multiple currencies (USD, EUR, GBP, AUD, SGD). All amounts need conversion to IDR for unified reporting. FX rate lookup (at transaction date) should be automated.

### Learning Objective

**Objective 8 — AI Engineering Career Pivot**
This project is a hands-on learning vehicle for transitioning from backend engineering into AI engineering. Every architectural decision should balance production quality with learning AI patterns including: LLM API integration, prompt engineering, structured output extraction, RAG pipelines, vector embeddings, AI agents with function calling, and AI observability.

---

## 5. Architecture Decision: Parser Strategy

### Options Evaluated

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Manual parser per bank** (regex/template) | Deterministic, fast, zero API cost | Breaks on format changes, N banks = N parsers, poor for PDF/screenshots | Use for CSV-only banks |
| **LLM-based extraction** (current plan) | Handles format chaos, one pipeline fits all, adapts to new banks via prompt | API cost, non-deterministic, needs validation layer | Best for PDF + screenshot |
| **Hybrid** (CSV parser + LLM for PDF/screenshot) | Fast+cheap for CSV, LLM only when needed, ~40% cost reduction | Two codepaths | **CHOSEN — optimal balance** |
| **n8n / workflow automation** | Visual workflows, built-in integrations | Extra infra, doesn't solve parsing, overkill for monthly upload flow | Premature — revisit for scheduled automation later |

### Decision: Hybrid Parser Strategy

- **CSV banks** (BCA, Wise): Direct column mapping via BankProfile config. No LLM needed. Fast, free, deterministic.
- **PDF banks** (Superbank, NeoBank): PyMuPDF text extraction → LLM structured extraction with BankProfile context in prompt.
- **Screenshot banks** (Bank Jago): LLM Vision API (send image directly) → structured extraction.
- **All paths converge**: → BankProfile-based normalization → Validation layer → Master schema → PostgreSQL.

---

## 6. Proposed Architecture

```
                    ┌──────────────────┐
                    │   Upload Statement│
                    │   (CSV/PDF/Image) │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Format Detection │
                    │  (file extension  │
                    │   + MIME type)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌─────────────┐
        │   CSV    │  │   PDF    │  │  Screenshot │
        │  Parser  │  │  Parser  │  │  (Vision)   │
        │(determin-│  │          │  │             │
        │  istic)  │  │ PyMuPDF  │  │  LLM Vision │
        └────┬─────┘  │ extract  │  │  API        │
             │        │ text     │  └──────┬──────┘
             │        └────┬─────┘         │
             │             │               │
             │        ┌────▼───────────────▼────┐
             │        │  LLM Structured          │
             │        │  Extraction               │
             │        │  (BankProfile context     │
             │        │   injected into prompt)   │
             │        └──────────┬───────────────┘
             │                   │
        ┌────▼───────────────────▼────┐
        │  BankProfile Normalization  │
        │  ─ Date format parsing      │
        │  ─ Decimal separator fix    │
        │  ─ Currency code mapping    │
        │  ─ Debit/Credit resolution  │
        │  ─ FX rate conversion (Wise)│
        └──────────────┬──────────────┘
                       │
                ┌──────▼──────┐
                │  Validation │
                │  Layer      │
                │  ─ Date valid?       │
                │  ─ Amount parseable? │
                │  ─ Balance check?    │
                │  ─ Duplicate detect? │
                │  ─ Confidence score  │
                └──────┬──────┘
                       │
              ┌────────▼────────┐
              │ Persist to      │
              │ PostgreSQL      │
              │ (Master Schema) │
              └─────────────────┘
```

### Service Boundaries

```
┌─────────────────────────────────────────────────────┐
│              .NET 8 Web API (C#)                     │
│                                                      │
│  Responsibilities:                                   │
│  ─ REST API endpoints (upload, query, manage)        │
│  ─ BankProfile management (CRUD)                     │
│  ─ CSV parsing (deterministic, no LLM needed)        │
│  ─ Validation layer                                  │
│  ─ EF Core persistence                               │
│  ─ Orchestration (decides which parser to invoke)     │
│  ─ Semantic Kernel (future: agents, function calling) │
│                                                      │
│  Calls Python service for:                           │
│  ─ PDF text extraction + LLM parsing                 │
│  ─ Screenshot/image → LLM Vision parsing             │
│  ─ Embeddings generation (future: RAG)               │
│  ─ Natural language query processing (future)        │
└──────────────────┬──────────────────────────────────┘
                   │ Internal HTTP
┌──────────────────▼──────────────────────────────────┐
│           Python AI Service (FastAPI)                │
│                                                      │
│  Responsibilities:                                   │
│  ─ PDF text extraction (PyMuPDF)                     │
│  ─ LLM-based structured extraction (PDF, screenshot) │
│  ─ LLM Vision API calls (screenshot parsing)         │
│  ─ Embedding generation (future)                     │
│  ─ RAG pipeline (future)                             │
│  ─ LLM provider abstraction (Anthropic/OpenAI/Ollama)│
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              PostgreSQL 16 + pgvector                │
│                                                      │
│  ─ Relational data (accounts, transactions, profiles)│
│  ─ Vector embeddings (future: RAG)                   │
└─────────────────────────────────────────────────────┘
```

---

## 7. Bank Profiles (Real Data Sources)

These are the actual bank accounts and their format characteristics:

| Bank | File Type | Date Format | Decimal Sep | Currency | Special Notes |
|------|-----------|-------------|-------------|----------|---------------|
| BCA | CSV | dd/MM/yyyy | , (comma) | IDR | Largest volume, most transactions |
| Superbank | PDF | dd/MM/yyyy | . (dot) | IDR | PDF table extraction needed |
| NeoBank | PDF | dd-MMM-yyyy | . (dot) | IDR | Sometimes inconsistent date formats |
| Wise | CSV | dd-MM-yyyy | . (dot) | Multi (USD, EUR, GBP, AUD, SGD) | Needs FX conversion to IDR |
| Bank Jago | Screenshot | dd/MM/yyyy | . (dot) | IDR | Mobile app screenshot, no export feature |

### BankProfile Entity (Proposed)

```
BankProfile {
    Id: Guid
    BankCode: string           // "bca", "superbank", "neobank", "wise", "jago"
    BankName: string           // Display name
    InputFormat: enum          // CSV, PDF, Screenshot
    ParsingStrategy: enum      // DirectCSV, LLMExtract, VisionExtract
    DateFormat: string         // "dd/MM/yyyy", "dd-MMM-yyyy", etc.
    DecimalSeparator: char     // '.' or ','
    DefaultCurrency: string    // "IDR", "USD", etc.
    IsMultiCurrency: bool      // true for Wise
    ColumnMapping: json        // For CSV: { "date": 0, "description": 1, "amount": 3, ... }
    LLMPromptHints: string     // Bank-specific prompt context for LLM extraction
    IsActive: bool
    CreatedAt: DateTime
    UpdatedAt: DateTime
}
```

---

## 8. Master Cash Flow Schema

The unified transaction format that all bank-specific data normalizes into:

```
Transaction {
    Id: Guid
    BankProfileId: Guid        // FK to BankProfile
    AccountName: string        // e.g., "BCA Main", "Wise USD"
    TransactionDate: DateTime
    Description: string        // Original description from bank
    Amount: decimal(18,4)      // Always positive
    Type: enum                 // Debit, Credit
    Currency: string           // Original currency (e.g., "USD")
    AmountIDR: decimal(18,4)   // Normalized to IDR (same as Amount if already IDR)
    ExchangeRate: decimal(18,8)// FX rate used (1.0 if IDR)
    Category: string?          // AI-assigned or manual (nullable until categorized)
    RawText: string            // Original text before parsing (for audit/debugging)
    ConfidenceScore: decimal?  // LLM extraction confidence (null for CSV-parsed)
    Source: enum               // CSV, PDF, Screenshot
    StatementPeriod: string    // "2025-01", "2025-02", etc.
    ImportBatchId: Guid        // Groups transactions from same upload
    IsValidated: bool          // Human-reviewed flag
    IsDeleted: bool            // Soft delete
    CreatedAt: DateTime
    UpdatedAt: DateTime
}
```

---

## 9. Sprint Plan (Revised)

Original sprint plan prioritized RAG (Sprint 2) too early. Revised to prioritize import pipeline hardening first — that's the core value proposition.

### Week 0 — Ramp-Up (Pre-Sprint 1)
**Goal:** Build a working AI pipeline (PDF → LLM → JSON) in 6 days.
**AI Learning:** LLM API basics, structured output, prompt engineering fundamentals.

- Day 1: Hello LLM (Python script → Anthropic API)
- Day 2: Structured output (messy text → JSON)
- Day 3: FastAPI service wrapper
- Day 4: PDF extraction (PyMuPDF + LLM)
- Day 5: .NET ↔ Python integration via Docker Compose
- Day 6: Persist to PostgreSQL + query endpoint
- Day 7: Rest

### Sprint 1 — Multi-Format Parsing Pipeline (Week 1-2)
**Goal:** Upload any bank statement (CSV, PDF, screenshot) → auto-extract → normalized transactions in DB.
**AI Learning:** Prompt engineering for diverse formats, LLM Vision API, structured output patterns.

- BankProfile entity + CRUD
- CSV direct parser (BCA, Wise) — no LLM, deterministic
- PDF parser (Superbank, NeoBank) — PyMuPDF + LLM extraction
- Screenshot parser (Bank Jago) — LLM Vision API
- Post-extraction validation layer
- Normalization pipeline (date, decimal, currency)
- Clean Architecture layering, MediatR, FluentValidation
- Basic error handling + retry logic for LLM calls
- Unit tests + integration tests

### Sprint 2 — Import Pipeline Hardening (Week 3-4)
**Goal:** Reliable, production-quality import pipeline for all 5 banks.
**AI Learning:** Prompt optimization, confidence scoring, cost tracking.

- Batch upload (multiple statements in one go)
- FX rate conversion for Wise (API lookup or manual)
- Duplicate transaction detection
- Confidence scoring per extracted field
- Human review queue (flag low-confidence rows)
- Transaction categorization via LLM
- Import history + audit trail
- Reconciliation: compare imported totals vs statement totals
- AI cost tracking (tokens per extraction)

### Sprint 3 — RAG + Natural Language Querying (Week 5-6)
**Goal:** Ask questions about financial data in plain English/Indonesian.
**AI Learning:** Embeddings, vector search, RAG pipeline, chunking strategies.

- Embedding generation for transactions
- pgvector storage + similarity search
- Query endpoint: POST /api/query
- RAG pipeline: embed question → retrieve → context injection → LLM answer
- Handle aggregation queries ("total spend on food last 3 months")

### Sprint 4 — AI Agents + Production Hardening (Week 7-8)
**Goal:** Agent that can execute multi-step financial tasks + production readiness.
**AI Learning:** Function calling, agent loops, Semantic Kernel, AI observability.

- Function calling: .NET API endpoints as LLM tools
- Agent loop: plan → execute → synthesize
- Semantic Kernel integration
- Semantic caching for repeated queries
- Rate limiting, security, input sanitization
- Docker Compose production profile

---

## 10. AI Learning Goals

This project is a career pivot vehicle from backend engineering into AI Engineering. Each sprint introduces new AI concepts, building from fundamentals to advanced patterns.

```
LEARNING PROGRESSION

Week 0          Sprint 1           Sprint 2           Sprint 3           Sprint 4
─────────────── ─────────────────── ─────────────────── ─────────────────── ───────────────────
LLM API basics  Prompt engineering  Prompt optimization Embeddings          Function calling
Structured      LLM Vision API     Confidence scoring  Vector search       Agent loops
  output        Multi-format       Cost tracking       RAG pipeline        Semantic Kernel
JSON mode         extraction                           Chunking strategy   AI observability
                Provider                                                   Semantic caching
                  abstraction
```

### Concepts to Master (Ordered by Sprint)

**Week 0 — Foundations:**
- How LLM APIs work (tokens, temperature, max_tokens)
- System prompt vs user prompt vs assistant role
- Structured output / JSON mode
- Basic prompt engineering

**Sprint 1 — Document AI:**
- Prompt engineering for extraction tasks (few-shot examples, output schemas)
- LLM Vision API (image → structured data)
- LLM provider abstraction pattern (Anthropic/OpenAI/Ollama)
- Non-determinism handling (validation, retry, fallback)

**Sprint 2 — AI Quality:**
- Prompt optimization (iterating for accuracy + consistency)
- Confidence scoring (when to trust LLM output vs flag for review)
- Token usage tracking and cost management
- Model selection strategy (small model for categorization, large for extraction)

**Sprint 3 — RAG:**
- What are embeddings and why they work (vector space, semantic similarity)
- Chunking strategies for structured financial data
- Vector search with pgvector (cosine similarity, top-k retrieval)
- RAG pipeline: retrieval → context injection → generation
- When RAG fails and why (retrieval quality, context window limits)

**Sprint 4 — Agents:**
- Function calling (defining tools, structured tool schemas)
- Agent loop pattern (plan → execute → observe → decide)
- Semantic Kernel vs LangChain (C# vs Python orchestration)
- AI observability (latency, token cost, success rate per query type)
- Semantic caching (embedding similarity for cache hits)

---

## 11. Tech Stack Reference

### Backend — Primary (.NET)
- .NET 8 (LTS), C# 12
- ASP.NET Core Web API (REST)
- MediatR (CQRS), FluentValidation, Clean Architecture
- Entity Framework Core 8
- PostgreSQL 16 + pgvector
- Auth0 (deferred until core features stable)
- xUnit, NSubstitute, Alba (testing)

### Backend — AI Services (Python)
- Python 3.12+, FastAPI
- Anthropic SDK (primary), OpenAI SDK (fallback)
- LangChain (Python-side orchestration)
- Semantic Kernel (C#-side orchestration)
- PyMuPDF (PDF text extraction)
- Poetry (dependency management)

### Frontend
- React 18 + TypeScript + Tailwind CSS
- TanStack Query (server state)

### Infrastructure
- Docker Compose (local dev)
- GitHub Actions (CI/CD)
- Pulumi (IaC, future cloud deploy)
- Serilog (structured logging), OpenTelemetry-ready

---

## 12. Code Conventions

### C# / .NET
- Clean Architecture: Domain → Application → Infrastructure → API
- CQRS: Commands and Queries via MediatR handlers
- FluentValidation on all command/query inputs
- PascalCase public, _camelCase private fields
- Async all the way (async/await on all I/O)
- No magic strings — constants or enums
- XML doc comments on public APIs

### Python
- Type hints on all function signatures
- Pydantic models for all request/response schemas
- Async FastAPI endpoints
- Structured logging (same format as .NET side)
- Poetry for dependency management

### Database
- EF Core migrations
- pgvector for embedding columns
- Soft deletes on all financial data
- Audit columns: CreatedAt, UpdatedAt, CreatedBy
- Multi-currency from day one (amount + currency code)
- All monetary values: decimal(18,4)

### General
- Health check endpoints on all services
- Structured JSON logging with correlationId
- Feature flags for AI features (toggle LLM provider)
- Environment variables for all configuration (no hardcoded keys)

---

*Last updated: March 2026*
