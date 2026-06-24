# AI Agent-Loop Engineering — Feasibility & Design

> **Architect consultation** · 2026-06-23 · scope: the Python AI service LLM call paths
> **Concept:** "Agent Loop & Fleet" (Vergadia) — Goal+criteria → act → **evaluate vs criteria** →
> fix → repeat; Open vs Closed loop; fleet orchestration with an eval gate at each layer.
> **Verdict: PROCEED** — build **one** closed loop first, where the eval gate is deterministic and
> free: **extraction ⇄ statement-balance reconciliation**. **DON'T-YET** loop the fuzzy paths
> (categorization, advice) or build a fleet.

---

## TL;DR

The infographic's thesis is *"the fix isn't a better model, it's changing the wiring"* — and its one
load-bearing claim is that a **Closed Loop is defined by its eval gate** ("verifiable feedback, fails
early, predictable budget"). Without a verifiable gate, a loop is just the **Open Loop** it draws
next to it: *explore → dead end → high token cost*.

So the real question for this project isn't "should I add an agent framework." It's: **which of my
one-shot LLM calls has a cheap, verifiable criterion to loop against?** Answer: exactly one is
unambiguous today — **extraction**, because you already store the `statement_balance` and the
reconciliation check (`Σdebits − Σcredits` vs the balance delta, plus row count) is free,
deterministic arithmetic. That is a textbook closed-loop gate sitting unused.

Build that one loop. It's your highest-stakes path (a wrong extraction silently corrupts the DB —
your own THINK-03/THINK-05 worst case), it teaches the whole closed-loop pattern on a *verifiable*
gate, and it needs no framework — just a bounded `while` around the provider you already have.

---

## The model you're pointing at, in project terms

| Infographic idea | What it means here |
|------------------|--------------------|
| **Prompting = old model** (manual loop, human at every step) | Your `/parse-pdf`, `/categorize`, `/portfolio-review`, `/journey/advise`, `/ask` — all one-shot calls; a human notices if the output is wrong. |
| **Agent loop** (self-correcting until eval passes; "writer revising their own manuscript") | The call *checks its own output against criteria* and retries the fix until it passes or a budget runs out. |
| **Open vs Closed loop** ← *the decision that matters* | **Open** = let it explore, no gate, unpredictable token cost. **Closed** = step → **eval gate ✓** → step → eval gate ✓, predictable budget, fails early. |
| **Fleet** (orchestrator → specialists → subagents, gate at each layer) | Only when a single agent hits a context limit or spans multiple domains. You don't have that problem yet. |

---

## Where you are today: Open Loop everywhere (verified)

Greps confirm **no `retry` / `reflexion` / `self-correct` / `critique` logic anywhere in
`services/ai-service/app`** — every LLM touchpoint is a single forward pass:

| Endpoint | Today | Has a verifiable gate available? |
|----------|-------|----------------------------------|
| `/parse-pdf`, `/parse-image` (extraction) | one-shot `tool_use`, temp=0, schema-validated | ✅ **YES — `statement_balance` reconciliation (deterministic, free)**. Currently unused as a gate. |
| `/ask` (RAG) | retrieve → rerank → generate; hallucination guard drops bad citations | 🟡 Partial — the guard + `confident=false` flag are a *weak* gate; no retry on failure. |
| `/categorize`, `/suggest-categories` | 4-layer cascade (rule → preset → history → LLM) | ❌ No — "is this category right?" needs a fuzzy LLM-judge. |
| `/portfolio-review`, `/journey/advise` | one-shot generative advice | ❌ No — soft criteria (good advice ≠ machine-checkable). |

The validation pipeline (`DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator →
DeduplicateCheck`) runs *after* extraction but **does not reconcile against the running balance** — so
a plausible-but-wrong extraction (a missed row, a transposed amount) passes every existing stage and
lands in Postgres. That is the open loop's signature failure: no gate, silent bad outcome.

---

## The real question & the decisive factor

> Reframed: *"Which one-shot call should become a self-correcting closed loop — and where is the
> verifiable gate that makes the loop closed instead of a token-burning open loop?"*

