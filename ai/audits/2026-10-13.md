# AI Setup Audit — 2026-10-13

Proposal only. Nothing has been moved, merged, renamed, or deleted yet.

## How usage was measured

- **Sources:** 312 Codex session logs (complete since 2026-09-12), the 3 Claude Code transcripts still on disk for this project, and `~/.claude/history.jsonl`.
- **What counted as a use:** you typed `/name` or `$name`, the Skill tool was called, or an agent opened that skill's `SKILL.md` file.
- **What was excluded:** 9 setup and maintenance sessions that touched 8 or more skills at once. These were the Codex migration on Sep 12 and the reorganization on Oct 8–9. Without this filter, every skill would look "used".
- **Gap:** Claude Code keeps only a few old transcripts, so Claude-side use before about Oct 10 is mostly invisible. Codex use over the last 30 days is complete. Memory files, hooks, and plugins don't log their use, so their usage is marked "unknown".
- **"Uses" column:** the number of real sessions in the last 30 days (since 2026-09-13), followed by the last date seen.

## 1. Every item, scored

### Skills (each row covers both the Claude copy in `.claude/skills/` and the Codex copy in `.agents/skills/`)

| # | Item | Lines (Claude / Codex) | Last changed | Uses | Bucket | Reason |
|---|------|------|------|------|------|------|
| 1 | commit | 432 / 38 | 10-08 | 12 · 10-13 | KEEP | Your most-used skill. Its secret scan and message rules change the result. |
| 2 | ci-check | 84 / 43 | 10-08 | 8 · 10-13 | KEEP | Runs your exact CI gates. |
| 3 | execute | 177 / 31 | 10-08 | 8 · 10-10 | KEEP | Core of your build loop. Encodes the plan-update rules. |
| 4 | plan | 247 / 34 | 10-08 | 7 · 10-10 | KEEP | Core of your build loop. Encodes your plan format. |
| 5 | typesafe-ai | 151 / 151 | 10-09 | 11 · 10-13 | KEEP | Used heavily. The Claude copy isn't saved in git yet. |
| 6 | mentor | 0 / 1011 | 10-08 | 4 · 10-13 | KEEP | Used. **The Claude copy is broken**: the file holds only a path and no header, so Claude sees no description. |
| 7 | chores | 292 / 32 | 10-08 | 4 · 10-07 | KEEP | Used for housekeeping. |
| 8 | tech-write | 1012 / 46 | 10-08 | 3 · 10-08 | KEEP | Used. Holds the Indonesian learning-material rules. |
| 9 | data-oriented-zenmode | 1529 / 254 | 05-06 | 3 · 10-10 | KEEP | Used for UI work. Visual style the model wouldn't pick on its own. |
| 10 | db-migrate | 54 / 28 | 10-08 | 2 · 10-10 | KEEP | Used. **The Claude copy still describes EF Core**, which was removed. The Codex copy is current. |
| 11 | docker-up | 43 / 26 | 10-08 | 3 · 10-10 | KEEP | Used. |
| 12 | add-endpoint | 84 / 49 | 10-08 | 2 · 10-10 | KEEP | Used. Project-specific scaffolding steps. |
| 13 | consult | 480 / 34 | 10-08 | 2 · 09-15 | KEEP | Used. Will absorb #17 and #18. |
| 14 | council | 142 / 24 | 10-08 | 2 · 10-09 | KEEP | Used. An account-level `anthropic-skills:council` also exists (see #88). |
| 15 | test-all | 30 / 41 | 10-08 | 0 | MERGE → ci-check | A subset of ci-check (tests plus lint). |
| 16 | create-diagram | 446 / 457 | 08-10 | 1 · 09-14 | MERGE → tech-write | tech-write already has an interactive diagram mode. Move `verify-diagram.js` along with it. |
| 17 | battle-plans | 117 / 24 | 10-08 | 0 | MERGE → consult | Comparing two proposals is a consult question. |
| 18 | arch-review | 223 / 33 | 10-08 | 0 | MERGE → consult | Becomes consult's "codebase health" mode. |
| 19 | run-ai-service | 97 / 26 | 05-18 | 0 | MERGE → docker-up | Starting a single service is a subset of starting the stack. |
| 20 | add-bank-parser | 371 / 36 | 05-31 | 0 | CUT | No use found. The parser pattern already lives in `.claude/rules/backend.md`. |
| 21 | add-llm-extractor | 218 / 33 | 05-18 | 0 | CUT | No use found. The patterns already live in `.claude/rules/ai-service.md`. |
| 22 | datatable | 182 / 32 | 05-18 | 0 | CUT | No use found. The existing DataTable code is the pattern. |
| 23 | braindump | 104 / 22 | 06-10 | 0 | CUT | No use found. |
| 24 | kanban-sync | 122 / 32 | 10-08 | 0 | CUT | No use found. It syncs GitHub issues, and you moved to local plans. |
| 25 | efficient-model | 109 / 30 | 06-12 | 0 | CUT | No use found. Handing work to cheaper sub-agents is default behavior. |
| 26 | po-review | 210 / 26 | 10-08 | 0 | CUT | No use found. |
| 27 | ux-review | 263 / 30 | 10-08 | 0 | CUT | No use found. Your UX preferences move to `ai/design/ui-rules.md`. |
| 28 | review-plan | 98 / 24 | 10-08 | 0 | CUT | No use found. Bring it back if you still review plans before `/execute`. |
| 29 | cio | 264 / 32 | 07-30 | 0 | UNSURE | No use found, but finance rule FIN-05 sends finance questions here. Rare by design. |
| 30 | risk-officer | 254 / 34 | 10-08 | 0 | UNSURE | Same situation as cio: Trading Desk work is routed here. |
| 31 | compliance | 223 / 32 | 10-08 | 0 | UNSURE | Same situation as cio: required before anything that gives advice ships. |
| 32 | pm-brainstorm | 321 / 33 | 10-08 | 0 | UNSURE | No use found, but the finance rules name it as the "do users want it" check. |
| 33 | data-oriented-theme | 782 / 380 | 05-22 | 0 | UNSURE | CLAUDE.md says to always apply it for UI work, yet it wasn't read once in 30 days. zenmode was read instead. |
| 34 | 13 loose `.md` files in `.claude/skills/` (`plan.md`, `add-endpoint.md`, …) | 1,262 total | 03–10 | n/a | CUT | Claude Code never loads them; it only reads `<name>/SKILL.md`. Seven are exact copies and six are older versions. |
| 35 | `.claude/skills/SKILLS-GUIDE.md` | 680 | 10-08 | unknown | CUT | A hand-written catalog that already disagrees with the skills. The map replaces it. |

### Instruction and rule files

| # | Item | Lines | Last changed | Uses | Bucket | Reason |
|---|------|------|------|------|------|------|
| 36 | `CLAUDE.md` (root) | 428 | 10-08 | every Claude session | KEEP | Main Claude entry point. Its layout, ports, env, and command sections repeat the rules and docs, so trim it (step 6). |
| 37 | `AGENTS.md` (root) | 93 | 10-09 | every Codex session | KEEP | Main Codex entry point. |
| 38 | `apps/api`, `apps/frontend`, `services/ai-service` `AGENTS.md` | 118 | 09-12 | Codex, in those folders | KEEP | Codex's per-folder rules. |
| 39 | `apps/api/CLAUDE.md` | 40 | 04-28 | Claude, in that folder | MERGE → `.claude/rules/backend.md` | Repeats backend.md and the root commands. |
| 40 | `apps/frontend/src/CLAUDE.md` | 42 | 03-14 | Claude, in that folder | MERGE → `.claude/rules/frontend.md` | Repeats frontend.md. It also sits in an odd spot (`src/`). |
| 41 | `.claude/rules/finance-domain.md` | 51 | 10-08 | always loaded | KEEP | Money invariants the model wouldn't enforce on its own. |
| 42 | `.claude/rules/governance.md` | 100 | 06-07 | always loaded | KEEP | Has 3 stale rows: TEST-03 in-memory DB, ARCH-05 AppDbContext, and THINK-05 `Wallet`. |
| 43 | `.claude/rules/backend.md` | 87 | 06-10 | always loaded | KEEP | Project-specific architecture rules. |
| 44 | `.claude/rules/ai-service.md` | 204 | 08-05 | always loaded | KEEP | Contradicts itself: it says "never JSON mode", but Gemini (the primary provider) uses JSON mode. Also still says `Wallet`. |
| 45 | `.claude/rules/frontend.md` | 49 | 03-14 | always loaded | KEEP | Receives #40. |
| 46 | `.claude/rules/docker.md` | 43 | 03-01 | always loaded | MERGE ← `.agents/rules/docker.md` facts | Wrong today: it says .NET 9, Postgres 16, and EF auto-migrate. The Codex copy is correct. |
| 47 | `.agents/rules/*` (6 files) | 180 | 09-12 | Codex, when told | KEEP | Codex copies of the rules. |
| 48 | `.agents/WORKFLOWS.md` | 65 | 10-09 | Codex, on any skill | KEEP | Shared Codex conventions. |
| 49 | `.claude/agents/code-reviewer.md` | 61 | 03-01 | 0 ever | CUT | Never used. `/code-review` covers it. |
| 50 | `.claude/agents/test-writer.md` | 97 | 03-01 | 0 ever | CUT | Never used. backend.md already has the test conventions. |
| 51 | `.claude/agents/planner.md` | 164 | 10-08 | 0 ever | MERGE → plan skill | Not a valid agent (it has no header). It also says to use `gh issue view`, which contradicts your local-plans rule. |
| 52 | `.claude/hooks/plan-complete-sync.py` | 137 | 10-08 | unknown | UNSURE | Runs after every tool call to update BOARD.md. Its effect isn't logged. |
| 53 | `.claude/hooks/skill-review-reminder.py` | 43 | 07-27 | unknown | CUT | Adds a reminder after every skill call. Noise. |
| 54 | `.claude/hooks/push-notify.sh` and its Stop hook | 1 | 04-29 | n/a | CUT | **Broken.** Settings call `~/.claude/hooks/push-notify.sh`, which doesn't exist, and the repo copy posts to a placeholder topic. Your built-in push notifications are already on. |
| 55 | `.claude/settings.json` | 69 | 10-08 | always | KEEP | Remove the two dead hook entries. |
| 56 | `.claude/metadata.md` | 14 | 06-16 | unknown | CUT | A copy of 3 memory entries. |
| 57 | `.claude/launch.json` | 35 | 03-01 | unknown | UNSURE | Preview launch config. Its Docker entry may be outdated. |
| 58 | `.codex/config.toml` | 8 | 09-12 | every Codex session | KEEP | Codex sandbox settings. |
| 59 | `.agents/scripts/validate-setup.cjs` | 75 | 10-09 | unknown | UNSURE | A setup checker. Could be useful after this reorganization. |
| 60 | `.agents/evals/` | 1,027 | 09-12 | 1 run (09-12) | UNSURE | A test case for the learning-material rules. |
| 61 | `.github/copilot-instructions.md` | 187 | 06-01 | unknown | CUT | Outdated (.NET 9, EF Core, Postgres 16). It also describes the product as a bank-statement tool. |
| 62 | `.github/workflows/claude.yml`, `claude-code-review.yml` | 94 | 03-14 | not checked | UNSURE | GitHub bots. I didn't check their run history. |
| 63 | `.mcp.json.example` | 34 | — | n/a | CUT | No tool servers are set up for this project. |
| 64 | `docs/codex/configuration.md`, `jev-setup.md` | 195 | 10-09 | referenced by AGENTS.md | KEEP | Codex and Jev setup reference. |
| 65 | `docs/codex/skills-and-rules.md` | 60 | 10-09 | referenced by AGENTS.md | MERGE → `ai/MAP.md` | The same job as the map. |
| 66 | `docs/codex/jev-audit.md`, `documentation-status-audit.md` | 95 | 10-09 | n/a | CUT | One-off reports that are already done. |

### Claude memory (`~/.claude/projects/…/memory/`)

| # | Item | Last changed | Uses | Bucket | Reason |
|---|------|------|------|------|------|
| 67 | `MEMORY.md` (index) | 10-13 | every session | KEEP | Its "Project State" section repeats BOARD.md, so trim it. |
| 68 | `codex-period-2026-09.md` | 10-13 | unknown | KEEP | Context you can't get from the code. |
| 69 | `architecture.md` | 05-23 | unknown | CUT | CLAUDE.md and the rules cover it. It's also older than the Supabase move. |
| 70 | `dev-workflow.md` | 03-14 | unknown | CUT | Repeats the CLAUDE.md commands. Seven months old. |
| 71 | `kanban.md`, `todo-plan-standard.md`, `feedback_plan_file_naming.md` | 10-13 | unknown | MERGE → `ai/build/templates/plan-template.md` | These three are one thing: how a plan file looks. |
| 72 | `feedback_act_dont_narrate`, `feedback_honest_progress_reporting` | 06-15 | unknown | CUT | Now built into the model's base instructions, almost word for word. |
| 73 | `feedback_clickable_file_links` | 05-31 | unknown | CUT | The VS Code extension already requires this. |
| 74 | `feedback_no_claude_coauthor` | 07-15 | unknown | CUT | Already enforced by the setting `includeCoAuthoredBy: false`. |
| 75 | `feedback_project_description_framing` | 06-24 | unknown | CUT | CLAUDE.md now says this at length. |
| 76 | `feedback_local_plans_over_github`, `feedback_learning_plans_stay_in_learning` | 10-13 | unknown | CUT | CLAUDE.md "Task Management" and `plans/README.md` already say this. |
| 77 | `feedback_lead_with_outcome`, `feedback_keep_emojis`, `feedback_no_external_artifacts`, `feedback_autonomous_execution` | 05–07 | unknown | MERGE → `ai/shared/preferences.md` | Real preferences. They move to one shared place so Codex sees them too. |
| 78 | `feedback_ux_card_design`, `feedback_ux_minimalism_vs_psychology`, `feedback_no_dividers` | 05-21/22 | unknown | MERGE → `ai/design/ui-rules.md` | One topic: how your UI should look. |
| 79 | `feedback_indonesian_translation_style`, `feedback_progressive_learning_material_style`, `feedback_never_name_the_teaching_method`, `feedback_topic_doc_define_before_arguing`, `feedback_log_only_actual_work` | 06–10 | unknown | MERGE → `ai/learn/style.md` | One topic: how learning material is written. |

### Personal and account level (outside this repo, affects all your projects)

| # | Item | Last changed | Uses here | Bucket | Reason |
|---|------|------|------|------|------|
| 80 | `~/.claude/CLAUDE.md` → `RTK.md` | — | every session | UNSURE | The RTK hook does the actual work, so this text is mostly informational. It does help when RTK misbehaves. |
| 81 | `~/.claude/skills/commit` | 07-15 | unknown | UNSURE | **Same name as the project's commit skill. In Claude Code this personal one is what loads.** Pick one. |
| 82 | `~/.claude/skills/grill-me` | 10-13 | 0 | MERGE → `grilling` | Duplicate. |
| 83 | career-coach, backup/restore-to-second-brain, leetcode-pop-quiz | 10-13 | 0 here | UNSURE | For your other projects. Out of scope here. |
| 84 | `~/.claude/*.ps1` (4 skill-counter scripts) and `settings.json.bak` | 06-10 / 09-12 | n/a | CUT | One-off leftovers. |
| 85 | Superpowers plugin | 09-23 | 0 here | UNSURE | Adds a long mandatory "check skills first" block to every session. |
| 86 | code-review plugin | 10-13 | 0 here | UNSURE | The built-in `/code-review` does the same job. |
| 87 | skill-creator plugin | 10-13 | 0 here | UNSURE | Only the reminder hook (#53) points to it. |
| 88 | claude.ai connectors (Gmail, Calendar, Docs, Higgsfield, Chrome; Drive and Linear aren't signed in) | — | 0 here | UNSURE | Account-wide. Higgsfield alone adds about 150 tools to every session. |
| 89 | Codex personal plugins (11 enabled) and `~/.codex/RTK.md` | — | unknown | UNSURE | Codex has no RTK hook, so its RTK note is needed. The plugins I can't judge. |

## 2. Counts

| Bucket | Items | Share of measured text* |
|------|------|------|
| KEEP | 29 | 45% |
| MERGE | 15 | 12% |
| CUT | 27 | 24% |
| UNSURE | 18 | 19% |
| **Total** | **89** | 19,725 lines |

\*Measured over the repo AI files plus project memory: 4,813 of 19,725 lines are cut. Merging folds another 12% into other files, and about half of that disappears as duplicate text. If you also cut every UNSURE item, the reduction reaches about 43%. The personal and account-level items (#80–89) aren't included in the line count.

## 3. Proposed structure

**Constraint:** Claude Code only loads skills from `.claude/skills/<name>/`, and Codex only from `.agents/skills/<name>/`, so skills must stay in those flat folders. Job folders therefore hold the job's instructions, templates, and examples, plus a list of which skills to use. They don't hold the skills themselves.

```
personal-finance/
├── CLAUDE.md                     # trimmed; imports ai/shared/preferences.md, points to ai/MAP.md
├── AGENTS.md                     # Codex; points to ai/MAP.md and ai/shared/preferences.md
├── ai/
│   ├── MAP.md                    # the map (below)
│   ├── shared/
│   │   └── preferences.md        # how you like answers, reports, commits (from memory #77)
│   ├── build/                    # ship a feature: plan → execute → check → commit
│   │   ├── README.md             # the order of skills; when to add an endpoint or migration
│   │   ├── templates/plan-template.md   # from memory #71
│   │   └── examples.md           # links to finished plans (PF-009, PF-133)
│   ├── decide/                   # architecture and finance judgment calls
│   │   └── README.md             # consult, council, cio, risk-officer, compliance, pm-brainstorm
│   ├── write/                    # docs and diagrams
│   │   ├── README.md
│   │   └── examples.md           # links to best finished docs and diagrams
│   ├── learn/                    # AI engineering learning (mentor)
│   │   ├── README.md
│   │   ├── style.md              # from memory #79
│   │   └── examples.md           # links to PF-AI004 …-id.md and others
│   └── design/                   # UI look and feel
│       ├── README.md
│       └── ui-rules.md           # from memory #78
├── .claude/
│   ├── rules/                    # 6 files, docker.md corrected
│   ├── skills/                   # 14 folders (was 31 folders plus 14 loose files)
│   ├── hooks/plan-complete-sync.py   # only if you keep it (#52)
│   └── settings.json             # dead hooks removed
├── .agents/                      # Codex mirror, trimmed the same way
└── _archive/2026-10-13/          # everything cut or merged, at its original path
```

UNSURE items stay where they are until you decide.

## 4. Draft map (`ai/MAP.md`)

```markdown
# AI Map

Start here. This file points to things; it never repeats them.

## Shared preferences
- `ai/shared/preferences.md` — how answers, reports, and commits should look. Applies to every job.
- `.claude/rules/` (Claude) and `.agents/rules/` (Codex) — project rules: architecture, money, tests.

## Jobs
| Folder | What it's for |
|---|---|
| `ai/build/` | Shipping code: planning, doing the work, checking, committing |
| `ai/decide/` | Hard calls: architecture choices and finance soundness |
| `ai/write/` | Docs, guides, and architecture diagrams |
| `ai/learn/` | AI engineering learning plan, progress, and learning material |
| `ai/design/` | How the app's screens should look |

## Which folder for which request
- "Build / fix / add X" → `ai/build/` (skills: plan, execute, ci-check, commit; add-endpoint, db-migrate, docker-up as needed)
- "Should we…", "which approach…", "is this formula right…" → `ai/decide/` (consult, council; finance: cio, risk-officer, compliance)
- "Write / document / diagram X" → `ai/write/` (tech-write)
- "Teach me / what's next in my learning / log progress" → `ai/learn/` (mentor)
- "Make this screen / page / component" → `ai/design/` (data-oriented-zenmode)
- "Use TypeSafe / Jev" → skill typesafe-ai; Jev setup in `docs/codex/jev-setup.md`
- "Tidy up the repo" → skill chores

## Where things live
- Skills: `.claude/skills/<name>/` (Claude) and `.agents/skills/<name>/` (Codex)
- Tasks and status: `plans/` and `plans/BOARD.md`
- Product and architecture docs: `docs/`
- Finance formulas and tax tables: `docs/reference/finance-domain/`
- Retired material: `_archive/` (don't load unless asked)
```

## 5. Exact steps, in order (after your approval)

All work happens on branch `chore/ai-setup-audit` in this worktree. Nothing gets committed unless you ask.

1. **Create archive folders:** `_archive/2026-10-13/` in the repo, `memory/_archive/2026-10-13/`, and `~/.claude/_archive/2026-10-13/`.
2. **Archive repo CUT items** with `git mv`, keeping their original paths under `_archive/2026-10-13/`. This covers:
   - #34: the 13 loose skill `.md` files
   - #35, #49, #50, #53, #54, #56, #61, #63, #66
   - #20–28: both the Claude and Codex copies
3. **Edit `.claude/settings.json`:** remove the Stop hook (`push-notify`) and the Skill hook (`skill-review-reminder`).
4. **Merge skills.** For each one, copy the unique content into the target in both trees, then archive the source:
   - 15 test-all → ci-check, as a "quick" mode
   - 16 create-diagram → tech-write; `verify-diagram.js` moves to `tech-write/scripts/`
   - 17 battle-plans and 18 arch-review → consult, as "compare two proposals" and "codebase health" modes
   - 19 run-ai-service → docker-up, as a "single service" option
   - 51 planner.md → plan, keeping only content plan doesn't already have
5. **Merge instruction files:**
   - 39 → backend.md and 40 → frontend.md, then archive the sources
   - 46: rewrite `.claude/rules/docker.md` from the current facts in `.agents/rules/docker.md`
   - 65: fold into `ai/MAP.md`, then archive
6. **Create `ai/`:** add the folders, `MAP.md`, `shared/preferences.md` (#77), `build/templates/plan-template.md` (#71), `design/ui-rules.md` (#78), `learn/style.md` (#79), and the short job READMEs.
   - Add `@ai/shared/preferences.md` and a pointer to `ai/MAP.md` in CLAUDE.md, and a "read these" line in AGENTS.md.
   - Trim CLAUDE.md sections that repeat the rules or `docs/SETUP.md`. I'll check each one against its target before removing it.
7. **Memory:** archive #69, #70, #72–76 and the merged sources of #71, #77–79. Then rewrite the `MEMORY.md` index to match and trim its "Project State" section.
8. **Personal level:** archive #84, and merge #82 into `grilling`.
9. **Check the result:**
   - Run `.agents/scripts/validate-setup.cjs`.
   - Confirm both skill folders contain only folders with a `SKILL.md`.
   - Search for broken links to anything archived.
   - Show you `git status`.

### Fixes found along the way (separate approval; these change wording, not structure)

- Fix the broken Claude `mentor` pointer by giving it a proper header (#6).
- Replace the outdated Claude `db-migrate` copy with the Supabase version (#10).
- Correct the stale rows in governance.md (#42) and ai-service.md (#44): `Wallet`→`AccountName`, the in-memory DB, and the JSON-mode contradiction.
- Track `.claude/skills/typesafe-ai/` in git (#5).

### Decisions only you can make

- The 18 UNSURE items, especially #81: which `commit` skill should win?
- **Two copies of every skill.** Claude gets a long version and Codex a short one, and they've already drifted apart. My recommendation for now: keep both, since your AGENTS.md deliberately keeps them separate, and let the map cover both. Merging them into one source is a bigger, separate job.

---

## Execution log — 2026-10-13 (approved and carried out)

All approved steps are done on branch `chore/ai-setup-audit`. Nothing is committed.

**Changes from the plan, each because the plan was wrong on a fact:**
- **#16 create-diagram: kept, not merged.** tech-write's interactive mode hands its work to create-diagram, which was split out on purpose. 11 diagram files in `docs/` also point to `/create-diagram` and its checker script.
- **#66 `docs/codex/jev-audit.md`: kept, not archived.** It is the source document for in-progress plan PF-141.
- **#71 `kanban.md`: archived, not merged.** It only describes the retired GitHub Projects workflow (next ID "PF-043", `gh issue create`), so nothing current was left to merge.
- **#82 `grill-me`: kept.** It is a 7-line shortcut that makes `/grill-me` run `grilling`, so there was nothing to merge.
- **Job folders:** each job's finished examples are listed in its `README.md` rather than a separate `examples.md`, which means fewer files.

**Result:**
- Skills went from 31 folders + 14 loose files (Claude) and 32 folders (Codex) to 20 matching folders in each tree.
- The Codex setup validator passes: 20 skills, 6 rule files, links, and helper syntax.
- CLAUDE.md went from 428 to 331 lines.
- Project memory went from 26 files to 2.
- The archives are in `_archive/2026-10-13/` (repo), `memory/_archive/2026-10-13/`, and `~/.claude/_archive/2026-10-13/`.

**Problems that were already there, found during the link check (not fixed):**
- CLAUDE.md links to `docs/design/bank-profiles-reference.md` and `docs/design/validation-pipeline.md`, which don't exist.
- `create-diagram` links to two diagrams under `docs/architecture/` that live in `docs/ai-features/`.
- `tech-write` has three `../../docs/...` links that are one level short.
- `models.py` uses `float` for `amount_idr`/`exchange_rate` (FIN-01).
