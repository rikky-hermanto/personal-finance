# RAG & Agents Roadmap

> Architect consultation output — 2026-05-25

## Context

Current AI usage is **direct LLM calls only** — no retrieval, no multi-step reasoning loops. Infrastructure is closer to ready than it looks: pgvector is already in Supabase, FastAPI is live, Gemini + Anthropic SDKs are wired up.

The filter: every AI feature must either (a) surface an insight the user couldn't compute themselves, or (b) reduce a workflow step from manual to automatic.

---

## RAG Use Cases

### 1. Natural Language Transaction Search — Highest ROI

**Problem:** Users filter transactions with Excel-style dropdowns.
**With RAG:** "Show me everything I spent at coffee shops in April" or "Find that Tokopedia payment from last month."

**How it works:**
1. On transaction insert, embed `description + category + amount` via Gemini embedding API → store vector in pgvector column on `transactions` table
2. New FastAPI endpoint `POST /search` — takes natural language query, embeds it, runs cosine similarity search (`<=>`) via pgvector
3. .NET `GET /api/transactions/search?q=...` proxies to it

**Files to touch:**
- Supabase migration — add vector column + HNSW index on `transactions`
- `services/ai-service/app/main.py` — new `/search` endpoint
- `apps/api/src/PersonalFinance.Infrastructure/External/` — new typed client

---

### 2. Financial Insight Q&A (RAG over your own data)

**Problem:** User wants to ask questions about their own finances in plain language.
**With RAG:** "Am I spending more on food this year?" or "How close am I to a 3-month emergency fund?"

This is mostly **smart context assembly**, not heavy RAG. For spending questions, pass aggregated category summaries as context. For journey questions, pass current tier scores + quest state. The `journey/advise` endpoint is already 70% of this — extend it.

**Files to touch:**
- `services/ai-service/app/services/journey_advisor.py`
- New `POST /insights/ask` endpoint

---

### 3. Semantic Categorization Fallback

**Problem:** 106 keyword rules fail on novel or truncated merchant names (common with BCA descriptions).
**With RAG:** When no keyword rule matches, embed the transaction description → find k nearest already-categorized transactions → use their category. The 106 rules become cold-start seed; every new categorization makes the system smarter.

**Files to touch:**
- `services/ai-service/app/services/categorizer.py` — add vector similarity fallback path
- Supabase migration — vector column on `transactions` (shared with use case #1)

---

## Agent Use Cases

### 4. Upload Processing Agent — Ready now

**Problem:** Current upload pipeline is a fixed linear sequence that fails silently on low-confidence extraction or misidentified banks.

**Current flow:**
```
Upload → BankIdentifier → Parser → ValidationPipeline → Categorize → Save
```

**Agent flow:**
```
UploadAgent loop:
  1. Identify bank (with confidence score)
  2. IF confidence < 0.8 → try alternate identification strategy
  3. Parse → inspect output quality (completeness, date consistency, amount range)
  4. IF quality check fails → re-extract with different prompt / escalate to user
  5. Categorize batch → flag low-confidence items for user review
  6. STOP: present results to user for confirmation
```

Human-in-the-loop preview step stays. The agent does better pre-processing with explicit uncertainty handling.

**Files to touch:**
- New `services/ai-service/app/agents/upload_agent.py`
- New `POST /agent/process-upload` endpoint

---

### 5. Monthly Financial Review Agent — After auth (PF-S08)

**What it does:** Runs at month-end autonomously — pulls transactions, compares categories vs prior months, computes journey score delta, identifies anomalies (new recurring charges, category spikes), generates narrative summary with 3 specific action items.

**Prerequisite:** Auth (PF-S08). Without user identity the agent can't scope data access or deliver the report. Target PF-S14 or PF-S15.

---

### 6. Journey Quest Agent — Upgrade to existing quest generation

**Problem:** Quest cards are likely generated from a single LLM call on tier state. No transaction history context.

**Agent version:**
1. Read all 5 tier indicator scores
2. Identify the weakest prerequisite blocking the next level
3. Generate specific, quantified quest ("Add Rp 1.8M to emergency fund to reach 3mo coverage")
4. Check recent transaction patterns that explain the weakness
5. Suggest a concrete behavioral change based on history

The `journey/advise` endpoint is a proto-agent — just extend the loop depth.

---

## Implementation Order

```
Phase 1 — PF-S13 (Now)
├── Supabase migration: vector column + HNSW index on transactions
├── Embed on insert (hook into TransactionCreatedEvent)
└── POST /search natural language endpoint in FastAPI

Phase 2 — After Phase 1 validates
├── Semantic categorization fallback (reuse Phase 1 vectors)
└── Extend /journey/advise with transaction history context

Phase 3 — After PF-S08 auth ships
├── Upload Processing Agent (self-correcting pipeline)
└── Monthly Review Agent (requires user identity)

Phase 4 — After Phase 3
└── Journey Quest Agent (deepened multi-step reasoning)
```

---

## Landmine

**Embedding drift.** When Gemini's embedding model is updated, old vectors and new vectors are not comparable — similarity search returns garbage. Store `embedding_model_version` alongside every vector row from day one, and build a re-embedding migration job before writing the first vector. Cheap to add at the start; extraordinarily expensive to bolt on after 50,000 transaction embeddings exist.

---

## Tickets

| Phase | Suggested ticket | Depends on |
|---|---|---|
| Phase 1 | PF-S13 (exists — RAG pipeline) | PF-S07 done ✅ |
| Phase 2 | PF-118 | PF-S13 |
| Phase 3a | PF-119 (Upload Agent) | PF-S08 auth |
| Phase 3b | PF-120 (Monthly Review Agent) | PF-S08 auth |
| Phase 4 | PF-121 (Journey Quest Agent) | PF-119 |
