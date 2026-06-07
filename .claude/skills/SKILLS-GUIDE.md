# Skills Quick Reference

Custom slash commands for this project. Type `/skill-name [args]` in Claude Code.

---

## Idea Capture

### `/braindump` — Capture a rough idea before it evaporates
Converts an unstructured brain dump into a lightweight idea file in `docs/ideas/`. This is a **capture tool, not an analysis tool** — no Fit Scores, no Competitive Scan, no Verdict. Just saves the idea exactly as stated, in the user's own words.

```
/braindump                                          # Claude captures whatever you describe
/braindump money tracing dari QRIS biar ga ribet    # inline dump
```

**Output:** `docs/ideas/{slug}.md` with: Core Idea · Context & Pain (in your words) · Rough Notes · Related Ideas · Next Step (points to `/pm-brainstorm` or `/plan` when ready).

**When to use:** mid-session shower thought, parking an idea without losing flow, anything you'd otherwise lose in Slack.

**NOT for:** full PM analysis → use `/pm-brainstorm analyze`. Planning → use `/plan`. Building → use `/execute`.

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

### `/consult` — Lead Software Architect consultation on any technical decision
Acts as a **Lead Software Architect from a FAANG-class company**. Gives concrete verdicts on any technical question — "it depends" is not an output. Reads the live codebase and governance rules before answering. Stays in discussion mode after the verdict.

| Mode | Usage |
|------|-------|
| *(none)* | Interactive — Claude asks what to consult on |
| `"question"` | Direct consultation — verdict + landmine + concrete next steps |
| `design [topic]` | System design deep dive — components, data model, failure modes, evolution path |
| `review [design]` | Design critique — what's good, what will cause a prod incident, SHIP IT / REDESIGN verdict |
| `tradeoffs [A vs B]` | Explicit tradeoff matrix — scoring, the deciding factor, conditions that flip the verdict |
| `adr [decision]` | Architecture Decision Record — context, options, rationale, success criteria |
| `scale [topic]` | Scale analysis — 10x/100x bottlenecks, scale cliff, pre-scale investments |

```
/consult                                          # interactive
/consult "should we add Redis caching here?"      # direct consultation
/consult design "multi-tenant transaction storage"
/consult review "our current parser routing design"
/consult tradeoffs "Supabase vs self-hosted Postgres"
/consult adr "choosing Supabase over EF Core"
/consult scale "transaction ingestion pipeline"
```

