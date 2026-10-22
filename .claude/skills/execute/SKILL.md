---
name: execute
description: Execute a pre-approved plan end-to-end — reads context and Affected Files, implements all unchecked steps with diagnostics, verifies acceptance criteria with real checks, batch-updates the plan, leaves code uncommitted for review. No mid-task questions.
---

# Execute — Execute a Plan File

You are a **Senior Engineer executing a pre-approved implementation plan**. The plan has already been reviewed and approved. Your job is to implement every step completely and correctly, mark each step done as you go, and verify the acceptance criteria at the end.

**You do not stop to ask questions mid-execution.** If a step is ambiguous, use your best judgment based on the plan's Approach section and the codebase you've read. The user will review the result in their git client.

**Plan-skill contract:** This skill consumes plans produced by `/plan`, which follow a fixed structure — **Objective / Acceptance Criteria / Approach / Affected Files / TODO steps**, each step carrying a `> **Why:**` rationale. The plan has already been architecturally reviewed; execute trusts its soundness and focuses on **implementation fidelity** — doing exactly what the plan says, completely. When an instruction is terse or ambiguous, disambiguate using the Approach section and the step's `> **Why:**`, not your own redesign.

---

## Arguments

`$ARGUMENTS` — the plan file to execute. Examples:
- `/execute PF-115` → searches status folders for `PF-115-*-todo.md` (fuzzy match on prefix)
- `/execute PF-115-transaction-running-balance-view.md` → exact filename in the matching status folder
- `/execute path/to/plan.md` → explicit path

If no argument given, ask which plan to execute.

---

## Pre-Flight

### Step 0a — Worktree status sync (when the work happens in a worktree)

Status is tracked in the **main checkout**, even when the code is written in a worktree: the owner watches `plans/` and `plans/BOARD.md` there. Never move a plan file or edit the board by hand; use the loop engine:

```bash
RUN="$HOME/.claude/skills/loop-run/scripts/run.mjs"
MAIN=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')   # first entry = the main checkout
```

- **Isolation requested** ("in isolated worktree", "in a worktree"), or you are in the main checkout and the plan is in `backlog/`: run `node "$RUN" start --hand --id <ID> --root "$MAIN"` first. It creates (or reuses) `.worktrees/<id>` on branch `loop/<id>`, moves the ticket to `in-progress/` in the main checkout, refreshes the board, and puts a plan copy in the worktree. Then do all work in that worktree.
- **Plan to read and update:** the copy at `<worktree>/plans/in-progress/**/<ID>-*-todo.md`, not the `backlog/` file that is still tracked in the worktree.
- **Already in `.worktrees/<id>` and the ticket is already `in-progress` in the main checkout:** nothing to start.
- **In a different worktree** (not `.worktrees/<id-lowercase>`): tracking is unavailable. Say so in the final summary; do not fake it.
- If `start --hand` refuses (slot held, ticket Blocked, not `Ready`), report the reasons and stop tracking. Do not work around them.

After the single batch plan Write at the end, run `node "$RUN" sync --id <ID> --root "$MAIN" --note "<one line: steps done, gates, what is open>"`. It copies the checkboxes to the main checkout and refreshes the board.

A hand run has no independent verifier, so the ticket **stays `in-progress`** ("implementation awaiting verification", see `plans/README.md`). Only `/loop-run` moves a ticket to `ready-to-review`. Report the ticket's folder in the final summary.

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

### Step 0.5 — Scan for cross-step dependencies

Before executing, scan the TODO steps for dependency chains: step N **consumes** a file, method, class, or command output that step M **produces**. Note these chains internally (e.g. "STEP 4 edits the service created in STEP 2").

If a prerequisite step later fails unresolvably, do **NOT** attempt its dependent steps — mark each dependent step as skipped with the chain noted (see failure-mark syntax below). Executing a dependent step against a missing prerequisite produces garbage diffs.

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

**Handling ambiguity:** If the step says "find X and replace with Y" but X doesn't exist verbatim in the file, look for the closest match using context from the `> **Why:**` and the surrounding code — but only replace it if the match is **semantically identical** to the plan's target: same intent, same signature, same dependencies. If no match exists or the semantics differ (different parameters, different behavior, different callers), do NOT guess — mark the step `[!]` with the reason and surface it in the final summary. A wrong-but-plausible edit is worse than a documented failure.

**Handling errors:** If a command fails, diagnose the error, fix the root cause, and re-run. Do NOT skip a failing step. If the failure is genuinely unresolvable (e.g., a service is not running), note it clearly and continue to the next step that does not depend on it (see Step 0.5 — dependent steps get skipped, not attempted).

### 3 — Track completion internally

After each step completes, note internally that STEP N is done (or failed/skipped with reason). **Do NOT edit the plan file between steps** — accumulate all results and write them in a single batch at the very end.

**Failure-mark syntax** (applied in the single batch Write at the end):

| Outcome | Checkbox change | Annotation under the step heading |
|---------|----------------|-----------------------------------|
| Step succeeded | `[ ]` → `[x]` | none |
| Step failed unresolvably | `[ ]` → `[!]` | `> **Failure:** [one-line reason]` |
| Step skipped (prerequisite failed) | `[ ]` → `[!]` | `> **Skipped:** prerequisite STEP N failed` |

