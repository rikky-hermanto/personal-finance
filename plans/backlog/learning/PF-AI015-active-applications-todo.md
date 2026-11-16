# PF-AI015 — Active Applications: Readiness Gate and a Deliberate Pipeline

> **Learning Phase:** Phase 3 · Chapter 15 of the learning path
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Depends on:** PF-AI013b (case-study page and first published post) and the story and deep-dive parts of PF-AI014. Deployment (PF-AI012) is strongly preferred but not required to send the first application.
> **Board objective:** Send a small number of well-matched AI engineering applications, each tailored and followed up, once the proof a reviewer will look for is in place.
> **Pivot goal:** Ship applications the way code is shipped: deliberate, checked before release, and tracked afterwards. Five to ten high-fit applications, not fifty generic ones.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [📌 Notes](#-notes)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

# 📖 Introduction

## High level — what is this?

The last chapter of the path, and the shortest plan. The work of finding, scoring and applying to roles is done in the career-ops project with its own skills. This plan does not repeat that. It holds the two things that belong to the learning track: a **readiness gate** that says when applying starts, and a **weekly record** in the progress log so the mentor skill can see the pipeline moving.

## Applying early wastes the roles you want most

It is tempting to start sending applications while the proof is still being built, on the idea that the process takes weeks anyway. The problem is that the first screen is often the only one. A reviewer who opens the repository and cannot find the AI work, or finds a claim with no number behind it, closes the tab. That company is then unavailable for months.

Waiting until everything is perfect fails in the other direction: the path has already run past its original ninety days. So the gate below is deliberately short. It lists only what a reviewer looks at in the first five minutes.

## A few matched applications beat many generic ones

The target companies are async-first and remote. They receive a lot of applications and the generic ones are filtered quickly. What gets through is a CV whose first lines match the posting, a link that shows the work, and a short note that says something specific. That takes about two hours per application, which is why the target is five to ten.

## 📚 Resources / Theory to Learn

| Resource | Used for |
|---|---|
| The career-ops skills: `scan`, `offer`, `pdf`, `contact`, `followup`, `interview-prep` | Finding roles, scoring fit, tailoring the CV, outreach and follow-up |
| [docs/mentor/field-guide-gap-analysis-2026-11-09.md](../../../docs/mentor/field-guide-gap-analysis-2026-11-09.md) | Which titles to target (Applied AI first, Agentic second) and what those postings ask for |
| The case-study page from PF-AI013b | The link every application carries |

# 🔧 Implementation

## 🎯 Objective

Open the application phase only when the readiness gate passes, send at least five tailored applications to roles that score 4.0 or higher on fit, keep a follow-up cadence running, and record the pipeline weekly in the progress log. This closes the Chapter 15 row.

## ✅ Acceptance Criteria

- [ ] Every item in the readiness gate is checked, with the date, before the first application is sent.
- [ ] At least five applications have been sent to roles scoring 4.0 or higher in the career-ops fit evaluation.
- [ ] Each application used a CV tailored to that posting and carried a working link to the case-study page.
- [ ] A follow-up cadence is active for every sent application.
- [ ] `docs/mentor/progress.md` has one line per week with: applications sent, responses, interviews scheduled, and one thing learned.
- [ ] Every claim in a CV or cover note matches the repository: nothing unmeasured is quoted as a number, and nothing unbuilt is described as built.

## 🧭 Approach

Gate, then pipeline, then a weekly look. Career-ops does the work and keeps the detailed tracker. This repository holds only the gate result and the weekly summary line.

Not in this plan: the CV content itself, salary negotiation, and interview preparation (PF-AI014). No personal contact details, recruiter names or offer figures are written into this repository; they stay in career-ops.

## 📂 Affected Files

| File | Change |
|------|--------|
| `docs/mentor/progress.md` | Edit — the gate result and the weekly pipeline line |
| `docs/mentor/ai-engineer-learning-path.md`, `docs/mentor/README.md` | Edit — records |
| Outside this repo | Scans, fit evaluations, tailored CVs, outreach and the tracker, all in career-ops |

## 📋 TODO

### [ ] STEP 1 — The readiness gate (owner)

Check each item and write the date beside it in the progress log. Do not send an application until all are checked. If one cannot be met, write why and what replaces it; do not skip it silently.

- [ ] The case-study page is linked from the README, and the evaluation numbers are reachable from the repository home in under a minute (PF-AI013b).
- [ ] At least one post is published and linked.
- [ ] Agent evaluation has run, or the page states plainly that it has not. This has been the oldest open item since 2026-10-17.
- [ ] The CV has been regenerated in career-ops with the proof points logged in the progress log, and every number on it traces to a result file.
- [ ] Five stories and three deep dives have each been delivered aloud at least once (PF-AI014).
- [ ] A private-window check of the repository shows no real financial data, no secrets, and no broken links from the README.
- [ ] Preferred, not required: the public URL from PF-AI012 works. If it does not, the CV says "runs locally with Docker Compose" and does not say "deployed".

> **Why:** each item is something a reviewer checks in the first five minutes or asks about in the first call. The last item exists because "deployed" is the claim most often stretched.
> **Check:** seven dated lines in the progress log.

### [ ] STEP 2 — Build the shortlist

Run the career-ops scan for AI engineering roles, Applied AI titles first and Agentic titles second. Filter for async-first or fully remote companies; the curriculum's starting list includes Grafana, Supabase, PostHog, GitLab, WorkOS, 1Password, Neon, Turso, Qdrant, Weaviate, LangChain, Langfuse, Anthropic, Datadog and Intercom. Evaluate each role with the fit evaluation and keep only those scoring 4.0 or higher.

For each role kept, note the two or three requirements in the posting that this project answers directly, and any it does not.

> **Why:** the note on what the project does not answer is as useful as the match. It tells you what the first interview will probe.
> **Check:** a shortlist of at least eight roles at 4.0 or higher, so five applications survive roles closing.

### [ ] STEP 3 — Apply, one at a time

For each shortlisted role: generate a tailored CV, write a short cover note that names one specific thing about the company's product or stack and one result from this project with its number, and send it. Where a relevant person can be found, send one short outreach message. Record the application in the career-ops tracker and set its follow-up date.

Spread the applications over two to three weeks. The first interview usually changes how you would write the next application.

> **Check:** five or more applications sent, each with a follow-up date.

### [ ] STEP 4 — The weekly look

Once a week, with `/mentor weekly`, add one line to the progress log: sent, responses, interviews, and one thing learned. If two weeks pass with no response at all, change something concrete before sending more: the first three lines of the CV, the titles targeted, or the fit threshold.

Take part in one or two AI engineering communities where the target companies' engineers are active. Answer questions there; do not post job requests.

> **Why:** a pipeline with no feedback loop is the application version of an eval that never runs.
> **Check:** a line every week while the plan is in progress.

### [ ] STEP 5 — Records

- `docs/mentor/ai-engineer-learning-path.md`: the Chapter 15 row.
- `docs/mentor/README.md` chapter map.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Check:** `grep -n "PF-AI015" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

## 📌 Notes

- **The schedule in the learning path puts this from January 2027.** The gate decides the real start, not the date.
- **Interviews feed back into PF-AI014.** A question you could not answer becomes a line in the interview practice log the same day.
- **Roles outside the target shape.** Forward Deployed roles are skipped on purpose (customer-facing work conflicts with the remote, async-first target). If a role needs fine-tuning or training-side MLOps, that is the trigger to revisit the deferred layer of the learning path, not a reason to stretch the CV.
- **Nothing personal in this repository.** Contact names, messages and compensation stay in career-ops.

# 🧾 Owner Review Checklist

- [ ] I did not send an application before the gate passed.
- [ ] Each application was tailored, and I can say what was specific about it.
- [ ] Every number on my CV traces to a file in this repository.
- [ ] The progress log has a pipeline line for every week.
- [ ] I changed something when two weeks passed without a response.

## Execution Notes

This plan is owner-run through the career-ops project. There is no `/execute` command for it here.

Where an agent helps in this repository: checking the readiness gate's verifiable items (links resolve, numbers on the case-study page match their sources, no secrets in the working tree). Model: **Sonnet 5.5** · Effort: **medium**.

### Stop and ask if

- A gate item cannot be met and there is no honest replacement for it.
- A posting asks for a claim the repository cannot support.
