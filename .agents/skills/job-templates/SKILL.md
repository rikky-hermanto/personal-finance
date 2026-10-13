---
name: job-templates
description: Find the work the user hands to AI over and over (status checks, reports, reviews, write-ups, emails, summaries), rank the repeat jobs, and turn each of the top five into a one-page template with purpose, inputs, steps, output format, a real finished example, and a done check, then prove each template on a fresh real case. Use when the user says "find my repeat jobs", "turn what I keep asking into templates", "/job-templates", "I keep re-explaining this", or wants the same output format every time without re-explaining it. Also use with one job name to build or repair a single template.
---

# Job templates

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Find the jobs the user keeps giving AI, and turn each one into a template so the output comes back in the same shape every time, with no re-explaining.

**Approval gates.** Steps 1 and 2 are read-only. Do not create or change files until the user confirms the top five. This overrides the usual "run end to end" preference: stop after Step 2 and again whenever Step 3 needs the user to pick an example.

**Single-job mode.** `/job-templates <job name>` skips Steps 1 and 2: confirm the job in one line, then run Steps 3 to 5 for that job only. Still gather real examples from history first.

## Step 1: Find the repeat jobs

Review the last 30 to 60 days. Sources, in order:

1. **Transcripts.** Run the bundled collector from your home directory:
   `python -I <this skill folder>/scripts/collect_requests.py --days 60 > <scratchpad>/requests.tsv`
   It reads `~/.claude/projects/*/*.jsonl` (Claude Code) and `~/.codex/sessions/` (Codex), drops injected context and subagent or reviewer sessions, and prints one row per request: date, tool, project, text. Add `--project <name>` to narrow it. Claude Code prunes old transcripts, so say how far back the data actually reaches.
2. **Skill use.** Slash commands appear in the collector output as `/name args`. A job that already has a skill is not a new template; note it and move on, unless the user re-explains it every time anyway (then the skill needs fixing, which is a finding).
3. **Sent and saved work.** `git log --since=60.days --name-only` across the user's repos, `plans/`, `docs/`, and `ai/`. Repeated file shapes (status reports, reviews, summaries) are repeat jobs too.

Group requests that ask for the same output, even in different words or languages (English and Indonesian mixed is normal here). Count only requests you can point to. **Merge rule:** if two jobs produce the same output for the same reader, they are one job; say which you merged and why.

For each job record: **name**, **frequency** (count of real requests), **example** (one request quoted verbatim with its date).

If the history can't be read, say so plainly, then interview the user: ask one question at a time about the work they give AI each week until the list is complete. Never invent history, examples, or counts.

## Step 2: Rank and stop

Rank by frequency times the time a template would save (how much the user re-explains, and how much the output varies today). Show a table:

| # | Job | Times | Example request (date) | Why a template helps |

Show the top five plus the next two or three as swap candidates. **Stop here and wait** for the user to confirm or swap.

## Step 3: Build one template per confirmed job

Each template is one page at most, in this exact order:

1. **PURPOSE.** What the job is and who reads the result. Two lines.
2. **INPUTS.** What the user provides each time, and the question to ask when each one is missing. Inputs the agent can find itself (git state, board, files) are listed as "look up", not asked for.
3. **STEPS.** Numbered, in the order a competent employee would do them. Short lines, no essays.
4. **OUTPUT FORMAT.** Exact headings, order, length limits, tone, and language. Show it as a skeleton.
5. **FINISHED EXAMPLE.** The best real past output for this job, reproduced in full (trim to fit one page, and mark any trimming). If several are good, show the candidates and let the user choose. Never write a fake one; if no real example exists, say so and fill this in after Step 5 from the first passing run.
6. **DONE CHECK.** Three to five yes/no checks, each one testable by reading the output.

Respect `ai/shared/preferences.md` (lead with the outcome, full sentences, no arrow chains) unless the job's reader needs something else.

## Step 4: File them

- Save each template as `ai/<job-folder>/templates/<job-slug>.md`. Pick the job folder from `ai/MAP.md` (`build/`, `decide/`, `write/`, `learn/`, `design/`). If none fits, propose a new folder and wait for a yes before creating it. Create the `templates/` subfolder when it's missing.
- Add one line per template to `ai/MAP.md` under "Which folder for which request", in the form `"<how the user asks>" → ai/<folder>/templates/<job-slug>.md`. Keep the map under 60 lines.
- Add the template to that folder's `README.md` list as well.
- If `ai/` doesn't exist in the current checkout, stop and tell the user; it lives on branch `chore/ai-setup-audit` until that is merged.

## Step 5: Prove each template works

For each template, take a fresh real case: the newest real request for that job that was not used as the finished example, or ask the user for one. Run the template exactly as written, then show:

- the output
- each done check marked **PASS** or **FAIL**, with one line of evidence

If any check fails, change the **template** (a missing input, a vague step, a loose format), not just the output, then run it again from the top. Repeat until every check passes. Do not claim success before that. Report the number of rounds each template needed and what changed.

## Rules

- Real past work only. Never fabricate examples, counts, dates, or history.
- One page per template. Concise steps and explicit formats.
- Merge jobs that are effectively the same, and explain the merge.
- No file changes before the top five are approved.
- When history is unreadable, say so and ask for what's missing.
- Leave the work uncommitted unless the user asks to commit.
