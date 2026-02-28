# Kanban Task System

> GitHub-native project management for Personal Finance AI platform.
> Designed for Claude Code orchestration + human review.

---

## Structure

```
.kanban/
├── BOARD.md              # Source of truth — Kanban columns + task index
├── board.html            # Interactive HTML visualization (open in browser)
├── README.md             # This file
├── templates/
│   └── task-template.md  # Template for new task files
└── tasks/
    ├── PF-001.md         # One file per task — planning, notes, acceptance criteria
    ├── PF-002.md
    └── ...
```

## Conventions

### Task IDs
- Format: `PF-XXX` (zero-padded, sequential)
- IDs are permanent — never reused, even if a task is deleted

### Kanban Columns
| Column         | Meaning |
|----------------|---------|
| **Backlog**    | Identified but not refined. Needs breakdown or dependencies resolved. |
| **Ready**      | Refined, acceptance criteria written, no blockers. Can be picked up. |
| **In Progress**| Actively being worked on. Limit: 2 tasks max. |
| **Review**     | Code complete. Needs verification, learning review, or PR merge. |
| **Done**       | Merged, verified, learning objective met. |

### Labels
| Label       | Color   | Meaning |
|-------------|---------|---------|
| `feature`   | blue    | Product feature implementation |
| `learning`  | green   | AI/ML learning objective |
| `infra`     | orange  | Infrastructure, DevOps, tooling |
| `ai`        | purple  | AI integration (LLM, RAG, agents) |
| `docs`      | gray    | Documentation |
| `test`      | yellow  | Testing |

### Sprint Tags
- `setup` — Initial project scaffolding (pre-sprint)
- `ramp-up` — Week 0: AI learning ramp-up
- `S1` — Sprint 1: PDF → LLM → Structured JSON
- `S2` — Sprint 2: RAG Pipeline
- `S3` — Sprint 3: AI Agents
- `S4` — Sprint 4: Production Hardening

### Workflow Rules
1. Move tasks left-to-right only (no skipping columns)
2. Max 2 tasks **In Progress** at any time
3. Every task file must have acceptance criteria before moving to **Ready**
4. **Review** requires: code works, tests pass (if applicable), learning notes written
5. Update `BOARD.md` when any task changes status
6. Regenerate `board.html` after significant board changes

## Creating a New Task

1. Copy `templates/task-template.md` to `tasks/PF-XXX.md`
2. Fill in all required fields
3. Add entry to the appropriate column in `BOARD.md`

## Viewing the Board

- **Terminal:** Read `BOARD.md` directly
- **Browser:** Open `board.html` (self-contained, no server needed)
- **GitHub:** Both render natively in the GitHub web UI
