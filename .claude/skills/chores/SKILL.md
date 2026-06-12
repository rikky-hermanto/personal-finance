---
name: chores
description: Use when the codebase needs housekeeping — stale plans to archive, dead files to remove, folder structure to tidy, tech debt markers to report, or any routine maintenance that accumulates between feature sprints.
---

# Skill: chores

Project housekeeping. Run between sprints or when the codebase feels cluttered. Produces a triage report, then executes each chore category you approve.

**Default:** run all chore categories. Pass a category name to limit scope.

```
/chores               # full sweep
/chores plans         # plan audit only
/chores codebase      # dead code / orphaned files only
/chores debt          # tech debt markers report only
/chores structure     # folder / namespace placement audit only
```

---

## Category 1 — Plan Audit

Scan `.claude/plans/` for `*-todo.md` files that can be archived.

### Step 0 — Path check

Verify `.claude/plans/` exists before scanning. If it doesn't, report `Plans: skipped — path not found` and move to the next category. Same rule applies to `.claude/plans/learning/` in Step 5.

### Step 1 — Collect candidates

For each `*-todo.md` in `.claude/plans/` (not already in `completed/`):

1. Count unchecked steps: lines matching `- \[ \]` or `### \[ \]`
2. Count unchecked ACs: lines matching `- \[ \]` in the **Acceptance Criteria** section
3. Read the `Status:` header line (e.g., `> **Status:** Done`)

Mark a plan **VERIFIED COMPLETE** when ALL three conditions hold:
- Status header says `Done` OR there are zero unchecked steps
- Zero unchecked ACs
- There is at least one checked step `[x]` (not an empty/template plan)

Mark a plan **POSSIBLY COMPLETE** when:
- Status header says `Done` but some checkboxes are still `[ ]` (incomplete execution)

Mark a plan **IN PROGRESS** when steps exist and some are checked but not all.

Mark a plan **NOT STARTED** when zero checked steps.

Mark a plan **MALFORMED** when it lacks a `Status:` header entirely, or its checkboxes can't be parsed (no recognizable `- [ ]` / `- [x]` lines where steps should be, garbled markdown, etc.). Do not guess a status for these — classify as MALFORMED ❌, note *why* (e.g., "no Status header", "no parseable checkboxes"), and continue with the remaining files. Malformed plans are never auto-moved; they go in the report for human repair.

**Status → report emoji mapping (use consistently in the Output Format):**

| Classification | Report line prefix |
|----------------|--------------------|
| VERIFIED COMPLETE | ✅ ARCHIVE |
| POSSIBLY COMPLETE | ⚠️ POSSIBLY DONE |
| IN PROGRESS | 🔵 IN PROGRESS |
| NOT STARTED | ⏸ NOT STARTED |
| MALFORMED | ❌ MALFORMED |

### Step 2 — Cross-check GitHub

For each VERIFIED COMPLETE plan that has a `GitHub Issue:` reference with a number:

```bash
gh issue view <number> --repo rikky-hermanto/personal-finance --json state --jq '.state'
```

If issue is `CLOSED` → confirms completion. If `OPEN` → flag for manual review before archiving.

### Step 3 — Move verified plans

For each VERIFIED COMPLETE plan (and POSSIBLY COMPLETE where issue is CLOSED):

```bash
Move-Item ".claude/plans/<file>.md" ".claude/plans/completed/<file>.md"
```

After moving, run `/kanban-sync` to keep BOARD.md in sync.

### Step 4 — Report stale plans

Flag plans that are NOT STARTED and older than 30 days. How to determine age:

1. Read the plan's `> **Started:**` header line and extract the date (e.g., `> **Started:** 2026-01-15`).
2. If no `Started:` header exists, fall back to file modification time:
   ```powershell
   (Get-Item ".claude/plans/<file>.md").LastWriteTime.ToString("yyyy-MM-dd")
   ```
3. Compare that date against today's date **yourself** (you know today's date from context) — do not script fragile shell date arithmetic. If the gap is more than 30 days, flag the plan as stale: `⏸ NOT STARTED: PF-XXX (started 2026-01-15 — 45 days stale)`.

Stale plans may be superseded. Do not delete — report them for human decision.

### Step 5 — Learning plans (`.claude/plans/learning/`)

