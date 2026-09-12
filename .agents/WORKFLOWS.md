# Shared Codex workflow conventions

Read root `AGENTS.md` and the relevant scoped instructions before performing a workflow.
These conventions apply to every skill in `.agents/skills/`.

## Separate configuration, shared task state

- Preserve all non-plan Claude configuration, all `CLAUDE.md` files, Claude GitHub
  workflows, and `.agents/.claude-plugin/plugin.json`. Never execute Claude hooks.
- `.claude/plans/` is the explicitly authorized shared writable task workspace.
  Codex may create/edit plans, update progress and acceptance criteria, maintain
  BOARD.md and learning material/glossary, and archive completed feature plans.
- Resolve a user-supplied path first, then `.claude/plans/`, including learning/ and
  completed/. Edit existing plans directly; do not create a second Codex plan tree,
  working copy, or board. Preserve plan history; learning plans stay in learning/.
- Re-read plans and board immediately before writing. Use narrow patches, preserve
  the other agent's edits, and avoid concurrent edits to the same file. Never delete
  plan history without explicit authorization.
- Keep plan/board status consistent after task operations. Respect the board's
  source-of-truth declaration for GitHub-linked tasks; report conflicts rather than
  claiming unperformed remote synchronization. Loading a skill does not create a task.
- Use existing ticket IDs when supplied. Inspect the shared plan tree and board before allocating
  an ID; support PF-, PF-S, and PF-AI. A descriptive filename is preferable when no
  ticket is assigned. Never confuse a PF identifier with a GitHub issue number.
- Read GitHub only when relevant and available; preserve local-only tickets. Remote
  mutations, publication, commits, or pushes require authorization in the actual task.
  An instruction to adapt a skill does not invoke its workflow.
- Shared product docs may be edited for a requested documentation task. Plans and
  plan-linked reviews/verdicts belong in `.claude/plans/`. Independent Codex reviews,
  ADRs, and captures may use `docs/codex/`; explicit destinations take precedence.
  No changes outside this repository.

## Tools and execution

- Skill names refer to `.agents/skills/<name>/SKILL.md`. Read the file directly or use
  the client's skill picker; Claude slash commands and its Skill/Agent/Workflow tools
  are not required. Use only tools available in the current Codex session.
- Keep work local unless the user asks for an external action. Do not assume an
  installed MCP server or credentials. Report unavailable checks explicitly.
- Prefer PowerShell-compatible commands with explicit working directories. Batch
  independent reads; sequence dependent edits. Never source Bash virtual environments.
- Delegation is optional and must follow the current session's authorization and tool
  rules. Do not assume a review persona implies spawning agents or changing models.
- Preserve the user's Git identity; no AI author/co-author trailer. Stage only task
  files. Do not expose credentials in logs, search results, or commit review snippets.

## Evidence and deliverables

Distinguish implemented behavior, intended design, measured results, and assumptions.
Verify historical claims against code. Finance/legal/current product claims require
current primary sources when relevant; stale reference tables are not live evidence.
Review findings need concrete triggers, impact, and file/line evidence. Plans are not
proof of completion. Match checks to scope and report failed/skipped/unavailable work.
Do not invent actual test counts, metrics, professional credentials, or prior experience.

Use the requested output depth. Saving a requested artifact is already authorized;
do not add a second confirmation step. If only discussion/review is requested, return
the result without automatically implementing or publishing it.
