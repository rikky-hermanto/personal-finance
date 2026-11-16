# PF-AI011b — Feedback Loop: What the AI Suggested vs What You Kept, Fed Back Into the Eval Set

> **Learning Phase:** Phase 3 · Chapter 11 · topic 18 of the learning path (ships with PF-AI011)
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Sensitive:** new table holding real transaction descriptions (schema, RLS), and an export that must never copy real text into the committed eval file
> **Depends on:** PF-AI011 for the review decision event (Phase 2 only). Phase 1 and Phase 3 have no dependency. Phase 3 needs paid LLM quota (Execution Rule 7).
> **Board objective:** When you change a category the AI suggested, the correction is kept and becomes a new test case, so the AI gets checked against real mistakes instead of guessed ones.
> **Pivot goal:** "Evals that grow from real use" is what Applied AI roles ask for most. Every eval set here was written by hand, so the evals only know the cases you thought of. This chapter builds the path from a real correction to a new eval row.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [🗺 Concept Map](#-concept-map)
  - [🧪 Experiments](#-experiments)
  - [📌 Notes](#-notes)
- [📝 Knowledge Check](#-knowledge-check)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

# 📖 Introduction

## High level — what is this?

The upload preview already asks the AI for categories and lets you change them. On submit, only the final category is saved. Whether the AI suggested it, and whether you overrode it, is thrown away. That discarded correction is the most honest quality signal this product produces, and it costs nothing to collect.

This chapter keeps it, in four parts:

1. **Capture.** On submit, store one row per AI-suggested transaction: what was suggested, what was kept, and which model and prompt produced the suggestion.
2. **Export.** A script lists the disagreements as eval candidates. You rewrite the useful ones as synthetic rows and add them to the categorization eval.
3. **Explicit feedback.** A thumbs up or down on a chat answer writes a score onto that answer's Langfuse trace.
4. **Two experiments.** One LLM-generated eval set compared against the hand-written one, and one shadow run that replays logged inputs through a candidate prompt.

## Hand-written cases only know what you imagined

`evals/categorize_cases.json` has 24 case groups, all synthetic and all written by you. It is a good regression net for the merchants you thought of. It cannot contain the bank description you have never seen, and that is exactly the row the model gets wrong in real use.

Writing more cases by hand does not fix this, because the gap is in imagination, not effort. The fix is a second source of cases that does not depend on what you can imagine.

## Implicit feedback is frequent and honest; explicit feedback is rare and biased

A thumbs button looks like the obvious answer. In practice almost nobody clicks it, and the people who do are mostly annoyed. It tells you something, but slowly and with a tilt.

Changing a category is different. You do it because the row is wrong and you need it right, not to give feedback. It happens on every import, and it carries the correct answer with it. So the correction is the main signal here, and the thumb is the small one. Both need a path back into the eval set, which is why both are in this plan.

## A real row must not walk into a committed file

The eval file says `"provenance": "synthetic fixtures; no customer transaction data"`, and this repository is open source. A feedback row holds a real bank description. If the export wrote those rows straight into `categorize_cases.json`, the next commit would publish them.

So the export writes candidates to a local, git-ignored file. You read a candidate, understand what tripped the model (an abbreviation, a merchant code, a transfer memo), and write a synthetic row with the same pattern and invented details. That rewritten row is what gets committed.

## One user cannot run an A/B test

An A/B test needs enough traffic to split. This product has one user. The substitute is a **shadow run**: take the inputs you already logged, run them through the candidate prompt offline, and compare its answers with the categories you actually kept. Nothing reaches the live path, and the comparison uses real inputs with real answers.

## 📚 Resources / Theory to Learn

| Resource | What it teaches | Time |
|---|---|---|
| Eugene Yan — *Patterns for Building LLM-based Systems & Products* (the "collect user feedback" and data flywheel sections) | Why implicit feedback beats explicit, and how it feeds evals | 40m |
| Langfuse docs — scores and user feedback | How a score attaches to a trace, and the score data types | 20m |
| [services/ai-service/evals/README.md](../../../services/ai-service/evals/README.md) | How the categorization eval is run, split and budgeted today | 15m |
| [docs/operations/ai-threat-model.md](../../../docs/operations/ai-threat-model.md) | What counts as sensitive text in this project | 10m |

## 🧠 Learning Strategy

Capture first, analysis later. The table is useful from the first import after Phase 1 ships, even if nothing reads it yet, because feedback you did not record cannot be recovered. So Phase 1 goes in before anything else, and Phases 2 and 3 can wait for real rows to accumulate.

Size the paid work before you start it. Phase 3 is the only part that calls a model. Write the number of calls next to each command before running it.

# 🔧 Implementation

## 🎯 Objective

Record every AI category suggestion together with the category the owner kept, turn disagreements into new categorization eval rows through a reviewed, privacy-safe export, add thumbs feedback on chat answers as Langfuse scores, and run one synthetic-set comparison and one shadow run. This closes topic 18 and the two feedback rows of the field guide check.

## ✅ Acceptance Criteria

- [ ] Submitting an import where the AI suggested categories stores one feedback row per suggested transaction, including rows where you kept the suggestion.
- [ ] A row you changed after the AI suggested it still records the original suggestion.
- [ ] Sending the same submit twice stores each feedback row once.
- [ ] A failure while storing feedback never fails the import; it is logged with the request id and no description text.
- [ ] Another signed-in user cannot read or write the owner's feedback rows.
- [ ] The export lists only disagreements, masks personal data, and writes only to a git-ignored path. `git status` is clean after running it.
- [ ] At least one case group built from real corrections exists in the categorization eval, written with invented details, and the eval has been re-run on it.
- [ ] A decision from the PF-AI011 category review (accept, edit, reject) stores one feedback row, and a replayed decision does not store a second.
- [ ] A thumbs up or down on a chat answer appears as a score on that answer's Langfuse trace.
- [ ] One reviewed synthetic eval set exists, with a short comparison of what it caught against the hand-written set.
- [ ] One shadow run is recorded: logged inputs replayed through a candidate prompt, with agreement against the kept categories for both prompts.
- [ ] `dotnet test`, `pytest` and the frontend lint and type checks pass.

## 🧭 Approach

Capture in the path that already exists. The preview already knows which rows the AI filled in; it only has to remember the suggestion after you edit the row, and send it with the submit. The API stores the rows through a small Application service, so the category review from PF-AI011 can use the same service through one endpoint.

The eval file stays synthetic. The export produces candidates for a human to rewrite, never rows to commit.

Deliberately not in this plan: automatic retraining or automatic prompt changes from feedback, a feedback dashboard in the app, per-user analysis, and any use of feedback rows as few-shot examples at runtime. The React approval card for the category review is also out; PF-AI011 shipped the backend only and this plan stores its decisions without adding UI for them.

## 📂 Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/{timestamp}_pf_ai011b_category_feedback.sql` | Create — append-only `category_feedback` table, owner RLS, unique key for retries |
| `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs` | Edit — optional `AiSuggestedCategory`, `AiConfidence` (transient, never written to `transactions`) |
| `apps/api/src/PersonalFinance.Application/Interfaces/ICategoryFeedbackService.cs` | Create — `RecordAsync` |
| `apps/api/src/PersonalFinance.Infrastructure/...` | Create — the Supabase implementation, beside the class that inserts transactions |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — record feedback after a successful submit; `POST category-feedback` for the review path |
| `apps/api/tests/PersonalFinance.Tests/...` | Create — service and submit tests |
| `apps/frontend/src/components/TransactionPreview.tsx` | Edit — keep the original suggestion per row after an edit, send it on submit |
| `apps/frontend/src/api/transactionsApi.ts` | Edit — the two optional fields on the submit payload |
| `apps/frontend/src/components/chat/AiChatPanel.tsx`, `apps/frontend/src/api/chatApi.ts` | Edit — thumbs on an answer |
| `apps/api/src/PersonalFinance.Api/Controllers/ChatController.cs` | Edit — `POST feedback` proxy |
| `services/ai-service/app/main.py`, `app/models.py` | Edit — return the trace id with an answer; `POST /ask/feedback` |
| `services/ai-service/app/services/category_review.py` | Edit — store the decision (only once PF-AI011 exists) |
| `services/ai-service/evals/export_feedback_cases.py` | Create — disagreements to a local candidate file |
| `services/ai-service/evals/generate_synthetic_categorize.py` | Create — LLM-generated candidate cases |
| `services/ai-service/evals/eval_categorize.py` | Edit — `--cases PATH`, only if no such option exists |
| `services/ai-service/evals/categorize_cases.json` | Edit — new feedback-derived case group, version bump |
| `services/ai-service/evals/results/{date}-feedback-loop.md` | Create — the comparison and shadow-run record |
| `.gitignore` | Edit — `services/ai-service/evals/local/` |
| `.claude/rules/ai-service.md`, `docs/architecture/API-endpoints.md` | Edit — new endpoints and error codes |
| `docs/mentor/ai-engineer-learning-path.md`, `docs/mentor/README.md`, `docs/mentor/progress.md` | Edit — records |

## 📋 TODO

## Phase 1 — Capture what was suggested and what was kept

### [ ] STEP 0 — Theory gate (1h, owner)

Read the resources above. Then answer without looking: why a changed category is a better signal than a thumb, why the export must not write into the committed eval file, and what a shadow run can and cannot tell you.

> **Why:** the three design decisions in this plan follow from these three answers.
> **Check:** you can say each answer in two sentences.

### [ ] STEP 1 — Confirm the facts this plan relies on

```bash
# Where the preview remembers AI-suggested rows, and where an edit forgets them
grep -n "aiSuggestedIds" apps/frontend/src/components/TransactionPreview.tsx

# What the suggestion call returns today (model and prompt version, or only category and confidence?)
grep -n "class SuggestCategories\|class CategorySuggestion" -A 12 services/ai-service/app/models.py
grep -n "suggest-categories" -A 12 services/ai-service/app/main.py
cat apps/api/src/PersonalFinance.Application/Interfaces/ILlmSuggestionClient.cs

# Where a submit inserts rows, and how it uses RequestId to make a repeat harmless
grep -n "RequestId\|InsertAsync\|TransactionsSubmittedEvent" apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs

# The pattern for an append-only, owner-scoped table
cat supabase/migrations/20261026000000_pf_152_quest_completions.sql

# How an eval script reaches the local database, and whether a custom case file can be passed
grep -n "DATABASE_URL\|asyncpg\|supabase" services/ai-service/evals/eval_retrieval.py | head
grep -n "categorize_cases.json\|add_argument" services/ai-service/evals/eval_categorize.py

# How a trace id can be read where /ask builds its response
grep -rn "trace_id\|get_current_trace_id" services/ai-service/app | head
pip show langfuse | grep -i version
```

Write the answers into Notes before continuing: whether the suggestion response carries a model and prompt version (if not, STEP 3 adds them), the class that inserts transactions, how a repeated submit is detected, and the installed Langfuse version.

> **Why:** every later step says "beside the existing code". A wrong guess about where the insert happens puts the feedback write in a place a retry runs twice.
> **Check:** the four answers are written down.

### [ ] STEP 2 — Migration: the `category_feedback` table

Create the migration with the `db-migrate` skill. Copy the RLS policy form and grants from the quest completions migration read in STEP 1; that table is also append-only and owner-scoped.

```sql
-- PF-AI011b: what the AI suggested vs what the owner kept. Append-only.
CREATE TABLE public.category_feedback (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  source             text NOT NULL CHECK (source IN ('upload_preview', 'category_review')),
  source_ref         text NOT NULL,          -- upload: '{request_id}:{row}', review: the review id
  action             text NOT NULL CHECK (action IN ('accepted', 'edited', 'rejected')),
  description        text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  suggested_category text NOT NULL CHECK (length(suggested_category) BETWEEN 1 AND 100),
  final_category     text NOT NULL CHECK (length(final_category) BETWEEN 1 AND 100),
  confidence         numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  model              text,
  prompt_version     text,
  transaction_id     integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_ref)
);

ALTER TABLE public.category_feedback ENABLE ROW LEVEL SECURITY;
-- SELECT and INSERT policies on user_id = auth.uid(); no UPDATE or DELETE policy.
-- Copy the exact policy and GRANT form from the pattern migration.
```

`final_category` is always the category that ended up on the row. For a rejected review that is the category the row already had.

> **Why:** the unique key on `source_ref` is what makes a repeated submit or a replayed review decision store one row. No update or delete policy keeps the history honest: a correction you later regret is still a fact about what the model suggested.
> **Check:** acting as the owner, an insert succeeds and the same insert again is rejected by the unique key. Acting as a second user, a select returns no rows.

### [ ] STEP 3 — API: carry the suggestion through submit and store it

- Add `string? AiSuggestedCategory` and `double? AiConfidence` to `TransactionDto`, with the same "transient, never written to the transactions table" comment that `AccountName` carries. Confidence is a model score, not an amount, so FIN-01 does not apply to it.
- If STEP 1 showed the suggestion response has no model or prompt version, add both to the AI service response and to `ILlmSuggestionClient`'s result, and return them from `categorize-preview` so the browser can send them back. Otherwise reuse what is there.
- Create `ICategoryFeedbackService.RecordAsync(IReadOnlyList<CategoryFeedbackEntry> entries, CancellationToken ct)` in Application and its Supabase implementation in Infrastructure, using the per-request client that carries the caller's token. Insert with "ignore on conflict" against the unique key.
- In the submit path, after the insert succeeds, build one entry for each submitted transaction whose `AiSuggestedCategory` is set and that was inserted (skip duplicates). `action` is `accepted` when the suggested and final categories match, otherwise `edited`. `source_ref` is the request id plus the row's position in the request.
- Wrap the call so a failure is logged as a warning with the request id and the count, and the submit still returns success.

Tests: `Record_SameSourceRefTwice_StoresOnce`, `Submit_WithAiSuggestions_RecordsAcceptedAndEdited`, `Submit_WithoutAiSuggestions_RecordsNothing`, `Submit_FeedbackServiceThrows_StillSucceeds`, `Submit_DuplicateRow_RecordsNoFeedback`.

> **Why:** feedback is a by-product of the import. If it could fail the import, the measuring tool would break the thing it measures. Recording accepted rows as well as edited ones matters: without them you can count mistakes but not compute a rate.
> **Check:** `dotnet test --filter CategoryFeedback` passes with the five tests.

### [ ] STEP 4 — Frontend: remember the suggestion after an edit

In `TransactionPreview.tsx`, `confirmEdit` removes the row from `aiSuggestedIds`, which is right for the highlight and wrong for feedback. Add a second piece of state that is never cleared by an edit:

```ts
const [aiSuggestions, setAiSuggestions] = useState<Record<string, { category: string; confidence: number }>>({});
```

Fill it in `handleBulkAiSuggest` next to `newAiIds`. When building the submit payload, set `aiSuggestedCategory` and `aiConfidence` on each transaction that has an entry. Add the two optional fields to the payload type in `transactionsApi.ts`. Do not change the visual behaviour of the preview.

> **Why:** the edited rows are the valuable ones, and they are exactly the rows the current state forgets.
> **Check:** in the running app, suggest categories for an upload, change one of them, submit, and query the table: the changed row shows `edited` with the original suggestion, the untouched ones show `accepted`.

## Phase 2 — From stored feedback to eval rows

### [ ] STEP 5 — Export the disagreements, locally

Add `services/ai-service/evals/local/` to `.gitignore` first. Then create `evals/export_feedback_cases.py`:

- Read `category_feedback` rows where `suggested_category <> final_category`, through the connection method the other eval scripts use (found in STEP 1).
- Pass each description through `app/services/pii_masker.py`.
- Group by `final_category`, count repeats of the same masked description, and write `evals/local/feedback_candidates.json` with: masked description, suggested, final, confidence, model, prompt version, count.
- Print a summary: total suggestions, disagreements, disagreement rate, and the five most frequent wrong suggestion pairs.
- Refuse to run if the output path is not ignored by git (`git check-ignore -q`).

> **Why:** the summary alone is already a result you can quote: "the categorizer was overridden on X% of real suggestions". The git check turns the privacy rule from a promise into a guard.
> **Check:** the script prints the summary, the file exists, and `git status --short` shows nothing new.

### [ ] STEP 6 — Rewrite candidates into synthetic eval rows (owner)

Open the candidate file. For each pattern worth keeping, add an example to a new case group in `categorize_cases.json`, in the existing shape (`merchant_family`, `split`, `flow`, `expected`, `examples`):

- Use `merchant_family` names starting with `feedback_`, and `split: "holdout"`.
- Keep the pattern that fooled the model (the abbreviation, the code format, the word order). Invent the merchant name, numbers and any personal detail.
- Bump `dataset_version` and note the date.

Then run the eval on the new rows only, with a budget:

```bash
cd services/ai-service
python -m evals.eval_categorize --filter feedback_ --confirm-live --max-requests <rows + 2>
```

> **Why:** this is the loop closing. A correction made in the app has become a test that fails until the model or the prompt handles that pattern.
> **Check:** the result file lists the `feedback_` cases, and `git diff` on the eval file contains no real merchant or personal text.

### [ ] STEP 7 — Store category review decisions (after PF-AI011)

Skip this step and leave it unchecked if PF-AI011 is not done yet.

Add `POST /api/transactions/category-feedback` (owner from `ICurrentUser`, body validated, calls `RecordAsync`). In `CategoryReviewService.decide`, after a review reaches a resolved state for the first time, send one entry: `source` is `category_review`, `source_ref` is the review id, `action` follows the decision, `final_category` is the category now on the row. A replayed decision sends the same entry and the unique key drops it. A failure here is logged and does not change the review's result.

> **Why:** the approval step and the preview produce the same event. One table means one export and one disagreement rate across both.
> **Check:** accept, edit and reject each store one row; sending a decision twice still leaves one.

### [ ] STEP 8 — Thumbs on a chat answer

Pre-flight, because the scoring call changed between Langfuse major versions:

```bash
cd services/ai-service
.venv/Scripts/python -c "
from app.observability import langfuse
print([n for n in dir(langfuse) if 'score' in n or 'trace_id' in n])"
```

Use the names it prints. Then:

- Return the trace id with `/ask`, and in the final event of `/ask/stream`.
- Add `POST /ask/feedback` with `{ "trace_id": str, "value": "up" | "down" }`. Validate the id format, write a score named `user_feedback` (1 for up, 0 for down), and return 204. Add the route to the owner-gated routes.
- Add `POST /api/chat/feedback` to `ChatController`, copied from the existing proxy actions.
- In `AiChatPanel.tsx`, show two small buttons under a finished answer. After a click, show the chosen one as selected and disable both. Follow [ai/design/](../../../ai/design/README.md); do not touch `src/components/ui/`.

> **Why:** the thumb costs little to add once a trace id reaches the browser, and it gives the chat path a feedback signal the preview cannot provide.
> **Check:** click a thumb in the running app, open the trace in Langfuse, and see the score on it.

## Phase 3 — Two experiments (paid quota)

### [ ] STEP 9 — One synthetic eval set, reviewed by hand

Create `evals/generate_synthetic_categorize.py`. It asks the model for realistic Indonesian bank descriptions per category, in batches, in the eval file's example shape, and writes `evals/local/synthetic_candidates.json`. It takes `--count`, `--confirm-live` and `--max-requests`, like the categorization eval.

Review every generated row. Delete the ones that are wrong, ambiguous or duplicates of hand-written cases, and save the rest as `evals/categorize_cases_synthetic.json` (synthetic, so it can be committed). Add `--cases PATH` to `eval_categorize.py` if STEP 1 found no such option, and run the eval on both sets.

Record in the results file: how many rows were generated, how many survived review, accuracy on each set, and which failures appeared only in the synthetic set or only in the hand-written set.

> **Why:** synthetic data is cheap to produce and easy to over-trust. Counting how many rows you had to delete is the honest part of the answer to "do you use synthetic eval data?".
> **Check:** the results file has the survival rate and the two failure lists.

### [ ] STEP 10 — One shadow run

Build a replay file from stored feedback: masked description as input, `final_category` as the expected answer, written to `evals/local/feedback_replay.json`. Run the current prompt and one candidate prompt over it with `--cases`, with a request budget. Record agreement with the kept category for each prompt, and the rows where the two prompts differ.

> **Why:** this is how you compare two prompts with one user. The inputs are real, the answers are real, and nothing reaches the live path.
> **Check:** the results file has both agreement numbers and a one-line decision: keep the current prompt or switch.

### [ ] STEP 11 — Records

- `docs/mentor/ai-engineer-learning-path.md`: row 18 status; the field guide rows "Feedback loop" and "Synthetic eval data".
- `docs/mentor/README.md` chapter map, `docs/mentor/progress.md` with what was done, `.claude/rules/ai-service.md` and `docs/architecture/API-endpoints.md` for the new endpoints.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Check:** `grep -n "PF-AI011b" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

## 🗺 Concept Map

| New concept | Familiar .NET/backend analogy | What it does |
|---|---|---|
| Implicit feedback | An audit log of what users actually did | Records the correction the user made anyway |
| Explicit feedback (score) | A rating field on a support ticket | A deliberate signal, rare and tilted |
| Data flywheel | Turning production incidents into regression tests | Real mistakes become permanent test cases |
| Synthetic eval data | Generated test fixtures | Cheap coverage that must be reviewed before it is trusted |
| Shadow run | Replaying recorded traffic against a new build | Compares a candidate offline on real inputs |
| `source_ref` unique key | An idempotency key | Makes a retried write store one row |

## 🧪 Experiments

**Experiment A — Drop the accepted rows.** Query the disagreement rate with and without the `accepted` rows in the table. Without them there is no denominator. Takeaway: recording agreement is what turns a list of mistakes into a rate.

**Experiment B — Trust the generator.** Run the synthetic set before reviewing it and again after. Compare the accuracy. Takeaway: wrong labels in an eval set show up as model errors, and the eval then punishes correct answers.

## 📌 Notes

- **Real text stays local.** `category_feedback` holds real descriptions under owner RLS. Candidate and replay files live in a git-ignored folder. Only rewritten, invented rows enter committed eval files.
- **Order with PF-AI011.** Phase 1 can ship before PF-AI011. STEP 7 waits for it.
- **The thumb accepts a trace id from the browser.** With one owner account this is acceptable. If public signup is ever turned on, the feedback route must check that the trace belongs to the caller.
- **Cost.** Phases 1 and 2 call no model except the small eval re-run in STEP 6. Size STEP 9 and STEP 10 in requests before starting; the free tier's daily cap is too small for both in one day.
- STEP 1 findings: _(fill in during execution)_

# 📝 Knowledge Check

1. Why are accepted suggestions stored and not only the corrected ones?
2. The export finds 40 disagreements. Why can none of them be pasted into `categorize_cases.json`, and what do you do instead?
3. A client retries the same submit after a timeout. How many feedback rows exist afterwards, and what guarantees it?
4. What does a shadow run tell you that an A/B test would, and what does it not tell you?
5. Your synthetic set shows 95% accuracy and the feedback-derived rows show 60%. Which number do you report, and why?
6. Give one reason explicit feedback is biased and one reason implicit feedback can also mislead.

# 🧾 Owner Review Checklist

- [ ] After an import with AI suggestions, I can see which ones I kept and which ones I changed.
- [ ] Submitting twice does not double the rows.
- [ ] The export left nothing for git to commit.
- [ ] At least one eval case group came from a real correction, with invented details.
- [ ] A thumb on a chat answer shows up in Langfuse.
- [ ] I can state the disagreement rate and where it comes from.

## Execution Notes

### Phase 1 — Capture

Model: **Opus 5.5** · Effort: **high**. Sensitive: a new table with RLS and a write inside the import path.
Before you start: local Supabase is running and the owner has done STEP 0.

```
/execute plans/in-progress/learning/PF-AI011b-feedback-loop-eval-set-todo.md phase 1
```

### Phase 2 — From stored feedback to eval rows

Model: **Sonnet 5.5** · Effort: **high**.
Before you start: at least one real import has gone through Phase 1, so the table has rows. STEP 6 is the owner's. STEP 7 needs PF-AI011 done.

```
/execute plans/in-progress/learning/PF-AI011b-feedback-loop-eval-set-todo.md phase 2
```

### Phase 3 — Two experiments

Model: **Sonnet 5.5** · Effort: **medium**.
Before you start: paid LLM quota is available and each run is sized in requests. The owner reviews the generated rows in STEP 9.

```
/execute plans/in-progress/learning/PF-AI011b-feedback-loop-eval-set-todo.md phase 3
```

### Stop and ask if

- STEP 1 shows the submit path cannot tell a first request from a retry.
- The export would need to write anywhere git tracks.
- The installed Langfuse version has no way to attach a score to an existing trace.
