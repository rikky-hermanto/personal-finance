# PF-AI012b — Evals in CI, Cost and Latency Engineering, and an Eval-Gated Model Upgrade

> **Learning Phase:** Phase 3 · Chapter 12 · topics 14, 19 and 20 of the learning path (companion to PF-AI012)
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Sensitive:** a CI job that uses a paid LLM key (secret handling, spend), and a possible change of the default model
> **Depends on:** PF-AI002 (eval harness, done), PF-AI008b (categorization eval, done), PF-AI009 (injection eval, done). No hard dependency on PF-AI012; the two can run in either order. Needs paid LLM quota (Execution Rule 7).
> **Board objective:** A broken AI prompt can no longer be merged, you know what each answer costs and which step is slow, and a new model is adopted only if the tests say it is better.
> **Pivot goal:** PF-AI012 puts the service on a public URL. This plan covers the three things that make it defensible in an interview: evals that block a regression, cost and speed that were measured and changed, and a model upgrade decided by numbers.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [🗺 Concept Map](#-concept-map)
  - [📌 Notes](#-notes)
- [📝 Knowledge Check](#-knowledge-check)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

# 📖 Introduction

## High level — what is this?

Three small pieces of work that share one idea: a number you measured once is a claim, and a number that is checked every time is a control.

| Part | Today | After this plan |
|---|---|---|
| Evals in CI | Evals are run by hand, when you remember. CI runs unit tests with every model call mocked. | A small eval subset runs in CI and blocks the merge when quality drops. |
| Cost and latency | Langfuse records cost and latency per call. Nobody has looked at which step is slow or what a question costs end to end. | Time to first token and per-step latency are measured, one thing is changed because of them, and there is a cost-per-query table. |
| Model upgrade | The model name is a config value. Changing it is a guess. | Old and new model run the same evals, and the decision is written down with accuracy, cost and latency. |

## A test suite that mocks the model cannot see the model get worse

`ci.yml` runs `pytest` for the AI service, and the project rule is to always mock LLM calls in tests. That rule is right: unit tests must be fast, free and repeatable. It also means CI proves the wiring and nothing about quality. Reword the answer prompt so it stops citing sources, and every test still passes.

Running the full eval suite in CI is the obvious fix, and the wrong one. It is slow, it costs money on every push, and model output varies a little between runs, so a strict threshold fails at random and people learn to ignore it.

What works is a **small, fixed subset with a floor**: a few cases per eval, a threshold set below the measured baseline with room for normal variation, and a hard cap on calls. It will not catch a small drift. It will catch a broken prompt, which is the failure that actually reaches main.

## A skipped check must not look like a passed check

A pull request from a fork gets no secrets, so the eval job cannot call a model there. If the job quietly succeeds in that case, the green tick means "not checked". That is the same mistake the finance rules forbid on a risk screen (FIN-04). The job has to say it was skipped, in words, and the run on `main` has to be the one that cannot be skipped.

## Average latency hides the step that hurts

"The answer takes four seconds" does not tell you what to fix. A streamed chat answer has stages: plan the query, retrieve or aggregate, rerank, wait for the model's first token, then stream. The user feels the wait before the first token far more than the total. So the two numbers to measure are **time to first token** and **latency per step**. Only then is it clear whether the slow part is yours (retrieval, rerank) or the provider's.

## The cheapest model that passes its eval

Not every task needs the strongest model. Categorizing a bank description is a narrow classification job; advising on a financial plan is not. Routing sends each task to the cheapest model that still passes that task's eval. The eval is what makes this safe: without it, "use the cheap one" is a hope.

## A new model is a regression risk until your evals say otherwise

A newer model is usually better on average. Your use is not the average: Indonesian bank text, a fixed JSON shape, a small category list. A new version can be better at reasoning and worse at following your exact output format. The only evidence that counts is your own eval set, run on both.

## 📚 Resources / Theory to Learn

| Resource | What it teaches | Time |
|---|---|---|
| Promptfoo docs — CI/CD integration | How others gate a pipeline on evals; thresholds and caching | 30m |
| GitHub Actions docs — using secrets, and `pull_request` from forks | Why a fork PR has no secrets, and how to condition a job | 20m |
| Chip Huyen — *Building a Generative AI Platform* (model router, gateway, cache sections) | Routing, fallbacks and where latency goes | 45m |
| Langfuse docs — cost and latency dashboards | Reading per-observation latency and cost | 20m |
| [services/ai-service/evals/README.md](../../../services/ai-service/evals/README.md) | The existing eval scripts, their budgets and result files | 15m |

## 🧠 Learning Strategy

Break it on purpose. The definition of done for evals in CI is that a deliberately broken prompt fails the build. Do that first with the gate running locally, before touching the workflow, so you know the gate can fail.

Measure before changing anything. Phase 2 has one rule: no optimisation until the per-step table exists. The table decides what to change.

Size every run in calls and write the number down before starting it.

# 🔧 Implementation

## 🎯 Objective

Add a small, budgeted eval gate to CI that blocks a quality regression on `main`. Measure time to first token, per-step latency and cost per query for the chat and advisor paths, make one change the measurements justify, and write a cost table with a one-million-queries-a-day estimate. Run the extraction and categorization evals on the current and a newer model and record the decision. This closes topics 14, 19 and 20.

## ✅ Acceptance Criteria

- [ ] One command runs the CI eval subset locally and exits non-zero when any score is below its threshold.
- [ ] The subset needs no database and makes at most the number of model calls stated in its config; a run that would exceed the cap stops before calling.
- [ ] A deliberately broken prompt makes the gate fail, locally and in CI, and the evidence (a failed run link or log) is recorded.
- [ ] On `main`, the eval job is required and blocking. Where the key is not available, the job reports "skipped: no key" in its summary and is never reported as an eval pass.
- [ ] The LLM key exists only as a GitHub Actions secret and never appears in logs. `gitleaks` still passes.
- [ ] A table shows time to first token, total time and per-step latency (p50 and p95) for `/ask/stream` and the advisor, with the sample size.
- [ ] One change was made because of that table, with before and after numbers. If nothing was worth changing, that is stated with the reason.
- [ ] A table shows cost per query for each AI path, and a back-of-envelope estimate for one million queries a day with its assumptions listed.
- [ ] Which model serves categorization and which serves advice is a recorded decision, backed by the categorization eval for each candidate.
- [ ] When the primary provider returns a quota error, the chat path answers through the second provider if its key is set, and otherwise returns the documented error. A test pins the behaviour.
- [ ] The extraction and categorization evals were run on the current and the newer model, and a decision record states accuracy, cost and latency for both and what was decided.
- [ ] All money figures in new code use `Decimal`; no cost is summed as a float.

## 🧭 Approach

Reuse the eval scripts; add one thin runner. The scripts already take request budgets. The gate is a small file that calls a fixed subset of each, compares scores with thresholds kept in a JSON file, and returns an exit code.

The subset must run without a database, because CI has no Supabase with embedded transactions. So the RAG cases in the subset check answer quality on a stored context, not retrieval. Retrieval evals stay a manual run.

Not in this plan: the full eval suite in CI, semantic caching, a model gateway service, load testing, and the deployment itself (PF-AI012). The provider fallback is listed in PF-AI012 STEP 4 for `/ask`; whichever plan runs first builds it, and the other ticks its step with a link.

## 📂 Affected Files

| File | Change |
|------|--------|
| `services/ai-service/evals/ci_gate.py` | Create — runs the subset, checks thresholds, enforces the call cap |
| `services/ai-service/evals/ci_subset.json` | Create — the case ids per eval, thresholds, and the call cap |
| `services/ai-service/evals/fixtures/ci/` | Create — stored contexts for the RAG subset, synthetic only |
| `services/ai-service/tests/test_ci_gate.py` | Create — threshold and budget logic, with the model mocked |
| `.github/workflows/ci.yml` | Edit — `ai-evals` job |
| `services/ai-service/evals/measure_latency.py` | Create — time to first token and per-step latency |
| `services/ai-service/app/...` | Edit — only the one change the measurements justify, and the fallback if PF-AI012 has not built it |
| `services/ai-service/evals/results/{date}-latency-cost.md` | Create — the latency and cost tables |
| `services/ai-service/evals/results/{date}-model-upgrade.md` | Create — the decision record |
| `docs/operations/ai-cost-latency.md` | Create — the one-page write-up that the tables feed |
| `services/ai-service/evals/README.md` | Edit — how to run the gate and how to change a threshold |
| `docs/mentor/ai-engineer-learning-path.md`, `docs/mentor/README.md`, `docs/mentor/progress.md`, `docs/INDEX.md` | Edit — records |

## 📋 TODO

## Phase 1 — Evals as a blocking CI gate (topic 14)

### [ ] STEP 0 — Theory gate (1h, owner)

Read the resources. Then answer without looking: why the full eval suite does not belong in CI, why the threshold sits below the baseline, and what a fork pull request can and cannot run.

> **Check:** three answers, two sentences each.

### [ ] STEP 1 — Confirm the facts this plan relies on

```bash
cd services/ai-service

# Which eval scripts need a database, and which only need a model key
grep -ln "asyncpg\|DATABASE_URL\|owner_connection\|supabase" evals/*.py
grep -n "add_argument" evals/eval_extraction.py evals/eval_faithfulness.py evals/eval_injection.py evals/eval_categorize.py

# Does the injection eval call a model at all, or only the pattern scanner?
grep -n "provider\|generate\|scan" evals/eval_injection.py | head -20

# The latest recorded baselines
ls evals/results/

# How the model is chosen per task today
grep -n "ai_model\|ai_provider\|jev_model\|categoriz" app/config.py app/services/categorization_factory.py app/agents/chat_model_factory.py

# What the chat path does on a provider quota error today
grep -rn "429\|RESOURCE_EXHAUSTED\|rate_limit\|llm_rate_limited\|provider_unavailable" app | head -20

# Where the stream emits its first token, and what spans exist
grep -n "yield\|start_observation\|start_as_current" app/main.py app/services/answerer.py | head -30

# The open PF-S15 follow-up that names the newer advisor model
grep -n -i "follow-up\|newer\|model" plans/done/PF-S15*.md | head -20
```

Write into Notes: which evals can run without a database, whether the injection eval is free of model calls, the current baseline score for each eval, the models in use per task, the current behaviour on a quota error, and the newer model named in the PF-S15 follow-up.

> **Why:** the subset, the thresholds and the upgrade candidate all come from these answers. None of them should be guessed.
> **Check:** the six answers are written down.

### [ ] STEP 2 — Choose the subset and write `ci_subset.json`

Pick cases that are cheap, stable and cover different failure types:

| Eval | Cases | Model calls | What a failure means |
|---|---|---|---|
| Extraction | 3 fixtures (one CSV-like, one PDF text, one with a tricky amount) | 3 | The extraction prompt or schema broke |
| Answer faithfulness on stored context | 3 questions, each with its context saved in `fixtures/ci/` | 3 to 6, depending on the judge | The answer prompt stopped grounding or citing |
| Categorization | 5 holdout cases across different categories | 5 | The categorizer prompt or routing broke |
| Injection | 5 attacks and 3 normal queries | 0 if STEP 1 confirmed the scanner makes no model call | A guard was removed or weakened |

Record the thresholds in the same file. Set each one below the baseline measured in STEP 1 by enough to absorb normal run-to-run variation; with three cases, one failure is a 33-point drop, so the floor for a three-case eval is "at most one miss". Set `max_requests` to the total above plus two.

> **Why:** a threshold equal to the baseline fails at random. A threshold far below it catches nothing. Writing the reasoning beside each number is FIN-02 applied to eval thresholds: a limit nobody can trace cannot be defended.
> **Check:** the file lists case ids, thresholds with a one-line reason each, and the call cap.

### [ ] STEP 3 — `ci_gate.py`

Create the runner:

- Load `ci_subset.json`. Count the calls the run would make and exit with a clear message before any call if the count exceeds `max_requests`.
- If no model key is configured, print `SKIPPED: no LLM key — evals were not run` and exit with code 78 so the caller can tell a skip from a pass and from a fail.
- Run each eval on its listed cases by calling the existing scoring functions, not by shelling out.
- Print one table: eval, cases, score, threshold, pass or fail, calls used. Write the same table to `$GITHUB_STEP_SUMMARY` when that variable is set.
- Exit 0 only if every eval passed; exit 1 otherwise.

Add `tests/test_ci_gate.py` with the model mocked: a score below threshold fails, a score at threshold passes, the cap stops the run before any call, and a missing key gives the skip code.

> **Why:** three outcomes need three exit codes. Folding "skipped" into "passed" is the bug this step exists to prevent.
> **Check:** `pytest tests/test_ci_gate.py -v` passes, and `python -m evals.ci_gate` runs locally and prints the table.

### [ ] STEP 4 — Prove the gate can fail

On a scratch branch, break one prompt in a way a unit test cannot see: remove the instruction to cite sources from the answer prompt, or remove the category list from the categorizer prompt. Run `pytest` (it should still pass) and then `python -m evals.ci_gate` (it should fail). Save both outputs. Discard the branch.

> **Why:** a gate that has never failed has not been tested. The pair "unit tests green, eval gate red" is also the clearest possible demonstration of why the gate exists.
> **Check:** both outputs are saved in the results folder or in Notes.

### [ ] STEP 5 — The `ai-evals` job in `ci.yml`

Add the key as a repository secret first (owner action, in GitHub settings). Then add a job:

- Runs after `ai-service` succeeds, with a timeout.
- Runs on pushes to `main`, and on pull requests that change `services/ai-service/**`.
- Passes the key to the gate step only, through `env`, from `secrets`.
- Treats the gate's skip code as a neutral result with a visible notice (`::notice::` plus the step summary), and only for pull requests. On `main`, a skip is a failure: the key must be there.
- Keeps `permissions: contents: read`.

Then make `ai-evals` a required check for `main` in the branch protection settings (owner action).

> **Why:** scoping the job to AI service changes keeps a frontend commit from spending model calls. Failing on a skip on `main` is what makes the check mean something.
> **Check:** a pull request that touches the AI service shows the job with its table in the summary. Re-push the broken prompt from STEP 4 to a pull request, confirm the job fails, record the run link, and close the pull request unmerged.

## Phase 2 — Cost and latency engineering (topic 19)

### [ ] STEP 6 — Measure before changing

Create `evals/measure_latency.py`. For a fixed list of questions (reuse `evals/ask_questions.json`, 10 questions), call `/ask/stream` on the locally running service and record, per question: time to the first streamed token, total time, and tokens. Read the per-step durations for the same requests from Langfuse observations if STEP 1 showed the steps are traced; if a step has no span, add one in the app rather than timing it from outside. Do the same for the advisor with the five scenarios in `evals/advisor_scenarios.json`.

Write `evals/results/{date}-latency-cost.md` with p50 and p95 per step, the sample size, the model, and the date. Mark the provider's share and your own share of the time.

> **Why:** with ten samples the p95 is close to the maximum, so state the sample size next to it. An honest small number is better than a precise-looking one.
> **Check:** the table exists and you can name the slowest step in one sentence.

### [ ] STEP 7 — Change one thing the table justifies

Pick the single largest avoidable cost and fix only that. Likely candidates, depending on the table: a step that runs serially but could run alongside another, a rerank over more candidates than the answer uses, a prompt that carries context the answer never needs, or a slow first token caused by work done before the stream opens. Re-run STEP 6 and add the before and after rows.

If the table shows the time is almost entirely the provider's, do not invent a change. Record that, and what you would do about it (a faster model for this path, streaming earlier, a cache).

> **Why:** one measured change is the interview story. Several unmeasured ones are not.
> **Check:** the results file has a before and after row, or a clear "nothing to change, because" paragraph.

### [ ] STEP 8 — Routing: the cheapest model that passes

Using the categorization eval, run each candidate model for the categorization task on the holdout split with a request budget, and record accuracy, cost per case and latency per case. Decide which model serves categorization and which serves advice, and write the decision and its numbers into the results file. If STEP 1 showed the routing already exists in config, this step confirms it with numbers instead of building it.

> **Why:** "we use a cheaper model for classification" is only an engineering statement when it comes with the accuracy it kept.
> **Check:** a table with one row per candidate, and one sentence stating the decision.

### [ ] STEP 9 — Fallback on a quota error

Skip the build and link to PF-AI012 STEP 4 if that step is already done. Otherwise do it here and tick it there.

On a quota or rate-limit error from the primary provider, the chat path retries once with the second provider when its key is configured, and tags the trace `fallback.used`. With no second key, it returns the documented error code. Cover `/ask` and `/ask/stream`; for the stream, the fallback can only happen before the first token is sent. Add tests for: primary succeeds, primary quota error with a second key, primary quota error without one.

> **Why:** in October 2026 one quota cap blocked three evals at once and the chat path simply stopped. A fallback is the fix, and "what happens when your provider returns 429?" is a standard interview question.
> **Check:** the three tests pass, and with the primary key deliberately invalidated the local service still answers through the second provider.

### [ ] STEP 10 — Cost per query and the one-million estimate

In the results file, add a table with one row per AI path (extraction per document, categorization per transaction, chat answer, advisor turn): input tokens, output tokens, cost, taken from Langfuse for the runs above. Compute with `Decimal`.

Then write `docs/operations/ai-cost-latency.md`, one page: the per-step latency table, the change from STEP 7, the routing decision, the cost table, and an estimate for one million chat queries a day. List every assumption in the estimate (mix of query types, cache hit rate, tokens per query, current list prices with the date you checked them) and state which component dominates.

> **Why:** the estimate is not a forecast. It shows you know which variable drives the bill and what you would do first to bring it down.
> **Check:** every number in the page traces to a results file or a dated price, and no estimate is presented as a measurement.

## Phase 3 — Model upgrade gated by evals (topic 20)

### [ ] STEP 11 — Run both models on the same evals

Take the newer model named in STEP 1. Before running, confirm its current name and price on the provider's own model page, and write the date checked. Then run the extraction eval and the categorization eval on the current model and on the newer one, same cases, same prompts, each with a request budget.

> **Why:** model names and prices go stale quickly. A decision record built on a remembered price is wrong in a way nobody notices.
> **Check:** four result files exist, two per model.

### [ ] STEP 12 — Decide and record

Write `evals/results/{date}-model-upgrade.md`:

| | Current | Newer |
|---|---|---|
| Extraction accuracy | | |
| Categorization accuracy | | |
| Cost per document / per case | | |
| Latency p50 | | |
| Output-format failures | | |

Then one paragraph: upgrade, stay, or upgrade only for one task, and why. List the cases that changed from pass to fail and from fail to pass. If the decision is to upgrade, change the config default in the same pull request and let the CI gate from Phase 1 run on it.

> **Why:** a written "we stayed, and here is why" is as good a result as an upgrade. The point is that the decision came from the eval set.
> **Check:** the record exists, and the CI gate passed on whatever default is now set.

### [ ] STEP 13 — Records

- `docs/mentor/ai-engineer-learning-path.md`: rows 14, 19 and 20, and the matching field guide rows.
- `docs/mentor/README.md` chapter map, `docs/mentor/progress.md`, `docs/INDEX.md` for the new operations page, `evals/README.md` for the gate.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Check:** `grep -n "PF-AI012b" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

## 🗺 Concept Map

| New concept | Familiar .NET/backend analogy | What it does |
|---|---|---|
| Eval gate in CI | A contract test stage in the pipeline | Blocks a merge when model output quality drops |
| Threshold below baseline | A performance budget with tolerance | Catches breaks without failing on noise |
| Skip is not pass | A test marked `Skip` that still shows green | Keeps an unchecked run from being read as checked |
| Time to first token | Time to first byte | The wait the user actually feels |
| Model routing | Choosing a cheaper SKU for a simple workload | Sends each task to the cheapest model that passes its eval |
| Provider fallback | A circuit breaker with a secondary | Keeps answering when the primary is over quota |
| Eval-gated upgrade | A dependency upgrade behind the test suite | Adopts a new model only on evidence |

## 📌 Notes

- **Why the subset skips retrieval.** CI has no database with embedded transactions. Retrieval evals stay a manual run before a release. If PF-AI012's cloud database with anonymized fixtures exists later, a nightly retrieval eval against it is a reasonable follow-up, not part of this plan.
- **Spend.** The CI subset is roughly a dozen model calls per run, which the free tier's daily cap cannot sustain. The job needs a paid key with a spend alert. Phase 2 and Phase 3 together are a few hundred calls; size each run first.
- **The many `[Fact(Skip=...)]` tests in the API** are the same "skipped looks green" problem in another place (PF-034). This plan does not fix them; it avoids adding a second instance.
- **PF-AI012 is older than the auth work.** It still says the API has no auth. Re-audit it before executing (Execution Rule 8); that re-audit is not part of this plan.
- STEP 1 findings: _(fill in during execution)_

# 📝 Knowledge Check

1. Unit tests pass and the eval gate fails. Give a concrete change that produces exactly this, and explain why the unit tests cannot see it.
2. Your faithfulness baseline is 0.90 on three questions. Why is 0.90 the wrong CI threshold, and what do you use?
3. A fork pull request has no secrets. What should the eval job report, and why is "success" the wrong answer?
4. Total answer time is unchanged but users say chat feels faster. Which number moved?
5. You route categorization to a cheaper model. What must be true before you can call that a safe change?
6. The newer model scores higher on extraction and lower on categorization. Name two defensible decisions.
7. In the one-million-queries estimate, which assumption would you check first if the bill came in at double?

# 🧾 Owner Review Checklist

- [ ] I saw the eval job fail on a broken prompt, and pass again without it.
- [ ] On `main`, the eval job cannot be skipped silently.
- [ ] I can name the slowest step of a chat answer and what I changed, with numbers.
- [ ] I can state the cost of one chat answer and what dominates it.
- [ ] I can explain which model serves which task, and the eval result behind it.
- [ ] The model upgrade decision is written down, whichever way it went.

## Execution Notes

### Phase 1 — Evals as a blocking CI gate

Model: **Sonnet 5.5** · Effort: **high**. Sensitive: a secret in CI and a required check on `main`.
Before you start: the owner has done STEP 0, a paid key exists, and the owner is available to add the secret and the branch protection rule in STEP 5.

```
/execute plans/in-progress/learning/PF-AI012b-evals-ci-cost-latency-model-upgrade-todo.md phase 1
```

### Phase 2 — Cost and latency engineering

Model: **Sonnet 5.5** · Effort: **high**.
Before you start: the local stack is running with Langfuse, and the run is sized in calls.

```
/execute plans/in-progress/learning/PF-AI012b-evals-ci-cost-latency-model-upgrade-todo.md phase 2
```

### Phase 3 — Model upgrade gated by evals

Model: **Sonnet 5.5** · Effort: **medium**.
Before you start: the newer model's name and price were checked on the provider's page today.

```
/execute plans/in-progress/learning/PF-AI012b-evals-ci-cost-latency-model-upgrade-todo.md phase 3
```

### Stop and ask if

- No eval can run without a database, so the subset cannot be built as described.
- The gate fails on an unbroken prompt more than once in five runs; the thresholds or the subset need rethinking, not loosening by reflex.
- The upgrade would change the default model and any eval regressed.
