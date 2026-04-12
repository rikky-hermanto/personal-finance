# Personal Finance — Kanban Board

> **Source of truth:** [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4)
> **Issues:** https://github.com/rikky-hermanto/personal-finance/issues
> **Last synced:** 2026-04-11

This file is a Claude-readable snapshot. It is NOT the source of truth — always use GitHub Issues/Projects for task management. Update this file after each task operation.

---

## Done (closed)

| ID | Issue | Title |
|----|-------|-------|
| PF-001 | [#9](https://github.com/rikky-hermanto/personal-finance/issues/9) | .NET Web API with Clean Architecture |
| PF-002 | [#10](https://github.com/rikky-hermanto/personal-finance/issues/10) | React + Vite Frontend Scaffold |
| PF-003 | [#11](https://github.com/rikky-hermanto/personal-finance/issues/11) | Docker Compose Orchestration |
| PF-004 | [#12](https://github.com/rikky-hermanto/personal-finance/issues/12) | EF Core + PostgreSQL Schema & Migrations |
| PF-005 | [#13](https://github.com/rikky-hermanto/personal-finance/issues/13) | Bank Statement CSV/PDF Parsers |
| PF-006 | [#14](https://github.com/rikky-hermanto/personal-finance/issues/14) | CQRS + MediatR Pipeline |
| PF-007 | [#15](https://github.com/rikky-hermanto/personal-finance/issues/15) | Category Rules Feature (CRUD) |
| PF-008 | [#16](https://github.com/rikky-hermanto/personal-finance/issues/16) | Cash Flow Dashboard with Charts |
| PF-027 | [#35](https://github.com/rikky-hermanto/personal-finance/issues/35) | Delete scaffold leftovers and dead code |
| PF-030 | [#38](https://github.com/rikky-hermanto/personal-finance/issues/38) | Move DTOs to correct project |
| PF-032 | [#40](https://github.com/rikky-hermanto/personal-finance/issues/40) | Update PROJECT_CONTEXT.md to match codebase |
| PF-033 | [#41](https://github.com/rikky-hermanto/personal-finance/issues/41) | Add Current Phase section to CLAUDE.md |
| PF-041 | [#49](https://github.com/rikky-hermanto/personal-finance/issues/49) | E2E functional test infrastructure — Playwright |

---

## Ready

| ID | Issue | Title |
|----|-------|-------|
| PF-009 | [#17](https://github.com/rikky-hermanto/personal-finance/issues/17) | Hello LLM — First Anthropic API Call |
| PF-010 | [#18](https://github.com/rikky-hermanto/personal-finance/issues/18) | Structured Output — Text → JSON via LLM |
| PF-011 | [#19](https://github.com/rikky-hermanto/personal-finance/issues/19) | FastAPI AI Microservice Scaffold |
| PF-028 | [#36](https://github.com/rikky-hermanto/personal-finance/issues/36) | Fix exception detail leaking to API clients |
| PF-029 | [#37](https://github.com/rikky-hermanto/personal-finance/issues/37) | Fix N+1 query in CategorizeAsync |
| PF-031 | [#39](https://github.com/rikky-hermanto/personal-finance/issues/39) | Extract dashboard aggregation from controller |

---

## Backlog — Supabase Migration (PF-S series)

> 6 phases. Each phase has a verification milestone in `docs/supabase-migration.md`.

| ID | Issue | Title | Phase |
|----|-------|-------|-------|
| PF-S01 | [#64](https://github.com/rikky-hermanto/personal-finance/issues/64) | Supabase project init + CLI setup | 1 |
| PF-S02 | [#65](https://github.com/rikky-hermanto/personal-finance/issues/65) | Migrate EF Core schema to Supabase SQL migrations | 1 |
| PF-S03 | [#66](https://github.com/rikky-hermanto/personal-finance/issues/66) | Seed category rules + basic RLS setup | 1 |
| PF-S04 | [#67](https://github.com/rikky-hermanto/personal-finance/issues/67) | Add supabase-csharp SDK — DI setup and SupabaseSettings | 2 |
| PF-S05 | [#68](https://github.com/rikky-hermanto/personal-finance/issues/68) | Annotate Domain entities for Supabase PostgREST | 2 |
| PF-S06 | [#69](https://github.com/rikky-hermanto/personal-finance/issues/69) | Rewrite CQRS handlers + services — DbContext → supabase-csharp | 2 |
| PF-S07 | [#70](https://github.com/rikky-hermanto/personal-finance/issues/70) | Delete PersonalFinance.Persistence project — eliminate EF Core | 2 |
| PF-S08 | [#71](https://github.com/rikky-hermanto/personal-finance/issues/71) | Supabase Auth — JWT middleware + user_id columns + RLS policies | 3 |
| PF-S09 | [#72](https://github.com/rikky-hermanto/personal-finance/issues/72) | Frontend Supabase Auth — login/signup + JWT forwarding | 3 |
| PF-S10 | [#73](https://github.com/rikky-hermanto/personal-finance/issues/73) | Supabase Storage — bank-statements bucket + StorageService + upload endpoint | 4 |
| PF-S11 | [#74](https://github.com/rikky-hermanto/personal-finance/issues/74) | Event-driven AI pipeline — statement_uploads + Webhook + Python /webhooks/process | 5 |
| PF-S12 | [#75](https://github.com/rikky-hermanto/personal-finance/issues/75) | Supabase Realtime — React subscription for live AI processing status | 5 |
| PF-S13 | [#76](https://github.com/rikky-hermanto/personal-finance/issues/76) | RAG pipeline — pgvector embeddings + match_transactions + natural language query | 6 |

---

## Backlog — AI Ramp-Up + Sprint 1 (pre-Supabase or parallel)

| ID | Issue | Title | Sprint |
|----|-------|-------|--------|
| PF-012 | [#20](https://github.com/rikky-hermanto/personal-finance/issues/20) | PDF Text Extraction with PyMuPDF | ramp-up |
| PF-013 | [#21](https://github.com/rikky-hermanto/personal-finance/issues/21) | End-to-End: .NET → Python → LLM Pipeline | ramp-up |
| PF-014 | [#22](https://github.com/rikky-hermanto/personal-finance/issues/22) | Persist AI-Parsed Transactions to DB | ramp-up |
| PF-015 | [#23](https://github.com/rikky-hermanto/personal-finance/issues/23) | LLM Provider Abstraction Layer | S1 |
| PF-016 | [#24](https://github.com/rikky-hermanto/personal-finance/issues/24) | AI-Powered Auto-Categorization | S1 |
| PF-017 | [#25](https://github.com/rikky-hermanto/personal-finance/issues/25) | Natural Language Transaction Query | S1 |
| PF-021 | [#29](https://github.com/rikky-hermanto/personal-finance/issues/29) | Function Calling — API Endpoints as LLM Tools | S3 |
| PF-022 | [#30](https://github.com/rikky-hermanto/personal-finance/issues/30) | Agent Loop with Semantic Kernel | S3 |
| PF-023 | [#31](https://github.com/rikky-hermanto/personal-finance/issues/31) | Multi-Turn Agent Conversation | S3 |
| PF-024 | [#32](https://github.com/rikky-hermanto/personal-finance/issues/32) | AI Observability + Cost Tracking | S4 |
| PF-025 | [#33](https://github.com/rikky-hermanto/personal-finance/issues/33) | Semantic Caching Layer | S4 |
| PF-026 | [#34](https://github.com/rikky-hermanto/personal-finance/issues/34) | Auth0 Integration + Security Hardening ⚠️ superseded by PF-S08/S09 | S4 |
| PF-043 | [#52](https://github.com/rikky-hermanto/personal-finance/issues/52) | Wise CSV Parser + FX Rate Conversion | S1 |
| PF-045 | [#54](https://github.com/rikky-hermanto/personal-finance/issues/54) | Bank Profile Config System — YAML Loader | S1 |
| PF-046 | [#55](https://github.com/rikky-hermanto/personal-finance/issues/55) | LLM Extraction Client — .NET → Python HTTP Bridge | S1 |
| PF-050 | [#59](https://github.com/rikky-hermanto/personal-finance/issues/59) | Docker Compose — Add ai-service Container | S1 |

---

## Backlog — Cleanup (still relevant)

| ID | Issue | Title |
|----|-------|-------|
| PF-034 | [#42](https://github.com/rikky-hermanto/personal-finance/issues/42) | Backend test suite — Command handlers & validators |
| PF-035 | [#43](https://github.com/rikky-hermanto/personal-finance/issues/43) | Backend test suite — Bank statement parsers |
| PF-036 | [#44](https://github.com/rikky-hermanto/personal-finance/issues/44) | Backend test suite — TransactionService |
| PF-037 | [#45](https://github.com/rikky-hermanto/personal-finance/issues/45) | Backend integration tests — Controllers |
| PF-038 | [#46](https://github.com/rikky-hermanto/personal-finance/issues/46) | Frontend test setup — Vitest + RTL |
| PF-042 | [#50](https://github.com/rikky-hermanto/personal-finance/issues/50) | Explore MCP servers for developer workflow leverage |
| PF-051 | [#60](https://github.com/rikky-hermanto/personal-finance/issues/60) | Add ILogger to all services, handlers, and parsers |
| PF-052 | [#61](https://github.com/rikky-hermanto/personal-finance/issues/61) | TypeScript strict mode + id type fix |

---

## Obsolete (superseded by Supabase migration plan)

> These issues are no longer actionable as standalone tasks. Their goals are covered by the PF-S series.

| ID | Issue | Reason |
|----|-------|--------|
| PF-039 | [#47](https://github.com/rikky-hermanto/personal-finance/issues/47) | Absorbed into PF-S06 (handler rewrite fixes N+1) |
| PF-040 | [#48](https://github.com/rikky-hermanto/personal-finance/issues/48) | Absorbed into PF-S06 (dashboard aggregation rewrite) |
| PF-044 | [#53](https://github.com/rikky-hermanto/personal-finance/issues/53) | Absorbed into PF-S10 (validation pipeline — Supabase-integrated version) |
| PF-047 | [#56](https://github.com/rikky-hermanto/personal-finance/issues/56) | Absorbed into PF-S11 (Superbank — now event-driven via webhook) |
| PF-048 | [#57](https://github.com/rikky-hermanto/personal-finance/issues/57) | Absorbed into PF-S11 (NeoBank — now event-driven via webhook) |
| PF-049 | [#58](https://github.com/rikky-hermanto/personal-finance/issues/58) | Absorbed into PF-S11 (Bank Jago — now event-driven via webhook) |
| PF-053 | [#62](https://github.com/rikky-hermanto/personal-finance/issues/62) | Resolved by Supabase migration (CORS reconfigured as part of Platform setup) |
| PF-054 | [#63](https://github.com/rikky-hermanto/personal-finance/issues/63) | Resolved by PF-S07 (deleting Persistence project eliminates ARCH-01) |

---

## Progress

```
Setup:      ████████████████████ 100% (8/8)
Cleanup:    ██████░░░░░░░░░░░░░░  28% (5/18 — 8 issues now obsolete)
Ramp-Up:    ░░░░░░░░░░░░░░░░░░░░   0% (0/6)
Sprint 1:   ░░░░░░░░░░░░░░░░░░░░   0% (0/8 active)
Supabase:   ░░░░░░░░░░░░░░░░░░░░   0% (0/13)
Sprint 2+:  ░░░░░░░░░░░░░░░░░░░░   0% (0/6)
──────────────────────────────────
Overall:    ██░░░░░░░░░░░░░░░░░░  20% (13/55 active, 8 obsolete)
```

> Next task ID: **PF-055** (PF-S series: PF-S14 if more Supabase tasks needed)
