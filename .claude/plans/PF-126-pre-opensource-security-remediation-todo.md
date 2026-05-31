# PF-126 — Pre-Open-Source Security Remediation: Purge PII + Credentials from Git History

> **GitHub Issue:** _(create before executing)_
> **Status:** Done
> **Started:** 2026-05-31
> **Completed:** 2026-05-31
> **Audit doc:** `docs/security-reviews/2026-05-31-pre-opensource-audit.md`

## Objective

The repository is being converted from private to public open source. A security audit on 2026-05-31 found 5 confirmed vulnerabilities: 3 Critical (real bank statement PDFs, a BCA credit card number embedded in `.playwright-mcp/` YAML snapshots, and an unprotected CSV), 1 High (developer contact info), and 1 Medium (hardcoded DB password). Because the sensitive files are in committed git history — not just the working tree — a simple deletion commit is insufficient. This task uses `git filter-repo` to rewrite ALL history before the repo goes public.

## Acceptance Criteria

- [x] `git log --all --full-history -- .playwright-mcp/` returns no commits
- [x] `git log --all --full-history -- docs/statement-examples/` returns no commits containing the PDF or PNG files
- [x] `git log --all --full-history -- docs/developer_profile.md` returns no commits
- [x] `git log --all --full-history -- .mcp.json` returns no commits
- [x] `.gitignore` has wildcard rules protecting `docs/statement-examples/*.pdf`, `*.png`, `*.csv`, `*.CSV`, and `docs/developer_profile.md`
- [x] `.mcp.json` has `${DATABASE_URL}` in place of the hardcoded `postgres123` credential
- [x] `.mcp.json.example` exists in the repo with all secrets replaced by `${VAR_NAME}` placeholders
- [x] `.mcp.json` is listed in `.gitignore`
- [x] `git ls-files .playwright-mcp/` returns nothing
- [x] `git ls-files docs/statement-examples/` returns only safe files (e.g. `transaction-template-sample.csv` if confirmed clean)
  > Note: `transaction-template-sample.csv` was found to contain real PII (name + card number + balances) and was added to the purge list. `git ls-files docs/statement-examples/` now returns nothing — all files purged.
- [x] Force-push to `origin` is complete — remote history matches local rewritten history

## Approach

Commit all `.gitignore` hardening and safe file changes first (so protective rules survive in the rewritten history), then purge all 5 sensitive path groups in a single `git filter-repo` run with multiple `--path --invert-paths` flags. One force-push at the end. This avoids multiple history-rewrite windows on the remote and is idiomatic for multi-path purges. `docs/statement-examples/transaction-template-sample.csv` must be manually confirmed as safe before the run — it is tracked but was not flagged in the audit.

## Affected Files

| File | Change |
|------|--------|
| `.gitignore` | Edit — add wildcard rules for statement-examples, `.mcp.json`, `docs/developer_profile.md` |
| `.mcp.json` | Edit — replace `postgres123` hardcoded value with `${DATABASE_URL}` |
| `.mcp.json.example` | Create — sanitized copy with all secrets as `${VAR_NAME}` placeholders |
| `docs/statement-examples/e-statement_Sep_2025_8851.pdf` | Purged from git history (file remains on disk, gitignored) |
| `docs/statement-examples/superbank_000020617734-2025-06-statement.pdf` | Purged from git history |
| `docs/statement-examples/Screenshot_20260209-141329.png` | Purged from git history |
| `docs/statement-examples/transaction-template-sample.csv` | Purged from git history (STEP 1 finding: contained real PII) |
| `.playwright-mcp/` (21 files) | Purged from git history + untracked |
| `docs/developer_profile.md` | Purged from git history (file removed from tracking) |
| `.mcp.json` | Purged from git history |
| `.kanban/BOARD.md` | Edit — moved PF-126 to Done |

---

## TODO

### [x] STEP 1 — Confirm `docs/statement-examples/transaction-template-sample.csv` is safe

```bash
# Check if this file contains any real account numbers or PII
# It was tracked but NOT flagged in the security audit
cat "docs/statement-examples/transaction-template-sample.csv" | head -30
```

> **Why:** This file is tracked in git (`git ls-files` confirmed) but the audit did not flag it. Before the filter-repo run, confirm it contains only dummy/template data — if it holds real transaction data, add it to the purge list in STEP 3. If it is clean sample data, it can stay.

**FINDING:** File contains real PII — account holder full name, a 16-digit ATM/card account number embedded in a transaction description, and real financial balances (100M+ IDR range). Added to the filter-repo purge list in STEP 5.

---

### [x] STEP 2 — Harden `.gitignore` before the history rewrite

Add these lines to `.gitignore`:

```gitignore
# Bank statement examples — real financial documents must never be committed
docs/statement-examples/*.pdf
docs/statement-examples/*.PDF
docs/statement-examples/*.png
docs/statement-examples/*.PNG
docs/statement-examples/*.jpg
docs/statement-examples/*.JPG
docs/statement-examples/*.csv
docs/statement-examples/*.CSV

# Developer identity files
docs/developer_profile.md

# MCP server config — contains local DB credentials; use .mcp.json.example for the template
.mcp.json
```