Scan `.claude/plans/learning/` too (skip with `skipped — path not found` if absent), but apply **different rules** — learning plans (PF-AIxxx) track the 90-day AI learning path and live longer than feature plans:

- Archive a learning plan to `completed/` only when **both** hold: its GitHub issue is `CLOSED` **and** all checkboxes are done. Never archive on checkboxes alone.
- Flag any learning plan untouched for more than 90 days (same age logic as Step 4 — `Started:` header or file mtime, compared by you) as "review for relevance" — report only, never move.

---

## Category 2 — Codebase Cleanliness

**Path check first:** verify `apps/api/src/`, `apps/frontend/src/`, and `services/` exist before scanning. For any missing path, report `skipped — path not found` for the affected scans instead of silently producing nothing.

### Dead code markers

Scan the codebase for patterns that signal dead or problematic code:

```bash
# Console.Write (CODE-05 violation)
grep -rn "Console\.Write" apps/api/src/ --include="*.cs"

# TODO / FIXME / HACK comments
grep -rn "TODO\|FIXME\|HACK\|XXX" apps/api/src/ apps/frontend/src/ services/ --include="*.cs" --include="*.ts" --include="*.tsx" --include="*.py"

# Skipped tests (TEST-04 / TEST-01)
grep -rn 'Fact(Skip' apps/api/tests/ --include="*.cs"

# Dead experimental endpoints (known: upload-preview-new)
grep -rn "upload-preview-new\|experimental" apps/api/src/ --include="*.cs"
```

Report each hit with file:line. Do not auto-delete — output a triage list.

### Orphaned plan files

Files in `.claude/plans/` that are not `*-todo.md` and not in `completed/`:

```bash
ls .claude/plans/ | grep -v "todo\.md$" | grep -v "completed" | grep -v "supabase-implementation"
```

Brainstorming files (e.g., `PF-114-journey-gamification-brainstroming.md`) are expected — flag them as "review for archival" rather than auto-removing.

### Build artifacts in source

Look for binary or generated files that shouldn't be tracked:

```bash
git ls-files --error-unmatch "*.user" "*.suo" ".vs/" 2>/dev/null
git ls-files | grep -E "\.(user|suo|DotSettings\.user)$"
```

### Temp / scratch files

Primary check — untracked files in the repo:

```bash
git status --short | grep "^??" | grep -v ".env"
```

Optional scratch-folder check (guarded — `c:\tmp` may not exist; run via PowerShell, not bash):

```powershell
if (Test-Path 'C:\tmp') { Get-ChildItem 'C:\tmp' | Select-Object Name, LastWriteTime } else { Write-Output 'skipped — C:\tmp not found' }
```

---

## Category 3 — Tech Debt Markers

**Do NOT rely on a hardcoded debt list — it goes stale.** Extract the current list at run time:

1. **Path check:** verify `docs/STATUS.md` and `CLAUDE.md` exist. If either is missing, report `skipped — path not found` for that source.
2. Read the `## Known Tech Debt` section from `docs/STATUS.md` — this is the authoritative list.
3. Read the `## Known Gotchas` section from `CLAUDE.md` and merge in any items not already covered.
4. For **each item found in those docs**, devise a targeted verification — usually a grep against the file(s) the item names, or a quick read of the file's first lines.
5. Report each item as one of:
   - `STILL OPEN` — the grep/read confirms the debt still exists
   - `FIXED` — the codebase no longer shows the problem → **recommend removing the item from docs/STATUS.md / CLAUDE.md** (report only; doc edits happen after user confirmation)
   - `FILE NOT FOUND` — the file the item references no longer exists (debt may be obsolete; flag for human review)

**Illustrative examples only** (the actual checks must be derived from whatever the docs list *today* — do not treat these as the debt list):

```bash
# Example: "TypeScript strict mode disabled" → check the compiler flag
grep '"strict"' apps/frontend/tsconfig.json apps/frontend/tsconfig.app.json

# Example: "TransactionService.cs missing namespace" → check for a namespace declaration
head -10 apps/api/src/PersonalFinance.Application/Services/TransactionService.cs | grep "namespace"

# Example: "Service X missing ILogger" → check the constructor injects it
grep -n "ILogger" apps/api/src/PersonalFinance.Application/Services/<ServiceNamedInDocs>.cs
```

---

## Category 4 — Folder Structure Audit

