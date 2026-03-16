# Revised Sprint Plan (Hybrid Approach)

> **Source:** Extracted from CLAUDE.md — Revised Sprint Plan section

## Sprint 1 — Hybrid Parser Pipeline (Week 1-2)

- Build Python FastAPI AI service skeleton (health check, extract endpoints)
- Implement LLM extraction for Superbank PDF using Claude structured output
- Implement LLM extraction for Bank Jago screenshot using Claude vision
- Build Wise CSV direct parser (with FX rate conversion logic)
- Build bank profile config system (YAML loader)
- Build validation pipeline (.NET side): DateNormalizer, DecimalFixer, CurrencyStandardizer, SchemaValidator, DeduplicateCheck
- Wire .NET → Python HTTP forwarding for PDF/image uploads
- Integration tests for full pipeline (upload → parse → validate → persist)

## Sprint 2 — RAG Pipeline (Week 3-4)

- Embedding generation for transaction descriptions + metadata
- pgvector storage and similarity search
- Natural language query endpoint
- RAG pipeline: embed question → retrieve → LLM answer

## Sprint 3 — AI Agents (Week 5-6)

- Function calling: .NET API endpoints as LLM tools
- Agent loop for multi-step operations
- Semantic Kernel integration on .NET side

## Sprint 4 — Production Hardening (Week 7-8)

- AI observability: token usage, latency, cost per query
- Semantic caching for repeated queries
- Error recovery and retry logic for LLM calls
- Rate limiting, security, API key management
- Optional: n8n orchestration layer for scheduled monthly imports
