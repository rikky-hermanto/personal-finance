---
id: PF-150
epic: E-001
flags: [Ready]
---

# PF-150 — Security re-audit (closes epic E-001)

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 8 of 8)
> **Sensitive:** security. Never copy names, keys or statement text into the report.
> **Planned from branch:** main

## Objective

After the other seven slices land, run the October audit again and prove the epic's goal: every finding is fixed or accepted in writing, and nothing new appears at medium severity or above. This ticket produces the evidence and the sign-off report. It changes no product code.

## Acceptance Criteria

- [ ] PF-143 to PF-149 are all in `plans/done/` (or the owner explicitly accepts running the re-audit with some still open; record which).
- [ ] A report at `ai/audits/2026-10-security-re-audit.md` (the folder already holds earlier audits) lists each of the 12 original findings with status: fixed (ticket and evidence), already closed (PF-S15 for the AI service bypassing RLS, and for `transaction_embeddings`), or accepted (row in `docs/reference/accepted-risks.md`).
- [ ] Evidence is fresh, from this run, for: `dotnet list package --vulnerable --include-transitive`, `npm audit --omit=dev`, `pip-audit`, a gitleaks scan of the working tree and history (install gitleaks locally if absent, or use the CI result for the same commit), and the name search from PF-143 returning nothing in the working tree.
- [ ] Runtime checks, run against the local stack: Grafana returns 401 without credentials; the listed ports do not answer on the LAN address; `/health` returns only a status; an upload with a wrong magic byte is rejected; an upload error body contains no exception text; a weak password is rejected by the local Auth API.
- [ ] A fresh review pass over the diff of PF-143 to PF-149 and the auth, upload and AI-chat code paths for new problems, with every finding at medium or above either fixed in a follow-up ticket or accepted in writing. The report says plainly whether anything new at medium or above was found.
- [ ] `docs/STATUS.md` and the E-001 epic note the result; no secrets or names in any file.

## Approach

Treat it as a checklist run, not a new design. Gather the commands' output into the scratchpad, summarise it in the report, and keep raw outputs out of the repository if they could contain names or keys. For the fresh review, use the `/code-review` skill at high effort on the combined diff, and the security-review skill on the auth and upload paths. Anything new goes to the owner as a proposed ticket rather than being fixed here.

## Affected Files

| File | Change |
|------|--------|
| `ai/audits/2026-10-security-re-audit.md` | Create — the report |
| `docs/reference/accepted-risks.md` | Edit — only to add any new accepted item the owner approves |
| `docs/STATUS.md` | Edit — one line with the result |
| `plans/epics/E-001-security-hardening.md` | Edit via the validator only — status changes are the owner's/loop's |

---

## TODO

### [ ] STEP 1 — Confirm the other slices are done
Check `plans/done/` for PF-143 to PF-149 and list any that are not. Stop and report if any are missing.

> **Why:** The re-audit proves the epic only if the fixes are in.

### [ ] STEP 2 — Collect fresh scan evidence
Run the three dependency audits, gitleaks (working tree and history), and the name search from PF-143. Save raw output in the scratchpad; summarise counts in the report.

> **Why:** The done-condition is clean scans or written acceptance for each remaining item.

### [ ] STEP 3 — Run the runtime checks
With the stack up, run each runtime check in the acceptance criteria and record pass or fail with the command used (no secrets in the command text).

> **Why:** Config files can say one thing while the running system does another; the audit's earlier gap was that Docker was not running.

### [ ] STEP 4 — Fresh review pass
Run `/code-review high` on the combined diff and the security review on the auth and upload paths. Triage the results into fixed, accepted, or proposed follow-up.

> **Why:** The goal is "nothing new at medium or above", which requires looking, not only re-checking the old list.

### [ ] STEP 5 — Write the report
Create `ai/audits/2026-10-security-re-audit.md` with a table of the 12 findings and their status, the scan counts, the runtime check results, and a one-sentence verdict. Add one line to `docs/STATUS.md`. Do not commit.

> **Why:** The owner reviews this at G3 to decide whether the epic is finished.

---

## Notes

- This ticket depends on PF-143 to PF-149 and must run last.
- If the report shows anything new at medium or above, the epic is not done; propose tickets to the owner instead of expanding this one.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Judgement-heavy review where a missed finding is silent.
Before you start: PF-143 to PF-149 are done and the local stack is running.

```
/execute plans/in-progress/PF-150-security-re-audit-todo.md
```

### Stop and ask if

- Any earlier slice is not done.
- A scan or review shows a high-severity finding that is exploitable now.
