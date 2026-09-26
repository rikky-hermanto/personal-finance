---
name: consult
description: "Evaluate a focused architecture decision, system design, critique, tradeoff, ADR, or scaling question against Personal Finance's actual topology and constraints."
---

# consult

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read root/scoped instructions, governance, relevant code, status, and historical
context. Clarify the real decision and uncertainty; calibrate to a solo-maintained
product rather than assuming enterprise scale. Give a concrete recommendation with
confidence and conditions that would change it.

Modes:
- direct: real question, hidden assumptions, decisive factor, PROCEED / DON'T /
  REDESIGN / NOT YET, practical steps, and the main failure risk.
- system design: scope/constraints, core tension, component/data design, contracts,
  failure modes, and an incremental evolution path.
- critique: inspect design and connected code; preserve sound choices, rank problems,
  identify the architectural cause, and SHIP / FIX / REDESIGN.
- tradeoff: explicit criteria/weights, evidence-based option matrix, decisive factor,
  useful aspects of alternatives, and reversal conditions.
- ADR: inspect existing numbering in docs and both plan histories; write context,
  decision, options, rationale, consequences, success criteria, and revisit triggers
  to docs/codex/adr/ when an ADR artifact is requested.
- scale: establish real request/data/dependency topology and baseline first, then
  state 10x/100x assumptions, bottlenecks, failure cliff, and staged mitigations.
  Do not invent measured throughput.

Every mode states phase fit: right now, durable, or expected to evolve, with reason.
Cite implementation evidence. Stay open to contrary evidence; avoid forced certainty.
Use plan when implementation planning is requested; a consultation alone does not
authorize code changes. No automatic subagent spawning or model switching.
