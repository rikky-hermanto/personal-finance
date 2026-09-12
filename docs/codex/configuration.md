# Codex adaptation inventory

This setup adds independent Codex instructions and selected workflows. Claude files,
including `.agents/.claude-plugin/plugin.json`, remain unchanged. There are no symlinks
or automatic synchronization jobs between the two configurations.

## Mapping

| Source | Codex destination / decision |
|---|---|
| Root `CLAUDE.md` and common rules | Root `AGENTS.md` |
| Backend guide/rules | `apps/api/AGENTS.md` |
| Frontend guide/rules | `apps/frontend/AGENTS.md` |
| AI service rules | `services/ai-service/AGENTS.md` |
| Zen UX and required base design principles | `.agents/skills/data-oriented-zenmode/`, self-contained with references |
| Test workflow | `.agents/skills/test-all/` |
| Local readiness workflow | `.agents/skills/ci-check/` |
| REST endpoint workflow | `.agents/skills/add-endpoint/` |
| Claude settings | Selected equivalents in `.codex/config.toml` and root instructions |
| Existing mentor | Preserved without migration edits |
| Other Claude skills | Not bulk-copied; remain available to Claude |
| Claude plans/board | Read-only historical context for Codex; no automatic writes |

## Settings decisions

- Workspace-write sandbox and on-request approvals replace the broad Claude tool
  allow list with Codex-native settings. Runtime/managed policies may override these
  defaults; project configuration is loaded only for trusted projects.
- Empty instruction fallback list avoids inheriting a user-level `CLAUDE.md` fallback.
- Model selection remains in the user's Codex UI/profile; `opusplan` is not translated
  into a guessed model or delegation strategy.
- Destructive-action intent and no automatic AI co-author trailer are captured in
  root instructions. Claude's tool-pattern strings are not valid Codex equivalents.
- No extra writable directories, external notifications, MCP connections, or hook
  commands are introduced.

The instruction to preserve Claude files is an agent behavior rule, not an OS-level
write deny. Workspace-write alone does not make every `.claude` file read-only.
This setup does not alter filesystem ACLs or claim a hard sandbox between agents.

Configuration reference: [official Codex configuration documentation](https://learn.chatgpt.com/docs/config-file/config-basic).

## Separate agent and hook review

| Existing item | Review result |
|---|---|
| `planner` agent | Assumes GitHub issues and writes `.claude/plans`. Keep task context readable, use conversation plans or requested `docs/codex/plans/` files; do not enable the agent definition. |
| `code-reviewer` agent | Contains obsolete EF conventions. Current architecture and review concerns are represented in scoped instructions; no subagent config added. |
| `test-writer` agent | Uses removed EF InMemoryDatabase and old paths. Current testing conventions are in scoped instructions and test skills; do not copy its templates. |
| `plan-complete-sync.py` | Mutates Claude board. Not enabled or executed by this adaptation. |
| `skill-review-reminder.py` | Claude-specific hook payload. Not enabled; skill changes remain deliberate task work. |
| `push-notify.sh` | Sends an external ntfy notification. Not enabled or executed. |

## Compatibility corrections

The Codex adaptation uses current `apps/` and `services/` paths, Supabase persistence,
Application DTOs, existing desk/macro Vitest suites, extraction `account_name`, both
Gemini and Anthropic extraction modes, and explicit app/node TypeScript checks.
It does not claim the local readiness checks are enforced by current GitHub CI.

Zen guidance resolves conflicting hover-only versus persistent navigation in favor
of visible recessed navigation, preserves dark mode, and includes keyboard/touch
access and reduced motion. Existing mentor and plugin metadata were not rewritten.

## Usage

Open a fresh Codex session after configuration changes. Ask to use `test-all`,
`ci-check`, or `add-endpoint` by name; Zen guidance is also referenced directly by
the frontend instructions. If the UI groups these skills under `mentor`, the existing
Claude plugin manifest's name explains that label; the manifest is preserved.
Discovery may depend on the client. The root instructions also point to each skill
so Codex can read the local file explicitly.

No app behavior, dependencies, Claude workflows, board history, or model choice is
changed by this setup. No commit/push or live notification is performed.
