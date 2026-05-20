---
name: kanban-sync
description: Sync .kanban/BOARD.md against GitHub Issues — moves closed issues to Done, reports open issues missing from the board. Eliminates the manual BOARD.md update step after every task closure.
---

# Skill: kanban-sync

Sync `.kanban/BOARD.md` with the live state of GitHub Issues. Run this after closing a ticket, or anytime the board feels stale.

## What it does

1. Fetches all **closed** issues from GitHub → finds which ones are missing from the Done section → adds them
2. Fetches all **open** issues → reports any whose PF-ID doesn't appear anywhere on the board (new tickets that haven't been triaged into a backlog section yet)
3. Updates the `Last synced` date header

It does **not** reorder rows, reformat sections, or delete anything. Additive-only patch.

---

## Step 1 — Fetch closed issues from GitHub

```bash
gh issue list \
  --repo rikky-hermanto/personal-finance \
  --state closed \
  --limit 200 \
  --json number,title
```

Parse the JSON. For each issue, extract the PF ticket ID from the title using the pattern `\[?(PF-S?\d+)\]?` (titles follow the convention `[PF-XXX] Task title`).

Build a list of closed tickets: `{ pf_id, issue_number, clean_title }` where `clean_title` strips the `[PF-XXX] ` prefix.

---

## Step 2 — Read BOARD.md

Read `.kanban/BOARD.md`. Extract the full text of the `## Done (closed)` section.

Build a set of ticket IDs already present in Done — scan for `| PF-` row patterns and the `~~PF-` strikethrough pattern used in backlog sections for completed items.

---

## Step 3 — Compute the diff

Find closed tickets (from Step 1) whose PF-ID is **not** in the Done set (from Step 2).

These are the rows to add.

If the diff is empty, print `✅ BOARD.md already up to date — nothing to add.` and stop.

---

## Step 4 — Patch BOARD.md

For each missing ticket, append a row to the Done table:

```
| PF-XXX | [#N](https://github.com/rikky-hermanto/personal-finance/issues/N) | Clean title here |
```

Insert after the last existing row in the `## Done (closed)` table — before the blank line that follows the table.

Also update the `Last synced` date:

```
**Last synced:** YYYY-MM-DD
```

---

## Step 5 — Fetch open issues and report gaps

```bash
gh issue list \
  --repo rikky-hermanto/personal-finance \
  --state open \
  --limit 200 \
  --json number,title
```

Parse PF-IDs from titles. Check which ones don't appear anywhere in BOARD.md (any section, not just Done).

Report these as untracked — print a list but **do not auto-add them** (they need to go into the right backlog section, which requires human judgment).

---

## Step 6 — Report summary

Print a compact summary:

```
📋 BOARD.md synced — 2026-05-20

Added to Done (3):
  PF-102  #84  Sync project status
  PF-108  #91  Spending analysis
  PF-114  #97  Living Garden Hero redesign

Untracked open issues (needs triage):
  PF-115  #98  Transaction Running Balance VIEW

Nothing else changed.
```

If nothing was added and nothing is untracked, print: `✅ Board is clean.`

---

## Constraints

- Never delete or reorder existing rows
- Never move tickets out of Done (closed on GH = permanent Done)
- If a closed issue has no `[PF-XXX]` pattern in its title, skip it and note it in output: `⚠️  Issue #N has no PF-ID in title — skipped`
- Tickets already in BOARD.md with `_(no issue)_` (plan-only tickets like PF-090, PF-100) are fine — they won't appear in the GH diff and should stay untouched

## When to run

- After closing a GitHub issue
- After a `/execute` completes a plan (the plan-complete hook handles BOARD.md for plan-only tickets; this handles GH-tracked ones)
- Start of a new session when BOARD.md feels stale
