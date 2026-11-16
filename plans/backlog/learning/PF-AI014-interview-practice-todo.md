# PF-AI014 — Interview Practice: Stories, Deep Dives, System Design, Take-Homes, Live Coding

> **Learning Phase:** Phase 3 · Chapter 14 · topics 21, 22, 23 and 24 of the learning path
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Depends on:** nothing for Phase 1 (live coding), which starts now. Phases 2 to 5 are best after PF-AI013 and PF-AI013b, because the stories reuse those pages; they are not blocked by them.
> **Board objective:** Practice the interview rounds a project alone cannot prepare you for: explaining your work aloud, designing an AI system in 45 minutes, building from scratch in four hours, and coding without AI help.
> **Pivot goal:** Every chapter so far was built inside one large repository, over days, with AI in the loop. Interviews test the opposite: a blank page, a clock, and often no AI tools. This plan is the practice for that, with a log that shows whether it is getting better.

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

A practice plan. Almost every step is the owner's, done with a timer, and most of it cannot be delegated to an agent. An agent can prepare question lists, check a write-up against the code, and review a recording's transcript afterwards. It cannot do the reps.

| Round | What it tests | Practice here | Volume |
|---|---|---|---|
| Live coding | Writing working Python under time pressure, without AI tools | Timed implementation problems | Two 45-minute sessions a week, from now |
| Fundamentals screen | Whether you understand how an LLM works | One two-evening skim, then quick-fire questions | 2 evenings |
| Project deep dive and behavioral | Whether you can explain what you built and why | Five stories, three deep dives, AI-specific answers | About 8 hours |
| AI system design | Trade-offs, failure modes, cost, evaluation, safety | Six timed designs, spoken and recorded | 6 × 45 minutes, plus review |
| Take-home | Building something small and defensible from nothing | Two four-hour builds, each with a README and a video | 2 × 4 hours, plus the defence |

## Knowing something and saying it are different skills

You can explain the eval harness in writing because you wrote it over weeks. Saying it in two minutes to a stranger, without notes, while they interrupt, is a separate skill. It fails in a specific way: you start in the middle, use names only you know, and run out of time before the result.

Reading your notes again does not fix this. It feels like progress because the material is familiar. The only practice that transfers is saying it aloud against a clock, recording it, and listening back. It is uncomfortable, which is why it gets skipped, which is why it works.

## A system design round is judged on what you leave out

In a 45-minute design, a strong candidate and a weak one often draw the same boxes. The difference is in the first five minutes and the last ten. The strong one asks what the system is for and how it will be judged before drawing anything, and ends with how it fails, what it costs, and how they would know it stopped working. The field guide lists the usual mistakes: no evaluation or monitoring plan, ignoring cost, putting control flow in prompts, and choosing agents because they are interesting.

So every design here uses the same five moves, in the same order, until the order is automatic: frame the problem, sketch the architecture, go deep on one part, name the trade-offs and failure modes, then summarise with the risks.

## Four hours from an empty folder is not four hours inside a big repo

In this repository, the eval harness, the provider factory, tracing and the test setup already exist. A take-home starts with none of them. The common failure is spending three hours on the feature and having nothing that shows it works.

The fix is an order of work: eval harness first, even a seven-question one, then the smallest thing that passes it, then the README. The README of decisions and trade-offs, and the conversation defending it, often count for more than the code.

## Live coding is the slowest gap to close

Most of the Python in this project was written with an AI assistant. That is how the job is done now, and it is also why this skill is weak: you can read and review Python well, and still stall when typing it from a blank file with someone watching. Some live rounds ban AI tools.

This does not improve in a week of cramming. It improves with short, regular sessions over months. That is why this phase starts now and runs in the background of every other chapter.

## 📚 Resources / Theory to Learn

