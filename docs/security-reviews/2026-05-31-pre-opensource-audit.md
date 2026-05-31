# Security Review — Pre-Public Open Source Audit

**Date:** 2026-05-31
**Scope:** All tracked and untracked files at time of review
**Trigger:** Repository being converted from private to public open source
**Status:** REMEDIATED — 2026-05-31
**Remediation:** PF-126 — git filter-repo history rewrite + force-push to origin

---

## Executive Summary

6 confirmed vulnerabilities found across 3 severity levels (1 additional finding discovered during remediation execution — see CRITICAL-4). All 6 have been remediated via a single `git filter-repo` history rewrite and force-push. The sensitive files remain on disk (gitignored) for local dev use.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| CRITICAL-1 | Critical | Real bank statement PDFs + screenshot tracked in git history | ✅ Purged from history |
| CRITICAL-2 | Critical | `.playwright-mcp/` YAML snapshots with credit card number + full name tracked in git | ✅ Purged from history |
| CRITICAL-3 | Critical | Real BCA bank statement CSV unprotected by `.gitignore` | ✅ Gitignore wildcard added |
| CRITICAL-4 | Critical | `docs/statement-examples/transaction-template-sample.csv` contained real PII (name + card number + balances) — NOT flagged in initial audit but discovered in STEP 1 verification | ✅ Purged from history |
| HIGH-1 | High | `docs/developer_profile.md` with real name + phone + email tracked in git | ✅ Purged from history |
| MEDIUM-1 | Medium | Hardcoded DB password in `.mcp.json` tracked in git | ✅ Redacted + purged + gitignored |

### Post-Remediation Manual Actions Required

- [ ] **GitHub secret scanning:** Repo Settings → Security → Secret scanning. Verify no alerts on new history.
- [ ] **Branch protection:** Settings → Branches → Add rule for `main` requiring force-push protection.
- [ ] **BCA credit card reissuance:** The 16-digit BCA credit card number was in `.playwright-mcp/` YAML history. If old history was ever cached/cloned before force-push, consider contacting BCA for card replacement.
- [ ] **Rotate API keys:** `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGFUSE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are gitignored but consider rotating before going fully public.
- [ ] **GitHub cache expungement:** GitHub keeps old history cached ~90 days. Use "Remove sensitive data" form for immediate expungement.

---

## CRITICAL-1: Real Bank Statement PDFs and Screenshot Tracked in Git History

**Files:**
- `docs/statement-examples/e-statement_Sep_2025_8851.pdf`
- `docs/statement-examples/superbank_000020617734-2025-06-statement.pdf`
- `docs/statement-examples/Screenshot_20260209-141329.png`

**Severity:** Critical
**Category:** Financial PII — real bank statements in git history
**Confidence:** 10/10

**Description:** Three real bank statement files are actively tracked in git commits `bb7b28bf` (PF-012) and `bf1c9d02`. The filenames contain account number fragments (`8851`, `000020617734`). The files contain full transaction histories, account holder name, account numbers, and balances. No `.gitignore` rules protect `.pdf` or `.png` files in this directory.

**Exploit Scenario:** Making the repository public immediately exposes 2+ months of real personal financial transaction history to anyone who clones the repo, runs `git log`, or browses GitHub. These files exist permanently in git history — deleting them in a new commit is insufficient.

**Remediation:**
```bash
# Purge each file from all history
git filter-repo --path docs/statement-examples/e-statement_Sep_2025_8851.pdf --invert-paths
git filter-repo --path "docs/statement-examples/superbank_000020617734-2025-06-statement.pdf" --invert-paths
git filter-repo --path docs/statement-examples/Screenshot_20260209-141329.png --invert-paths

# Add gitignore protection
echo "docs/statement-examples/*.pdf" >> .gitignore
echo "docs/statement-examples/*.png" >> .gitignore
echo "docs/statement-examples/*.jpg" >> .gitignore
```

---

## CRITICAL-2: `.playwright-mcp/` Snapshots with Credit Card Number and Full Name Tracked in Git

**Directory:** `.playwright-mcp/` — 19 YAML files and 2 PNGs currently tracked

**Severity:** Critical
**Category:** Financial PII / Payment card data in git history
**Confidence:** 10/10

**Description:** The `.playwright-mcp/` directory was added to `.gitignore`, but this is ineffective because 21 files were already committed before the ignore rule was added. Git does not retroactively untrack committed files. The tracked YAML files are DOM snapshots captured while the live app displayed real financial data. Confirmed present in tracked files:

- Full legal name in dozens of transaction descriptions
- **16-digit BCA credit card number** in two tracked YAML files — embedded in a transaction table row
- Real IDR transaction amounts including a Rp 50,000,000 wire transfer
- Running account balances

**Exploit Scenario:** Publishing the repo exposes payment card data that could be used for fraud. The credit card number combined with the account holder's name (also present) satisfies partial card-not-present attack requirements.

**Remediation:**
```bash
# Purge entire directory from all history
git filter-repo --path .playwright-mcp/ --invert-paths

# Untrack any remaining files
git rm -r --cached .playwright-mcp/

# Verify removal
git log --all --full-history -- ".playwright-mcp/"

