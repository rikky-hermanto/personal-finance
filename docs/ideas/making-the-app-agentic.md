# Idea: Making the App Agentic

> **Status:** Braindump — not yet planned
> **Captured:** 2026-08-05
> **Source:** Chat exploration in [docs/ideas/agentic-ideas.md](agentic-ideas.md) — started from confusion over someone calling the app "an extraction pipeline, not an agent system"

---

## The Core Idea

Right now the app is a **pipeline** (code controls the flow, LLMs are cogs in a fixed sequence: PDF Extractor → LLM Parser → Categorizer → RAG Answerer). To become **agentic**, the LLM itself needs to control the flow — given a goal, a loop, and a set of tools, deciding autonomously what to call next instead of following a hardcoded sequence.

```
PIPELINE (current)                      AGENT (proposed direction)
─────────────────                       ──────────────────────────
PDF → LLM Parser → Categorizer          Goal: "Keep dining budget < 300"
      (fixed steps, code-controlled)           │
                                                ▼
                                         [LLM decides next tool call]
                                          ┌───────┬───────┬─────────┐
                                          ▼       ▼       ▼         ▼
                                    check_txns  compare  notify   loop/stop
                                                to budget  user
                                          (LLM controls the flow, not code)
```

---

## Context & Pain (from the dump)

- Someone pointed out the app is "an extraction pipeline, not an agent system" — this is accurate, not a criticism: reliability, speed/cost, and security all favor pipelines for financial data (deterministic parsing, no hallucination risk on money-moving actions).
- The pipeline approach is the *right* call for the core extraction/categorization work — this braindump is about *adding* agentic behavior on top, not replacing the pipeline.
- Bridging path suggested: introduce a Router or ReAct (Reason + Act) loop — give existing pipelines (categorizer, recommender, query_db) a standard function signature, then let an LLM decide which to call for vague user questions like "Why am I broke this month?"

---

## Rough Notes

### 1. The Proactive Budget Enforcer (Background Agent)
Runs autonomously (e.g. daily cron) instead of waiting for the user to ask. Goal: "Keep the user under their monthly dining budget of $300." Tool: `check_transactions` daily. Action: if nearing the limit, autonomously uses `send_notification` — "Heads up! You only have $20 left for dining this month. Maybe cook at home this weekend?"

### 2. The Subscription Negotiator / Canceler
User: "I want to cancel my unused subscriptions." Agent uses `identify_recurring_charges`, then `web_browser_automation` (or APIs if available) to log into the service and navigate the cancellation flow, or drafts a cancellation email via `send_email`.

### 3. The Autonomous Investment Researcher
Runs in background with goal: "Maximize yield on idle cash with low risk." Uses `get_account_balances` to find checking accounts with high idle balances, `search_web` to find current best HYSA APYs. Proactively suggests: "You have $10,000 sitting in checking earning 0%. I found a SoFi account offering 4.6%. Shall I help you move $8,000 there?"

### 4. The "Tax Season" Preparation Agent
Goal: "Prepare a tax summary for 2023." Loops through `search_transactions` (filtering for potential write-offs like office supplies, charity), `read_receipts` (existing PDF extractor), `generate_csv`. Without step-by-step prompting, spends a few minutes gathering deductible transactions and produces a formatted spreadsheet.

### 5. Multi-Agent Debt Snowball Optimizer
Two agents debate strategy: Agent 1 (The Mathematician) calculates fastest payoff mathematically (Avalanche method); Agent 2 (The Behavioral Coach) argues for Snowball method based on user's past failure to stick to long-term plans. They converse internally and present a unified, personalized debt payoff plan, complete with scheduled micro-transfers via an `execute_transfer` tool.

### Open questions / half-formed thoughts
- Which of these are safe to make fully autonomous (read-only: budget enforcer, tax prep, investment researcher) vs. which need a human-in-the-loop confirmation step before acting (subscription canceler, debt snowball transfers — anything that moves money or contacts third parties)?
- The "Router / ReAct loop" bridging idea is the most concrete near-term step — could reuse existing services (`CategoryRuleService`, `JourneyScoringService`, `PortfolioReviewClient`) as tools behind a single agent loop for the chat/advisor surface.
- Ties into the existing RAG roadmap (`/ask` endpoint, PF-AI003/PF-AI004) — an agent loop is a natural next phase after retrieval is working.

---

## Related Ideas / Features

- [agentic-ideas.md](agentic-ideas.md) — raw source chat this braindump was captured from
- [rag-and-agents-roadmap.md](rag-and-agents-roadmap.md) — broader roadmap this likely feeds into
- [llm-to-deterministic-parser-agent.md](llm-to-deterministic-parser-agent.md) — related agent/parser thinking

---

## Next Step (when ready)

Run `/pm-brainstorm analyze making-the-app-agentic` for full PM analysis, or `/plan` when ready to build.
