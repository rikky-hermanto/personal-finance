# Codex adaptation inventory

Codex has independent instructions, 33 standalone skills and six rules. Claude configuration remains separate; its shared-plan directory setting now points to root `plans/`. Both agents actively share that directory.

| Source | Codex destination |
|---|---|
| Root and service CLAUDE.md | Root and scoped AGENTS.md |
| .claude/rules | .agents/rules, routed by AGENTS.md |
| .claude/skills | .agents/skills; [inventory](skills-and-rules.md) |
| Claude settings | Selected native settings in .codex/config.toml |
| Plans, learning material and board | Shared `plans/` status folders and resources; edit originals directly ([layout](../../plans/README.md)) |

## Shared task state

[Workflow conventions](../../.agents/WORKFLOWS.md) authorize plan creation, progress updates, board maintenance, learning material and archiving. Re-read before writing, preserve concurrent edits and avoid duplicate Codex plans. Respect the board's GitHub source-of-truth declaration; local edits do not imply remote synchronization or authorize remote mutations.

Non-plan Claude configuration, CLAUDE.md files, plugin metadata and Claude workflows remain protected. This separation is an instruction boundary, not a filesystem ACL.

## Compatibility decisions

Workspace-write and on-request approvals are project defaults; managed policies may override them. The empty instruction fallback list avoids inheriting CLAUDE.md. Model selection stays with the user. Claude tool allowlists, model routing, MCP connections and notification hooks are not imported.

Adaptations use current apps/services paths, Supabase persistence, Application DTOs, provider-based extraction and service-specific checks. Zen remains the default frontend UX. Local readiness checks are not guarantees about remote CI.

The mentor curriculum is retained with workflow/path compatibility edits. Claude's mentor skill still points at the shared `.agents/skills/mentor/` skill; that pointer and the learning resources are unchanged. On 2026-10-09, the user requested removal of the misleading `mentor:` namespace from general Codex workflows. The `.agents/.claude-plugin/plugin.json` marker was moved, byte-for-byte, to [the historical manifest](archive/mentor-plugin.json). No files under `.claude/` were changed. No automatic configuration synchronization is installed.

Planner behavior is covered by plan/execute skills using shared plans. Reviewer/test-writer definitions contain older EF assumptions; current conventions are in Codex skills and scoped instructions. No Claude agents or hooks were enabled or executed.

## Usage

Ask for a standalone skill by its actual name, such as `$plan`, `$execute`, or `$review-plan`, or read its SKILL.md directly. Use `$mentor` for AI Engineering learning guidance. `.agents/` must not contain a `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json` marker: those package the skill collection and can introduce a plugin namespace. Refresh the client or start a new session to reload discovery metadata; a running conversation retains its injected skill catalog.

The manifest archive preserves the original package metadata for history, not active discovery. If a separately installed/cached `mentor` plugin still appears after refresh, inspect its registration before disabling it; do not rename the standalone skills or edit plugin caches to compensate.

Run `node .agents/scripts/validate-setup.cjs` to check coverage, metadata, concrete links and helper syntax. This validates setup integrity, not application behavior or live providers.
