---
id: PF-143
epic: E-001
flags: [Ready]
---

# PF-143 — Scrub real people's names from the category-rules export

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 1 of 8)
> **Sensitive:** security / PII. The repository is public. Do NOT write any real name into this plan, a commit message, a PR, a log, or your replies. Refer to rows by line number only.
> **Planned from branch:** main

## Objective

`docs/data/category-rules-2026-05-07.csv` ties real private people's names to loan, transfer and bill categories, and the repository is public. This ticket replaces those names with neutral placeholders so the current tree no longer exposes anyone, and records in writing that the copies already in git history are accepted (the owner decided on 2026-10-22 not to rewrite history or force-push).

## Acceptance Criteria

- [ ] No person's name remains in `docs/data/category-rules-2026-05-07.csv`; every person-keyed row uses a neutral placeholder (for example `PERSON_A`, `PERSON_B`) with the same Type and Category as before.
- [ ] The row count (183 lines including the header) and the `Keyword;Type;Category` structure are unchanged, and the file still parses as semicolon CSV.
- [ ] The same names no longer appear in any other tracked file. The audit found two more: `docs/battle-plans/PF-107-assets-management-verdict` and `plans/done/PF-107-phase-1B-balance-sheet-mvp-todo.md`. Both are scrubbed too.
- [ ] A tracked note records that the old history (first seen in commit `c77208a7`) still contains the names, that the owner accepted this on 2026-10-22, and that no history rewrite or force-push is planned. The note contains no names.
- [ ] A whole-tree search for each removed name returns nothing (searched locally, never pasted into output).
- [ ] Nothing in the app reads this file (confirmed: it is only referenced by the E-001 epic), so no test changes are needed. `dotnet test` and the Python tests are not affected.

## Approach

Edit the three tracked files in place and replace each personal name with a stable placeholder, using the same placeholder for the same person everywhere, so the loan and bill examples stay readable. Find the names by reading the CSV rows that classify as `Loan Given`, `Loan Repayment` or `Bill` whose keyword looks like a person (lines 7, 8, 9, 27, 43, 128, 139 and 169 are known; also scan the rest of the file once, including `TRANSFER OUT ...`/`BI-FAST ...` rows, because the audit found two names and the file has more). Do not rewrite history, do not delete the file, and do not touch the live 106-rule category set in the database or migrations. Record the accepted exposure in `docs/reference/accepted-risks.md` (create it if absent, as a short table: finding, decision, date, reason) so later epic slices can add their own accepted items to the same file.

## Affected Files

| File | Change |
|------|--------|
| `docs/data/category-rules-2026-05-07.csv` | Edit — replace person names in keyword cells with placeholders |
| `docs/battle-plans/PF-107-assets-management-verdict` | Edit — replace the same names with placeholders |
| `plans/done/PF-107-phase-1B-balance-sheet-mvp-todo.md` | Edit — replace the same names with placeholders (historical note only; wording otherwise unchanged) |
| `docs/reference/accepted-risks.md` | Create or Edit — add the "names in git history" accepted-risk row, no names |

---

## TODO

### [ ] STEP 1 — Build the private list of names to remove
Open the CSV and read the rows at lines 7, 8, 9, 27, 43, 128, 139 and 169, then skim the rest for any other keyword that is a person's name. Keep the list in your head or in a scratchpad file outside the repository; never write it into the repo or into a reply.

> **Why:** The audit only counted two names, but the file shows more person-like keywords. Scrubbing only the first two would leave the exposure open.

### [ ] STEP 2 — Replace the names in the CSV
Replace each name with `PERSON_A`, `PERSON_B`, and so on (same person, same placeholder). Keep the `;Type;Category` columns exactly as they are. Preserve the file's line endings and trailing newline.

```bash
git diff --stat docs/data/category-rules-2026-05-07.csv
wc -l docs/data/category-rules-2026-05-07.csv   # expect 183, as before
```

> **Why:** The Type and Category columns are the useful part of the example. Changing only the keyword keeps the file's teaching value and its structure.

### [ ] STEP 3 — Scrub the other two files
Search the tracked tree for each name using the private list from step 1 (for example `git grep -n -i -F -f <scratchpad-file>`), but only read the file names and line numbers, never the matched text. Replace the matches in `docs/battle-plans/PF-107-assets-management-verdict` and `plans/done/PF-107-phase-1B-balance-sheet-mvp-todo.md` with the same placeholders.

> **Why:** A name that survives in one doc defeats the scrub. The done plan is historical, so change only the names and nothing else in it.

### [ ] STEP 4 — Prove the tree is clean
Run the same `git grep -c -F -f` and confirm it prints nothing. Also grep `supabase/` and `apps/` for the names. If anything appears outside the three files, stop and report it by file and line number.

> **Why:** This is the acceptance proof. A silent leftover is exactly the failure this ticket exists to remove.

### [ ] STEP 5 — Record the accepted history exposure
Create or extend `docs/reference/accepted-risks.md` with one row: finding "real names in the public category-rules export, present in history since `c77208a7`"; decision "current tree scrubbed in PF-143, history not rewritten, exposure accepted"; date `2026-10-22`; reason "owner decision under E-001: a rewrite plus force-push breaks every clone and open branch". Link it from `docs/STATUS.md` only if STATUS.md already has a security or risks section.

> **Why:** The epic's done-condition says the exposure must be either fixed or consciously accepted in writing. This row is that written record.

### [ ] STEP 6 — Final check and handoff
Run `git status` and `git diff --stat`; expect exactly the four files above. Do not commit. Leave the changes for review.

> **Why:** The owner reviews at gate G3 before anything merges. Commit and push are not part of this ticket.

---

## Notes

- This repository is public. If any step would put a real name into command output, a commit message or this plan, stop and use line numbers instead.
- Other E-001 slices (upload hardening, local network, sign-in rules, dependencies, low items, third-party note, re-audit) are separate tickets; later slices add their accepted items to `docs/reference/accepted-risks.md`.
- Related: PF-127 (PII redaction of tracked files before open-sourcing) covers the same area. If PF-127 already scrubbed some of these files, STEP 3 simply finds fewer matches.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. This is a PII task in a public repo, where a leaked name in output or a missed row is a silent failure.
Before you start: none.

```
/execute plans/in-progress/PF-143-scrub-names-from-category-rules-export-todo.md
```

### Stop and ask if

- The name search finds the names in a file outside the three listed (for example `supabase/` seeds or `apps/` code), because that may mean live data, not only docs.
- A scrub would change the row count, the column structure, or a file that a test or the app reads.
