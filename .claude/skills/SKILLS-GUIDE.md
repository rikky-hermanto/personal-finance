# Skills Quick Reference

Custom slash commands for this project. Type `/skill-name [args]` in Claude Code.

---

## Product Management & Brainstorming

### `/pm-brainstorm` — Feature ideation and PM analysis
Acts as a Senior Product Manager. Analyzes feature ideas, scans competitors, generates alternatives, and gives a Go/No-Go verdict. Aware of this product's current state and the Indonesian fintech market.

| Mode | Usage |
|------|-------|
| *(none)* | Interactive — Claude asks what idea to explore |
| `analyze [idea]` | Deep PM analysis: user pain, competitive scan, MVP cut, fit score, verdict |
| `compete [area]` | Competitive landscape scan for a feature area (e.g. "budgeting", "goals") |
| `prioritize` | Rank a list of ideas you provide, output a build-order stack |
| `alternatives [idea]` | Generate 3–5 alternative framings for the same user pain |

```
/pm-brainstorm                                  # interactive
/pm-brainstorm analyze smart bill detection     # full analysis
/pm-brainstorm compete savings goals            # competitive scan
/pm-brainstorm prioritize                       # rank a list you'll paste
/pm-brainstorm alternatives recurring expenses  # explore different angles
```

**Output:** User Pain Map · Competitive Scan · Feature Breakdown · Risk & Blind Spots · Fit Score (out of 25) · Go/No-Go verdict · Alternative Framings.

After analysis, enters discussion mode — push back, ask follow-ups, explore alternatives. Can hand off to `/battle-plans` or `/review-plan` when ready to execute.

Optionally saves output to `.claude/plans/pm-{feature}-analysis.md`.

---

## Architecture & Design

### `/arch-review` — Full codebase architecture health report + discussion
Reads the entire live codebase (not CLAUDE.md summaries — actual source files), produces a structured health report, then enters discussion mode for improvements and new ideas.

| Argument | Scope |
|----------|-------|
| *(none)* | Full-stack review — all layers |
| `backend` | .NET API only |
| `frontend` | React app only |
| `ai-service` | Python FastAPI service only |
| `data-flow` | End-to-end path: upload → parse → validate → persist → display |

```
/arch-review                    # full review
/arch-review backend            # .NET only
/arch-review frontend           # React only
/arch-review ai-service         # Python service only
/arch-review data-flow          # trace the data path end-to-end
```

**Output:** Strengths · Architecture findings (🔴/🟡/🟢) · Consistency audit · Test coverage gaps · Tech debt ledger · Top 3 highest-leverage improvements.

After the report, Claude enters discussion mode — ask it to go deeper on any finding, evaluate a new idea, or propose what to build next. It can generate `todo.md` or battle plan files directly from the discussion.

Optionally saves the report to `.claude/plans/arch-review-{YYYY-MM-DD}.md`.

---

## Plan Creation (End-to-End)

### `/plan` — Use case → approaches → winner → implementation plan
The full pipeline: takes a raw problem, bug, feature, or refactor request; reads live codebase context; generates 2–3 competing approaches; scores them; picks a winner; then writes a complete, PF-009-style implementation plan (Objective → Acceptance Criteria → Approach → Affected Files → TODO steps) ready for execution.

| Argument | Behavior |
|----------|----------|
| `[ticket]` | Look up ticket in `.kanban/BOARD.md`, plan from description |
| `[free-text description]` | Plan from the description directly |
| `[ticket or text] as architect` | Skip PO scoring; go straight to technical approach scoring |

```
/plan PF-116                                        # plan from ticket
/plan "statement tab is slow on date filter"        # plan from problem
/plan "add monthly budget limits per category"      # plan from feature brief
/plan "extract category logic out of controller"    # plan from refactor request
/plan PF-116 as architect                           # architect-only scoring
```

**Output flow:**
1. Problem restatement (type / domain / layers affected)
2. 2–3 solution approaches with tradeoffs
3. Scoring grid (adapts to bug / feature / refactor)
4. Verdict: winner + why not the others
5. Full implementation plan (Objective → Acceptance Criteria → Approach → Affected Files → TODO steps with `> **Why:**` rationale on each)
6. Offers to save to `.claude/plans/{ticket}-todo.md`
7. Suggests natural next steps: `/review-plan`, `/battle-plans`, `/pm-brainstorm`

