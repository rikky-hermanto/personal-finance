---
id: PF-147
epic: E-001
flags: []
---

# PF-147 — Fix vulnerable dependencies in shipped code, accept the rest in writing

> **GitHub Issue:** _(create when scheduling)_
> **Status:** Done
> **Started:** 2026-10-22 (accepted 2026-10-22)
> **Epic:** E-001 (slice 5 of 8)
> **Sensitive:** security, plus a risk of breaking the AI chat agents.
> **Planned from branch:** main

## Objective

The 2026-10-15 audit found known vulnerabilities in three package sets. This ticket fixes what actually ships to users or runs in production, and writes a one-line reason for each advisory it deliberately leaves. The owner decided on 2026-10-22: fix shipped code, accept build-time-only npm advisories in writing.

## Acceptance Criteria

- [x] **.NET:** `dotnet list package --vulnerable --include-transitive` reports no high-severity item for shipped projects. `Microsoft.OpenApi` (advisory GHSA-v5pm-xwqc-g5wc) is raised to a fixed version, either by upgrading `Microsoft.AspNetCore.OpenApi` or by adding an explicit `Microsoft.OpenApi` reference at the fixed version. `dotnet build` and `dotnet test` pass.
  > Verification note: `Microsoft.AspNetCore.OpenApi` 10.0.0 → 10.0.13 resolves `Microsoft.OpenApi` 2.12.2 (fixed in 2.7.5). The scan reports no vulnerable packages in any project. Tests: 431 passed, 0 failed, 9 skipped, run in the clean worktree.
- [x] **npm (browser):** `react-router-dom` (and its `@remix-run/router` dependency) is upgraded to a fixed version within the 6.x line used by the app, with routes unchanged. `npm run lint`, `npx tsc --noEmit`, `npm run build` and the existing unit tests pass.
  > Verification note: `react-router-dom` 6.30.6, `@remix-run/router` 1.23.4. Lint 0 errors (9 existing warnings), `tsc` clean, build passes, `test:desk` 12 passed, `test:macro` 26 passed. The high-severity `@remix-run/router` XSS/open-redirect advisories are cleared. Two moderate `react-router` advisories remain that are fixed only in 7.x; recorded in `accepted-risks.md`. Routes were not clicked through in a browser.
- [x] **npm (build-time):** every remaining `npm audit --omit=dev` finding that only runs at build time (for example `postcss`, `tailwindcss`, `micromatch`, `braces`) is listed in `docs/reference/accepted-risks.md` with package, advisory, why it cannot reach users, and the date, one line each. If `npm audit fix` (without `--force`) clears some safely, do that first.
  > Verification note: `npm audit fix` crashes inside npm ("Cannot read properties of null (reading 'edgesOut')"), so targeted `npm update` was used instead. `npm audit --omit=dev` went from 20 findings to 2 (both `react-router`, documented). `tailwindcss-animate` was mis-filed under `dependencies` and moved to `devDependencies`. Dev-only findings from plain `npm audit` are also listed.
- [x] **Python:** the production AI service no longer depends on the vulnerable `langgraph`, `langgraph-checkpoint`, `langgraph-sdk`, `langchain-core` and `langchain-anthropic` versions, OR each version that cannot be upgraded is listed in `accepted-risks.md` with a concrete reason (for example "upgrade breaks the ragas evaluation pin; eval-only, not in the production image"). `pip-audit` output is recorded in the plan notes.
  > Verification note: took the second branch. All five are accepted with a concrete reason (the 1.x line needs `langchain-google-genai` 4.x, which breaks `chat_model_factory.py`). `pip-audit` before and after is in the Execution Record below.
- [x] The full Python suite (`pytest`, mocked LLM only) passes after any upgrade, including `test_advisor_agent.py`, `test_categorizer_agent.py` and `test_agent_owner_scope.py`. Chat and agent behaviour is unchanged.
  > Verification note: 358 passed in a fresh venv built from the final `pyproject.toml` (`pip install -e ".[dev]"`, no eval extra). No agent code was changed.
- [x] No new `--force`, `--legacy-peer-deps` or version-ignoring flags are introduced to make installs pass.
  > Verification note: none used.

## Approach

