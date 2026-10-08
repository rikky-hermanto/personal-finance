# Jev transaction categorizer

Status: Implementation complete; live evaluation and promotion pending (runtime disabled).
Date: 2026-09-27
Tracking: PF-141; local-only, no GitHub issue created/synced.
Source: User requested planning from `docs/codex/jev-audit.md`.

## Objective and scope

Evaluate Jev as the bounded classifier behind `POST /categorize`, then optionally
enable it for transactions still unresolved by existing categorization layers.
Reduce measured residual-classification cost and latency without increasing wrong
accepted labels or allowing Jev to create reusable category rules automatically.

This is application integration, separate from the development-agent router in
`tools/jev-router`. Do not import that checkout, its policy, or its virtualenv into
the application. Local implementation, dependency installation and offline/mock
verification are authorized. Paid evaluation, credential changes, deployment,
migration, commit and push remain unauthorized.

Out of scope: `/suggest-categories`, bulk preview Suggest, `/categorize-agent`,
extraction, query planning, Journey/portfolio advice, frontend redesign, new DB
schema, global AI provider replacement and autonomous learning of merchant rules.

## Current evidence

| Location | Implemented behavior and implication |
|---|---|
| `services/ai-service/app/services/categorizer.py:Categorizer.categorize` | Calls `LlmProvider.generate_json` for category + self-reported confidence. Invalid payload returns first category with zero confidence; Python does not currently enforce closed vocabulary here. |
| `services/ai-service/app/main.py` | Lifespan creates `Categorizer(provider=provider)`; `/categorize` calls it; empty categories rejected. |
| `services/ai-service/app/models.py` | Request amount is already Decimal; response is category string + float confidence without range constraint. |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs` | Validates returned category against offered vocabulary; errors return Uncategorized/0. Converts decimal amount to double for existing wire contract. |
| `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs:ApplyLlmCategorizationAsync` | Batch merchant suggestion runs first and can create rules. Remaining rows call `/categorize` sequentially. Any non-Uncategorized label is applied, regardless of confidence; 0.85 only gates rule creation. |
| `apps/api/src/PersonalFinance.Application/Commands/CategorizePreviewCommand.cs` | Uses `ILlmSuggestionClient`, not `/categorize`. This work will not accelerate the preview Suggest button or replace its rule-generating path. |
| `services/ai-service/evals/{eval_categorize.py,scoring_categorize.py,categorize_cases.json}` | Existing baseline harness supports Gemini/Anthropic, alternative accepted labels, per-case vocabulary, cost/latency and simple confidence diagnostics. Extend it, do not duplicate it. |
| `apps/api/tests/PersonalFinance.Tests/Services/{LlmCategorizationClientTests,CategorizationLayerTests}.cs` | Existing consumer and pipeline regression seams, including low-confidence categorization without seeding. |

Related history: completed PF-103 and PF-122 plans; PF-AI010 learning plan reports
Done and its code exists, although BOARD still lists it pending. Do not change
that unrelated status without reconciliation. `docs/STATUS.md` is older context.
The audit did not measure cost/latency; no savings are established yet.

## Approaches compared

Scores are engineering judgment, 1 (weak)–5 (strong), equally weighted.

| Approach | User value | Scope fit | Integration fit | Testability | Governance | Total |
|---|---:|---:|---:|---:|---:|---:|
| A. Directly replace current provider with Jev and reuse confidence thresholds | 3 | 4 | 2 | 3 | 1 | 13 |
| B. Independent categorization backend; evaluation first; opt-in runtime with abstention and no Jev rule creation | 4 | 5 | 5 | 5 | 5 | 24 |
| C. Jev → generative LLM cascade for every uncertain result | 4 | 3 | 4 | 4 | 3 | 18 |

Recommend B. A conflates confidence semantics and risks persistent bad rules.
C may improve coverage, but adds variable expense, latency and two-provider
failure modes before a baseline exists. Keep C as a measured follow-up.
Evaluation-only delivery is a valid first milestone even if runtime promotion fails.

## Proposed design

### Backend and bounded decision

- Preserve existing `Categorizer` as the legacy implementation. Add a focused
  `JevCategorizer` with the same async categorize operation and a small composition
  factory. Do not implement unrelated extraction/generation methods on a fake
  `LlmProvider` adapter just to satisfy its interface.
- Proposed `CATEGORIZATION_BACKEND=llm|jev`, default `llm`; independent of
  `AI_PROVIDER`. Default behavior creates no TypeSafe client and needs no key.
- Add server-side `TYPESAFE_API_KEY`, `JEV_MODEL` pinned to the evaluated version,
  and an explicitly calibrated acceptance threshold. If Jev is selected but its
  key/threshold is missing, fail startup configuration validation; do not silently
  select another provider. Runtime outages abstain without blocking import.
- Use official `AsyncTypeSafeClient` with lifespan-owned close/cleanup, a proposed
  5-second overall call deadline and zero automatic retries. Evaluate dependency
  compatibility in the service environment before changing `pyproject.toml`.
  Do not reuse the development tool's installed packages. Keep global provider
  keys/settings needed by other features intact.
- One Choice per transaction. Build opaque IDs mapped to exact offered labels;
  include labels in criteria descriptions. Add a distinct internal no-match ID,
  never a synthetic user category. Normalize duplicate/case-variant vocabulary
  deterministically, preserving canonical spelling. Handle blanks and empty lists.
- Current Choice limit is 255 options, so allow at most 254 categories plus
  no-match. Oversized inputs must abstain or return a documented validation error,
  never silently truncate taxonomy. Bound text and total token input as well.
- State: sanitized merchant description/remarks, DB/CR meaning, optional minimal
  amount context serialized as a decimal string. Omit account names and identifiers
  unless evidence establishes necessity. Treat all text/category labels as data,
  not instructions; test prompt injection and ambiguous Indonesian bank shorthand.
- Validate response presence, type, selected ID, numeric finiteness/range and
  probability structure. Missing, malformed, unknown ID, no-match, below-threshold
  or provider failure → `Uncategorized`, confidence 0, no rule eligibility.
- Accepted result returns canonical label and actual Jev confidence. Retain raw
  probability and confidence separately in sanitized eval output; confidence is
  distribution concentration, not calibrated probability of correct classification.

### Contract and rule-creation safety

Do not clamp confidence to 0.84 to defeat rule creation: that would corrupt
metrics and make policy implicit. Carry rule eligibility explicitly.

| Field | Producer → consumer | Proposed meaning / sanitized example |
|---|---|---|
| `category` | Python response → .NET result | Existing string, exact offered label, e.g. `Groceries`; `Uncategorized` is the existing abstention sentinel |
| `confidence` | Python response → .NET result | Existing finite float/double [0,1]; raw engine confidence for accepted result, 0 for abstention; not comparable across engines without evaluation |
| `rule_seed_allowed` | New Python response → .NET result | Boolean; false for all Jev results. Legacy valid results explicitly true, still subject to existing 0.85 gate. Missing metadata defaults false in updated .NET. |

Replace the internal `ILlmCategorizationClient` tuple with a named Application
result record containing these fields; update all callers and mocks together.
The pipeline checks both eligibility and its existing confidence threshold before
calling AddAsync. It must still preserve source Type, Flow, amount and existing
categories. Legacy categorization remains available; malformed legacy response
changes intentionally from first-category/0 to Uncategorized/0, with the existing
test updated to assert the corrected behavior rather than an arbitrary label.

Deploy the .NET consumer guard before enabling Jev. Old .NET ignores the new flag
and could seed rules; therefore mixed-version Jev enablement is forbidden. Updated
.NET against old Python conservatively stops seeding absent metadata but continues
categorizing. Updated Python legacy mode explicitly restores eligibility. This is
a deliberate rollout compatibility change, not a hidden promise of identical rule
creation across mixed versions. No database migration is needed.

The earlier merchant-suggestion rule-writing path remains legacy and unchanged.
Tests must isolate that path so it cannot obscure a Jev seeding regression.

### Privacy, observability and cost

Add minimal metadata to existing observability: backend/model/prompt version,
input tokens, elapsed time, accepted/abstained/error reason and cost. Never log
raw description, remarks, account name, category payload, full response or exception
body. Remove raw logging at the changed Python/.NET categorizer boundaries; do not
claim this fixes all pre-existing pipeline logging. Sanitization is defense in
depth, not guaranteed anonymization. Use synthetic fixtures for initial evaluation;
real financial data requires a separate data-handling decision before sending it
to a new external processor. Masking behavior and its accuracy impact need tests.

Pricing checked 2026-09-27: Jev 1.13 is $0.042 per million input tokens, output
free. Estimate with Decimal: input_tokens × Decimal('0.042') / 1_000_000. Store
price verification date/model; recheck before live runs. Measure cost per correct
accepted result as well as per request, including abstentions/errors. A zero-token
or unknown-usage failure is not automatically a measured zero-cost call.

## Acceptance criteria

- [x] Default legacy mode sends no Jev requests; other AI features retain providers.
- [x] Jev uses async bounded calls and only offered categories or abstention.
- [x] Low confidence, invalid response, timeout, 429/5xx and no-match never silently
  become first-category success; imports preserve unresolved rows.
- [x] Jev never seeds reusable rules, even at confidence 1.0; consumer metadata
  handling and mixed-version behavior are covered by tests.
- [x] Rules/presets/history still win; no reclassification of already-labeled rows;
  Type/Flow/amount/date/currency semantics remain unchanged.
- [x] Existing request and category/confidence response fields remain compatible;
  optional rule metadata is mapped end-to-end and validated.
- [x] Evaluator supports Jev and current baseline on the same versioned cases,
  separates abstention from OOV/error, and saves resumable/unique run artifacts.
- [x] Unit tests make zero external LLM calls; live runs require explicit execution
  authorization, keys and a fixed request/spend budget.
- [x] Sanitized logs record real model, usage and latency without transaction text.
- [x] Runtime stays disabled until promotion evidence below is reviewed.
- [x] Rollback to `llm` is tested and does not change extraction/advisor providers.

## Ordered implementation steps and results

### STEP 1 — Establish baseline and a held-out evaluation set

Inspect existing evaluator/cases and historical results; capture current actual
runtime provider/model and taxonomy without printing environment values. Extend
the existing sanitized dataset with Indonesian/English merchant text, DB/CR
ambiguity, transfers/income, no-fit/insufficient evidence, same merchant different
flows, custom category collisions, Unicode, injection and absent context.
Split by merchant family so near-duplicates cannot leak into tuning and holdout.
Use at least 100 held-out synthetic/reviewed cases as an initial floor, report
sample counts and uncertainty; do not claim this establishes production accuracy.
Run `--list` offline first. Do not run the paid baseline until separately authorized.

- [x] Added dataset `pf-141-v1`: 20 tuning and 100 held-out synthetic cases,
  grouped wholly by merchant family. Offline `--list` verified 120 unique cases,
  all 16 fallback categories, and the planned ambiguity/adversarial boundaries.
- [ ] Paid baseline rerun remains deliberately not run. The inspected historical
  baseline is the 2026-08-05 seven-case Gemini 2.5 Flash result; it is not promotion evidence.

### STEP 2 — Implement the isolated Jev classifier and policy tests

Add `app/services/jev_categorizer.py`, shared minimal state sanitizer/policy as
needed, `tests/test_jev_categorizer.py`, and bounded SDK dependency/configuration.
Keep no-match IDs collision-proof. Inject/mock the async SDK at its service boundary.
Test 0/1/many categories, >254 categories, invalid numbers, wrong IDs, deadline,
schema errors, redaction and concurrent requests without shared mutable usage data.
Do not wire production selection yet.

- [x] Implemented the isolated classifier, sanitizer, opaque-id/no-match policy,
  254-category limit, exact probability validation, five-second overall deadline,
  zero SDK retries, per-call observations, and mocked concurrency/failure tests.

### STEP 3 — Extend PF-AI010 evaluator and compare

Extend `evals/eval_categorize.py`, `scoring_categorize.py`, existing cases and
`tests/test_scoring_categorize.py`. Keep historical CLI choices compatible; add
proposed `--provider jev` and targeted baseline/Jev comparison, not mandatory paid
Anthropic calls. Record real returned model, prompt/dataset hashes, request usage,
p50/p95, accepted precision, coverage, abstention correctness, OOV and failure rate.
Keep threshold tuning separate from held-out evaluation. Exclude abstentions from
accepted precision but include them in coverage and operational cost. Distinguish
raw Jev confidence from winner probability and existing self-reported confidence.

- [x] Extended the existing evaluator/scorer and preserved historical CLI switches;
  added `--provider jev`, `--compare-jev`, dataset/prompt hashes, real returned Jev
  model/usage, unique resumable JSON/Markdown artifacts, and mandatory live budgets.
- [ ] Baseline/Jev live comparison and threshold calibration remain pending separate
  authorization, keys, and a reviewed request/spend budget.

### STEP 4 — Add consumer guard and runtime composition

Update `app/models.py`, `categorizer.py`, `config.py`, `main.py`, `.env.example`,
`pyproject.toml`; add small categorization factory only if justified by wiring.
Update Application result/interface, Infrastructure HTTP mapping and pipeline
rule guard. Update associated mocks/tests. Trace all interface usages before edits.
Document enablement order. Runtime `jev` remains opt-in; retain legacy default.
Validate real deployment environment-variable injection separately before rollout;
changing compose/deployment files requires reading applicable Docker instructions.

- [x] Added the additive response flag, named .NET result, conservative missing-field
  handling, consumer rule guard, opt-in factory/lifespan client, pinned SDK/config,
  environment example, enablement order, and rollback documentation. The default is
  still `llm`; compose/deployment injection was intentionally not changed.

### STEP 5 — Verify contracts, integration and import behavior

Run focused tests, then relevant AI-service/API regression suites. Exercise a
mocked import with one deterministic match, one accepted Jev result, one abstention
and one provider error; assert exact labels and zero Jev-created rules. Verify
old/new response metadata handling and legacy rule creation eligibility. Existing
skipped DB integrations must be reported as skipped, not passing coverage.

- [x] Mocked import coverage includes an already-labeled row, accepted Jev result,
  abstention, and provider-error fallback with zero Jev rule creation and unchanged
  Type/Flow/amount/date/currency semantics. Old/new metadata and legacy eligibility
  are covered by focused tests.
- [x] Verification: 51 focused Python tests passed; 22 focused .NET tests passed;
  .NET build passed (6 projects, 0 errors); full .NET suite passed (353 tests).
  Full Python suite: 234 passed and one unrelated existing failure remained in
  `test_merchant_suggester.py` for `REK123456`. `pip check` retained four unrelated
  pre-existing LangChain/OpenAI environment conflicts; TypeSafe introduced no new conflict.

Commands below are for execution later, from the stated directories:

```powershell
# services/ai-service — existing offline commands
rtk proxy .venv/Scripts/python.exe evals/eval_categorize.py --list
rtk proxy .venv/Scripts/python.exe -m pytest tests/test_categorize.py tests/test_scoring_categorize.py
# After STEP 2 creates the proposed test file
rtk proxy .venv/Scripts/python.exe -m pytest tests/test_jev_categorizer.py
# Broader regression, after checking for live-provider tests
rtk proxy .venv/Scripts/python.exe -m pytest