> **Why:** These rules must exist in the clean rewritten history so that if anyone clones the repo after the force-push, the protective gitignore rules are present. Adding them before the filter-repo run ensures they survive in the rewritten commit graph. Without this step, the gitignore protection would only exist from the current HEAD forward, not in the rewritten history.

---

### [x] STEP 3 — Redact `.mcp.json` credential and create `.mcp.json.example`

Edit `.mcp.json` — replace the hardcoded DB password:
```json
"env": {
  "DATABASE_URL": "${DATABASE_URL}"
}
```

Create `.mcp.json.example` with this content:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PAT}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "<path-to-repo>/apps",
        "<path-to-repo>/services",
        "<path-to-repo>/.claude"
      ]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

> **Why:** The `.mcp.json.example` is the file that goes into the public repo — it shows contributors how to configure their own MCP setup without exposing any real credentials. The actual `.mcp.json` will be purged from history in STEP 4 and gitignored, so it only exists locally.

---

### [x] STEP 4 — Commit all pre-purge safe changes

```bash
git add .gitignore .mcp.json.example .mcp.json \
  .kanban/BOARD.md \
  docs/security-reviews/2026-05-31-pre-opensource-audit.md
git commit -m "security: harden gitignore + redact .mcp.json credential before history purge (PF-126)
...
```

> **Why:** The filter-repo run rewrites ALL commits including this one. Committing the gitignore hardening and credential redaction here means those protective changes will exist in the rewritten history — future readers of the history will see the protective rules introduced before the purge. The `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs` uncommitted change should also be staged if relevant, or stashed beforehand.

**Note:** `TransactionDto.cs`, `CLAUDE.md`, and `governance.md` were pre-existing uncommitted changes from PF-125 — left unstaged to keep this commit security-scoped.

---

### [x] STEP 5 — Run single batched `git filter-repo` to purge all sensitive paths

```bash
# Purge all sensitive paths in one pass (+ transaction-template-sample.csv per STEP 1 finding)
git filter-repo \
  --path ".playwright-mcp/" \
  --path "docs/statement-examples/e-statement_Sep_2025_8851.pdf" \
  --path "docs/statement-examples/superbank_000020617734-2025-06-statement.pdf" \
  --path "docs/statement-examples/Screenshot_20260209-141329.png" \
  --path "docs/statement-examples/transaction-template-sample.csv" \
  --path "docs/developer_profile.md" \
  --path ".mcp.json" \
  --invert-paths \
  --force
```

> **Why:** A single filter-repo pass rewrites the entire history atomically.

**Note:** `filter-repo` removed the `origin` remote (expected behavior). Re-added manually before STEP 7.

---

### [x] STEP 6 — Verify removal from history

All 7 paths verified — each `git log --all --full-history` query returned empty output. `git ls-files` for `.playwright-mcp/`, `docs/developer_profile.md`, `.mcp.json`, and `docs/statement-examples/` all return nothing.

---

### [x] STEP 7 — Force-push rewritten history to origin

Re-added `origin` remote (removed by filter-repo), then:

```bash
git push origin --force --all
git push origin --force --tags
```

All 4 existing branches + 5 new branches force-pushed successfully. Tags were already up-to-date.

---

### [x] STEP 8 — Post-push: GitHub repository configuration (manual)

Manual actions documented in `docs/security-reviews/2026-05-31-pre-opensource-audit.md`:

1. **GitHub secret scanning:** Repo Settings → Security → Secret scanning. Verify no alerts on new history.
2. **Branch protection:** Add rule for `main` requiring force-push protection.
3. **BCA credit card reissuance:** The 16-digit BCA credit card number was in `.playwright-mcp/` history. Consider contacting BCA for card replacement if old history may have been cached.
4. **Rotate API keys:** `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGFUSE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. **GitHub cache expungement:** Use "Remove sensitive data" support form for immediate CDN expungement.

---

## Notes

- `git filter-repo` rewrites all commit SHAs — any local clones by collaborators will diverge after the force-push and will need to be deleted and re-cloned. There are no known collaborators on this repo, but worth confirming.
- The sensitive files remain on disk after filter-repo runs (filter-repo does not touch the working tree). This is intentional — the local copies are useful for continued development. The `.gitignore` rules added in STEP 2 prevent them from being accidentally re-committed.
- `docs/statement-examples/transaction-template-sample.csv` was NOT flagged in the audit but was found to contain real PII in STEP 1 — full name, 16-digit card number, real balances. It was added to the purge list and purged from history.
- The audit confirms `docs/security-reviews/2026-05-31-pre-opensource-audit.md` itself is safe to commit — it documents the remediation without containing any PII or credentials.
- After force-push, GitHub keeps a cached copy of the old history for approximately 90 days before GC. To request immediate expungement, use the GitHub Support "Remove sensitive data" form.