The field guide is a local clone at `C:\workspaces\ai-engineering-field-guide` ([fork](https://github.com/rikky-hermanto/ai-engineering-field-guide)).

| Resource | Used for | Time |
|---|---|---|
| Field guide `interview/questions/02-coding.md` | The live-coding problem list and Python depth questions | 20m to skim |
| Field guide `interview/questions/01-theory.md` | The fundamentals question list | 20m |
| [docs/mentor/topics/01-llm-fundamentals.md](../../../docs/mentor/topics/01-llm-fundamentals.md) · [08-fine-tuned-llms.md](../../../docs/mentor/topics/08-fine-tuned-llms.md) | Topic 24: the fundamentals skim and the fine-tuning answer | 2 evenings |
| Andrej Karpathy — *Intro to Large Language Models* | The same, as a talk | 1h |
| Field guide `interview/questions/04-ai-system-design.md` | The design prompts and what interviewers look for | 30m |
| Chip Huyen — *Building a Generative AI Platform* | The reference architecture for design answers | 1h |
| Two case studies named in the learning path: Doctolib's agent graph and Uber's GenAI Gateway | What real designs look like, before your first timed one | 1h |
| Field guide `interview/questions/06-home-assignments.md` | Real company take-home prompts | 30m |
| PF-AI013's three write-ups and PF-AI013b's case-study page | Raw material for stories and deep dives | — |

## 🧠 Learning Strategy

Recall, then check. For anything spoken: close the notes, say it, then open the notes and mark what you missed. Never the other way round.

Record everything spoken. Listening back is where the improvement happens. One recording reviewed is worth three made and ignored.

Log every session in one line, the same day. The log is the only way to see the trend, and a gap in it is information.

Mix the phases. After the first two weeks, do not finish all six designs and then all the stories. Alternate. Interviews mix them too.

# 🔧 Implementation

## 🎯 Objective

Build interview readiness across the five rounds an AI engineering process uses, with every spoken answer timed and recorded and every session logged, so that readiness is shown by a record of practice. This closes the Chapter 14 rows, topics 21 to 23, the fundamentals skim (topic 24), and the "AI-specific behavioral answers" row of the field guide check.

## ✅ Acceptance Criteria

- [ ] `docs/mentor/interview-practice.md` exists and has one dated line per practice session, with the problem, the time taken and one thing to fix.
- [ ] Live coding: at least 16 sessions logged (eight weeks at two a week), each 45 minutes, with no AI tools, and at least four distinct problems finished through all their levels.
- [ ] The Python depth questions (the GIL, asyncio, concurrency against parallelism) each have a spoken answer under two minutes.
- [ ] Fundamentals: the skim is done, and the one-page "when would you fine-tune instead of prompting or RAG?" answer exists, using this project as the example.
- [ ] Five STAR stories are written, and each has been delivered aloud in under three minutes.
- [ ] Three deep dives have been delivered aloud, recorded, and each brought under five minutes.
- [ ] The three AI-specific behavioral answers and the four common screen questions each have a spoken answer under two minutes.
- [ ] Six system designs were done at 45 minutes each, spoken and recorded, and each has a short review against the five moves and the four common mistakes.
- [ ] Two take-homes were built from an empty folder in four hours each, eval harness first, each with a README of decisions and a 5-minute video, and each defended aloud. Both are public repositories containing no real data.
- [ ] No story, answer or repository claims something the project has not measured or built.

## 🧭 Approach

One log, five phases, all owner-run. The log lives in this repository because the mentor skill reads here. The stories are written with career-ops and stay there; this plan tracks that they exist and were rehearsed. The two take-home repositories live outside this one.

Agents help at the edges only: preparing a question sheet, checking a story's facts against the code and result files, and reviewing a transcript against the five design moves after the owner has done the timed attempt.

Not in this plan: data-structure and algorithm drills (coordinate with any DSA practice already running for other interviews, do not duplicate it), mock interviews with other people (worth doing; arrange separately), and applications (PF-AI015).

## 📂 Affected Files

| File | Change |
|------|--------|
| `docs/mentor/interview-practice.md` | Create — the session log and the checklists |
| `docs/mentor/topics/08-fine-tuned-llms.md` | Edit — add the one-page fine-tuning answer if it is not already there |
| `docs/mentor/ai-engineer-learning-path.md`, `docs/mentor/README.md`, `docs/mentor/progress.md` | Edit — records |
| Outside this repo | STAR stories in career-ops; two public take-home repositories; recordings kept privately |

## 📋 TODO

## Phase 1 — Python live coding without AI tools (topic 23, starts now, runs in the background)

### [ ] STEP 1 — Create the log and fix the schedule

Create `docs/mentor/interview-practice.md` with a section per phase and this line format:

```markdown
| Date | Round | Problem | Time | Finished? | One thing to fix |
|---|---|---|---|---|---|
```

Put two fixed 45-minute slots in the calendar each week. Decide them now and write them at the top of the log.

> **Why:** "twice a week when there is time" becomes zero. A fixed slot is the only version of this that has survived in the progress log.
> **Check:** the file exists and names the two weekly slots.

### [ ] STEP 2 — Set up a session with no AI tools

Use a plain editor or a terminal with the AI extensions disabled, and a Python interpreter. No assistant, no autocomplete that suggests whole lines. The standard library documentation is allowed, as it usually is in a real round.

> **Check:** you can open the practice setup in under a minute, and nothing in it suggests code.

### [ ] STEP 3 — The sessions (ongoing)

Work through implementation problems that grow in levels, from the field guide list. Start with these four and take each through every level before moving on:

| Problem | Levels |
|---|---|
| Key-value store | get and set; then time-to-live; then expiry without scanning everything; then a size limit |
| Rate limiter | fixed window; then sliding window; then per-key limits; then safe under concurrent calls |
| LRU cache | get and put in constant time; then a capacity; then time-to-live; then thread safety |
| Simple crawler | fetch and parse links; then no repeats; then a depth limit; then concurrent fetches with a cap |

Each session: read the problem, say your plan aloud for two minutes, then code. Run it. Write tests if time allows. Stop at 45 minutes whatever the state. Log the line the same day.

Every fourth session, replace coding with the Python depth questions: explain the GIL, asyncio, and concurrency against parallelism aloud, two minutes each, then check against the documentation.

> **Why:** talking through the plan first is part of the round, and it is the part that disappears under pressure. Stopping at 45 minutes keeps the practice honest about pace.
> **Check:** two log lines a week. After four weeks, compare the time to the first working version against the first sessions.

## Phase 2 — LLM fundamentals and the fine-tuning answer (topic 24, two evenings)

### [ ] STEP 4 — The skim

Evening one: read `topics/01-llm-fundamentals.md` and watch the Karpathy talk. Then, without notes, explain aloud in about a minute each: tokenization, attention at a high level, the KV cache, temperature and top-p, and what the context window limits. Check the question list in the field guide's theory file and mark the ones you could not answer.

> **Check:** five spoken explanations, and a list of the questions to revisit.

### [ ] STEP 5 — The fine-tuning answer

Evening two: write one page answering "when would you fine-tune instead of prompting or using RAG?" with this project as the example. Indonesian bank-description categorization is the natural candidate: say what would make fine-tuning worth it there, and why it has not been needed so far, with the categorization eval numbers. Put it in `topics/08-fine-tuned-llms.md` if that file does not already contain it. Then say it aloud in under two minutes.

> **Why:** there is no fine-tuning project in this path on purpose. The answer still has to be good, because the question is common and a vague reply undoes a strong project round.
> **Check:** the page exists and the spoken version is under two minutes.

## Phase 3 — Stories, deep dives and behavioral answers

### [ ] STEP 6 — Five STAR stories

Write them with `/career-ops interview-prep`. The five from the curriculum: the tool use against JSON mode decision; the three-tier duplicate detection design; the PDF text extraction that cut token cost; the RAG pipeline, including the result where hybrid search lost; and the agent and MCP system. For each, name the result as a number with its source, and add one line on what you would do differently.

Before rehearsing, check each story's facts against the code and the result files. A story that claims a number the repository does not contain gets corrected or cut.

> **Check:** five stories written, each with a sourced number, each delivered aloud in under three minutes and logged.

### [ ] STEP 7 — Three deep dives, recorded

Five minutes each, aloud, recorded: "explain your extraction pipeline", "how do you evaluate LLM accuracy in production?", and "walk me through your RAG and agent architecture". Listen back once. Note where you started in the middle, where you used a name without explaining it, and where you ran over. Record again.

> **Check:** three recordings under five minutes each, on the second attempt or later.

### [ ] STEP 8 — AI-specific behavioral answers and common screen questions

Prepare and say aloud, two minutes each:

- How you stay current.
- A recent AI development that caught your attention, and why it matters for your work. Refresh this one before each interview; it goes stale in weeks.
- An AI solution that failed. Two are already in this repository: hybrid search losing to vector search, and the guardrail hold-out result.
- RAG against fine-tuning, and when you use each (from STEP 5).
- How you handle hallucinations in production (the answer-accuracy work: routing numeric questions to SQL instead of retrieval).
- How you keep LLM costs under control at scale (from PF-AI012 and PF-AI012b, once they have numbers).
- What MCP is and why it matters.

> **Check:** seven log lines, each under two minutes.

## Phase 4 — AI system design practice (topic 21)

### [ ] STEP 9 — Prepare the frame once

Read the Chip Huyen article and the two case studies first. Then write a one-page sheet with the five moves and, under each, the questions you ask every time:

1. **Frame:** who uses it, what a good answer is, how it will be measured, scale, latency and cost limits, what must never happen.
2. **Sketch:** the main components and the path of one request.
3. **Deep dive:** one of retrieval, tools, memory, evaluation or safety, chosen by what the problem makes hard.
4. **Trade-offs and failure modes:** what breaks, how you would know, what it costs, what you chose not to build.
5. **Summary:** the design in four sentences and the top three risks.

> **Check:** the sheet fits on one page and you can recite the five moves.

### [ ] STEP 10 — Six timed designs

Forty-five minutes each, spoken aloud, recorded, with a drawing tool or paper. One per session, no more than two a week:

1. A document question-answering system over 10 million documents.
2. A chat assistant for 1 million daily users, where cost is the constraint.
3. A multi-step agent workflow, such as email triage or scheduling.
4. A pipeline that processes 10,000 uploaded payslips and identity documents a month. This is the closest to this project; do it third or fourth, not first.
5. Memory across conversations.
6. Policy-violation detection.

After each, review the recording against the sheet and the four common mistakes: no evaluation or monitoring plan, cost ignored, control flow put in prompts, agents chosen without a reason. Log the one thing to fix, and carry it into the next design.

> **Why:** doing the project-shaped one first makes the frame feel easier than it is. Starting with an unfamiliar problem shows whether the five moves hold without your own system to lean on.
> **Check:** six log lines, each with a named fix, and the fix from one session visibly applied in the next.

## Phase 5 — Timed greenfield take-homes (topic 22)

### [ ] STEP 11 — Take-home one: an agentic build

Four hours, from an empty folder. Suggested prompt: an inbox-triage agent with a human approval step before any action. Order of work: the eval set and a script that scores it in the first 45 minutes, then the smallest agent that passes, then the approval step, then the README. Use only invented data.

The README covers: what it does, how to run it, the decisions and the options you rejected, what is not done, and what you would do with another day. Record a 5-minute video walking through it. Then defend it aloud for ten minutes against these questions: why this design, how you know it works, what breaks first, what it costs.

> **Check:** a public repository with a README and eval results, a video link, and a log line with the actual time spent per part.

### [ ] STEP 12 — Take-home two: an applied build

Four hours, from an empty folder. Suggested prompt: a policy-document RAG with mandatory citations, a refusal path for questions the documents cannot answer, and a seven-question eval covering answerable, partly answerable and unanswerable questions. Same order of work, same README, same video, same defence.

Compare the time split with take-home one. If the eval harness took less time and the README more, the first one taught something.

> **Check:** a second public repository, and a log line comparing the two time splits.

### [ ] STEP 13 — Records

- `docs/mentor/ai-engineer-learning-path.md`: the Chapter 14 rows, topics 21 to 24, and the "AI-specific behavioral answers" row.
- `docs/mentor/README.md` chapter map and `docs/mentor/progress.md`.
- Add the two take-home repositories to the case-study page from PF-AI013b.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Check:** `grep -n "PF-AI014" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

## 📌 Notes

- **This plan stays in progress for months.** Phase 1 is a habit, not a task. Move the plan to in-progress when the first session is logged, and close it when the acceptance criteria are met, not when the calendar says so.
- **Rough size.** About twenty hours of interview practice across Phases 2 to 5, plus the live-coding sessions. The learning path's schedule gives this until early January 2027.
- **Recordings stay private.** They are for review, not for publishing. The two take-home videos are the exception and must contain only invented data.
- **Keep answers current.** Model names, prices and "recent developments" go stale quickly. Re-check any figure against its source in the week of an interview.
- **Cost answers depend on Chapter 12.** Until PF-AI012 and PF-AI012b have produced numbers, the cost answer in STEP 8 uses what Langfuse already shows and says what has not been measured.

# 📝 Knowledge Check

1. Recite the five moves of a system design answer, and the question you ask first in the framing move.
2. Name the four common mistakes in an AI system design round. Which one did your last recording make?
3. In a four-hour take-home, what do you build in the first 45 minutes, and why?
4. Explain the GIL in under a minute, and say when asyncio helps and when it does not.
5. When would you fine-tune instead of prompting or using RAG? Use this project's categorizer as the example.
6. Tell the hybrid search story in under two minutes, ending with what you would do differently.

# 🧾 Owner Review Checklist

- [ ] The log shows two live-coding sessions a week, without long gaps.
- [ ] I listened back to every recording at least once.
- [ ] Each of the six designs has a named fix, and I can show it applied in a later one.
- [ ] Both take-homes started with the eval harness and ended with a README and a video.
- [ ] Every number in my stories traces to a file.
- [ ] I can answer the six knowledge-check questions aloud.

## Execution Notes

This plan is owner-run. There is no `/execute` command for the practice itself.

Where an agent helps:

- **STEP 1:** create the log file with its sections and line format. Model: **Haiku 5.5** · Effort: **low**.
- **STEP 6:** check each written story's facts against the code and result files, and list anything unsupported. Model: **Sonnet 5.5** · Effort: **high**.
- **STEP 10:** given a transcript of a recorded design, review it against the five moves and the four mistakes. Do this only after the timed attempt, never before. Model: **Sonnet 5.5** · Effort: **medium**.

### Stop and ask if

- Three weeks pass with no live-coding line in the log. The schedule is not working and needs changing, not more resolve.
- A story cannot be supported by the repository and there is no honest version of it.
