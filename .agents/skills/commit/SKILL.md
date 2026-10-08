---
name: commit
description: "Commit task-scoped Personal Finance changes using the user's Git identity, optionally push when requested, or preview/adjust ignore rules without committing."
---

# commit

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Modes: default commit; push commits then pushes; wip uses a concise wip message;
amend only when explicitly requested and the target is not published; dry-run changes
nothing; ignore reviews and updates appropriate ignore patterns without staging.

Inspect status, staged/unstaged diffs, recent messages, branch, remote, and configured
author/committer. Preserve unrelated staged changes; do not accidentally include them
or reset the user's index. Stage exact task files, never git add . as a shortcut.
Include shared `plans/` changes when part of the task. Leave non-plan Claude
configuration, CLAUDE.md files, the plugin manifest, and unrelated evals out unless
the user specifically authorized those files.

Review candidates for credentials/private data without printing secret values.
Exclude actual env/local overrides, statements/personal seeds, exports, dependency
folders, caches, and build/test artifacts. An env example is safe only if its values
are placeholders; a secret-shaped string is a lead, not proof. Report exclusions
and unresolved findings rather than silently committing an incomplete logical change.

Use relevant checks and git diff --cached --check. For docs/config-only changes,
validate affected formats/links; do not run the application suite without a reason.
For code readiness use ci-check. Do not invent a ticket or test result in the message.

Use the user's configured Git identity, without agent names, signature lines, or AI
co-author trailers. Keep model/agent names out of attribution. Commit with a concise
description of actual behavior; multiline messages should use a body file.

Push only when requested, to the verified current branch/remote, without force.
If remote changes cause rejection, inspect before resolving; never overwrite them.
Afterward verify commit author/body, hash, push result, and remaining working changes.
Do not automatically create a PR, amend a published commit, or change Git identity.
