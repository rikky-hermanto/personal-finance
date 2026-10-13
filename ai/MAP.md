# AI Map

Start here. This file points to things; it never repeats them.

## Shared preferences

- [shared/preferences.md](shared/preferences.md): how answers, reports, outputs, and commits should look. Applies to every job.
- `.claude/rules/` (Claude) and `.agents/rules/` (Codex): project rules for architecture, money, tests, and containers.

## Jobs

| Folder | What it's for |
|---|---|
| [build/](build/README.md) | Shipping code: plan, do the work, check, commit |
| [decide/](decide/README.md) | Hard calls: architecture choices and finance soundness |
| [write/](write/README.md) | Docs, guides, and architecture diagrams |
| [learn/](learn/README.md) | AI engineering learning plan, progress, and material |
| [design/](design/README.md) | How the app's screens should look |

## Which folder for which request

- "Build / fix / add X" → `build/` (plan, execute, ci-check, commit; add-endpoint, db-migrate, docker-up as needed)
- "Should we…", "which approach…", "how healthy is the code…", "is this formula right…" → `decide/` (consult, council; cio, risk-officer, compliance, pm-brainstorm)
- "Write / document / diagram X" → `write/` (tech-write, create-diagram)
- "Teach me / what's next / log my progress" → `learn/` (mentor)
- "Make or change a screen, page, or component" → `design/` (data-oriented-zenmode or data-oriented-theme)
- "Use TypeSafe / Jev" → skill typesafe-ai; Jev setup in `docs/codex/jev-setup.md`
- "Tidy up the repo" → skill chores
- "Find what I keep asking for" or "make this a template" → skill job-templates; templates live in `ai/<job>/templates/` or in the repo where the job happens (below)
- "Audit my AI setup" or "a new model came out, what can I cut" → skill ai-setup-audit; past reports are in `ai/audits/`
- "Where were we? / status terakhir / what's next" → `C:\workspaces\tarombo\templates\status-check.md` (any repo)
- "Review the plan for <task>, don't implement" → `C:\workspaces\tarombo\templates\plan-readiness-review.md` (any repo)
- "Give me a concise prompt for the next chat" → `C:\workspaces\tarombo\templates\handoff-prompt.md` (any repo)
- "Approved, merge to main, commit push, start clean" → `C:\workspaces\tarombo\templates\task-close-out.md` (any repo)
- "Reach out / reply / connection note / cover letter" → `C:\workspaces\career-ops\data\templates\outreach-message.md`
- "Start the app / a service" → skill docker-up

## Where things live

- Skills: `.claude/skills/<name>/SKILL.md` (Claude) and `.agents/skills/<name>/SKILL.md` (Codex). Same names, separate copies.
- Codex conventions: `.agents/WORKFLOWS.md`. Codex settings rationale: `docs/codex/configuration.md`.
- Tasks and status: `plans/` and `plans/BOARD.md` (rules in `plans/README.md`).
- Product and architecture docs: `docs/` (current state: `docs/STATUS.md`).
- Finance formulas, instruments, and tax tables: `docs/reference/finance-domain/`.
- Retired material: `_archive/`. Don't load it unless asked.