**Path check first:** verify `apps/api/src/PersonalFinance.Infrastructure/` and `apps/frontend/src/` exist. For any missing path, report `skipped — path not found` for the affected scans.

### ARCH-02: Interfaces in wrong layer

Scan Infrastructure for interface files:

```bash
grep -rn "^public interface" apps/api/src/PersonalFinance.Infrastructure/ --include="*.cs" -l
```

**Known intentional placements (do NOT report as violations):**

- `Infrastructure/Parsers/IBankSignature.cs` — deliberately lives in Infrastructure as part of the PF-124 Chain of Responsibility registry (`BankIdentifier`). It is an internal detail of the parser subsystem, not a cross-layer contract; the cross-layer contracts (`IBankStatementParser`, `IBankIdentifier`) correctly live in `Application/Interfaces/`.

**Rule:** flagged hits require manual review before reporting as violations — check git history (`git log --follow <file>`) and CLAUDE.md / `.claude/plans/BOARD.md` for an intentional-placement rationale (e.g., a PF ticket) before listing a hit as an ARCH-02 violation. Report confirmed-intentional hits separately as "excluded (intentional)".

### ARCH-03: Namespace vs physical path mismatch

```bash
grep -rn "namespace PersonalFinance\.Application" apps/api/src/PersonalFinance.Infrastructure/ --include="*.cs"
```

Each hit is an ARCH-03 violation.

### Frontend: files outside conventions

```bash
# Pages outside pages/
find apps/frontend/src -name "*Page.tsx" -not -path "*/pages/*"

# API clients outside api/
find apps/frontend/src -name "*Api.ts" -not -path "*/api/*"
```

---

## Category 5 — Dependency Health

**Optional / best-effort category.** Quick scan for outdated packages (no auto-update — report only). Verify each directory exists first (`apps/api`, `apps/frontend`, `services/ai-service`) and report `skipped — path not found` for missing ones. If a tool isn't available (e.g., pip outside the venv) report `skipped — tool unavailable` rather than failing the sweep:

```bash
# .NET packages
cd apps/api && dotnet list package --outdated 2>/dev/null | head -30

# Frontend packages
cd apps/frontend && npm outdated 2>/dev/null | head -20

# Python packages
cd services/ai-service && pip list --outdated 2>/dev/null | head -20
```

---

## Output Format

Print a structured report before making any changes:

```
## Chores Report — YYYY-MM-DD

### Plans (X candidates)
✅ ARCHIVE: PF-XXX — all steps done, issue #N closed
⚠️  POSSIBLY DONE: PF-XXX — status=Done but 2 unchecked steps
🔵 IN PROGRESS: PF-XXX — 4/9 steps complete
⏸  NOT STARTED: PF-XXX (started 2026-01-15 — 45 days stale)
❌ MALFORMED: PF-XXX — no Status header / unparseable checkboxes

### Codebase
[n] Console.Write hits → [file:line list]
[n] TODO/FIXME comments → [file:line list]
[n] Skipped tests → [file:line list]
[n] Orphaned plan files → [list]

### Tech Debt Status
(one line per item extracted from docs/STATUS.md + CLAUDE.md at run time)
STILL OPEN: <item> — <evidence file:line>
FIXED: <item> — recommend removing from docs
FILE NOT FOUND: <item> — referenced file gone, flag for review

### Folder Structure
[n] ARCH-02 violations → [list] (after manual review; intentional placements listed as "excluded (intentional)")
[n] ARCH-03 violations → [list]

### Dependencies
[summary of outdated packages]
```

**Then ask:** "Proceed with archiving N plans? (yes/no)" before moving any files.

---

## Rules

- **Never delete plan files** — only move to `completed/`. Deletion requires explicit user instruction.
- **Never auto-fix tech debt** — report only. Tech debt fixes belong in their own PF ticket.
- **Never touch `src/components/ui/`** — shadcn/ui managed files.
- **Never commit** — leave all changes (moves, edits) uncommitted for user review.
- **One plan move at a time is fine** — no need to batch into a single git operation.
- After archiving plans, recommend updates to `docs/STATUS.md`'s `## Known Tech Debt` section (and `CLAUDE.md`'s `## Known Gotchas`) if any items were resolved — apply only after user confirmation — and run `/kanban-sync`.