**Decisive factor: the loop only pays for itself when the eval gate is verifiable and cheap.** The
infographic is explicit — "verifiable feedback" is what separates the closed loop from the open one.
A loop wrapped around a *fuzzy* gate (an LLM judging its own category choice) costs 2–5× the tokens
for marginal, unprovable gain. A loop wrapped around a *deterministic* gate (arithmetic that has to
balance) catches real errors for free. **The gate, not the loop, is the design.**

---

## Verdict: PROCEED — one deterministic-gate loop first

### ✅ Build first: extraction ⇄ statement-balance reconciliation

This is the right first loop on every axis: highest stakes (silent DB corruption), a free
deterministic gate you already have the data for, and it demonstrates the entire closed-loop pattern.

```
                          ┌──────────────────────────────────────────────┐
                          ▼                                                │
  PDF ─▶ extract (temp=0) ─▶ ① RECONCILE GATE ──fail──▶ ② FIX ────────────┘
         tool_use            Σ(DB) − Σ(CR) == Δbalance?   re-prompt with the
                            row count == statement count?  *discrepancy as a hint*
                            dates within period?           (change the INPUT,
                                  │                          never the temperature)
                                ✓ pass                       cap: ≤3 iters + cost ceiling
                                  ▼                          exhausted → flag for human,
                          persist to Postgres                 NEVER silently persist
```

Loop, framework-free, around the provider you already have:

```python
async def extract_reconciled(pdf_text: str, statement_balance_delta: Decimal,
                             expected_count: int | None) -> ExtractionResult:
    hint = ""
    for attempt in range(MAX_ATTEMPTS):           # hard iteration cap (Define exit condition)
        txns = await provider.extract(pdf_text + hint, temperature=0.0)  # temp stays 0 — see Landmine
        gap = reconcile(txns, statement_balance_delta, expected_count)   # deterministic, free
        if gap.is_clean:
            return ExtractionResult(txns, reconciled=True)               # eval gate ✓ → exit
        if cost_so_far >= COST_CEILING:           # hard budget cap (predictable budget)
            break
        hint = gap.as_prompt_hint()               # FIX: vary the input, not the sampling
    return ExtractionResult(txns, reconciled=False, flagged_for_review=gap)  # fail early, surface
```

The gate is arithmetic — **$0 per check, fully deterministic, no second LLM call.** That is the
cleanest possible closed loop, and it converts your worst silent-failure mode into a loud, early one.

### ✅ Build second: corrective-RAG loop on `/ask`

You already shipped a *partial* gate in [answerer.py](../../services/ai-service/app/services/answerer.py)
— the hallucination guard + the `confident` flag. Close the loop: when the guard drops citations **or**
`confident=false`, **reformulate the query once** (broaden the window, add keyword/BM25 to catch the
terse Indonesian bank codes your retrieval eval showed dense vectors miss) and retry. **One** retry,
not unbounded — the gate is the work you already did.

### ⛔ DON'T-YET loop: categorization, portfolio review, journey advice

Their gates are fuzzy (an LLM judging "is this category/advice good?"). A loop there burns tokens and
latency for a gain you can't verify — exactly the "high token cost" the open loop is criticized for,
just dressed up as a closed one. The honest move at this scale: keep them one-shot; if you must add
self-correction, a *single* self-critique pass (reflexion) is the ceiling, not a loop.

### ⛔ DON'T-YET build a fleet

The fleet (orchestrator → specialists → subagents) solves *single-agent context overflow* and
*multi-domain synthesis*. One bank statement fits in context; one `/ask` query is single-domain. You
don't have the problem the fleet solves. Building it now is orchestration overhead with no payoff.

> **The one future fleet candidate** worth naming: the **Journey advisor** is a natural orchestrator
> — fan out to five specialists (one per pyramid tier: Foundations, Defense, Growth, Freedom, Legacy),
> each with its own eval gate, then synthesize. That maps onto your architecture beautifully — but
> only *after* the single-agent loop pattern is proven, and only if a single advisor call starts
> hitting real context or quality limits. Not now.

