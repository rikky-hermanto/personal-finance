# Loop Engineering — Operator Manual

How to turn an idea into merged code with the loop: **epic → plan → execute → verify → review**.
Claude does the planning, coding, testing and checking in an isolated worktree. You make three decisions, called gates, and nothing passes a gate without your answer.

> Configured on 2026-10-15 with `/setup-loop`. Config: [.claude/loop.json](../../.claude/loop.json). Slot script: [scripts/loop-env.mjs](../../scripts/loop-env.mjs).

---

## 1. The idea in one picture

```
 You write an epic          G1                 G2                         G3
 (business language)   ──▶ /loop-grill ──▶  /loop-run  ──────────────▶ /loop-accept
 plans/epics/E-001…        clarify + plan    pick ticket, model,        pass → merge locally
                           tickets land in   budget; Claude executes,   fail → back to backlog
                           plans/backlog/    tests, verifies            with your feedback
                                             → plans/ready-to-review/
```

| Gate | Your decision | Command |
|---|---|---|
| **G1** | "Yes, this is what I mean" for an epic | `/loop-grill E-001` |
| **G2** | "Spend quota on this ticket, with this model" | `/loop-run` or `/loop-run PF-150` |
| **G3** | "This works, merge it" or "No, because…" | `/loop-accept PF-150 pass` / `fail` |

`/loop-standup` ties them together each morning. It tells you which gate is waiting for you.

---

## 2. Before your first run

The audit on 2026-10-15 left these open. Re-check any time with `/setup-loop audit`.

| Must do | Why | How |
|---|---|---|
| Update Claude Code to v2.1.259 or later | Unattended runs need `--permission-prompts none`; older versions can hang on a prompt | Update the CLI, then `claude --version` |
| Add the statusline to `~/.claude/settings.json` | The loop reads your 5-hour and weekly usage from it; without it every G2 says "usage unknown" | Add `"statusLine": { "type": "command", "command": "node \"C:/Users/rikky/.claude/skills/loop-lib/scripts/statusline.mjs\"" }` |
| Make `.claude/hooks/plan-complete-sync.py` loop-aware | It also writes `plans/BOARD.md` and can overwrite the generated loop block | Port the reference in `~/.claude/skills/setup-loop/templates/board-sync-hook/` |
| Commit the loop files | `loop.json`, `loop-env.mjs`, `.worktreeinclude`, `plans/epics/` are untracked | `/commit` |

| Should do | How to record it |
|---|---|
| Run `/ci-check` on main once and confirm it is green | `node "$HOME/.claude/skills/setup-loop/scripts/scaffold.mjs" confirm ciBaseline --root . --note "..."` |
| Do one snapshot/restore round trip on a scratch database (Docker up) | `confirm dbRoundTrip` — until then, **don't run schema tickets in the loop** |
| Desktop scheduled task for the standup (Phase 2) | Claude Desktop → Routines → New → Local, name `loop-standup`, weekdays 08:00, folder `C:\workspaces\personal-finance`, Sonnet |

---

## 3. What the loop is set up to do here

