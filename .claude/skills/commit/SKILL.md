---
name: commit
description: Stage safe files, scan for secrets, generate a context-aware commit message, then commit (and optionally push). Triggered by /commit or /commit push.
---

# Skill: commit

Safe-commit workflow for this open-source repo. Scans staged content for sensitive data, infers a context-aware commit message from changed files and active ticket context, then commits. Pass `push` as the argument to also push to origin.

## Variants

| Invocation | Behavior |
|-----------|----------|
| `/commit` | Stage → scan → commit (no push) |
| `/commit push` | Stage → scan → commit → push |
| `/commit wip` | Quick WIP commit — message: `wip: [brief file summary]`, no push |
| `/commit amend` | Amend last commit with current staged changes (only if last commit is not on remote) |
| `/commit dry-run` | Show what would be staged + proposed commit message — no file is touched |

---

## Step 0 — Orientation

```bash
git status
git diff --stat HEAD
git log --oneline -8
```

Determine:
- Which files are modified/untracked (candidate staged files)
- Whether any ticket (PF-XXX or PF-SXXX) is inferable from branch name, recent commits, or open plan files in `.claude/plans/`
- The message style used in recent commits (ticket-prefix vs `chore:` / `feat:` / `fix:` convention)

---

## Step 1 — Build the safe-to-stage list

### 1a. Collect candidates

All tracked modified files + untracked files NOT matched by `.gitignore`.

```bash
git status --short
```

### 1b. Apply the hard-block list

**Never stage** any file matching these patterns, regardless of gitignore state:

| Pattern | Reason |
|---------|--------|
| `.env`, `.env.*` (except `.env.example`) | Credentials |
| `appsettings.Development.json` | Local Supabase JWT keys — already in .gitignore but double-check |
| `appsettings.*.json` that is NOT `appsettings.json` or `appsettings.example.json` | May contain local overrides |
| `*.local` | Machine-specific settings |
| `.claude/settings.local.json` | Machine-specific Claude permissions |
| `services/ai-service/.env` | AI service API keys |
| `supabase/.temp/`, `supabase/.branches/` | Supabase CLI local state |
| `supabase/local-setup.md` | Local paths |
| `supabase/seed/assets_seed.sql` | Personal data |
| `supabase/migrations/20260516000001_assets_seed.sql` | Personal data |
| `docs/statement-examples/` | Bank statement samples — may contain personal financial data |
| `issues.json`, `project_items.json` | GitHub API export dumps |
| `**/bin/`, `**/obj/` | Build artifacts |
| `.venv/`, `__pycache__/`, `*.egg-info/`, `build/`, `dist/` | Python artifacts |
| `node_modules/` | Frontend dependencies |
| `**/test-results/`, `**/playwright-report/` | Test artifacts |
| `.playwright-mcp/` | Playwright MCP state |

If any candidate file matches a hard-block pattern, **exclude it silently** (do not stage, do not error).

### 1c. Inline secret scan on remaining candidates

For each file that passed the block list, scan its diff (`git diff HEAD -- <file>` or full content for untracked files) for secret patterns:

| Pattern | What to look for |
|---------|-----------------|
| API keys | Strings matching `sk-`, `AKIA`, `eyJ` (JWT), `AIza`, `ghp_`, `ghs_`, `glpat-`, `xox[baprs]-` |
| Supabase service role key | Strings >40 chars that look like JWT or contain `service_role` near a base64 blob |
| Anthropic / Gemini keys | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `sk-ant-`, `AIza` in a value context |
| Passwords in code | `password\s*=\s*["'][^"']{6,}`, `postgres123`, `secret\s*=\s*["'][^"']{6,}` |
| Private keys | `-----BEGIN` lines (RSA/EC/PEM) |
| Connection strings with credentials | `postgresql://user:password@`, `Server=...;Password=` |

**If a secret pattern is found in any file:**
1. Print a warning: `⚠️  Possible secret in <file>:<line> — "<matched snippet>" — EXCLUDED from staging`
2. Remove that file from the staging list
3. Do NOT abort the whole commit — continue with the remaining safe files

**Exception:** `.env.example` files are always allowed (they contain placeholder values only — confirm no real values are present).

### 1d. Report the safe-to-stage list

Print a compact table before staging anything:

```
📦 Safe to stage (5 files):
  M  apps/frontend/src/components/Dashboard.tsx
  M  apps/api/src/PersonalFinance.Application/Services/DashboardService.cs
  M  .claude/plans/BOARD.md
  ?  apps/frontend/src/components/NewWidget.tsx
  M  .claude/skills/commit/SKILL.md

🚫 Excluded (2 files):
  appsettings.Development.json  → hard-blocked (local settings)
  apps/api/.env                 → hard-blocked (credentials)
```

If the safe list is empty, stop and say: `Nothing safe to stage. All modified files are either blocked or contain sensitive patterns.`

---

## Step 2 — Stage the safe files

```bash
git add <file1> <file2> ...
```

Stage each file individually by name — never use `git add .` or `git add -A`.

---

## Step 3 — Generate the commit message

### 3a. Infer the active ticket

Check in order:
1. Branch name: `git rev-parse --abbrev-ref HEAD` — extract `PF-\d+` or `PF-S\d+` pattern
2. Most recent commit message — does it reference a PF ticket?
3. Open plan files: `ls .claude/plans/PF-*-todo.md` — find the one with unchecked steps
4. If none found, fall back to a conventional commit prefix

### 3b. Analyse the changed files

Group staged files by area:

| Files changed in | Implies |
|-----------------|---------|
| `apps/frontend/src/` | Frontend/UI change |
| `apps/api/src/PersonalFinance.Api/` | Controller / API layer |
| `apps/api/src/PersonalFinance.Application/` | Business logic / CQRS |
| `apps/api/src/PersonalFinance.Infrastructure/` | Parsers / external services |
| `apps/api/src/PersonalFinance.Domain/` | Domain entity / event |
| `apps/api/tests/` | Test coverage |
| `services/ai-service/` | Python AI service |
| `supabase/migrations/` | Database schema change |
| `.claude/` | Developer tooling / skills / rules |
| `.claude/plans/`, `.github/` | Project housekeeping |
| `docs/` | Documentation |
| `docker-compose.yml`, `Dockerfile` | Infrastructure / container |

### 3c. Compose the message

**With an active ticket** — use ticket-prefix style matching the repo convention:
```
PF-117: <one-line summary of the intent, not the list of files>
```

**Without a ticket** — use conventional commit style:
```
feat: <what was added>
fix: <what was corrected>
chore: <housekeeping, tooling, config>
refactor: <restructuring without behavior change>
test: <test additions or fixes>
docs: <documentation only>
```

**Rules for the summary line:**
- Max 72 characters
- Present tense, imperative: "add", "fix", "update", "remove" — not "added", "fixed"
- Describe the **intent/outcome**, not the mechanics ("improve dashboard load performance" not "change three useState calls")
- If multiple areas changed, lead with the dominant one

**Optional body** (add when the why is non-obvious):
```
<blank line>
<1-3 sentences explaining motivation if not self-evident>
```

### 3d. Show the proposed message to confirm

Print the full proposed commit message before committing:

```
📝 Proposed commit message:
─────────────────────────────
PF-117: improve dashboard accuracy and refine transaction UX

Dashboard now reads from cashflow summary endpoint rather than raw
transactions, matching the data shown in the statement tab.
─────────────────────────────
Proceed? (committing in 3 seconds unless you stop me)
```

Wait briefly (proceed automatically — this is a non-interactive skill). If the user has already confirmed by invoking the skill, proceed immediately.

---

## Step 4 — Commit

```bash
git commit -m "$(cat <<'EOF'
<message here>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Always use the HEREDOC form to preserve multi-line messages.

Verify the commit succeeded:
```bash
git log --oneline -1
```

---

## Step 5 — Push (only if `push` argument was passed)

```bash
git push origin HEAD
```

Before pushing, confirm the branch is not `main`:
```bash
git rev-parse --abbrev-ref HEAD
```

If the branch IS `main`, warn and ask for explicit confirmation:
```
⚠️  You are about to push directly to main.
    This is allowed but the CI gates (dotnet build, lint, tsc) have not been verified.
    Recommend running /ci-check first.
    Proceeding with push...
```

After push, print the remote URL and branch:
```
✅ Pushed to origin/<branch>
   https://github.com/rikky-hermanto/personal-finance/tree/<branch>
```

---

## Step 6 — Final summary

```
✅ Commit complete
   Hash:    abc1234
   Message: PF-117: improve dashboard accuracy and refine transaction UX
   Files:   5 staged, 2 excluded (see above)
   Push:    ✅ origin/main  (or: — not pushed)
```

---

## Variant: `/commit wip`

Shortened flow — no secret scan detail, no body, no ticket inference. Just commit the safe files with:

```
wip: <comma-joined short names of changed areas, max 60 chars>
```

Examples:
- `wip: Dashboard.tsx, DashboardService.cs`
- `wip: frontend components, backend handlers`

Use when quickly saving progress mid-feature. Does not push.

---

## Variant: `/commit amend`

Only use if the **last commit has NOT been pushed** to the remote (verify with `git status` — "Your branch is ahead of 'origin/...' by 1 commit").

1. Run Steps 0–2 (orientation + secret scan + stage)
2. Amend with `git commit --amend --no-edit` (preserve existing message) OR regenerate the message if files from a different area were added
3. Print: `✅ Amended commit <hash>`

**Refuse** if `git log origin/HEAD..HEAD` shows 0 commits (branch is already in sync with remote — amend would modify a published commit).

---

## Variant: `/commit dry-run`

Run Steps 0–1 fully (orientation + build safe list + secret scan) but **stop before staging**.

Output:
```
🔍 Dry run — nothing staged or committed.

Would stage (5 files):
  [list]

Would exclude (2 files):
  [list with reasons]

Proposed message:
  PF-117: improve dashboard accuracy and refine transaction UX

Run /commit to proceed or /commit push to commit and push.
```

---

## Safety Constraints (always enforced, no exceptions)

1. **Never** `git add .` or `git add -A` — always add files by explicit name
2. **Never** `git push --force` unless the user explicitly types the word "force push" in their message
3. **Never** `git commit --no-verify` — hooks exist for a reason
4. **Never** commit to a branch named `main` without printing the warning in Step 5
5. **Never** stage a file whose content matches the hard-block list or inline secret patterns
6. If a secret is found in a file that the user explicitly asks to stage anyway, print: `Refused: <file> contains a likely secret at line <N>. Remove the secret before committing.` and do not stage it.

---

## .gitignore Health Check (run opportunistically)

When this skill runs, also check for common missing patterns that would cause future leaks.
If any of these are NOT in `.gitignore`, print a warning (do not auto-edit):

| Should be ignored | Why |
|------------------|-----|
| `appsettings.Development.json` | Contains local Supabase JWT keys |
| `.env` / `.env.*` | API keys and credentials |
| `.claude/settings.local.json` | Machine-specific permissions |
| `services/ai-service/.env` | AI service keys |
| `supabase/.temp/` | Supabase CLI local state |

Current `.gitignore` already covers all of the above as of 2026-05-21 — this check is a guard against future removals.
