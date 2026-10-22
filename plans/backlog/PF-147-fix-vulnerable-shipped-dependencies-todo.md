---
id: PF-147
epic: E-001
flags: [Ready]
---

# PF-147 — Fix vulnerable dependencies in shipped code, accept the rest in writing

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 5 of 8)
> **Sensitive:** security, plus a risk of breaking the AI chat agents.
> **Planned from branch:** main

## Objective

The 2026-10-15 audit found known vulnerabilities in three package sets. This ticket fixes what actually ships to users or runs in production, and writes a one-line reason for each advisory it deliberately leaves. The owner decided on 2026-10-22: fix shipped code, accept build-time-only npm advisories in writing.

## Acceptance Criteria

- [ ] **.NET:** `dotnet list package --vulnerable --include-transitive` reports no high-severity item for shipped projects. `Microsoft.OpenApi` (advisory GHSA-v5pm-xwqc-g5wc) is raised to a fixed version, either by upgrading `Microsoft.AspNetCore.OpenApi` or by adding an explicit `Microsoft.OpenApi` reference at the fixed version. `dotnet build` and `dotnet test` pass.
- [ ] **npm (browser):** `react-router-dom` (and its `@remix-run/router` dependency) is upgraded to a fixed version within the 6.x line used by the app, with routes unchanged. `npm run lint`, `npx tsc --noEmit`, `npm run build` and the existing unit tests pass.
- [ ] **npm (build-time):** every remaining `npm audit --omit=dev` finding that only runs at build time (for example `postcss`, `tailwindcss`, `micromatch`, `braces`) is listed in `docs/reference/accepted-risks.md` with package, advisory, why it cannot reach users, and the date, one line each. If `npm audit fix` (without `--force`) clears some safely, do that first.
- [ ] **Python:** the production AI service no longer depends on the vulnerable `langgraph`, `langgraph-checkpoint`, `langgraph-sdk`, `langchain-core` and `langchain-anthropic` versions, OR each version that cannot be upgraded is listed in `accepted-risks.md` with a concrete reason (for example "upgrade breaks the ragas evaluation pin; eval-only, not in the production image"). `pip-audit` output is recorded in the plan notes.
- [ ] The full Python suite (`pytest`, mocked LLM only) passes after any upgrade, including `test_advisor_agent.py`, `test_categorizer_agent.py` and `test_agent_owner_scope.py`. Chat and agent behaviour is unchanged.
- [ ] No new `--force`, `--legacy-peer-deps` or version-ignoring flags are introduced to make installs pass.

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

### [ ] STEP 1 — Take a baseline
```bash
cd apps/api && dotnet list PersonalFinance.slnx package --vulnerable --include-transitive
cd ../frontend && npm audit --omit=dev
cd ../../services/ai-service && .venv/Scripts/python.exe -m pip_audit
```
Save the three outputs to the scratchpad. If `pip-audit` is missing, install it in the venv only.

> **Why:** Advisory lists change daily. Work from today's output, not the 2026-10-15 numbers in the epic.

### [ ] STEP 2 — .NET fix
Raise `Microsoft.OpenApi` to the fixed version named in the advisory (explicit reference if the parent package does not pull a fixed one). Re-run the vulnerable scan, `dotnet build` and `dotnet test`.

> **Why:** It is a transitive dependency, so the smallest safe fix is an explicit minimum version. Keep `TreatWarningsAsErrors` clean (CI-02).

### [ ] STEP 3 — Browser fix
Upgrade `react-router-dom` within the 6.x line to the fixed release. Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:desk` and `npm run test:macro`, then open the app and click through `/journey`, `/cashflow`, `/assets`, `/investment` and `/settings` to confirm routing still works.

> **Why:** This is the only advisory in code that ships to the browser, so it is the one that matters most.

### [ ] STEP 4 — Build-time npm advisories
Run `npm audit fix` (never `--force`). For what remains, confirm each package is only used by the build or dev tooling (`npm ls <package>` shows it under devDependencies), then add one row each to `docs/reference/accepted-risks.md`.

> **Why:** Build-time advisories need a human-readable reason, not silence; otherwise they come back as unexplained red in every future audit.

### [ ] STEP 5 — Python runtime upgrade attempt
In a scratch copy of the venv (or a branch of the lock file), upgrade `langgraph`, `langgraph-checkpoint`, `langgraph-sdk`, `langchain-core` and `langchain-anthropic` to the fixed releases. Keep the eval-only packages in a separate optional group so the production image does not install `ragas` and its pins. Run the full `pytest` suite. If tests pass with only small import-path fixes, keep the upgrade.

> **Why:** The comments in `pyproject.toml` show the last upgrade attempt cascaded into ragas. Isolating eval-only packages is the cheapest way to remove that coupling without touching agent logic.

### [ ] STEP 6 — Decide or accept
If STEP 5 is green, finish it. If it needs agent rewrites, revert it and add accepted-risk rows naming each package, the advisory, why it is not exploitable in this deployment (for example, only called with trusted internal inputs, or in an eval-only group), and "revisit when the AI service is deployed". Do not rewrite agent code in this ticket.

> **Why:** The owner chose "fix shipped code, accept the rest". An unreviewed rewrite of the chat agents is a larger risk than the advisory it removes.

### [ ] STEP 7 — Final scans and handoff
Re-run the three audits and paste the before-and-after counts into the plan notes. Run `git diff --stat`. Do not commit.

> **Why:** The epic's done-condition is "clean, or each remaining item accepted in writing". The before-and-after numbers prove it.

---

## Notes

- Mixed concerns are the main risk here. If a step fails, revert only that ecosystem's changes; the other two should still be deliverable.
- `npm audit --omit=dev` counts build tools listed under `dependencies`; check whether the Vite/Tailwind packages are mis-filed before accepting them.
- Related: PF-S15's Python code is the main consumer of `langgraph`; its agent tests are the safety net.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Dependency upgrades across three stacks, where a silent behaviour change in the chat agents is the real risk.
Before you start: none (PF-143 creates `docs/reference/accepted-risks.md`; create it here if that ticket has not run).

```
/execute plans/in-progress/PF-147-fix-vulnerable-shipped-dependencies-todo.md
```

### Stop and ask if

- The Python upgrade needs changes to agent code beyond import paths.
- Fixing the browser package needs a major-version jump of `react-router-dom` (7.x), because that is a migration.