# apps/api
rtk dotnet test PersonalFinance.slnx --filter 'FullyQualifiedName~LlmCategorizationClientTests|FullyQualifiedName~CategorizationLayerTests'
rtk dotnet build PersonalFinance.slnx
rtk dotnet test PersonalFinance.slnx

# Paid, future-only; run only after explicit authorization and key setup
rtk proxy .venv/Scripts/python.exe evals/eval_categorize.py --provider jev `
  --jev-threshold <calibrated-value> --confirm-live `
  --max-requests <approved-count> --max-spend-usd <approved-usd>
```

No frontend code change is planned. Confirm preview Suggest still uses its existing
endpoint; add UI checks only if implementation expands that scope.

### STEP 6 — Promotion decision and rollback

Proposed engineering gates (not vendor promises or financial standards):

- Zero OOV labels escape validation; all failure/no-match boundary tests pass.
- Held-out accepted-label precision at least 95% and no worse than the current
  baseline on the same accepted subset; at least 50% coverage to prevent trivial
  all-abstain success. Report uncertainty and manually inspect high-confidence
  errors, especially transfers vs income; insufficient evidence blocks promotion.
- Measured residual endpoint p95 latency and cost per correct accepted result
  improve over baseline. Report full import timing separately because the preceding
  merchant-suggestion batch is unchanged and may dominate total time/cost.
- No Jev automatic rule creation; deployment consumer guard proven in place.
- A separately authorized sanitized live smoke test proves real response mapping;
  the development router's logs and mocked tests are not application evidence.

If gates fail, leave `CATEGORIZATION_BACKEND=llm` and retain evaluation artifacts.
If gates pass, enable on local/staging imports first and review results before a
production switch. Roll back with backend `llm` plus service restart; do not delete
rules or rewrite historical transaction categories automatically. Record affected
run IDs for any manual correction. No dual-provider production shadow traffic is
required in v1; offline paired evaluation avoids doubling production requests.

- [x] Rollback composition is tested and documented.
- [ ] Promotion decision is pending paired held-out results, manual error review,
  deployment variable validation, consumer-guard deployment, and an authorized smoke test.

## Dependencies and open decisions

- Local implementation authorization was supplied by `/execute` on 2026-09-27.
- A TypeSafe key and approved evaluation request/spend budget are prerequisites for
  live evidence. Credential contents/availability were not printed or changed.
- Acceptance threshold must be calibrated; no arbitrary 0.85 carryover. The 95%
  precision / 50% coverage targets above are proposed release criteria for review.
- Initial scope assumes residual `/categorize`, not the visible bulk Suggest button.
  Extending the merchant-suggestion path is a separate follow-up with rule/PII risks.
- PF-AI010 code is reusable; no dependency on unfinished smolagents learning work.
- Before processing real customer records, settle data minimization/retention and
  processor handling. No regulatory compliance certification is implied here.

## Sources and planning verification

- Repository paths above and `docs/codex/jev-audit.md` were read for this plan.
- Official TypeSafe pages checked 2026-09-27:
  https://docs.typesafe.ai/primitives/choice (closed set, no-match, confidence, limits),
  https://docs.typesafe.ai/models (pricing/model),
  https://docs.typesafe.ai/sdk/python (async SDK).
- Official installed skill: `.agents/skills/typesafe-ai/SKILL.md`.
- TypeSafe Python SDK 0.7.2 was compatibility-checked and installed only in the
  existing AI-service virtual environment; `pyproject.toml` pins `>=0.7.2,<0.8`.
- Application, evaluator, tests, docs, this plan, and the local-only BOARD entry were
  updated. No paid/live model calls, customer data, credentials, deployment, migration,
  commit, push, or remote issue/project mutation occurred.
