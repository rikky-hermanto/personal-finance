---
name: efficient-model
description: Use when the task is codebase-heavy or token-heavy — broad repo searches across the .NET/Python/React monorepo, long test or log output, multi-file edits, or research sweeps where independent slices can run in parallel. Keeps your selected model on judgment; pushes bounded heavy lifting down to cheaper executor subagents.
---

# Skill: efficient-model

**Whatever model you selected via `/model` is the orchestrator.** It stays on the decision layer — decomposition, architecture/contract calls, synthesis, final review — and pushes token-heavy passes (repo scans, log/test-output reduction, bounded edits, research) **down to a cheaper tier** via subagents. The orchestrator spends its expensive tokens on judgment, not on reading everything itself.

This skill does **not** change your model. It assumes you already picked your orchestrator with `/model`. It only changes *how that model delegates*.

## The tier ladder — delegate downward

Your active model is the manager; executors are one or more tiers below it:

| Your model (orchestrator) | Delegate executor work to | Notes |
|---------------------------|---------------------------|-------|
| **Fable 5** | Opus → Sonnet → Haiku | Most headroom to delegate — Fable is the priciest tier |
| **Opus 4.8** | Sonnet → Haiku | Everyday default; delegate scans + reduction |
| **Sonnet 4.6** | Haiku | Only push mechanical/bulk passes down |
| **Haiku 4.5** | — | Already the cheapest tier; skip this skill |

**Rule:** delegate each slice to the *cheapest tier that can do it reliably*. Bounded-but-reasoning work → one tier down. Mechanical scans / log reduction / inventory → bottom tier (`haiku`).

> ⚠️ **The silent footgun: omitting `model` inherits the orchestrator's tier.** An `Agent` or `Workflow` call without an explicit `model` runs the executor at YOUR price — on Fable, that's a Fable-priced grep. **Always set `model` explicitly when the point is cost.** No error will tell you; only the bill will.

**Authorization:** invoking `/efficient-model` IS the user's standing opt-in to spawn executor subagents for the current task — the harness default ("don't spawn unless asked") is satisfied by this invocation.

## The delegation levers (concrete, not abstract)

Delegation runs on two tools with explicit `model` overrides — pick the executor tier per call:

| Lever | Use for | How |
|-------|---------|-----|
| `Agent` tool | One bounded slice — a scan, a test run, a narrow edit | `Agent({ subagent_type, model: "sonnet", prompt })` |
| `Workflow` tool | Fan-out: N independent slices, pipelines, loop-until-done | `agent(prompt, { model: "haiku", phase })` inside the script |

**Workflow is gated** — it only activates when you say `ultracode` or "use a workflow" (it can spawn dozens of agents). For a handful of slices, fire parallel `Agent` calls in one response instead.

Two more levers most people miss:
- **`run_in_background: true`** on `Agent` — long executor passes (full test suite, broad eval run) go async; the orchestrator keeps planning and gets notified on completion.
- **`SendMessage` to a prior agent** — an executor that already built context is warmer and cheaper than a fresh spawn. Continue it for follow-up slices in the same area instead of respawning cold.

### Delegation economics — when it actually pays off

Every spawn starts **cold**: it re-derives context the orchestrator already has, plus you pay for writing the handoff packet. Delegation wins only when:

```
(tokens the orchestrator would burn reading/doing it itself)
        ≫  (handoff packet + executor cold-start + report)
```

Rule of thumb: if the slice is under ~a few files or one quick command, the orchestrator doing it directly is cheaper than managing it.

### Subagent type → executor map for this repo

| Heavy work | `subagent_type` | suggested tier |
|-----------|-----------------|----------------|
| Broad code search (where is X, naming conventions, call sites) | `Explore` | one tier down |
| Run `dotnet test` / `pytest` / Playwright, reduce output to failures | `general-purpose` | bottom tier (`haiku`) |
| Bounded edit (one parser, one handler, one component) | `general-purpose` | one tier down |
| Review a diff against governance rules | `code-reviewer` | one tier down |
| Draft xUnit/Moq tests from an existing pattern | `test-writer` | one tier down |

## When to delegate vs. keep local

| Delegate (cheaper executor) | Keep on the orchestrator |
|-----------------------------|--------------------------|
| Large repo search, long logs, broad docs | Tiny edits (cheaper to just do it) |
| Repetitive edits across many files | Tightly-coupled, shared-file changes |
| Parallel test/browser/eval runs | Judgment-sensitive debugging |
| Inventory / summarization passes | Decisions touching the frozen contract |

## Handoff packets

Write each delegated prompt as if the subagent has **zero chat context**:
- Repo path + exact objective; files/surfaces in scope, and what's explicitly out of scope.
- Evidence format to return: files, line refs, commands run, diffs, failures, uncertainties.
- Verification command or flow, and what success looks like.
- **Stop conditions:** if the code doesn't match the prompt, a command fails after one retry, or it needs out-of-scope files — stop and report, don't improvise.

## Vetting delegated work

Treat subagent reports as **leads, not facts**. Before acting on a high-impact finding, opening a PR, or saying it's done — the orchestrator reopens the cited files, confirms the line refs/failures, and reviews the final diff against the task.

Vet hardest where this repo is unforgiving:
- **THINK-05 frozen contract** — any `TransactionDto` ↔ `models.py` field rename must land in both files; never trust a subagent's "done" here without reopening both.
- **Governance rules** (ARCH-01..06, layer direction) — a subagent edit can quietly violate layering; confirm before merging.
- **Bank parser output** — wrong field type = silent DB corruption (THINK-03). Verify, don't assume.

## Already-fanned-out skills

These already delegate internally — invoke them instead of hand-rolling a workflow:
- `/arch-review` — parallel readers across layers → health report
- `/code-review ultra` — multi-agent cloud review of the branch

## Common mistakes

- **Forgetting `model` on the spawn.** The executor silently inherits the orchestrator's tier — you delegate at full price. Always set it.
- **Expecting it to switch models.** It doesn't — `/model` sets the orchestrator; this skill only governs delegation.
- **Delegating a one-liner.** Coordination cost > the edit. Just do it on the orchestrator.
- **Respawning instead of continuing.** A follow-up slice in the same area → `SendMessage` to the existing executor; don't pay the cold start twice.
- **No stop condition** → the executor widens scope and burns tokens on the wrong thing.
- **Trusting the report.** A confident summary is still a lead. Reopen the file for anything high-impact.
- **Reaching for Workflow on 2 slices.** Use parallel `Agent` calls; save Workflow for real fan-out (needs `ultracode`).

## Diagram

`assets/model-orchestrator.excalidraw` (editable) — the orchestrate → delegate-down → vet → synthesize loop.
