# PF-142 — CI workflow that runs the existing gates

> **Status:** To Do
> **Started:** 2026-10-14
> **Planned from branch:** main
> **Depends on:** nothing

## Objective

Governance rule CI-01 says `dotnet build`, `dotnet test`, `npm run lint`, `npm run build`, `tsc --noEmit` and `gitleaks detect` block merges, but no GitHub workflow runs any of them. The only workflows are `claude.yml` and `claude-code-review.yml`, whose last 30 runs were all `skipped`. As a result, errors pile up quietly on `main` until someone runs `/ci-check` by hand (see `chore(frontend): clear lint and tsc errors blocking CI-01`, 2026-10-14). This ticket makes CI-01 true by running the gates that already exist on every push and PR. It is also the prerequisite the `/setup-loop` audit of 2026-10-14 named before any loop can be installed: a loop needs an automatic gate and a failure history, and today there is neither.

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` runs on every push to `main` and every PR into `main`, with four jobs: `api`, `frontend`, `ai-service`, `secrets`.
- [ ] Each job runs only commands that already exist in the repo (`/ci-check`, `package.json`, `pyproject.toml`). No new gate is invented, and no gate is weakened, skipped or filtered to get green.
- [ ] Before the workflow lands, a local baseline of every gate on the starting SHA is recorded in this plan's Notes.
- [ ] A push to `main` produces a green `CI` run, and its URL and SHA are recorded in Notes. Any gate that can't go green within this ticket is recorded as a pre-existing failure with its own follow-up ticket, not hidden.
- [ ] `/ci-check` and the docs say that CI now runs these gates, and the stale Gate 4 `tsc` command is corrected.

## Approach

Add one GitHub Actions workflow with four parallel jobs that mirror `/ci-check` exactly: .NET build and test; frontend lint, both `tsc -p` checks, both Vitest suites, and build; the AI-service `pytest` suite (LLM calls are already mocked, and `conftest.py` blocks live HTTP); and gitleaks on the pushed commits. Toolchains match the Dockerfiles (`dotnet/sdk:10.0`, `node:20`, `python:3.12`). Out of scope: Playwright e2e (it needs the full Supabase stack), CI-02 analyzers, CI-03 Prettier, branch protection and Dependabot. Each of those adds a new gate or changes the workflow, and that belongs in a separate decision.

## Affected Files

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Create — four-job gate workflow |
| `.claude/skills/ci-check/SKILL.md` | Edit — point to CI, fix the Gate 4 tsc command and the quick-run line |
| `.agents/skills/ci-check/SKILL.md` (if present) | Edit — same change for Codex |
| `CLAUDE.md` | Edit — one line under Infrastructure: what CI actually runs |
| `docs/STATUS.md` | Edit — note CI is live (tech-debt line, if one exists) |
| `plans/BOARD.md` | Edit — row moves as status changes |

---

## TODO

### [ ] STEP 1 — Record the local baseline on the starting SHA

Run every gate locally from a clean `main` checkout and record pass/fail with the counts. Install nothing new and run no migrations.

```bash
git rev-parse --short HEAD
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test PersonalFinance.slnx
cd ../frontend && npm run lint \
  && npx --no-install tsc --noEmit -p tsconfig.app.json \
  && npx --no-install tsc --noEmit -p tsconfig.node.json \
  && npm run test:desk && npm run test:macro && npm run build
cd ../../services/ai-service && .venv/Scripts/python -m pytest -q
```

> **Why:** CI's first run should hold no surprises. If a gate is already red locally, it is a pre-existing failure, and it gets fixed or ticketed in STEP 4 instead of being mistaken for a CI configuration bug.
> **Check:** Notes has a table with columns gate, result, counts and SHA.

---

### [ ] STEP 2 — Create the workflow on a branch

```bash
git switch -c chore/PF-142-ci-gates
```

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  api:
    name: api (dotnet build + test)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: apps/api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
      - run: dotnet restore PersonalFinance.slnx
      - run: dotnet build PersonalFinance.slnx --no-restore
      - run: dotnet test PersonalFinance.slnx --no-build --verbosity normal

  frontend:
    name: frontend (lint + tsc + vitest + build)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: apps/frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx --no-install tsc --noEmit -p tsconfig.app.json
      - run: npx --no-install tsc --noEmit -p tsconfig.node.json
      - run: npm run test:desk
      - run: npm run test:macro
      - run: npm run build

  ai-service:
    name: ai-service (pytest)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: services/ai-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: services/ai-service/pyproject.toml
      - run: pip install -e ".[dev]"
      - run: python -m pytest -q

  secrets:
    name: secrets (gitleaks)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **Why:** Each job mirrors one `/ci-check` gate, so a CI failure reproduces locally with the same command. `permissions: contents: read` keeps the token minimal. `concurrency` cancels superseded runs on the same ref. No secrets are needed, because `conftest.py` injects fake API keys and blocks live HTTP, and the .NET tests that need Supabase are already `[Fact(Skip=...)]`.
> **Check:** `gh workflow view CI` lists the workflow after the push in STEP 3.

---

### [ ] STEP 3 — Push the branch and open a draft PR to exercise the workflow

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run existing CI-01 gates on push and PR (PF-142)"
git push -u origin chore/PF-142-ci-gates
gh pr create --draft --base main --title "PF-142: CI workflow for existing gates" --body "Runs the /ci-check gates in GitHub Actions. See plans/backlog/PF-142-ci-workflow-existing-gates-todo.md."
gh pr checks --watch
```

