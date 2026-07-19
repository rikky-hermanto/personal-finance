# `/goal` and `/loop` — Use Cases for This Project

> Note: only `loop` is a registered skill in this environment; `/goal` is covered generically (self-paced, multi-step objective pursuit) based on its typical meaning, since no `goal` skill is currently available here.

## `/loop` — recurring / self-paced execution

1. **CI/test babysitting** — `/loop 5m ci-check` while iterating on a PF ticket: re-run `dotnet build`, `dotnet test`, `npm run lint`, `tsc --noEmit` on an interval and only interrupt when something fails.
2. **AI eval monitoring** — poll `services/ai-service/evals/results/` after kicking off a long `eval_extraction.py --compare` run; report F1 drift as it lands (relevant to active PF-AI002/PF-AI003 work).
3. **Board hygiene** — periodic loop running `kanban-sync` to catch drift between `.claude/plans/BOARD.md` and actual plan file statuses.
4. **Docker/service health watch** — loop `docker-up` / status checks while doing unrelated work, alert if `api`, `ai-service`, or the Supabase local stack goes unhealthy.
5. **Long-running Supabase migration work** (PF-S08 Auth is next) — self-paced loop that keeps applying/verifying migration steps and re-checking RLS policies without manual polling.
6. **Langfuse cost/latency watch** — loop-check trace exports during a bulk categorization/backfill job to catch cost spikes early.

## `/goal` — open-ended objective pursuit

1. **"Get PF-S08 (Auth) done"** — hand off the whole ticket (JWT middleware, user_id columns, RLS policies, tests) and let it self-direct through the plan file's checklist.
2. **"Bring TypeScript strict mode back"** (known tech debt, PF-052) — incrementally fix strict-mode violations file by file until clean.
3. **"Close out backend ILogger coverage gap"** (PF-051) — sweep `DashboardService`, `SpendingAnalysisService`, etc., adding `ILogger<T>` and structured logging per governance rule ERR-02.
4. **"Un-skip CategoryRuleService tests"** — blocked on the PF-034 integration harness, so the real goal becomes "build the Supabase integration test harness, then re-enable skipped tests."
5. **AI learning track progression** — "advance PF-AI003 RAG Phase 1 to done" as a standing goal, since it's explicitly in-progress on the board.

## Housekeeping use cases

Routine maintenance work that accumulates between sprints. Each entry names the tool that fits and why.

### 1. Ideas folder cleanup — `/loop`

`docs/ideas/` accumulates raw brainstorms (`gamification-engine.md`, `money-tracing.md`, `claude-fable-ideas.md`, …) plus `adopting/`, `prototypes/`, `blogs/`, `screenshots/`. Over time it drifts: ideas ship but the file stays, some duplicate each other, some are ready to become real tickets.

Each pass: cross-check ideas against the BOARD.md Done column and `git log` to find shipped-but-unarchived ideas; flag overlapping/duplicate files; flag actionable un-ticketed ideas as promotion candidates for a `PF-XXX-todo.md` plan.

```
/loop 30m chores clean up docs/ideas — flag stale/shipped ideas for archive, flag duplicates,
flag promotion-ready ideas for BOARD.md, do not delete without confirmation
```

Keep the loop in **flag-and-report** mode rather than auto-archive. File moves are semi-destructive; approving batches periodically beats a loop silently reorganizing docs unattended.

### 2. Plan filename convention audit — `/goal`

Convention is `PF-{number}-{short-kebab-slug}-todo.md`, but several plans currently drop the `-todo` suffix — `PF-109-spending-analysis-subscription-radar.md`, `PF-110-…`, `PF-111-…`, `PF-112-…`. A one-shot goal renames the offenders, updates any BOARD.md links that point at them, and verifies nothing else references the old paths.

Goal, not loop — it's a finite sweep with a clear done state, not something to re-check on an interval.

### 3. Ticket-counter drift reconciliation — `/goal`

`CLAUDE.md` states "current highest: PF-130" and the memory index says PF-128, while `.claude/plans/` actually contains PF-131 and PF-132. Next-ID guidance is wrong in two places at once, which risks a duplicate ticket number.

A goal-run recomputes the true highest ID per prefix (PF / PF-S / PF-AI) from filenames plus BOARD.md, then updates every place the counter is asserted. Worth re-running as a `/loop` on a slow cadence (weekly) if the drift keeps recurring — the underlying cause is that the counter is duplicated rather than derived.

### 4. Completed-plan archival sweep — `/loop`

`.claude/plans/completed/` holds 47 archived plans, but plans finished mid-sprint don't always get moved. A slow loop compares Done rows in BOARD.md against files still sitting in `.claude/plans/`, and reports which ones are due for archival.

Two rules the loop must respect: the plan-complete hook already appends Done rows automatically (don't double-append), and learning-track plans (`PF-AIxxx`) **never** move to `completed/` — they stay in `.claude/plans/learning/` marked Done in place.

### 5. Tech-debt register refresh — `/goal`

The known-debt list spans `CLAUDE.md`, `docs/tech-debts/`, and the memory index, and it has already gone stale once — items marked RESOLVED (the `IBankIdentifier` ARCH-02 violation, the `ex.Message` leak, the `Wallet` rename) sat listed as active for a while.

A goal-run verifies each claimed debt item still reproduces in the current code, marks the fixed ones resolved with the commit that fixed them, and surfaces newly-introduced debt not yet registered. Best run right after a sprint closes.

### 6. Dead-code and stub sweep — `/goal`

Known dead surfaces exist — the `upload-preview-new` endpoint is documented as a PF-S11 stub that returns 202 then nothing. A goal-run inventories unreferenced endpoints, unused DTOs, orphaned components, and skipped-test clusters, then reports them grouped by whether they're truly dead versus blocked-on-a-ticket. Report first, delete only on approval: "unreferenced" and "unused" are different claims, and the stub is intentional.

### 7. Secret and PII re-scan — `/loop`

Pre-open-source hardening (PF-126, PF-127) purged PII and credentials from git history, but new commits can reintroduce them. A `gitleaks detect` loop on a daily cadence catches regressions early, when history rewriting is still cheap. Note the known-benign case so the loop doesn't cry wolf: `appsettings.Development.json` holds well-known local Supabase JWT defaults, not production secrets.

### 8. Docs-vs-code accuracy audit — `/goal`

`CLAUDE.md` and the architecture docs assert specific facts — endpoint counts, parser inventories, port mappings, "8 endpoints" on the AI service, the file-path tables. Code moves faster than prose. A goal-run walks each factual assertion, checks it against the actual tree, and reports the mismatches rather than silently rewriting — some drift signals a doc that's wrong, other drift signals code that broke a documented contract, and those need opposite fixes.

## Recommendation

Since this project already uses `.claude/plans/` + `BOARD.md` as the task system, `/goal` is most useful as an autonomous driver *through* an existing plan file rather than a replacement for planning. `/loop` is best for anything that needs interval-based polling (tests, health checks, evals) rather than pure task completion.