# Force-push rewritten history
git push origin --force --all
```

> **Additional action:** Consider reporting the card number to the issuing bank for precautionary reissuance before going public.

---

## CRITICAL-3: Real BCA Bank Statement CSV Unprotected by `.gitignore`

**File:** `docs/statement-examples/[account-holder]_[account-number]_feb.CSV` *(untracked but unprotected — filename contained account holder abbreviation + account number fragment)*

**Severity:** Critical
**Category:** Financial PII — unprotected untracked file, one `git add .` away from exposure
**Confidence:** 10/10

**Description:** This file is currently untracked (`??` in `git status`) but has no `.gitignore` protection. The filename contains an account identifier. The file content includes:

- Real BCA account number (redacted from this doc)
- Full legal name
- Complete February transaction history including a Rp 50,000,000 stock investment transfer
- BCA credit card number embedded in a payment description
- BPJS health insurance member number
- Phone number embedded in a Telkomsel transfer description
- Opening and closing account balances

The existing `.gitignore` only protects `docs/statement-examples/Cashflow 2024 2025.csv` by exact name — a wildcard rule is needed.

**Remediation:** Add to `.gitignore` immediately:
```gitignore
docs/statement-examples/*.CSV
docs/statement-examples/*.csv
docs/statement-examples/*.pdf
docs/statement-examples/*.png
docs/statement-examples/*.jpg
```

---

## HIGH-1: `docs/developer_profile.md` Contains Real PII — Tracked in Git

**File:** `docs/developer_profile.md`

**Severity:** High
**Category:** PII — personal contact information in tracked file
**Confidence:** 10/10

**Description:** This file is actively tracked in git and contains:
- Full legal name
- Real email address
- Real Indonesian mobile phone number — the same number that appears in Telkomsel payment descriptions in the bank statements, making cross-referencing trivial

Other CV files in `docs/` (`cv_rikkyhermanto.md`, etc.) are individually gitignored — `developer_profile.md` was accidentally missed in that sweep.

**Exploit Scenario:** Publishing the repo exposes personal contact information to scrapers, OSINT tools, and spam/phishing campaigns. Combined with the financial data in other tracked files, this creates a complete personal dossier.

**Remediation:**
```bash
git rm --cached docs/developer_profile.md
echo "docs/developer_profile.md" >> .gitignore
git filter-repo --path docs/developer_profile.md --invert-paths
```

---

## MEDIUM-1: Hardcoded Database Password in `.mcp.json` — Tracked in Git

**File:** `.mcp.json`

**Severity:** Medium
**Category:** Credential — hardcoded DB connection string
**Confidence:** 8/10

**Description:** `.mcp.json` is tracked in git and contains:
```json
"DATABASE_URL": "postgresql://postgres:postgres123@localhost:5432/personal_finance"
```

This is a local dev credential already flagged as a governance violation in `SEC-01` of the project rulebook. While not a production secret, it hardcodes the full internal connection string (host, port, database name, username, password) and will trigger GitHub secret scanning and tools like `gitleaks` after going public.

**Remediation:**
```bash
# Replace hardcoded value with env var reference in .mcp.json
# "DATABASE_URL": "${DATABASE_URL}"

# Gitignore the file, provide an example template
echo ".mcp.json" >> .gitignore
cp .mcp.json .mcp.json.example
# Redact secrets in .mcp.json.example

# Purge from history
git filter-repo --path .mcp.json --invert-paths
```

---

## Remediation Priority Order

| Priority | Action | Command | Risk if Skipped |
|----------|--------|---------|-----------------|
| 1 | Purge `.playwright-mcp/` from git history | `git filter-repo --path .playwright-mcp/ --invert-paths` | Credit card number publicly exposed |
| 2 | Purge PDF/PNG bank statements from git history | `git filter-repo` per file | Full financial transaction history exposed |
| 3 | Add wildcard gitignore for `docs/statement-examples/` | Add `*.pdf *.png *.csv *.CSV` rules | Untracked CSV committed on next `git add .` |
| 4 | Purge `docs/developer_profile.md` from git history | `git filter-repo --path docs/developer_profile.md --invert-paths` | Real name + phone + email permanently public |
| 5 | Remove hardcoded password from `.mcp.json` + gitignore | Replace value + `git filter-repo` | Persistent secret scanner alerts |
| 6 | Force-push rewritten history | `git push origin --force --all` | History rewrite not published |

> **Note on git history rewrite:** Steps 1–5 all modify history. Batch them into a single `git filter-repo` session before force-pushing, to avoid multiple force-pushes. Coordinate with any collaborators first.

---

## Files Reviewed — No Issues Found

The following files from the current `git status` are clean and safe to push:

| File | Verdict |
|------|---------|
| `services/ai-service/.env.example` | Safe — all placeholder values |
| `services/ai-service/app/config.py` | Safe — reads from env vars only |
| `services/ai-service/app/main.py` | Safe |
| `services/ai-service/app/providers/anthropic.py` | Safe — API key injected via constructor |
| `services/ai-service/app/providers/gemini.py` | Safe — API key injected via constructor |
| `services/ai-service/app/observability.py` | Safe |
| `apps/api/src/.../TransactionDto.cs` | Safe — DTO schema only |
| `.kanban/BOARD.md` | Safe |
| `mentor/progress.md` | Safe |
| `.claude/plans/*.md` | Safe — planning docs, no secrets |

---

## Notes on `.env` Files

Real API keys (Gemini, Langfuse, Supabase service role) exist in local `.env` files. These are correctly gitignored and will not be committed. However, since these keys have been used in the running application, consider rotating them before going fully public as a precaution.