**Output:** The Real Question (reframed) · Hidden Assumptions · Decisive Factor · Verdict (PROCEED/DON'T/REDESIGN/NOT YET) · What to Do · The Landmine 💣

After the verdict, enters discussion mode — push back, add constraints (`what if we have 2 engineers?`), request the ADR version, or hand off to `/plan`.

The Architect's principles: a verdict is always required · name the landmine · reversibility over purity · operational burden is part of the design · complexity must justify itself · right-size for the project phase.

---

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

## Feature Review (Post-Development)

### `/ux-review` — Lead UX Designer review of a component, page, or flow
Acts as a **Lead UX Designer** grounded in user psychology (Fitts's Law, Hick's Law, cognitive load theory) and minimalism principles. Reviews the actual implementation files — not just screenshots. Gives a concrete **SHIP IT / REFINE / RETHINK** verdict with specific, actionable design notes.

| Mode | Usage |
|------|-------|
| *(none)* | Interactive — Claude asks what to review |
| `ComponentName` | Review a specific component (reads all connected files) |
| `/route/path` | Review a page or flow end-to-end |
| `PF-XXX` | Review the UI shipped for a specific ticket |
| `ComponentName quick` | Abbreviated pass — AC scorecard only |
| `flow [name]` | End-to-end flow review (multiple screens) |

```
/ux-review                              # interactive
/ux-review TransactionPreview           # component review
/ux-review /cashflow/upload             # page flow review
/ux-review PF-116                       # ticket implementation review
/ux-review TransactionPreview quick     # abbreviated pass
```

**Output:** User's goal + emotional context · Visual Hierarchy & Attention Flow · Cognitive Load · Interaction Feedback & Trust · Minimalism Audit · Typography & Density · Empty/Loading/Error state coverage · Psychology Notes · **SHIP IT / REFINE / RETHINK verdict**

After the report, enters discussion mode — push back on findings, request a layout alternative in words, or ask it to implement a fix directly. Optionally saves to `.claude/plans/ux-review-{target}-{YYYY-MM-DD}.md`.

---

### `/po-review` — Lead PO review of an implemented feature
Acts as a **Lead Product Owner** reviewing built code against the original spec. Not an architecture review — a product review: does this feature do what it was supposed to do, for the user it was built for?

| Mode | Usage |
|------|-------|
| *(none)* | Interactive — Claude asks what feature to review |
| `PF-XXX` | Full review of a specific ticket's implementation |
| `PF-XXX quick` | Abbreviated pass — AC scorecard only, no deep UX section |
| `PF-XXX ux` | UX-focused review — layout, labels, empty/error/loading states |
| `PF-XXX regression` | Regression-only pass — checks what may have broken around the changes |

```
/po-review                      # interactive
/po-review PF-116               # review ticket implementation
/po-review PF-116 quick         # abbreviated AC check
/po-review PF-116 ux            # UX-focused
/po-review PF-116 regression    # regression check only
```

**Output:** AC Scorecard (Pass/Fail/Partial per criterion) · What Works Well · Blocking Issues · Non-Blocking Issues · UX Observations · Regression Check · **SHIP IT / SEND BACK verdict**

After the report, enters discussion mode — push back on findings, confirm a fix is in, or get direction on how to fix a blocking issue. Optionally saves to `.claude/plans/po-review-{ticket}-{date}.md`.

---

## Writing & Documentation

### `/tech-write` — Senior Technical Writer — write, rewrite, audit, or scaffold any doc
Acts as a **Senior Staff Technical Writer** (FAANG-equivalent). Reads the live codebase and project context before writing anything. Applies Diátaxis principles (tutorial / how-to / reference / explanation), Stripe-level clarity, and Google's documentation style guide.

| Mode | Usage |
|------|-------|
| *(none)* | Interactive — asks what to write and for whom |
| `sync-status` | Sync project state across README, CLAUDE.md, STATUS.md, INDEX.md, MEMORY.md |
| `readme` | Write or rewrite the project README |
| `api [endpoint or file]` | Document a specific API endpoint or set of endpoints |
| `runbook [scenario]` | Write an operational runbook |
| `migration [from] [to]` | Write a migration guide |
| `adr [decision]` | Produce an Architecture Decision Record |
| `onboarding` | Write a developer onboarding guide |
| `audit [file or section]` | Audit an existing doc for quality, gaps, and structure |
| `rewrite [file]` | Rewrite an existing doc to production standard |
| `explain [concept or file]` | Write a conceptual explanation / architecture narrative |

```
/tech-write                                             # interactive
/tech-write sync-status                                 # sync all status-tracking docs
/tech-write readme                                      # rewrite README
/tech-write api TransactionsController                  # document an endpoint group
/tech-write runbook "AI service unreachable"            # incident runbook
/tech-write migration "EF Core" "supabase-csharp"       # migration guide
/tech-write adr "choosing pgvector over a vector DB"    # ADR
/tech-write audit docs/STATUS.md                        # doc quality audit
/tech-write rewrite docs/architecture/API-endpoints.md  # rewrite to production standard
/tech-write explain "hybrid parser routing"             # conceptual explanation
```

**`sync-status` touches:** `docs/STATUS.md` (always) · `CLAUDE.md` next-ticket-ID line · `README.md` features section (if present) · `docs/INDEX.md` (new docs only) · `MEMORY.md` project state section. Never touches `.kanban/BOARD.md` — use `/kanban-sync` for that.

**Doc audit output:** Diátaxis classification · Grade (A–F) · Issue table (🔴 blocking / 🟡 reduces usefulness / 🟢 polish) · Missing content · **PUBLISH / REVISE / REWRITE verdict**

---

## Plan Review & Decision-Making

### `/council` — 5-persona adversarial debate → Chairman verdict
Instead of asking Claude one question and getting a yes, run it through five adversarial voices that argue from locked positions, then a Chairman synthesizes the real answer.

| Persona | Mandate |
|---------|---------|
| 🔴 The Contrarian | Find every way this fails |
| 🧱 The First-Principles Thinker | Rebuild the question from scratch |
| 🟢 The Expansionist | Find the upside you missed |
| 🔭 The Outsider | Strip context, look at the raw problem |
| ⚙️ The Executor | What do we do Monday morning? |
| 🎯 The Chairman | Reads the debate, delivers the verdict |

```
/council should we build a budgeting feature next?
/council is the Supabase migration the right call for a solo project?
/council I want to go full-time on this app
/council                                        # interactive — Claude asks what to evaluate
```

**Verdict options:** YES · NO · NOT YET · REFRAME

After the verdict, enters discussion mode — push back on any voice, run again with a new framing, or ask the Chairman to reconsider under new constraints. Optionally saves to `.claude/plans/council-{slug}-{date}.md`.

---

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

## Plan Execution

### `/execute` — Execute a plan file end-to-end, unattended
Reads every unchecked step in a plan file, implements it, marks it `[x]` immediately after, then verifies all acceptance criteria at the end. Never stops mid-execution to ask questions — leave it running and review the diff in your git client when you're back.

```
/execute PF-115                                          # fuzzy match on prefix
/execute PF-115-transaction-running-balance-view.md      # exact filename
```

**What it does:**
1. Reads the plan + all affected files before touching anything
2. Executes each `[ ] STEP` in order — create files, edit files, run commands
3. Marks each step `[x]` immediately on completion
4. Verifies each acceptance criterion and checks it off if met
5. Outputs a final summary: steps done, steps failed, ACTs met/unmet

**After it finishes:** review changes in your git client, then run `/ci-check` before pushing.

---

## Dev Operations

### `/commit` — Safe-commit with secret scan + smart message
Stages safe files only (hard-block list + inline secret scan), generates a context-aware commit message, then commits. Pass `push` to also push to origin.

| Invocation | Behavior |
|-----------|----------|
| `/commit` | Stage → scan → commit (no push) |
| `/commit push` | Stage → scan → commit → push |
| `/commit wip` | Quick WIP commit — short message, no push |
| `/commit amend` | Amend last commit (only if not yet pushed) |
| `/commit dry-run` | Preview safe-to-stage list + proposed message, no changes |

```
/commit               # commit only
/commit push          # commit + push to origin
/commit wip           # save progress quickly
/commit amend         # fold staged changes into the last commit
/commit dry-run       # preview without touching anything
```

**What it checks:**
- Hard-block list: `.env`, `appsettings.Development.json`, `*.local`, build artifacts, personal data files
- Inline secret scan: API keys (`sk-`, `AIza`, `AKIA`, JWT blobs), passwords in code, PEM keys, connection strings with credentials
- `.gitignore` health check — warns if critical patterns are missing

**Message style:** infers active PF ticket from branch/plan files → `PF-XXX: intent summary`. Falls back to `feat:` / `fix:` / `chore:` conventional commits. Never `git add .`; always stages by explicit file name.

---

### `/kanban-sync` — Sync BOARD.md against GitHub Issues
Pulls closed issues from GitHub, finds which ones are missing from the Done section, appends them, and reports any open issues not yet triaged onto the board. Additive-only — never deletes or reorders rows.

```
/kanban-sync        # sync Done + report untracked open issues
```

**What it does:**
1. `gh issue list --state closed` → finds tickets missing from Done → appends rows
2. `gh issue list --state open` → reports PF-IDs not anywhere on the board (needs triage)
3. Updates the `Last synced` date header

For plan-only tickets (PF-090, PF-100 — no GH issue), use the plan completion hook or update manually; those won't appear in the GitHub diff.

---

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

### `/chores` — Project housekeeping sweep
Audits plans for archival, scans for dead code and tech debt markers, checks folder structure violations, and reports outdated dependencies. Always reports before acting — no files are moved or deleted without confirmation.

| Invocation | Scope |
|-----------|-------|
| `/chores` | Full sweep — all 5 categories |
| `/chores plans` | Plan audit + archive to `completed/` only |
| `/chores codebase` | Dead code, orphaned files, build artifacts |
| `/chores debt` | Tech debt markers status report |
| `/chores structure` | ARCH-02/03 folder/namespace violations |

```
/chores               # full sweep
/chores plans         # archive completed plans only
/chores debt          # check known tech debt items
```

**What it checks:**
- Plans: scans `*-todo.md` for all-done checkboxes + GitHub issue state → moves verified-complete to `completed/`
- Codebase: `Console.Write`, TODO/FIXME, skipped tests, dead endpoints, orphaned plan files
- Tech debt: verifies each item in CLAUDE.md's Known Tech Debt section is still open or fixed
- Structure: ARCH-02 interfaces in wrong layer, ARCH-03 namespace mismatches, frontend file placement
- Dependencies: `dotnet list --outdated`, `npm outdated`, `pip list --outdated`

Never auto-deletes. Never commits. Always runs `/kanban-sync` after archiving plans.

---

## UI Themes (auto-applied)

These are applied **automatically** — you don't need to invoke them manually.

| Skill | When applied |
|-------|-------------|
| `data-oriented-theme` | Any web UI, dashboard, component, or artifact |
| `data-oriented-zenmode` | When you ask for "zen", "minimal", "clean", "focus mode" UI |

To override: explicitly request a different style ("landing page", "marketing design").

---

## Learning & Development

### `/mentor` — AI Engineering pivot coach (90-day structured learning path)
Tracks and drives Rikky's pivot from .NET Backend Engineer to **AI Engineering / Backend AI Engineering** — targeting async-first remote companies (Grafana, Supabase, GitLab, PostHog archetype). Reads live progress from `docs/mentor/progress.md` and the task-level curriculum at `mentor/learning-path.md` before every response.

| Mode | Usage |
|------|-------|
| *(none)* or `today` | **Daily focus** — what to work on today, calibrated to progress |
| `status` | **Progress dashboard** — phase, week, gap scorecard, streak |
| `log [what you did]` | **Record progress** — appends to `progress.md`, marks tasks done |
| `weekly` | **Weekly review + next-week plan** — what shipped, what slipped, day-by-day plan |
| `plan` | **Full 30/60/90 roadmap** — all phases and weeks, marked by status |
| `cert [name]` | **Certification ROI eval** — signal value, gap coverage, WORTH IT / SKIP / DEFER |
| `gap` | **Gap re-assessment** — current match score vs AI Eng JD landscape |

```
/mentor                                             # today's focus
/mentor status                                      # full progress dashboard
/mentor log added RAG retrieval endpoint with MRR eval
/mentor weekly                                      # Sunday/Monday review + next-week plan
/mentor plan                                        # see full 30/60/90 roadmap
/mentor cert "Databricks Generative AI Engineer"    # evaluate a cert
/mentor gap                                         # re-run gap analysis vs JD landscape
```

**Learning path (3 phases, 12 weeks):**
- Phase 1 (Days 1–30): AI Observability · LLM Evals · RAG embeddings · RAG re-ranking
- Phase 2 (Days 31–60): Streaming + Production UX · Advanced RAG · smolagents · LangGraph multi-agent
- Phase 3 (Days 61–90): Public presence + blog post · Certifications · Interview prep · Active applications

**Rules:**
- Implementation happens **same day** as theory — no "study first, build later"
- Every concept is implemented in `c:\workspaces\personal-finance` — no toy scripts
- Daily output scannable in 10 seconds — no walls of text
- All learning plans (`PF-AIxxx-*.md`) must end with a **Knowledge Check quiz** (5–6 MCQs, cert-style)

**Files it reads:** `docs/mentor/progress.md` (live log) · `mentor/learning-path.md` (week-by-week tasks) · `docs/mentor/ai-engineer-learning-path.md` (curriculum map)

---

## Naming Convention for Plan Files

```
.claude/plans/
  PF-{n}-{feature}-teamA          # Proposal A (no extension = markdown)
  PF-{n}-{feature}-teamB          # Proposal B
  PF-{n}-{feature}-verdict.md     # Battle plans output
  PF-{n}-{feature}-todo.md        # Execution plan (review-plan input)
```
