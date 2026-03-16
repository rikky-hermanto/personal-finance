# Architecture Diagram

> **Source:** Extracted from CLAUDE.md — Architecture section

Full-stack monorepo: React 18 + Vite frontend (`apps/frontend/`) with .NET 9 Clean Architecture API (`apps/api/`) and PostgreSQL 16, orchestrated via Docker Compose. Python AI service (FastAPI) handles LLM extraction for PDF/image bank statements.

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│              (TypeScript + Tailwind CSS)                │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│              .NET 9 Web API (C#)                        │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐  │
│  │ Accounts │ │ Transact │ │  Assets   │ │   Tax    │  │
│  │ Module   │ │ Module   │ │  Module   │ │  Module  │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ MediatR (CQRS) + FluentValidation                │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Bank Identifier + Direct CSV Parsers             │   │
│  │ → BCA parser, Wise parser (+ FX conversion)      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Validation Pipeline                              │   │
│  │ → DateNorm → DecimalFix → CurrencyStd → Schema   │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ (PDF/image uploads forwarded)         │
└─────────────────┼───────────────────────────────────────┘
                  │ Internal HTTP
┌─────────────────▼───────────────────────────────────────┐
│           Python AI Service (FastAPI)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ LLM Extractor (PDF → structured JSON)            │   │
│  │ Vision Extractor (screenshot → structured JSON)  │   │
│  │ → Claude API (primary) / OpenAI (fallback)       │   │
│  │ → Structured output (JSON mode / tool_use)       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐               │
│  │   RAG    │ │ Embeddings│ │ Categorizer│  (Sprint 2+) │
│  │ Pipeline │ │  Service  │ │  Service   │              │
│  └──────────┘ └──────────┘ └────────────┘               │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              PostgreSQL 16 + pgvector                   │
│  ┌──────────────────┐  ┌─────────────────────────┐      │
│  │ Relational Data  │  │  Vector Embeddings      │      │
│  │ (EF Core)        │  │  (pgvector / cosine)    │      │
│  └──────────────────┘  └─────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Key Architecture Decisions

- **CSV banks stay in .NET** — BCA and Wise parsers are deterministic, no LLM needed. They live in `Infrastructure/BankParsers/` as `IBankStatementParser` implementations. Zero latency, zero cost.
- **PDF/image banks go to Python** — Superbank, NeoBank, Bank Jago require LLM extraction. The .NET API forwards the file to the Python FastAPI service, which returns structured JSON matching the master schema.
- **Validation is shared** — Both parser paths feed into the same `ValidationPipeline` in .NET before persisting. This is the single source of truth for data quality.
- **LLM structured output, not free text** — The Python service uses Claude's `tool_use` or JSON mode to force structured output matching the master schema. No regex parsing of LLM output, no "formatted CSV" intermediate step.
- **Bank profiles as config** — Adding a new bank = adding a YAML config file + (if CSV) a parser class, or (if PDF/image) a prompt template. The bank identifier auto-detects which profile to use.
