# PF-AI013b — Public Presence: Case-Study Page, First Published Post, Demo Video, Certification Decision

> **Learning Phase:** Phase 3 · Chapter 13 of the learning path (companion to PF-AI013)
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Sensitive:** everything here is published outside the repo or made easy to find in it; real financial data, real names and secrets must not appear in a post, a screenshot or a video
> **Depends on:** nothing for Phase 1 and Phase 2. Phase 3 (full post and demo video) waits for PF-AI012 so the demo can show a public URL. PF-AI013's three write-ups feed Phase 3 but do not block it.
> **Board objective:** Someone who has five minutes can find the AI work in this project, see what it does, read the measured results, and watch it run.
> **Pivot goal:** As of 2026-10-17, two blog drafts had sat since 2026-06-24 and nothing was published. The work exists; a reviewer cannot find it. This plan makes it findable, in the order that costs least: one post now, one page in the repo, then the full post and video.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [📌 Notes](#-notes)
- [📝 Knowledge Check](#-knowledge-check)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

# 📖 Introduction

## High level — what is this?

A writing and publishing task with almost no code. Four deliverables:

| Deliverable | What it is | When |
|---|---|---|
| First published post | The eval-harness draft, finished and live | Now |
| AI case-study page | One page in this repo that walks a reviewer through the AI work | Now, about half a day |
| Full post and 3-minute demo video | The whole system: extraction, RAG, agents, MCP, security, deployment | After Chapter 12 |
| Certification decision and profile update | One cert chosen or declined with a reason; LinkedIn headline and About | After the page exists |

## A reviewer gives you five minutes

This repository is a five-module finance product. The AI work is spread across a Python service, eval scripts, plans, and a progress log of more than a hundred kilobytes. A hiring manager who opens the repo sees a budgeting app. They will not read the progress log, and they should not have to.

A README section does not solve this. The README has to introduce the product, and the product is the pyramid, not the AI pipeline. What works is a single page written for one reader with one question, "what did this person build with LLMs, and how do they know it works?", linked from the README in one line.

## A number without its limit reads as marketing

The strongest material here is the measured results, including the ones that went badly: hybrid search lost to plain vector search, and the pattern-based injection scanner blocked none of the four held-out attacks. Leaving those out makes the page look cleaner and weaker. A reviewer who has built these systems knows that everything has a failure. A page that shows where it failed, and what you would do next, reads as engineering.

So every number on the page carries three things: what it was measured on, how many cases, and the date. And the limits section is not optional.

## Publishing one small post beats polishing one large one

The full post depends on deployment being finished, and waiting for it is how two drafts stayed unpublished for five months. The eval-harness draft does not depend on anything. Publishing it now gets the platform, the privacy check and the habit in place while the stakes are small.

## A certification is a purchase, not a milestone

A cert costs money and about two weeks. It earns its place only if the roles you are applying to filter on it or if it fills a gap the project does not. The decision is made with `/mentor cert`, written down with its reason, and "no, because" is an acceptable outcome.

## 📚 Resources / Theory to Learn

| Resource | What it gives you | Time |
|---|---|---|
| [docs/ideas/blogs/blogging-plan.md](../../../docs/ideas/blogs/blogging-plan.md) | Positioning, post archetypes, the weekly workflow, and the privacy checklist | 20m |
| [docs/ideas/blogs/2026-06-24-eval-harness.md](../../../docs/ideas/blogs/2026-06-24-eval-harness.md) | The draft Phase 1 publishes | 15m |
| [docs/mentor/field-guide-gap-analysis-2026-11-09.md](../../../docs/mentor/field-guide-gap-analysis-2026-11-09.md) | What reviewers look for in a portfolio, with the market numbers | 20m |
| [docs/mentor/cert-path-databricks-genai.md](../../../docs/mentor/cert-path-databricks-genai.md) | The Databricks cert path already researched | 15m |
| Two or three AI engineering case-study READMEs you admire | The shape of a good page; note what you read first and what you skipped | 30m |

## 🧠 Learning Strategy

Collect the numbers before writing a sentence. Every figure on the page and in the posts comes from a results file or the progress log, with its date. A page written from memory will contain a number that is slightly wrong, and that is the one a reviewer asks about.

Write for the reader who stops after the first screen. Problem, what it does, one result, one link to the demo. Everything else is below that.

# 🔧 Implementation

## 🎯 Objective

Publish the eval-harness post, add a one-page AI case study to this repo with verified numbers and an honest limits section, then publish the full system post and a 3-minute demo video once Chapter 12 is done, and close the certification question with a recorded decision. This closes the Chapter 13 row and the "Public proof" and "Prompt change driven by an eval" rows of the field guide check.

## ✅ Acceptance Criteria

- [ ] The eval-harness post is live at a public URL, linked from the README and from the case-study page.
- [ ] `docs/ai-case-study.md` exists, fits in about two screens before its details, and is linked from the README in one line.
- [ ] The page covers: problem, user, input, output, demo, architecture, tests, evaluation numbers, limitations, and a 60-second pitch.
- [ ] Every number on the page names its source file, sample size and date, and matches that source.
- [ ] The page includes one before-and-after example of a prompt changed because of an eval result, with the score before and after.
- [ ] The page reports the guardrail hold-out result as measured, explains why a pattern guard fails on unseen attacks, and says what you would add next.
- [ ] Nothing published contains real transaction text, real balances, a real name other than the author's, an account number, a key or a token. The privacy checklist in the blogging plan was run on each item.
- [ ] The full post and a demo video of about three minutes are published and linked from the page (Phase 3).
- [ ] The certification decision is recorded in `docs/mentor/progress.md` with its reason, and scheduled if the answer is yes.
- [ ] The LinkedIn headline and About section are updated and link to the post and the repo.
- [ ] New proof points are logged in `docs/mentor/progress.md` for the CV update, which happens in career-ops.

## 🧭 Approach

Smallest public artifact first. Phase 1 publishes what already exists. Phase 2 writes the page from verified evidence. Phase 3 waits for deployment and then tells the whole story once.

The executor can gather evidence, draft and check links. The owner does every publish action, records the video, and makes the certification decision; none of those can be delegated.

Not in this plan: the three agent-design write-ups (PF-AI013), the blog automation pipeline (PF-131), CV regeneration (career-ops), and any change to the product.

## 📂 Affected Files

| File | Change |
|------|--------|
| `docs/ideas/blogs/2026-06-24-eval-harness.md` | Edit — finish, then mark as published with the URL |
| `docs/ai-case-study.md` | Create — the case-study page |
| `README.md` | Edit — one line linking the page and the post; keep all emoji and status markers |
| `docs/ideas/blogs/{date}-production-llm-pipeline.md` | Create — the full post draft (Phase 3) |
| `docs/INDEX.md` | Edit — entry for the case-study page |
| `docs/mentor/ai-engineer-learning-path.md`, `docs/mentor/README.md`, `docs/mentor/progress.md` | Edit — records |

## 📋 TODO

## Phase 1 — Publish the eval-harness post now

### [ ] STEP 1 — Check the draft against the code as it is today

The draft is from 2026-06-24. Since then the eval harness grew (categorization, injection, numeric accuracy) and auth landed.

```bash
ls services/ai-service/evals/ services/ai-service/evals/results/
grep -n "accuracy\|%\|\$" docs/ideas/blogs/2026-06-24-eval-harness.md | head -40
grep -n "PF-131" plans/BOARD.md
cat plans/in-progress/PF-131*.md | head -40
```

List every number and every file name in the draft, and check each against the results files. Fix what changed. Decide the platform from the blogging plan and the state of PF-131; if the automation is not ready, publish by hand and do not wait for it.

> **Why:** a five-month-old draft will name a file that moved or a score that was re-measured. A first post with a wrong number is worse than no post.
> **Check:** every number in the draft has a source file written next to it in a scratch list.

### [ ] STEP 2 — Privacy check, then publish (owner)

Run the privacy checklist from `blogging-plan.md` on the text, the code blocks and every image. Replace any real description, amount, account or name with an invented one. Then publish, and record the URL at the top of the draft file with the date.

> **Why:** once published, text is cached and indexed even if deleted. The check happens before, not after.
> **Check:** the post opens in a private browser window, and the README links to it.

## Phase 2 — The AI case-study page

### [ ] STEP 3 — Collect the evidence

Fill this table in Notes before writing. Use the latest result file for each, and the progress log for anything not in a result file.

| Claim | Number | Measured on | Date | Source file |
|---|---|---|---|---|
| Extraction accuracy, per provider | | | | |
| Extraction cost per document and p95 latency | | | | |
| Retrieval: MRR@5 and P@5 | | | | |
| Faithfulness on cited answers | | | | |
| Hybrid search vs vector search | | | | |
| Categorization accuracy | | | | |
| Injection: blocked on the main set, false alarms | | | | |
| Injection: blocked on the held-out set | | | | |
| Agent evaluation | | | | |

Also find one prompt that was changed because of an eval result:

```bash
git log --oneline -- services/ai-service/app/prompts/ | head -30
grep -n -i "prompt" docs/mentor/progress.md | grep -i "eval\|accuracy\|score" | head -20
```

Pick a change where the prompt text before and after and the score before and after are both recoverable from git and a results file.

> **Why:** if a row cannot be filled from a file, the claim does not go on the page. Agent evaluation is the likely gap; if the scenarios have still never run, the page says so.
> **Check:** every row has a source file or the word "not measured".

### [ ] STEP 4 — Write `docs/ai-case-study.md`

Use this order. Keep the part above "Evaluation" to about two screens.

```markdown
# AI Engineering in Personal Finance

> One-page case study. Last verified: [date].

## The problem
[Two or three sentences: Indonesian bank statements arrive as PDFs and screenshots with no common format; the product needs clean, categorized transactions and answers a person can trust.]

## Who it is for, what goes in, what comes out
[A three-row table: user, input, output.]

## See it run
[Demo video link, the post link, and how to run it locally in three commands.]

## Architecture
[One diagram or a link to the existing one, and five bullets: extraction, eval harness, RAG, agents, guardrails.]

## How I know it works
[The evidence table from STEP 3, trimmed to the rows a reviewer cares about.]

## One prompt changed by an eval
[Before, after, the score before and after, and what the eval caught.]

## What does not work yet
[The hold-out result, agent evaluation if it has not run, anything not deployed. One line each on what comes next.]

## Tests and how to run the evals
[Commands, and what each proves.]

## The 60-second pitch
[About 130 words, written to be spoken.]
```

For the limits section, state the injection hold-out result exactly as measured. Explain it in two sentences: a pattern scanner recognises the phrasings it was written against, so an attack worded differently passes. Then say what you would add: a model-based classifier, stricter separation of retrieved data from instructions, and limits on what the model can do when it is fooled.

> **Why:** "what does not work yet" is the section an experienced reviewer reads most carefully, and the one that most candidates leave out.
> **Check:** the page renders on GitHub, every link resolves, and every number matches its source.

### [ ] STEP 5 — Link it and check the five-minute path

Add one line to the README pointing to the page and the post, matching the existing emoji style. Add the page to `docs/INDEX.md`. Then test the path: open the repository's GitHub page in a private window and time how long it takes to reach the evaluation numbers.

> **Check:** under one minute from the repo home to the numbers, with at most two clicks.

### [ ] STEP 6 — Say the pitch (owner)

Close the page, start a timer, and say the 60-second pitch aloud. Rewrite it in the words you actually used.

> **Check:** between 45 and 90 seconds, and the page's final section is in your wording.

## Phase 3 — Full post, demo video, certification, profile (after Chapter 12)

### [ ] STEP 7 — Write and publish the full post

Draft `docs/ideas/blogs/{date}-production-llm-pipeline.md` from the case-study page and PF-AI013's three write-ups. Suggested arc: the extraction decision (tool use against JSON mode), measuring before building, RAG and the result where the simpler option won, agents and their limits, the security hold-out result, and what deployment cost. Include the benchmark table and one architecture diagram. Run the privacy checklist and publish (owner).

> **Check:** the post is live and linked from the page.

### [ ] STEP 8 — Record the 3-minute demo (owner)

Use anonymized fixture data only. Script, about thirty seconds each: upload a statement and watch categorized transactions appear; the Journey page with pyramid scores; a Langfuse trace showing cost, latency and tokens; a chat question with a streamed, cited answer; the advisor giving a multi-step recommendation; the MCP server called from a client. Before recording, check every screen for real data and close anything that shows a key or a token.

> **Why:** a video is the hardest thing to scrub afterwards. A real balance in one frame cannot be edited out of a published link people have already opened.
> **Check:** the video is about three minutes, shows no real financial data, and is linked from the page.

### [ ] STEP 9 — Certification decision (owner)

Run `/mentor cert` for the Databricks Generative AI Engineer Associate and for Azure AI-102. Decide using the roles you are about to apply to: does a posting filter on it, and does it cover something the project does not? Record the decision and the reason in `docs/mentor/progress.md`. If yes, book the date. Check the current exam price and syllabus on the vendor's page before paying; both change.

> **Check:** one line in the progress log: which cert, yes or no, why, and the date if booked.

### [ ] STEP 10 — LinkedIn and proof points (owner)

Update the headline and About section to lead with the AI work and link the post and the repository. Log the new proof points in `docs/mentor/progress.md` so the CV can be regenerated in career-ops.

> **Check:** the profile links work from a logged-out browser.

### [ ] STEP 11 — Records

- `docs/mentor/ai-engineer-learning-path.md`: the Chapter 13 row and the "Public proof" and "Prompt change driven by an eval" rows.
- `docs/mentor/README.md` chapter map and `docs/mentor/progress.md`.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Check:** `grep -n "PF-AI013b" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

## 📌 Notes

- **Phase 1 and Phase 2 do not wait for anything.** They can run alongside Chapter 11 and Chapter 12 work.
- **Re-verify before each publish.** A number that was right when the page was written can be stale by the time the full post goes out. Update the "last verified" date when you re-check.
- **The page is in `docs/`, not `docs/mentor/`.** The mentor folder is the learning track, written for you. This page is written for a stranger.
- **Tax and regulatory figures** do not belong in these posts. If one appears, FIN-06 applies: check its verified date first.
- STEP 3 evidence table: _(fill in during execution)_

# 📝 Knowledge Check

1. A reviewer opens the repository home page. What are the two clicks that take them to your evaluation numbers?
2. Why does the page report that the scanner blocked none of the held-out attacks, when leaving it out would look better?
3. Give the before-and-after prompt example from memory: what the eval caught, what changed, and what the score did.
4. Which number on the page are you least sure of, and what would you re-run to confirm it?
5. Under what conditions is a certification worth buying for this pivot, and under what conditions is it not?

# 🧾 Owner Review Checklist

- [ ] The first post is live and I checked it for real data before publishing.
- [ ] I can reach the evaluation numbers from the repo home in under a minute.
- [ ] Every number on the page matches its source file.
- [ ] The page says plainly what does not work yet.
- [ ] I said the 60-second pitch aloud and rewrote it in my own words.
- [ ] The video shows only anonymized data.
- [ ] The certification decision is written down with its reason.

## Execution Notes

### Phase 1 — Publish the eval-harness post

Model: **Sonnet 5.5** · Effort: **medium**. The executor does STEP 1 and prepares the text; the owner does STEP 2.

```
/execute plans/in-progress/learning/PF-AI013b-public-presence-case-study-todo.md phase 1
```

### Phase 2 — The case-study page

Model: **Sonnet 5.5** · Effort: **high**. Docs only, but every sentence is a factual claim, so the executor reads the result files before it writes. STEP 6 is the owner's.

```
/execute plans/in-progress/learning/PF-AI013b-public-presence-case-study-todo.md phase 2
```

### Phase 3 — Full post, video, certification, profile

Model: **Sonnet 5.5** · Effort: **medium** for the draft in STEP 7. Steps 8 to 10 are the owner's.
Before you start: PF-AI012 is done and the public URL works.

```
/execute plans/in-progress/learning/PF-AI013b-public-presence-case-study-todo.md phase 3
```

### Stop and ask if

- A number in the draft or on the page cannot be traced to a file.
- Any text, image or screen prepared for publishing contains data that might be real.
- No prompt change with a recoverable before-and-after score can be found for STEP 3.
