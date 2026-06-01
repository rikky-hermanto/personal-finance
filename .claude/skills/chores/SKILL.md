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

Flag plans that are NOT STARTED and older than 30 days by checking their `Started:` date header. These may be superseded. Do not delete — report them for human decision.

---

## Category 2 — Codebase Cleanliness

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

# any import
grep -rn "^using.*;" apps/api/src/ --include="*.cs" | grep -v "// "
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

```bash
ls c:\tmp\ 2>/dev/null
git status --short | grep "^??" | grep -v ".env"
```

---

## Category 3 — Tech Debt Markers

Pull the known tech debt list from `CLAUDE.md` (the `### Known Tech Debt` section) and verify current status of each item:

| Debt item | How to verify |
|-----------|--------------|
| TypeScript strict mode disabled | `grep '"strict"' apps/frontend/tsconfig.json` |
| `IBankIdentifier` in wrong layer | Check if file is in `Infrastructure/Parsers/IBankIdentifier.cs` |
| `TransactionService.cs` missing namespace | Check first 10 lines for `namespace` |
| `ex.Message` leak in upload-preview | `grep -n "ex.Message" apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` |
| `upload-preview-new` dead endpoint | Grep for the action method |
| ILogger missing in DashboardService | `grep -n "ILogger" apps/api/src/PersonalFinance.Application/Services/DashboardService.cs` |
| ILogger missing in SpendingAnalysisService | Same grep on SpendingAnalysisService.cs |

For each item: report `STILL OPEN`, `FIXED`, or `FILE NOT FOUND`.

---

## Category 4 — Folder Structure Audit

### ARCH-02: Interfaces in wrong layer

Scan Infrastructure for interface files:

```bash
grep -rn "^public interface" apps/api/src/PersonalFinance.Infrastructure/ --include="*.cs" -l
```

Each hit is an ARCH-02 violation — the interface belongs in `Application/Interfaces/`.

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

Quick scan for outdated or vulnerable packages (no auto-update — report only):

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

### Codebase
[n] Console.Write hits → [file:line list]
[n] TODO/FIXME comments → [file:line list]
[n] Skipped tests → [file:line list]
[n] Orphaned plan files → [list]

### Tech Debt Status
STILL OPEN: TypeScript strict mode
STILL OPEN: IBankIdentifier in wrong layer
FIXED: ...

### Folder Structure
[n] ARCH-02 violations → [list]
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
- After archiving plans, always update `CLAUDE.md`'s `### Known Tech Debt` section if any items were resolved, and run `/kanban-sync`.
