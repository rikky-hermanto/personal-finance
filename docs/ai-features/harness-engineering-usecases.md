# Harness Engineering — Use Cases for This Project

> **The harness is the scaffolding around a language model that turns it into an agent.** The model is a next-token predictor; the harness is the control loop, tool design, context management, guardrails, and orchestration that make it reliable. The same model is dramatically more or less capable depending on harness quality.

This project already ships several harness elements: the eval harness (PF-AI002), Langfuse tracing (PF-AI001), the `ProviderFactory` abstraction, and the 4-layer categorization ladder (PF-103). What is largely missing is **control loops and verification** — and that is exactly where the value is, because every LLM surface here touches financial data where a small error becomes silent corruption in PostgreSQL.

Use cases below are ordered by impact.

## 1. Self-correcting extraction loop

**Surface:** bank statement ingestion (`services/ai-service/app/services/llm_parser.py` → `.NET` validation pipeline).

Today the flow is *open loop*: PDF → LLM → validation pipeline → persist. If the LLM extracts wrong, the validator only rejects — it never repairs.

**Harness pattern: verify-and-retry loop.** After extraction, run deterministic checks the model cannot game:

- Do all `amount_idr` debits/credits reconcile with the statement total?
- Is `bank_running_balance` continuous row-to-row?
- Does the extracted row count match the transaction count in the header?

On failure, feed the *specific* error back for a targeted retry instead of discarding the whole batch:

```
retry hint → "row 14: running balance jumps 4.2M → 5.1M but amount is only 300K — re-check this row"
```

```
extract ──> deterministic validators ──✗──> retry with error context ──┐
              │                                                          │
              └──✓──> persist                          (max N retries) <─┘
```

This converts silent failures into automatic corrections. Highest-risk surface, and the foundation already exists (the 5-stage validation pipeline for the checks, the eval harness to prove the loop actually raises accuracy). **Best place to start.**

## 2. Confidence-based model escalation

**Surface:** `ProviderFactory` / parser routing.

Provider selection is currently static (`AI_PROVIDER=gemini`). The harness pattern is **cost-aware routing**: run cheap Gemini Flash first, escalate to Sonnet only for low-confidence rows or documents.

- Bank Jago blurry screenshot → escalate a tier.
- BCA / Wise deterministic CSV → never hits an LLM at all (already enforced by THINK-01).

Langfuse already captures cost/latency per call, so the savings are measurable rather than assumed. This also encodes THINK-01 (direct parser before LLM) as a runtime routing decision, not just a review-time rule.

## 3. Journey advisor as a tool-using agent

**Surface:** `POST /journey/advise` (`journey_advisor.py`).

The advisor likely sends one large prompt stuffed with all the user's data. Convert it to an **agent with read-only tools**: `get_pyramid_scores()`, `get_recent_transactions()`, `get_net_worth()`, `get_debt_ratio()`. Let the model decide which data to pull for a given question.

This is a pure **tool-design harness**: smaller context, more focused answers, and each tool is independently testable. It fits the product directly — financial advice must be grounded in real numbers, not hallucinated, and tools make the grounding explicit and auditable.

## 4. Multi-agent portfolio review

**Surface:** `POST /portfolio-review` (`portfolio_reviewer.py`).

Currently a single call. Fan it out into orchestration:

```
per asset class (IDX / mutual funds / bonds / crypto / P2P)
   → specialist reviewer  →  adversarial risk critic  →  synthesizer
```

The risk critic is deliberately prompted to *refute* — hunt for over-concentration, liquidity traps, correlation risk. This is the **judge / adversarial-verify** pattern. It is what makes a review feel like a real advisor rather than a summary of holdings.

## 5. RAG answer-grounding harness

**Surface:** the `/ask` endpoint being built in PF-AI003 / PF-AI004.

Pipeline: retrieve → re-rank → generate → **verify every claim is supported by a retrieved source**. If an answer is not grounded in the retrieved documents, reject and regenerate.

```
query → retrieve (pgvector) → re-rank → generate → grounding check ──✗──> regenerate
                                                          │
                                                          └──✓──> return with citations
```

This is a mandatory guardrail once the LLM starts giving financial advice — a hallucination here is not just low-quality, it is harmful. Ties directly into the in-progress RAG work.

## 6. Eval-as-CI-gate (meta-harness)

**Surface:** `services/ai-service/evals/` (already exists — 20 fixtures, row-level F1).

Promote the eval harness into a **regression gate**: any prompt or model change must clear an F1 threshold before merge (extends the CI-01 gate set). Add an **LLM-as-judge** for advisor answer quality, which has no numeric ground truth.

This is the harness that guards the other harnesses — and it maps cleanly onto the AI Engineering learning track (the eval/observability discipline underneath everything in #1–#5).

## Recommendation

Start with **#1 (self-correcting extraction loop)**. It has the highest impact, builds on what already exists (validation pipeline + eval harness), and teaches the core control-loop pattern reused in #3, #4, and #5. A natural sequence:

1. #1 — control loop + deterministic verification
2. #6 — lock the gains in with an eval gate
3. #2 — cost-aware routing once the loop is trustworthy
4. #3 / #5 — tool-using + grounded advice
5. #4 — full multi-agent orchestration

Each step reuses the harness primitives from the one before, so the investment compounds rather than resets.
