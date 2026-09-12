# Codex adaptation inventory

Codex has independent instructions, 32 adapted skills and six rules. Claude configuration remains unchanged. Both agents actively share `.claude/plans/`.

| Source | Codex destination |
|---|---|
| Root and service CLAUDE.md | Root and scoped AGENTS.md |
| .claude/rules | .agents/rules, routed by AGENTS.md |
| .claude/skills | .agents/skills; [inventory](skills-and-rules.md) |
| Claude settings | Selected native settings in .codex/config.toml |
| Plans, learning material and board | Shared .claude/plans; edit originals directly |

## Shared task state

[Workflow conventions](../../.agents/WORKFLOWS.md) authorize plan creation, progress updates, board maintenance, learning material and archiving. Re-read before writing, preserve concurrent edits and avoid duplicate Codex plans. Respect the board's GitHub source-of-truth declaration; local edits do not imply remote synchronization or authorize remote mutations.

Non-plan Claude configuration, CLAUDE.md files, plugin metadata and Claude workflows remain protected. This separation is an instruction boundary, not a filesystem ACL.

## Compatibility decisions

Workspace-write and on-request approvals are project defaults; managed policies may override them. The empty instruction fallback list avoids inheriting CLAUDE.md. Model selection stays with the user. Claude tool allowlists, model routing, MCP connections and notification hooks are not imported.

Adaptations use current apps/services paths, Supabase persistence, Application DTOs, provider-based extraction and service-specific checks. Zen remains the default frontend UX. Local readiness checks are not guarantees about remote CI.

The mentor curriculum is retained with workflow/path compatibility edits. Claude's mentor skill already points at this shared .agents skill; its pointer and plugin manifest remain unchanged. No automatic configuration synchronization is installed.

Planner behavior is covered by plan/execute skills using shared plans. Reviewer/test-writer definitions contain older EF assumptions; current conventions are in Codex skills and scoped instructions. No Claude agents or hooks were enabled or executed.

## Usage

Ask for a skill by name or read its SKILL.md directly. Refresh the client if discovery metadata is stale. The existing plugin name may group skills under mentor; its manifest has not been renamed.

Run `node .agents/scripts/validate-setup.cjs` to check coverage, metadata, concrete links and helper syntax. This validates setup integrity, not application behavior or live providers.