Never mark a failed or skipped step `[x]`.

---

## Acceptance Criteria Verification

After all steps are done (or attempted), verify each acceptance criterion:

For each `- [ ]` in the **Acceptance Criteria** section, check if it is now satisfied:
- If yes: update to `- [x]`
- If no: leave as `- [ ]` and add a note below it: `  > Not met: [one-line reason]`

Do this by actually checking — read files, run commands, inspect output. Do not rubber-stamp them all as done without checking.

**Never mark an ACT met on "should work."** Run the check. If an ACT is inherently subjective (e.g. "UI looks clean"), add a verification note beneath it documenting what was actually checked:

```
- [x] Upload wizard shows clear error states
  > Verification note: read UploadWizard.tsx — error branch renders Alert with message; not visually verified
```

**Common ACT patterns** — map each criterion to a concrete verification method:

| Criterion pattern | How to verify | Pass = |
|-------------------|---------------|--------|
| "File X exists" | Read the file | readable, non-empty |
| "Tests pass" | `cd apps/api && dotnet test` (backend) · `npm run lint` / `npm run build` (frontend) · `pytest` (ai-service) | exit code 0, no failures |
| "Builds cleanly" | `cd apps/api && dotnet build PersonalFinance.slnx` | exit code 0 |
| "Controller action ≤ N lines" | read the controller, count lines in the action body | ≤ N |
| "Class X implements interface Y" | grep `class X : .*Y` | match found |
| "Endpoint returns 200" | run the relevant test, or curl against a running API only if the stack is already up | documented evidence |

**Then do a single batch update of the plan file** — use the `Write` tool to rewrite the entire plan file with all step checkbox changes (`[x]` for successes, `[!]` + annotation for failures/skips) AND all acceptance criteria checkbox changes applied at once. Do NOT use multiple Edit calls (one per checkbox) — that triggers a permission prompt for every single checkbox. One Write call = one prompt. This is the only time you touch the plan file.

---

## Owner Review Checklist (write it with the final plan Write)

Every plan this skill runs can end up in `ready-to-review/`, where the owner reviews it by hand (loop gate G3). Give the owner a step-by-step way to do that: add one section to the plan, inside the same single batch `Write` as the checkbox updates.

- **Where:** a `## ✅ Owner Review Checklist (G3)` section near the end of the plan, immediately before `## Loop Notes` (at the very end if there is no Loop Notes). Same heading level as `## 📝 Knowledge Check`; its parts are `###` headings lettered A, B, C. If the plan has a Table of Contents, add an entry for it after the last entry. If the section already exists (rework), update it instead of adding a second one.
- **What it covers, in this order:** (A) before you start: branch, services and data needed; (B) read the code: the specific files and what to look for; (C) run the tests, with the exact commands and expected counts; (D) start the stack and check it; (E) one live check per acceptance criterion that was only proven with mocks, or that the plan moved to a manual follow-up; (F) optional stretch work; (G) decide and close: what "accepted" means, and what to tell Claude so it moves the plan to `done/`.
- **Open with a state line** (what is merged or verified, and what the verifier could not check) and, if you found defects while executing, a **Known defects to confirm** paragraph naming each one with its file and why a mocked test could not catch it. Never leave a known defect out of the checklist.
- **Every item** names the command, URL or file, and what a pass looks like. No "verify it works".
- **Checkbox glyph:** write items as `- ☐`, never `- [ ]`. The loop executor gate counts `- [ ]` lines in the plan and fails the run while any are open, so real checkboxes here would fail the run. The owner ticks an item by changing `☐` to `☑`.
- **Closing step:** if the branch is merged through a pull request, tell the owner not to run `/loop-accept` (it would try to merge again) and to ask Claude to move the plan to `done/` and remove the branch and worktree instead.

---

## Cross-File Wiring Check

Before writing the final summary, verify that anything new the plan introduced is actually wired up — a class that compiles but is never referenced is a silent failure:

- New **interfaces** → grep for at least one implementing class AND one consumer (constructor injection or DI registration)
- New **commands/handlers** → grep for the `Send()`/`Publish()` call site that dispatches them
- New **services/parsers** → grep `Program.cs` (or the relevant DI extension) for the `AddScoped`/`AddSingleton` registration

If a new type has zero references or no DI registration, flag it in the final summary as a wiring gap — do not silently pass.

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

Ticket status: [folder in the main checkout, and whether `sync` ran]

Next steps:
- Review changes in your git client
- Run /ci-check before pushing
- [any step-specific follow-up noted in the plan's Notes section]
```

---

## Rules

- **Never ask permission mid-execution.** You have pre-approval to implement everything in the plan.
- **Never skip a step silently.** If you can't do it, document why.
- **Never modify the plan's content** (Objective, Approach, Acceptance Criteria wording) — only update `[ ]` → `[x]` checkboxes and add the Owner Review Checklist section.
- **Mark all steps done in a single batch at the very end** — use ONE `Write` call to rewrite the entire plan file with all checkboxes updated. Never use multiple Edit calls (one per checkbox) and never edit the plan file mid-execution.
- **If a step produces a compilation error or test failure**, fix it before moving on. The plan is your spec; the code must match it.
- **Commit nothing.** Leave all changes uncommitted for the user to review.
