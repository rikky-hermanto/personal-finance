# Ticket Planning Workflow

## Rule: Always Generate a Planning File Before Working on a GitHub Issue

Whenever you are asked to work on a GitHub issue ticket (any reference to `PF-XXX`, a GitHub issue number, or a task from the board), you MUST:

1. **Read the issue** via `gh issue view <number> --repo rikky-hermanto/personal-finance`
2. **Generate a planning file** at `.claude/plans/PF-XXX-todo.md` before writing any code
3. **Follow the planning template** defined below
4. **Update the planning file** as you progress — check off completed steps, add notes on blockers or discoveries

---

## Planning File Template

File name: `.claude/plans/PF-{number}-todo.md`

````markdown
# PF-XXX — {Issue Title}

> **GitHub Issue:** #{number}
> **Status:** In Progress
> **Started:** {date}

## Objective

{One paragraph: what problem does this ticket solve and why}

## Acceptance Criteria

- [ ] Criteria 1
- [ ] Criteria 2

## Approach

{2–5 sentences: chosen strategy, key trade-offs, what is out of scope}

## Affected Files

| File | Change |
|------|--------|
| `path/to/file.py` | Create / Modify / Delete |

---

## TODO

### STEP 1 — {Step title}
```bash
# exact command(s) to run
```
> **Why:** {Explain the purpose. Use .NET/backend analogies where relevant.}
>
> **Check:** {How to verify this step succeeded — expected output, file to inspect, etc.}

---

### STEP 2 — {Step title}
{Brief description of what to write or do. Include exact file contents for non-trivial files.}

```language
# exact code or config content
```

> **Why:** {Explain each key decision.}
>
> **Expected output:** (if applicable)
> ```
> example output here
> ```

---

### STEP N — Commit
```bash
git add {specific files}
git status  # verify no secrets staged
git commit -m "PF-XXX: {short description}"
```

---

## Concept Map (learning tickets only)

| New concept | Familiar analogy | What it does |
|---|---|---|
| {LLM/Python concept} | {.NET/backend analogy} | {one-line explanation} |

---

## Experiments (learning tickets only)

**Experiment A — {Name}:**
{What to change, what to observe, and the takeaway for production use}

---

## Notes

{Discoveries, gotchas, decisions made during implementation}
````

---

## Step Format Rules

Every TODO step MUST follow this format:

### Required in every step
- **`### STEP N — Title`** heading (not flat bullet `- [ ] Step N`)
- **Exact commands** — copy-pasteable `bash` code blocks, not vague instructions like "install dependencies"
- **`> **Why:**`** explanation block — always answer *why*, not just *what*
- **`> **Check:**` or `> **Expected output:**`** — how to know the step succeeded

### Analogies for this project's developer (Rikky — 10+ yr .NET backend, pivoting to AI)
When explaining Python tooling or LLM concepts, always map to familiar .NET/backend equivalents:

| Python / LLM | .NET / backend analogy |
|---|---|
| `pyproject.toml` | `.csproj` |
| `.venv/` | Per-project NuGet cache |
| `pip install -e .` | `ProjectReference` (editable install) |
| `pydantic BaseModel` | C# `record` with FluentValidation |
| `pydantic-settings` | `IOptions<T>` + `appsettings.json` |
| FastAPI | ASP.NET Core Web API |
| `lifespan` context manager | `IHostedService` startup/shutdown |
| `@app.get("/health")` | `[HttpGet("health")]` on a controller |
| `async def` endpoint | `async Task<IActionResult>` action |
| `uvicorn` | Kestrel (the HTTP server) |
| `tool_use` / JSON mode | Structured output contract (like a typed API response) |
| `temperature=0.0` | Deterministic mode — use for all data extraction |
| `stop_reason = "max_tokens"` | Response truncated — treat as error in parsers |
| `message.usage.input_tokens` | Billable units for API cost tracking |

---

## Ticket Types

### Learning ticket (PF-009 pattern)
- Ticket goal is to *understand* a concept, not just ship code
- Include **Concept Map** section with .NET analogies
- Include **Experiments** section (A/B/C/D) — deliberate parameter changes to observe behavior
- Steps explain *why* before *what*
- Include expected terminal output so developer knows when it worked

### Build ticket (PF-011+ pattern)
- Ticket goal is to *ship working code*
- Steps still include exact commands and `> **Why:**` blocks
- Include verification step after each phase (smoke test, curl, `pytest`)
- No experiments section — but include a final end-to-end test step
- Include actual file contents for non-trivial files so developer understands the structure

---

## Rules

- **Never skip this step.** Even for small tickets, a one-minute planning file prevents scope creep and drift.
- **Create the file first, then start coding.** The plan is written before the first code change.
- **Steps use `### STEP N` headings, not flat `- [ ]` bullets.** Flat bullets are allowed only inside a step for sub-items.
- **Every step has a `> **Why:**` block.** No unexplained commands.
- **Every step has a verification check.** No step ends without telling the developer how to confirm it worked.
- **Keep it updated.** Check off TODO items (convert heading to `### ~~STEP N~~` or add `[x]` sub-item) as you complete them. Add notes as you discover things.
- **One file per ticket.** File name must be `PF-{number}-todo.md`. If the ticket has no PF number, use the GitHub issue number: `issue-{number}-todo.md`.
- **Do not delete planning files.** They serve as a lightweight audit trail of what was done and why.
