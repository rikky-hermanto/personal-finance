# Ticket Planning Workflow

## Rule: Always Generate a Planning File Before Working on a GitHub Issue

Whenever you are asked to work on a GitHub issue ticket (any reference to `PF-XXX`, a GitHub issue number, or a task from the board), you MUST:

1. **Read the issue** via `gh issue view <number> --repo rikky-hermanto/personal-finance`
2. **Generate a planning file** at `.claude/plannings/PF-XXX-todo.md` before writing any code
3. **Follow the planning template** defined below
4. **Update the planning file** as you progress — check off completed steps, add notes on blockers or discoveries

---

## Planning File Template

File name: `.claude/plannings/PF-{number}-todo.md`

```markdown
# PF-XXX — {Issue Title}

> **GitHub Issue:** #{number}
> **Status:** In Progress
> **Started:** {date}

## Objective

{One paragraph: what problem does this ticket solve and why}

## Acceptance Criteria

{Copy from issue, or derive from description}

- [ ] Criteria 1
- [ ] Criteria 2

## Approach

{2–5 sentences: chosen strategy, key trade-offs, what is out of scope}

## Affected Files

{List known files that will be created or modified — update as you discover more}

| File | Change |
|------|--------|
| `path/to/file.cs` | Create / Modify / Delete |

## TODO

{Ordered checklist — the actual work steps. Be specific enough to verify done/not-done.}

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Notes

{Discoveries, gotchas, decisions made during implementation}
```

---

## Rules

- **Never skip this step.** Even for small tickets, a one-minute planning file prevents scope creep and drift.
- **Create the file first, then start coding.** The plan is written before the first code change.
- **Keep it updated.** Check off TODO items as you complete them. Add notes as you discover things.
- **One file per ticket.** File name must be `PF-{number}-todo.md`. If the ticket has no PF number, use the GitHub issue number: `issue-{number}-todo.md`.
- **Do not delete planning files.** They serve as a lightweight audit trail of what was done and why.
