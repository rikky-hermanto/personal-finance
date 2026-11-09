# Plan file template

Every task plan follows this shape. The `plan` skill writes it; `execute` works through it.
Canonical example: [PF-009-gemini-hello-llm-todo.md](../../../plans/done/PF-009-gemini-hello-llm-todo.md).

## File name and place

- `PF-{number}-{short-kebab-slug}-todo.md` — the slug is 3–6 lowercase words from the title. Never just `PF-{number}-todo.md`.
- New plans go in `plans/backlog/`; learning plans (PF-AI) in `plans/backlog/learning/`. Status = folder — see [plans/README.md](../../../plans/README.md).
- Add or update the row in `plans/BOARD.md` whenever a plan is created or moves.

## Sections, in order

````markdown
# PF-XXX — Short descriptive title

> **Status:** To Do
> **Started:** YYYY-MM-DD
> **Depends on:** (optional)

## Objective
One paragraph: what problem this solves, what it unblocks, what it depends on.

## Acceptance Criteria
- [ ] User-visible or system-observable outcome

## Approach
2–5 sentences: chosen strategy, key trade-offs, what is explicitly out of scope.

## Affected Files
| File | Change |
|------|--------|
| `path/to/File.cs` | Create / Edit / Delete — one line |

---

## TODO

### [ ] STEP 1 — Short imperative title
```bash
exact, copy-pasteable command or full file content
```
> **Why:** the non-obvious reason, what breaks if skipped.
> **Check:** how to know it worked (expected output, curl, test).

---

## Concept Map (learning tickets only)
| New concept | Familiar .NET/backend analogy | What it does |

## Experiments (learning tickets only)
**Experiment A — Name:** what to change, what to observe, the production takeaway.

## Notes
Discoveries, gotchas, decisions, and what was left out and why.
````

## Step rules

- `### [ ] STEP N` headings with the checkbox on the heading line — not flat bullets.
- Every step has a `> **Why:**` and a way to check it worked.
- Each step is independently doable and at most about half a day.
- **Pre-flight check for new SDKs:** any step that installs a third-party library called directly adds a one-line `python -c "..."` (or equivalent) that exercises the exact API used and prints a pass signal. SDK APIs drift between minor versions; this catches it at step 2, not step 9.
- Check items off as they are done and add notes as you go. Never delete plan files — they are the audit trail.

## Ticket types

- **Learning ticket** (PF-009 pattern): the goal is to *understand*. Include Concept Map and Experiments, explain why before what, show expected terminal output. Map Python/LLM ideas to .NET equivalents (`pyproject.toml` ≈ `.csproj`, pydantic ≈ record + FluentValidation, FastAPI ≈ ASP.NET Core, uvicorn ≈ Kestrel, `lifespan` ≈ `IHostedService`).
- **Build ticket** (PF-011+ pattern): the goal is to *ship*. A verification step after each phase and a final end-to-end check; no Experiments section.