**When to use `/plan` vs others:**
- Have a raw problem → `/plan`
- Have two written proposals → `/battle-plans`
- Have a plan, want it stress-tested → `/review-plan`
- Have a vague idea, want PM thinking first → `/pm-brainstorm`

---

## Plan Review & Decision-Making

### `/battle-plans` — Compare two competing proposals
Pick a winner between Team A and Team B proposals.

| Flag | Role | Scores on |
|------|------|-----------|
| *(none)* | Senior PO / Analyst | User Value, Scope Fit, Delivery Risk, Speed, Maintainability |
| `as architect` | Senior Software Architect | Design Correctness, Integration Fit, Scalability, Testability, Complexity vs Value |

```
/battle-plans PF-115                                        # auto-discover teamA + teamB
/battle-plans PF-115 as architect                           # architect lens
/battle-plans PF-115-feature-teamA PF-115-feature-teamB     # explicit file names
/battle-plans PF-115-feature-teamA PF-115-feature-teamB as architect
```

Files are resolved from `.claude/plans/`. Optionally saves a `*-verdict.md` at the end.

---

### `/review-plan` — Deep-review a single plan before execution
Stress-test a plan file and get a Go / No-Go verdict with gap table.

| Flag | Role | Focus |
|------|------|-------|
| *(none)* | Senior Software Architect | Layer violations, contracts, sequencing, test strategy |
| `as po` | Senior PO / Analyst | Acceptance criteria, scope creep, MVP cuts, delivery risk |
| `quick` | Either | Key risks only, abbreviated output |

```
/review-plan PF-115-feature-todo.md                         # architect review
/review-plan PF-115-feature-todo.md as po                   # PO lens
/review-plan PF-115-feature-todo.md quick                   # abbreviated
/review-plan PF-115-feature-todo.md as po quick             # abbreviated PO lens
```

Files are resolved from `.claude/plans/`. Offers to apply revisions to the file directly.

---

## Code Scaffolding

### `/add-endpoint` — New REST API endpoint (full CRUD)
Scaffolds Domain entity → Command/Handler → Validator → Service → Controller → DI → Frontend API client → Tests.

```
/add-endpoint
# Claude will ask: entity name, operations needed, properties
```

---

### `/add-bank-parser` — New bank statement parser
Guides through `IBankStatementParser` implementation, `BankIdentifier` detection, DI registration.

```
/add-bank-parser
# Claude will ask: bank name, file format (CSV/PDF/image), parser strategy
```

---

### `/add-llm-extractor` — New LLM extraction provider
Adds a new provider to the Python AI service following the `GeminiProvider` / `AnthropicProvider` pattern.

```
/add-llm-extractor
# Claude will ask: provider name, model, tool_use vs JSON mode
```

---

### `/datatable` — Add a server-paginated data table
Adds an Excel-style filtered, paginated table to the frontend following the Transactions table pattern.

```
/datatable
# Claude will ask: entity, columns, filters needed
```

---

## Dev Operations

### `/docker-up` — Start full stack via Docker Compose
Runs `docker compose down && docker compose up --build` with correct service ordering.

```
/docker-up             # all services
/docker-up api         # API + DB only
```

---

### `/run-ai-service` — Start Python AI service locally
Activates venv and starts uvicorn with reload.

```
/run-ai-service
```

---

### `/db-migrate` — Create and apply a Supabase migration
Generates a numbered SQL migration file and runs `supabase db push`.

```
/db-migrate add_user_id_to_transactions
```

---

### `/test-all` — Run full test suite
Runs xUnit backend tests, ESLint, TypeScript check, and Playwright E2E in sequence.

```
/test-all
```

---

### `/ci-check` — Run CI gates locally before pushing
Mirrors the GitHub Actions pipeline: build → test → lint → tsc → secret scan.

```
/ci-check
```

---

## UI Themes (auto-applied)

These are applied **automatically** — you don't need to invoke them manually.

| Skill | When applied |
|-------|-------------|
| `data-oriented-theme` | Any web UI, dashboard, component, or artifact |
| `data-oriented-zenmode` | When you ask for "zen", "minimal", "clean", "focus mode" UI |

To override: explicitly request a different style ("landing page", "marketing design").

---

## Naming Convention for Plan Files

```
.claude/plans/
  PF-{n}-{feature}-teamA          # Proposal A (no extension = markdown)
  PF-{n}-{feature}-teamB          # Proposal B
  PF-{n}-{feature}-verdict.md     # Battle plans output
  PF-{n}-{feature}-todo.md        # Execution plan (review-plan input)
```
