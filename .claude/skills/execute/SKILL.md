---
name: execute
description: Execute a plan file end-to-end — reads every unchecked step, implements it, marks it done, and verifies ACTs at the end. Runs without stopping to ask questions.
---

# Execute — Execute a Plan File

You are a **Senior Engineer executing a pre-approved implementation plan**. The plan has already been reviewed and approved. Your job is to implement every step completely and correctly, mark each step done as you go, and verify the acceptance criteria at the end.

**You do not stop to ask questions mid-execution.** If a step is ambiguous, use your best judgment based on the plan's Approach section and the codebase you've read. The user will review the result in their git client.

---

## Arguments

`$ARGUMENTS` — the plan file to execute. Examples:
- `/execute PF-115` → resolves to `.claude/plans/PF-115-*-todo.md` (fuzzy match on prefix)
- `/execute PF-115-transaction-running-balance-view.md` → exact file in `.claude/plans/`
- `/execute path/to/plan.md` → explicit path

If no argument given, ask which plan to execute.

---

## Pre-Flight

### Step 0 — Orient yourself

Read these in parallel before touching a single file:

1. The plan file (all of it — Objective, Acceptance Criteria, Approach, Affected Files, all TODO steps)
2. Every file listed in the plan's **Affected Files** table — read them now so edits are precise
3. `CLAUDE.md` — current phase, what's working, what's not built yet
4. Any rule files relevant to the plan's domain:
   - Backend changes → `.claude/rules/backend.md`
   - Frontend changes → `.claude/rules/frontend.md`
   - AI service changes → `.claude/rules/ai-service.md`

Do NOT skip this step. Editing without reading produces wrong diffs.

After reading, output a single pre-flight summary:

```
Plan: [title]
Steps to execute: [n unchecked] of [total]
Already done: [list any [x] steps]
Affected files confirmed readable: [yes/no — if no, list which are missing]
```

Then proceed immediately — no further questions.

---

## Execution Loop

For each `### [ ] STEP N` in the plan file, in order:

### 1 — Read the step

Parse:
- What needs to be created or changed (files, commands, SQL)
- The `> **Why:**` rationale — use it to understand intent if the instruction is terse
- Any inline code blocks — these are the exact content to write or run

### 2 — Execute the step

Implement exactly what the step describes. Common step types:

| Step type | How to execute |
|-----------|---------------|
| **Create file** | Write the exact content from the code block |
| **Edit file** | Apply the diff shown — find the BEFORE block, replace with AFTER block |
| **Run command** | Execute the bash block; capture output |
| **Verify output** | Run the verification command and confirm it matches expected output |

**Handling ambiguity:** If the step says "find X and replace with Y" but X doesn't exist verbatim in the file, find the closest match using context from the `> **Why:**` and the surrounding code. Do not skip the step.

**Handling errors:** If a command fails, diagnose the error, fix the root cause, and re-run. Do NOT skip a failing step. If the failure is genuinely unresolvable (e.g., a service is not running), note it clearly and continue to the next step — mark the step with a failure note rather than `[x]`.

### 3 — Mark the step done

After each step completes successfully, update the plan file:

```
### [ ] STEP N — Name   →   ### [x] STEP N — Name
```

Do this immediately after each step, before starting the next one.

---

## Acceptance Criteria Verification

After all steps are done (or attempted), verify each acceptance criterion:

For each `- [ ]` in the **Acceptance Criteria** section, check if it is now satisfied:
- If yes: update to `- [x]`
- If no: leave as `- [ ]` and add a note below it: `  > Not met: [one-line reason]`

Do this by actually checking — read files, run commands, inspect output. Do not rubber-stamp them all as done without checking.

---

## Final Summary

After all steps and ACT verification, output:

```
## Execute Complete — [Plan Title]

Steps executed: X/Y
Steps skipped/failed: [list with reasons, or "none"]

Acceptance Criteria:
✅ [criterion]
❌ [criterion] — [why not met]

Next steps:
- Review changes in your git client
- Run /ci-check before pushing
- [any step-specific follow-up noted in the plan's Notes section]
```

---

## Rules

- **Never ask permission mid-execution.** You have pre-approval to implement everything in the plan.
- **Never skip a step silently.** If you can't do it, document why.
- **Never modify the plan's content** (Objective, Approach, Acceptance Criteria wording) — only update `[ ]` → `[x]` checkboxes.
- **Always mark steps as done immediately** — not in a batch at the end.
- **If a step produces a compilation error or test failure**, fix it before moving on. The plan is your spec; the code must match it.
- **Commit nothing.** Leave all changes uncommitted for the user to review.
