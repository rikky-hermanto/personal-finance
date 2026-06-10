# Idea: Agentic LLM-to-Deterministic Parser Learning Loop

> **Status:** Braindump — not yet planned
> **Captured:** 2026-06-10
> **Source:** Mid-session, frustration with expensive LLM token cost for anonymous bank PDFs

---

## The Core Idea

Build an iterative learning agent that observes LLM-parsed anonymous bank statements over time, extracts recurring structural patterns, then notifies the developer when confidence is high enough to warrant writing a deterministic parser — closing the feedback loop from "unknown PDF" → "free CSV parser."

```
  Unknown PDF Upload
         │
         ▼
  ┌─────────────────┐
  │  LlmPdfParser   │  ← token cost every time
  └────────┬────────┘
           │  raw text + extracted transactions
           ▼
  ┌──────────────────────────┐
  │  parser_learning_events  │  ← Supabase table; accumulates per-bank
  └────────────┬─────────────┘
               │  (cron / trigger)
               ▼
  ┌──────────────────────────────────────────┐
  │         Pattern Learning Agent           │
  │  - column positions stable?              │
  │  - date format consistent?               │
  │  - header/footer fingerprint repeating?  │
  │  - amount decimal convention fixed?      │
  └────────────────┬─────────────────────────┘
                   │
           N samples & stable?
           ┌───────┴────────┐
          NO               YES
           │                │
     keep accumulating      ▼
                  ┌──────────────────────────┐
                  │   Developer Notification  │
                  │  + Bank Profile YAML      │
                  │  + IBankSignature sketch  │
                  │  + PR draft (optional)    │
                  └────────────┬─────────────┘
                               │  human reviews + ships
                               ▼
                  ┌──────────────────────────┐
                  │   Deterministic Parser   │  ← zero LLM cost from now on
                  └──────────────────────────┘
```

---

## Context & Pain (from the dump)

- Anonymous bank PDFs (not yet registered in the bank signature registry) fall back to `LlmPdfParser`
- Every LLM parse costs tokens — expensive at scale, especially if the same unknown bank recurs monthly
- Currently there's no mechanism to detect "this unregistered bank has shown up 10 times — we should build a parser for it"
- The gap: we're accumulating signal (repeated LLM parse results from the same format) but throwing it away each time

---

## Rough Notes

- Agent would work iteratively across uploads, not within a single parse call
- Inputs it could learn from: raw PDF text (PyMuPDF), LLM-extracted transactions, filename patterns, header/footer text, column labels
- Pattern extraction ideas:
  - Detect column header row by finding consistent date/amount/description patterns across multiple samples
  - Track "which bank name string appears in the PDF header?" → candidate wallet name
  - Detect decimal/date format conventions per bank
- Confidence gate: after N samples (e.g. 3-5 uploads) with consistent structure → trigger developer notification
- Notification could be: GitHub issue auto-created, Slack message, email — with an attached pattern summary
- Output of the agent: a "bank profile draft" — the YAML config format already planned in PF-045
- Could even auto-generate a skeleton `IBankSignature` implementation and draft parser as a PR draft
- The "agentic loop" is async and offline — runs in the background, not blocking the upload path
- Storage: each LLM parse result + raw PDF text stored in a `parser_learning_events` table in Supabase; agent queries this table periodically (cron or trigger-based)
- Deterministic parser confidence isn't just row count — need field-level stability: is `amount_idr` always in the same column? Is `date` format stable across all samples?
- Risk: PDF layout changes across months (bank redesign) → need to detect format drift, not just pattern convergence
- Could tie into the eval harness (PF-AI002) — sampled real statements as ground truth, use F1 to validate the proposed deterministic parser before promoting it

---

## Related Ideas / Features

- [rag-and-agents-roadmap.md](rag-and-agents-roadmap.md) — broader AI agents roadmap; this fits as a "parser intelligence" agent
- `IBankSignature` registry (PF-124) — the output of this agent feeds directly into this; a new `IBankSignature` impl is the end product
- Bank profile YAML config system (PF-045, not yet built) — the draft output format for what the agent generates
- Eval harness (PF-AI002, done) — scoring infrastructure that could validate the proposed parser before shipping it

---

## Next Step (when ready)

Run `/pm-brainstorm analyze llm-to-deterministic-parser-agent` for full PM analysis, or `/plan` when ready to build.
