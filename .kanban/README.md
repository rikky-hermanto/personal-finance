# Project Task Management

> Hybrid approach: GitHub Projects v2 is the source of truth. `BOARD.md` is a Claude-readable snapshot.

---

## Where Tasks Live

| What | Where |
|------|-------|
| Task board (UI) | [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4) |
| Task details | [GitHub Issues](https://github.com/rikky-hermanto/personal-finance/issues) |
| Claude snapshot | [BOARD.md](./BOARD.md) — updated after each task operation |

## Structure

```
.kanban/
├── BOARD.md     # Claude-readable snapshot (NOT source of truth)
└── README.md    # This file
```

## Task IDs

- Format: `PF-XXX` (zero-padded, sequential)
- IDs are permanent — never reused
- GitHub issue titles are prefixed: `[PF-XXX] Task title`
- Next ID: check the highest existing issue title and increment

## Kanban Columns

| Column | GitHub Status | Meaning |
|--------|---------------|---------|
| **Backlog** | Backlog | Identified, not yet refined |
| **Ready** | Ready | Acceptance criteria written, no blockers |
| **In Progress** | In Progress | Actively being worked on (WIP limit: 2) |
| **Done** | Done + issue closed | Merged, verified, complete |

## Labels

| Label | Meaning |
|-------|---------|
| `feature` | Product feature |
| `learning` | Learning / exploration objective |
| `infra` | Infrastructure, tooling, DevOps |
| `ai` | LLM, RAG, agents |
| `docs` | Documentation |
| `testing` | Tests and test infrastructure |
| `bug` | Bug fix |
| `sprint:setup` / `sprint:cleanup` / `sprint:ramp-up` / `sprint:S1–S4` | Sprint tags |

## Workflow

### Create a new task
```bash
gh issue create \
  --repo rikky-hermanto/personal-finance \
  --title "[PF-XXX] Task title" \
  --body "## Objective\n...\n\n## Acceptance Criteria\n- [ ] ..." \
  --label "feature,sprint:cleanup"

# Add to project and set status
gh project item-add 4 --owner rikky-hermanto --url <issue-url>
# Then set status via GitHub UI or GraphQL
```

### Move a task
Update the Status field in [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4), then update `BOARD.md`.

### Close a task
```bash
gh issue close <number> --repo rikky-hermanto/personal-finance
```
Then move to Done in the project and update `BOARD.md`.

## Keeping BOARD.md in Sync

After any task operation (create, move, close), update `BOARD.md`:
- Add new issues to the correct column table
- Move rows between columns when status changes
- Close done issues and move to the Done table
- Update the progress bars at the bottom