| Setting | Value | Meaning |
|---|---|---|
| Tickets | `PF-\d+`, files `PF-<n>-<slug>-todo.md` | Only plain `PF-` tickets. `PF-AI` (learning) and `PF-S` (sprint) tickets stay manual |
| Tests every run | `dotnet test`, `npm run test:desk` + `test:macro`, `pytest` | Same test steps CI runs |
| CI gate | `/ci-check` | All five CI-01 gates; "not run" counts as a failure |
| E2E | **off** (`when: never`) | Turned off on purpose. See [use case 8](#use-case-8--turn-e2e-on-for-a-ticket) |
| Slot 1 ports | frontend **8180**, API **7308**, AI service **8100** | Your main stack (8080 / 7208 / 8000) is never touched |
| Shared | Supabase on 54321/54322 | One database for both. Schema tickets snapshot it first |
| Models | opus, sonnet, haiku | Plan and grill use opus; execute uses sonnet/high by default |
| Concurrency | 1 ticket at a time | A slot stays held until G3 passes or sends the ticket back |
| Sensitive paths | auth, money, secrets, schema globs | Highlighted at G2 and listed first at G3 |
| Never done by the loop | `git push`, merge to remote, `gh` issue/PR changes, `supabase db push` | Blocked by the engine deny list. Pushing is always `/commit push` by you |

Where things show up:

| You want to see… | Look at |
|---|---|
| What's in flight, and what each ticket is for | `plans/BOARD.md`, the block between `<!-- loop:begin -->` and `<!-- loop:end -->`. The Objectives column comes from each ticket's `> **Board objective:**` line |
| The code being written | `.worktrees/PF-<n>/` on branch `loop/PF-<n>` |
| The running app for that ticket | http://localhost:8180 |
| Logs of a run | `.loop/runs/PF-<n>/` (`tests.log`, `ci.log`, `verdict.json`, `segment-N.out.json`) |
| Logs of the slot's processes | `.loop/slots/1/ai.log`, `api.log`, `frontend.log` |

---

## 4. Use cases

### Use case 1 — A normal morning

You open Claude Code in the project (or the scheduled task fires at 08:00).

```
/loop-standup
```

- If nothing needs you, the reply is just `idle`. Done.
- Otherwise you get, in this order: draft epics to grill (G1), ready tickets to pick (G2), tickets waiting for your review (G3), and stuck runs or old worktrees.

Example answer to the G2 question on your phone or in the terminal:

> **3 tickets ready.** Top: PF-152 (S, sonnet/high, ~?% of 5h). Usage 5h 22% · week 41%. **Pick one?**
> ◉ PF-152 (Recommended) ○ PF-149 ○ PF-147 ○ None today

Pick one and the standup hands over to `/loop-run`. `~?%` means fewer than three runs have been measured, so the cost estimate is still unknown. That is expected at first.

---

### Use case 2 — You have a new feature idea

Example: you want a **subscription radar** in Cashflow, a list of recurring charges you may have forgotten about.

1. Copy the template and write only the top part, in plain words:

   ```
   plans/epics/E-001-subscription-radar.md      (copy of plans/epics/_TEMPLATE.md)
   ```

   ```markdown
   ---
   id: E-001
   title: Subscription radar
   status: draft
   priority-hint: medium
   created: 2026-10-16T01:00:00Z
   created-label: 2026-10-16 09:00 Asia/Makassar
   tickets: []
   ---
   # Subscription radar
   ## What I Want (owner, business language)
   Show me every recurring charge from my statements so I can cancel the ones I forgot.
   ## Why Now
   I found two streaming subscriptions I don't use.
   ## Done Looks Like (optional, owner)
   A list on /cashflow with merchant, monthly cost and last charge date.
   ```

   Leave everything under the `<!-- Everything below is written by loop-grill -->` line empty.

2. Clarify it (G1):

   ```
   /loop-grill E-001
   ```

   Claude asks one multiple-choice question at a time, for example "Monthly only, or also yearly subscriptions?" or "Hide a merchant after you dismiss it?". Each comes with a recommendation. It then writes the clarified understanding, decisions, out-of-scope list and proposed slices into the epic and asks **"Is this what you mean?"**

3. Say yes. In the same session `/plan` runs once per slice, and the tickets (for example PF-150 and PF-151) appear in `plans/backlog/`, linked to the epic. Nothing is executed yet; that waits for G2.

If you have to stop in the middle of grilling, just stop. Your answers are saved, and the next `/loop-grill E-001` continues where you left off.

---

### Use case 3 — Run an existing backlog ticket directly

You already have a plan, for example `plans/backlog/PF-148-…-todo.md`, and want the loop to build it.

```
/loop-run PF-148
```

1. **G2:** confirm the model and effort (sonnet/high is the default). If a usage guard trips (5-hour above 70% or week above 80%), you choose **Override** or **Wait**.
2. The loop creates `.worktrees/PF-148` on branch `loop/PF-148`, copies your `.env` files and `appsettings.Development.json` into it, and moves the ticket to `plans/in-progress/`.
3. `/execute` runs in segments of up to 30 minutes. Each segment ends with a checkpoint and a WIP commit on the loop branch, and you get push notifications along the way.
4. Then the tests, `/ci-check` and a **separate verifier** that checks every acceptance criterion with evidence.
5. On PASS: one squashed local commit, the ticket moves to `plans/ready-to-review/`, and the app is running at http://localhost:8180 for you to try.

Older tickets without frontmatter are fine. Picking one at G2 counts as your approval that it is ready.

---

### Use case 4 — You review it and it's good

Open http://localhost:8180, click through the feature and read the diff on `loop/PF-148`. Then:

```
/loop-accept PF-148 pass
```

You see the commits and files changed, with **sensitive paths first** (for example `money: Application/Services/JourneyScoringService.cs`). Confirm the local merge. The loop then:

- merges `loop/PF-148` into `main` locally and verifies the merge;
- stops the slot's processes and removes the worktree and branch;
- moves the ticket to `plans/done/` and refreshes the board block;
- lists docs that mention PF-148 and *proposes* `gh` commands for the GitHub issue (it runs them only if you say "yes, run these").

Pushing is yours: `/commit push`.

---

### Use case 5 — You review it and it's not right

```
/loop-accept PF-148 fail
```

Claude asks for your feedback in your own words, for example: *"Totals are in USD for Wise rows, they must be IDR."* The ticket goes back to `plans/backlog/` with:

- `review: not-passed` (the board shows **PO-Review NOT PASSED**);
- `rework` counter + 1;
- your feedback appended with a timestamp;
- the worktree and branch **kept**, so the next `/loop-run PF-148` continues from them.

After 2 failed reviews (`policy.maxRework`) the next G2 says **"re-plan recommended"**. Fix the plan (or the epic) rather than running it a third time.

---

### Use case 6 — A run needs more time or hits your quota

- **Segment limit (4 segments):** the run stops with `needs-decision`. You choose *Continue (+1)*, *Continue (+2)* or *Stop and send to backlog*.
- **Quota guard:** the run pauses at its last checkpoint with `paused-quota`. Nothing is lost. Choose *Override* or wait for the reset time in the push message, then `/loop-run PF-148` again.
- **Stuck:** two segments in a row without finishing a step stop the run. The standup lists it under stuck runs.
- **Loop-Failed:** tests or CI failed twice with the same output. The ticket goes back to backlog flagged `Loop-Failed` with the reason, and the worktree is kept for you to look at.

---

### Use case 7 — A ticket that changes the database schema

Example: PF-153 adds a `subscriptions` table under `supabase/migrations/`.

> ⚠ Do this only after the snapshot round trip in [section 2](#2-before-your-first-run) is confirmed.

- At G2 the ticket is tagged **schema** and you're warned that it migrates your shared local database, so the main app on 8080 may break until G3.
- Before executing, the loop snapshots the `public` and `supabase_migrations` schemas to `.loop/runs/PF-153/db-before.dump` and reads the dump back to check it.
- **Pass:** nothing to undo.
- **Fail or cancel:** `/loop-accept` offers to restore the database from the snapshot. It restores only on your explicit yes, in one transaction. Auth users are not touched.
- The loop never runs `supabase db push`. Applying to anything other than your local stack stays manual.

---

### Use case 8 — Turn e2e on for a ticket

E2E is off because `apps/frontend/playwright.config.ts` hard-codes `localhost:8080`, which would test your main stack instead of the slot. When you ask for e2e:

1. Make the config read the slot URL (the default stays 8080 for you):

   ```ts
   const baseURL = process.env.LOOP_BASE_URL ?? 'http://localhost:8080';
   // use: { baseURL, … }   webServer: { url: baseURL, … }
   ```

2. In `.claude/loop.json` set `commands.e2e.when` to `"ui-or-api"`, and optionally `policy.e2eRequired` to `true`.
3. Note that login is required since PF-S08, so specs that don't sign in will fail. The first run will show which ones.

Set `when` back to `"never"` to turn it off again.

---

### Use case 9 — Cancel a ticket

```
cancel PF-151        (or: /loop-accept PF-151 cancel)
```

This stops the slot, tags the branch tip as `loop-archive/PF-151` and moves the ticket to `plans/cancelled/`. The worktree is removed only if you confirm, and a database restore is offered the same way as in use case 7.

---

### Use case 10 — Start or stop a slot by hand

Useful for trying a worktree outside a run, or cleaning up after a crash:

```bash
node scripts/loop-env.mjs up 1 .worktrees/PF-148     # start AI, API, frontend on 8100/7308/8180
node scripts/loop-env.mjs down 1                     # stop only slot 1
node scripts/loop-env.mjs snapshot C:/tmp/pf.dump    # dump public + migration ledger (Docker must be up)
node scripts/loop-env.mjs restore  C:/tmp/pf.dump    # destructive: replaces those schemas
```

`up 0` and `down 0` are refused on purpose. Slot 0 is your stack.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| G2 always says "usage unknown" | No statusline, or its snapshot is older than 6 h | Add the statusline (section 2); open any Claude Code session to refresh it |
| `start` refused: slot held | The previous ticket is still in `ready-to-review/` | Finish G3 for it first (`/loop-accept … pass` or `fail`) |
| `env.up failed` / `api did not answer` | Port in use, or first `dotnet` build is slow | Read `.loop/slots/1/api.log`; free ports 8180/7308/8100; retry |
| Frontend in the slot shows an old dependency error | The ticket changed `package.json` but the worktree borrowed main's `node_modules` | Delete `.worktrees/PF-<n>/apps/frontend/node_modules`; the next `up` runs `npm ci` |
| Snapshot fails | Docker or Supabase isn't running, or the container name differs | `npm start`, or set `LOOP_DB_CONTAINER` |
| Board block looks wrong | Another writer touched it | `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write` |
| Many G3 failures | Plans, acceptance criteria or the verifier are too loose | The standup shows the first-pass rate; below 50%, fix the plan template and ACs before running more |

## 6. Command cheat sheet

| Command | Gate | What it does |
|---|---|---|
| `/loop-standup` | all | Daily triage; `idle` when nothing needs you |
| `/loop-grill E-001` | G1 | Clarify an epic, then plan it into tickets |
| `/loop-run [PF-n]` | G2 | Pick, budget and run one ticket end to end |
| `/loop-accept PF-n pass` | G3 | Merge locally, clean up, move to done |
| `/loop-accept PF-n fail` | G3 | Record feedback, back to backlog for rework |
| `cancel PF-n` | — | Archive branch, move to cancelled |
| `/setup-loop audit` | — | Re-check readiness (A1–A23) |