> **Why:** A draft PR runs the `pull_request` trigger without touching `main`, so environment differences (Linux paths, case-sensitive imports, a missing system library) surface before the merge.
> **Check:** `gh pr checks` lists all four jobs. Write each job's result and duration in Notes.

---

### [ ] STEP 4 — Resolve each red job by cause, never by weakening the gate

For each red job, read the full log (`gh run view --log-failed`) and classify the failure as one of these:

| Cause | Action |
|-------|--------|
| CI environment differs from local (e.g. Linux case-sensitive import path, missing `libgl` for PyMuPDF) | Fix in the workflow or the code, in this branch |
| Also red in the STEP 1 local baseline (pre-existing) | Fix in this branch if under ~2 hours; otherwise open a follow-up `PF-` ticket and record it in Notes |
| gitleaks finding in pushed commits | Stop. Rotate the credential first, then report it. Never rewrite history or add an allowlist to silence a real secret |

> **Why:** THINK-04: a failing gate is a diagnostic signal. Adding `continue-on-error`, `--skip`, `-k "not ..."` or an ESLint disable would make the badge green and the gate meaningless, and that's exactly the problem this ticket exists to fix.
> **Check:** every job is green, or each remaining red job has a follow-up ticket ID recorded in Notes.

---

### [ ] STEP 5 — Update `/ci-check` and the docs to match reality

- In `.claude/skills/ci-check/SKILL.md`, replace the Gate 4 command `npx tsc --noEmit` with the two `-p tsconfig.app.json` / `-p tsconfig.node.json` commands. The root `tsconfig.json` has `files: []`, so the current command checks nothing. Fix the "Quick run" line the same way, and add one line saying `.github/workflows/ci.yml` runs these same gates on every push and PR.
- Apply the same edit to `.agents/skills/ci-check/SKILL.md` if it exists.
- In `CLAUDE.md` under Infrastructure, change `CI/CD: GitHub Actions` to say CI runs build, test, lint, typecheck, Vitest, pytest and gitleaks, and that e2e is not run in CI.
- In `docs/STATUS.md`, update any line that says CI is missing.

> **Why:** a skill that documents a no-op typecheck teaches every future agent run, human or loop, to trust a gate that checks nothing.
> **Check:** `git grep -n "npx tsc --noEmit$"` returns no hits in skill files.

---

### [ ] STEP 6 — Merge and confirm a green run on `main`

```bash
gh pr ready
gh pr merge --squash --delete-branch
gh run list --workflow CI --branch main --limit 1
```

> **Why:** the `push` trigger on `main` is the run that matters, because you push directly to `main`. Only a green run there proves the gate works where the work actually lands.
> **Check:** the latest `CI` run on `main` has `conclusion: success`. Record its URL and SHA in Notes, then move this plan to `plans/done/` and update `plans/BOARD.md`.

---

## Notes

- **Follow-up for loop engineering:** after about 4 weeks of CI history (around 2026-11-11), rerun `/setup-loop`. If red runs on `main` occur weekly, CI failure triage becomes the first loop (goal-based or `/loop`, drafts on a branch, sensitive paths escalated). If `main` stays green, that's the answer too: no loop is needed yet.
- **Branch protection is deliberately left out.** Required status checks only bite on PRs, and work currently goes straight to `main`. Whether to switch to a PR flow is a workflow decision for you, not a CI configuration detail.
- **gitleaks scope:** on `push` and `pull_request` events, the action scans only the new commits, not the full history. A full-history scan is a one-off audit that belongs with PF-127 (PII redaction before open-sourcing).
- **Python version:** CI uses 3.12 to match `services/ai-service/Dockerfile`. The local venv is 3.11 (`requires-python >= 3.11.9`), so a 3.12-only failure is a real finding, not noise.
- **Cost:** these are public-repo runners. The ai-service job is the slowest, because of the heavy dependency set (smolagents, litellm, langgraph, ragas), and the pip cache keyed on `pyproject.toml` softens it after the first run.
- **e2e is excluded.** `apps/frontend/e2e/` needs Supabase plus the API and AI service running. Running it in CI is a separate ticket (Supabase CLI in Actions) if it ever earns its cost.

### Baseline (STEP 1, local, starting SHA 946709ff)

| Gate | Result | Counts | SHA |
|------|--------|--------|-----|
| dotnet build | pass | 0 errors, 12 warnings | 946709ff |
| dotnet test | pass | 404 passed, 9 skipped (existing Supabase-integration skips), 0 failed | 946709ff |
| npm run lint | pass | 0 errors, 9 warnings | 946709ff |
| tsc app / node | pass | 0 errors each | 946709ff |
| vitest desk / macro | pass | desk 12 tests, macro 26 tests | 946709ff |
| npm run build | pass | built in 1m 1s | 946709ff |
| pytest | **fail** | 240 passed, 1 failed: `test_is_pii_keyword[REK123456-True]` | 946709ff |

The pytest failure was pre-existing: `_PII_PATTERNS` used `REK`, which never matches `REK123456` (no word boundary before the digits). Fixed in the code (`REK(?![A-Z])`), not the test. Now 241 passed.

### CI results (draft PR #85, branch chore/PF-142-ci-gates)

PR: https://github.com/rikky-hermanto/personal-finance/pull/85

| Job | Result | Duration |
|-----|--------|----------|
| api (dotnet build + test) | pass | 29s |
| frontend (lint + tsc + vitest + build) | pass | 1m31s |
| ai-service (pytest) | pass | 1m7s |
| secrets (gitleaks) | pass (all steps succeeded, no findings) | ~7s |

No gate was weakened. Remaining for you: STEP 6 (merge to main and confirm the green `push` run) is intentionally not done; merging was not approved.