---

## Phase fit

- **Extraction reconciliation loop:** right for now **and** forever — it's pure engineering hygiene
  ("fails early, predictable budget"), independent of scale.
- **Corrective-RAG loop:** right for now — bounded, reuses existing gates.
- **Fuzzy-gate loops:** not worth it at solo-dev scale; the token/latency cost outruns the unprovable
  benefit.
- **Fleet:** not right until a real context-overflow or multi-domain need exists.

---

## The Landmine 💣 (two — the first is specific to *your* rules)

**1. A retry loop must not reach for `temperature > 0` to vary its output.** Your extraction rule is
explicit ([.claude/rules/ai-service.md](../../.claude/rules/ai-service.md)): *"Always set
temperature=0.0 for extraction — creativity introduces field hallucination."* The naive way to make a
loop produce "different" output on retry is to raise the temperature — which **directly violates that
rule and reintroduces the hallucination you designed it out to prevent.** The fix step must vary the
**input** (re-page the PDF, inject the reconciliation gap as a targeted hint: *"the debits sum to X but
the balance moved by Y — find the missing ~Z transaction"*), never the sampling. This is the subtle
trap a generic "add an agent loop" answer walks straight into.

**2. An unbounded loop burns real money.** The open loop's "high token cost" failure *is* a missing
iteration/cost cap. Every loop needs a hard exit — `reconciled OR iters≥N OR cost≥ceiling` — and on
exhaustion it must **surface to a human, never silently persist a non-reconciling extraction**. This is
the loop-level twin of your existing `stop_reason == "max_tokens"` hard-error rule: a partial/unsure
result is worse than a clean failure, because it poisons the DB and every downstream pyramid score.

---

## How this maps to your AI-Eng learning track

This *is* a named curriculum topic — "AI Loop Engineering" — so it slots in cleanly:

- **Suggested ticket: PF-AI005 — "Agent Loop: Extraction Reconciliation."**
- **Reconsider the Chapter 7 first-agent choice.** Your plan ([progress.md](../mentor/progress.md))
  makes the first agent a *Transaction Categorizer* (smolagents). But categorization has a **fuzzy
  gate** — a weak vehicle for teaching the closed-loop discipline the infographic is about. The
  **extraction-reconciliation loop has a deterministic gate**, so it teaches "verifiable feedback /
  eval gate / fails early" *cleanly*. Consider making it the first agent (or the Chapter-7 warm-up
  before the categorizer). It's also the stronger interview story: *"I wrapped extraction in a
  self-correcting loop gated on arithmetic balance reconciliation — it turned a silent data-corruption
  failure mode into an early, automatic catch, with a hard token budget and no determinism loss."*
- **Framework deferral is correct:** start framework-free (`while` + your provider abstraction). Pull
  in LangGraph at **Chapter 8**, where state/routing/multi-step genuinely earns it (the pyramid
  advisor fleet) — not before.

> **Bridge to the offline side:** the eval harnesses you already built (extraction F1, retrieval
> MRR/P@5, faithfulness) are the **same criteria** as these runtime gates, applied offline as
> regression tests. Runtime gate = self-correct *now*; offline eval = catch regressions *before
> ship*. Same criterion, two clocks. (An eval-ops "data flywheel" around those harnesses is a
> *separate* topic — not what "loop engineering" means here.)

---

## Confidence: High

Grounded in the repo: `statement_balance` data exists (PF-116, it's in your dedup key); there is
**zero** retry/self-correction logic today (every call is one-shot); extraction is your
highest-corruption-risk path with a free, deterministic gate currently unused. The only thing that
would move the *first-loop* choice off extraction is if reconciliation data turned out unreliable for
some banks (e.g. a format with no running balance) — in which case that bank falls back to one-shot +
human review, and the loop still holds for the banks that do carry a balance.

---

*Generated via `/consult` (Architect mode), corrected to the agent-loop interpretation. To turn this
into an implementation plan: `/plan PF-AI005 extraction reconciliation agent loop`.*