Treat each ecosystem as its own small change so that a failure in one does not block the others. Start with the two low-risk ones (.NET and `react-router-dom`). For Python, the repo has a documented pin (`langgraph>=0.2,<1.0` and the `ragas` stack) because moving to langgraph 1.x forces `langchain-core` 1.x, which breaks the evaluation tooling. First split the dependencies into runtime (production image) and eval-only (ragas, `langchain-openai`, `langchain-community`) if they are not already separate, then try the runtime upgrade in isolation. If the upgrade cannot be made green without rewriting agent code, stop at "accepted with a written reason" rather than rewriting the agents in this ticket; open a follow-up note instead.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj` (or `Directory.Packages.props` / `Directory.Build.props`) | Edit — fixed OpenApi version |
| `apps/frontend/package.json`, `package-lock.json` | Edit — `react-router-dom` upgrade; safe `npm audit fix` results |
| `services/ai-service/pyproject.toml` (and lock or requirements files, if present) | Edit — runtime vs eval split and version bumps, if feasible |
| `services/ai-service/app/` agent modules | Edit only if a version bump forces an API change; keep to the minimum |
| `docs/reference/accepted-risks.md` | Edit — one row per accepted advisory (file created in PF-143; create if absent) |

---

## TODO

### [x] STEP 1 — Take a baseline
```bash
cd apps/api && dotnet list PersonalFinance.slnx package --vulnerable --include-transitive
cd ../frontend && npm audit --omit=dev
cd ../../services/ai-service && .venv/Scripts/python.exe -m pip_audit
```
Save the three outputs to the scratchpad. If `pip-audit` is missing, install it in the venv only.

> **Why:** Advisory lists change daily. Work from today's output, not the 2026-10-15 numbers in the epic.

### [x] STEP 2 — .NET fix
Raise `Microsoft.OpenApi` to the fixed version named in the advisory (explicit reference if the parent package does not pull a fixed one). Re-run the vulnerable scan, `dotnet build` and `dotnet test`.

> **Why:** It is a transitive dependency, so the smallest safe fix is an explicit minimum version. Keep `TreatWarningsAsErrors` clean (CI-02).

### [x] STEP 3 — Browser fix
Upgrade `react-router-dom` within the 6.x line to the fixed release. Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:desk` and `npm run test:macro`, then open the app and click through `/journey`, `/cashflow`, `/assets`, `/investment` and `/settings` to confirm routing still works.

> **Why:** This is the only advisory in code that ships to the browser, so it is the one that matters most.

### [x] STEP 4 — Build-time npm advisories
Run `npm audit fix` (never `--force`). For what remains, confirm each package is only used by the build or dev tooling (`npm ls <package>` shows it under devDependencies), then add one row each to `docs/reference/accepted-risks.md`.

> **Why:** Build-time advisories need a human-readable reason, not silence; otherwise they come back as unexplained red in every future audit.

### [x] STEP 5 — Python runtime upgrade attempt
In a scratch copy of the venv (or a branch of the lock file), upgrade `langgraph`, `langgraph-checkpoint`, `langgraph-sdk`, `langchain-core` and `langchain-anthropic` to the fixed releases. Keep the eval-only packages in a separate optional group so the production image does not install `ragas` and its pins. Run the full `pytest` suite. If tests pass with only small import-path fixes, keep the upgrade.

> **Why:** The comments in `pyproject.toml` show the last upgrade attempt cascaded into ragas. Isolating eval-only packages is the cheapest way to remove that coupling without touching agent logic.

### [x] STEP 6 — Decide or accept
If STEP 5 is green, finish it. If it needs agent rewrites, revert it and add accepted-risk rows naming each package, the advisory, why it is not exploitable in this deployment (for example, only called with trusted internal inputs, or in an eval-only group), and "revisit when the AI service is deployed". Do not rewrite agent code in this ticket.

> **Why:** The owner chose "fix shipped code, accept the rest". An unreviewed rewrite of the chat agents is a larger risk than the advisory it removes.

### [x] STEP 7 — Final scans and handoff
Re-run the three audits and paste the before-and-after counts into the plan notes. Run `git diff --stat`. Do not commit.

> **Why:** The epic's done-condition is "clean, or each remaining item accepted in writing". The before-and-after numbers prove it.

---

## Notes

- Mixed concerns are the main risk here. If a step fails, revert only that ecosystem's changes; the other two should still be deliverable.
- `npm audit --omit=dev` counts build tools listed under `dependencies`; check whether the Vite/Tailwind packages are mis-filed before accepting them.
- Related: PF-S15's Python code is the main consumer of `langgraph`; its agent tests are the safety net.

## Execution Record (2026-10-22)

| Scan | Before | After |
|------|--------|-------|
| `dotnet list package --vulnerable` | 1 high (`Microsoft.OpenApi` 2.0.0, in Api and Tests) | none |
| `npm audit --omit=dev` | 20 (17 high, 3 moderate) | 2 moderate (`react-router`, fixed only in 7.x, accepted) |
| `pip-audit` (fresh venv from final `pyproject.toml`) | 131 findings in 23 packages (stale dev venv incl. ragas stack) | 25 findings in 8 packages: the langchain/langgraph set and the venv-bootstrap `setuptools`, all accepted |

