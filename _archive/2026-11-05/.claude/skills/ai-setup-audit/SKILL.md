---
name: ai-setup-audit
description: Audit everything the AI setup (Claude Code and Codex) loads — skills, rules, instruction files, memory, hooks, settings, MCP servers, agents — score each item KEEP, MERGE, CUT, or UNSURE against real usage, and reorganize what's left under the ai/ job folders. Use when a new model ships, when the setup feels bloated or slow, or when the user says "audit my AI setup", "/ai-setup-audit", "what does my setup load", or "clean up my skills".
---

# AI setup audit

Find everything the AI setup loads, decide what earns its place, and keep the rest in a structure an agent can navigate without help.

**Approval gate.** Steps 1–5 are read-only. Do not delete, move, or rename anything until the user approves the plan. This overrides the usual "run end to end" preference: the audit stops at Step 5 and waits.

## Before you start

- Work in a git worktree on a branch such as `chore/ai-setup-audit-<YYYY-MM-DD>`, so every change is one reviewable, reversible diff.
- Read the last audit report in `ai/audits/` (newest file). Its UNSURE list, "not fixed" list, and recorded model are this audit's starting point.
- Note the current model name. Record it in the report: the strictness test in Step 2 depends on it.

## Step 1: Inventory everything

List everything the setup can load or read, in both tools and at both levels:

| Where | What to look for |
|---|---|
| Repo, Claude | `CLAUDE.md` files (root and nested), `.claude/skills/`, `.claude/rules/`, `.claude/agents/`, `.claude/hooks/`, `.claude/settings*.json`, `.mcp.json` |
| Repo, Codex | `AGENTS.md` files (root and nested), `.agents/skills/`, `.agents/rules/`, `.agents/WORKFLOWS.md`, `.codex/` |
| Repo, shared | `ai/` (map, preferences, job folders), docs the setup points agents to |
| Personal | `~/.claude/` (CLAUDE.md, skills, agents, commands, settings, plugins), `~/.codex/`, project memory in `~/.claude/projects/<project>/memory/` |
| Tools | MCP servers and connectors from settings files; note which are enabled |

For each item record: name, location, what it claims to do, rough length (lines), last changed (`git log -1 --format=%cs -- <path>`, or file date if untracked), and last used.

**Usage evidence.** Never invent it. Write "unknown" when you can't find any.
- Claude: session transcripts in `~/.claude/projects/<project-dir>/*.jsonl`. Count `Skill` tool calls and slash commands per skill name over the last 30 days. Include worktree project dirs (`<project>--worktrees-*`).
- Codex: session logs in `~/.codex/sessions/` if present.
- Discount setup sessions: a session that opens eight or more skills at once is maintenance, not real use. Report both counts.
- Loaded-every-session files (rules, CLAUDE.md, preferences) have no invocation count. Judge them on content instead.

## Step 2: Score every item

One bucket per item, with a one-line reason:

- **KEEP:** used in the last 30 days AND it changes the result in a way the current model would not get right on its own.
- **MERGE:** overlaps another item (name it).
- **CUT:** unused in 30 days, duplicates something, describes a stack that no longer exists, or tells the model to do what it already does by default.
- **UNSURE:** you can't tell; the user decides.

Be strict. If a good modern model would get it right without the instruction, it is a CUT. When the model has changed since the last audit, re-test earlier KEEP items against that bar; newer models make some instructions redundant.

**Before marking anything CUT or MERGE, search for references to it** (`grep -r` across the repo, plans, and docs). Something still linked from an active plan or from other docs is not dead. Last time, `docs/codex/jev-audit.md` was the source for an in-progress plan, and `create-diagram` was referenced by 11 diagram files.

Also flag stale facts inside items you KEEP (old framework names, renamed fields, removed projects). Fixing those is part of the plan.

## Step 3: Propose the structure

The structure already exists: one folder per job under `ai/` (`build/`, `decide/`, `write/`, `learn/`, `design/`), shared preferences in `ai/shared/preferences.md`, and the map in `ai/MAP.md`. Inside each job folder: that job's instructions, templates, and finished examples.

Propose changes only where the work has changed: a new job folder, a folder nobody uses, or items that sit in the wrong place. Show the full tree either way, marking what changes.

Skills stay where each tool loads them (`.claude/skills/<name>/` and `.agents/skills/<name>/`, same name in both). Job folders point to skills; they don't hold copies.

## Step 4: Update the map

`ai/MAP.md` must stay under 60 lines and tell any agent:

- what each folder is for, in one line
- which folder or skill to open for which kind of request
- where shared preferences live

It points to things and never repeats their contents. Draft the new version if anything changed.

## Step 5: Show the plan and stop

Give the user:

1. A table of every item with its bucket and reason.
2. Counts: total, KEEP, MERGE, CUT, UNSURE, and the rough share of the setup (by lines loaded) the cuts remove.
3. The proposed tree.
4. The draft map (or "unchanged").
5. The exact moves, merges, fixes, and archives, in order.

Write all of this to `ai/audits/<YYYY-MM-DD>.md`, then stop and wait for approval.

## After approval: execute

1. **Archive, never delete.** `git mv` cut items into `_archive/<YYYY-MM-DD>/`, keeping their original paths underneath. Personal-level items go to `~/.claude/_archive/<YYYY-MM-DD>/`; memory files go to `memory/_archive/<YYYY-MM-DD>/`.
2. **Do merges and stale-fact fixes in both skill trees.** A skill exists in `.claude/skills/` and `.agents/skills/` under the same name. Codex copies must keep their link to `.agents/WORKFLOWS.md`.
3. **Update every pointer:** `ai/MAP.md`, job READMEs, `CLAUDE.md`, `AGENTS.md`, `.agents/WORKFLOWS.md`, `docs/INDEX.md`, and the project memory index.
4. **Verify:**
   - Run the Codex validator: `node .agents/scripts/validate-setup.cjs`. It needs a YAML parser from `apps/frontend/node_modules`. In a fresh worktree, run `npm install` there first or point it at the main checkout's `node_modules`.
   - Check that every relative markdown link in `ai/`, `.claude/`, `.agents/`, `CLAUDE.md`, `AGENTS.md`, and `docs/INDEX.md` resolves. Separate the links you broke (fix them) from ones that were already broken (list them).
   - Confirm `.claude/settings.json` still parses as JSON.
5. **Report back** by appending an execution log to the audit file. Include where you departed from the approved plan and why, before/after counts, where the archives are, and any problems you found but didn't fix.
6. Leave the work uncommitted unless the user asks to commit.

## Gotchas

- If a hook rewrites `git add` and the worktree guard rejects it, `git stage` does the same thing.
- `git push` can be blocked inside an isolated worktree session. Exit the worktree with `keep`, then push from the main checkout.
- CRLF/LF warnings on new markdown files are harmless.

## Rules

- Never delete permanently. Archive.
- Never invent usage data. If you can't find it, write "unknown".
- Plain language in everything the user reads: full sentences, no arrow chains, no jargon used as shorthand.