Findings worth knowing:

- Production code (`app/services/advisor.py`) imports `langfuse.langchain`, which needs the `langchain` package. It used to be installed only through the ragas stack, so a `pip install .` image would have failed on that import. `langchain>=0.3,<1.0` is now declared explicitly in `pyproject.toml`.
- `npm audit fix` crashes inside npm; targeted `npm update` and `npm install` were used.
- The Python 1.x upgrade was tried and reverted: `langchain-google-genai` 4.x drops `google.api_core`, which `chat_model_factory.py` imports. That is an agent rewrite, so it is out of scope here.
- Tracking: `start --hand` refused (slot 1 held by PF-AI009 until its G3 review). The work is on branch `fix/pf-147-vulnerable-deps` in `.worktrees/pf-147`. This plan is still in `backlog/` and the board was not updated; `sync` was not run. Nothing is committed.
- Follow-ups to consider: constrain quest/insight deeplinks to paths starting with a single `/`; a ticket to port `chat_model_factory.py` to `langchain-google-genai` 4.x and then to langgraph 1.x; a React Router 7 migration.

## ✅ Owner Review Checklist (G3)

State: .NET, npm and Python changes are done in `.worktrees/pf-147` and verified by commands (build, lint, tsc, unit tests, 358 Python tests, three audits). Not verified: routing in a real browser, and any live AI chat run.

**Known defects to confirm:** (1) `react-router` still carries two moderate advisories fixed only in 7.x (`apps/frontend/package.json`); a mocked test cannot show whether any in-app link takes an unvetted path. (2) The langchain/langgraph set stays on old versions because the Google chat adapter (`services/ai-service/app/agents/chat_model_factory.py`) cannot move to 4.x without a rewrite.

### A. Before you start
- ☑ `cd .worktrees/pf-147 && git status` shows branch `fix/pf-147-vulnerable-deps` with 5 changed files (csproj, `package.json`, `package-lock.json`, `pyproject.toml`, `docs/reference/accepted-risks.md`).
- ☑ No services are needed for A–C; D needs `npm start`.

### B. Read the code
- ☑ `git diff` on `PersonalFinance.Api.csproj`: only `Microsoft.AspNetCore.OpenApi` 10.0.0 → 10.0.13.
- ☑ `git diff apps/frontend/package.json`: `react-router-dom` `^6.30.3`; `tailwindcss-animate` moved to devDependencies.
- ☑ `git diff services/ai-service/pyproject.toml`: langgraph bounds unchanged, `langchain>=0.3,<1.0` added, ragas stack under a new `eval` extra.
- ☑ `docs/reference/accepted-risks.md`: each row names the package, advisory, reason and date.

### C. Run the tests
- ☑ `cd apps/api && dotnet test PersonalFinance.slnx` → 431 passed, 0 failed, 9 skipped.
- ☑ `cd apps/frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build && npm run test:desk && npm run test:macro` → 0 lint errors, 12 and 26 tests pass.
- ☑ `cd services/ai-service && pip install -e ".[dev]" && pytest` → 358 passed.
- ☑ `dotnet list PersonalFinance.slnx package --vulnerable --include-transitive` → no vulnerable packages; `npm audit --omit=dev` → 2 moderate (`react-router`).

### D. Start the stack and check it
- ☑ `npm start`, open http://localhost:8080, sign in, and click `/journey`, `/cashflow`, `/assets`, `/investment`, `/settings`: each loads and the sidebar highlights correctly.
- ☑ On `/journey`, click a quest card: it navigates to an in-app page.

### E. Live checks for things only proven with mocks
- ☑ Send one question in AI chat and ask for an advisor answer: the reply streams and no import error appears in the AI service log (this exercises `langfuse.langchain`).

### F. Optional stretch
- ☑ Add a guard so `actionDeeplink`/`actionPath` must start with a single `/`.

### G. Decide and close
- ☑ Accepted means: sections A–E pass and you are happy with the accepted-risk rows. Tell Claude "PF-147 accepted"; it will commit, merge the branch, move the plan to `done/` and remove the branch and worktree. If the branch is merged through a pull request, do not run `/loop-accept` (it would try to merge again).

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Dependency upgrades across three stacks, where a silent behaviour change in the chat agents is the real risk.
Before you start: none (PF-143 creates `docs/reference/accepted-risks.md`; create it here if that ticket has not run).

```
/execute plans/in-progress/PF-147-fix-vulnerable-shipped-dependencies-todo.md
```

### Stop and ask if

- The Python upgrade needs changes to agent code beyond import paths.
- Fixing the browser package needs a major-version jump of `react-router-dom` (7.x), because that is a migration.
