# PF-154 — Big Purchases on a shared Goal model

> **GitHub Issue:** not created yet. Create `[PF-154] Big Purchases on a shared Goal model` before starting.
> **Status:** To Do
> **Started:** 2026-11-09 (planned)
> **Planned from branch:** main
> **Sensitive:** schema and RLS (three new owner-scoped tables), money math (FIN-01/02), a new money-as-string API contract, advice-adjacent copy (FIN-04/05)
> **Board objective:** Plan big purchases like land, a car, study or a wedding: see what to set aside each month, and whether your safety net is ready first.

## Objective

Big Purchases is the first Growth-tier (L3) module for large lifestyle goals: house or land, a vehicle, a degree, a wedding. It replaces the owner's spreadsheet Goals sheet: priority, category, target, date, months left, the monthly amount needed, the amount already set aside, and % complete. It is built on a generic, tier-tagged Goal model, so Emergency Fund (L2), FIRE (L4) and the top-level Goals page can reuse the same tables later without a redesign.

The pyramid's job here is sequencing. A big purchase made before the Defense tier holds is the "good intentions, wrong order" mistake the product exists to prevent. So every Big Purchase carries a foundation check: green only when it has actually been checked and passed (FIN-04).

## Acceptance Criteria

- [ ] `/big-purchases` is live in the sidebar (the SOON badge is gone) and lists the owner's big-purchase goals as cards, ordered by priority and then target date, 50 per page with "Load more".
- [ ] The owner can create, edit, pause, mark achieved, cancel and delete a goal (category: house/land, vehicle, education, wedding, other; priority P1–P4; target amount; optional target date; notes).
- [ ] The owner can record a contribution or a withdrawal (dated, with an optional "held in" account and a note), and delete one. Allocated = the sum of the goal's contributions. A withdrawal that would take allocated below zero is rejected with a 400.
- [ ] Each card shows: name, category, an `L3 · Growth` tier badge, a priority chip, a progress bar anchored as "Rp X of Rp Y", and the next step: "Rp M a month until {Mon YYYY}", or "Rp R needed by {date}" (less than a month left), or "Target date passed, Rp R still to go", or "Set a target date", or "Fully funded (Rp S over)".
- [ ] The derived numbers follow `formulas.md` §9 exactly, with unit tests for: no date, past date, less than one month left, the monthly figure rounded up to whole rupiah, over-funded (> 100%, surplus shown), zero allocated, the optional price-growth assumption, and pace with less than 3 months of history.
- [ ] Foundation check, three states, per goal:
  - **Not evaluated** (neutral grey): an L1 or L2 indicator the check needs is `no_data`, or a savings balance is stale (G6). The copy names what to record.
  - **Not recommended yet** (amber): spending, cover after earmarks, DTI, or post-purchase DTI fails its bar. The copy names which check and the gap.
  - **Foundation checked** (green): every check was evaluated and passed.
  It is never green while any input is unevaluated (FIN-04).
- [ ] Money set aside for goals in a savings account is subtracted from emergency-fund cover in the check, and the card says so ("Rp X set aside for goals is not counted as your cushion").
- [ ] Property and vehicle goals take an optional cost breakdown (purchase price, down payment, loan principal, taxes, fees, other), entered as amounts. The target is the cash needed (everything except the loan principal), and the full cost is shown alongside it. No tax or fee rate is stored, computed or shown anywhere.
- [ ] A goal with a planned monthly instalment shows a post-purchase DTI estimate against the 29.6% Defense bar, labelled "estimate at your current take-home income, not a loan eligibility check".
- [ ] All money crosses the API as JSON strings (FIN-01). A serialization test proves it, and the frontend never does arithmetic on money.
- [ ] RLS: every new table is owner-only, and a contribution or cost item cannot attach to another owner's goal (a composite FK test in the migration check).
- [ ] Goal writes do not trigger a Journey recalculation, and no quest is added (decision recorded in Notes).
- [ ] The compliance disclosure "A personal planning tool, not financial advice. Numbers come from what you entered." is always visible on `/big-purchases`.
- [ ] `ci-check` passes (dotnet build/test, lint, tsc, Vitest including the new `test:goals`, vite build, gitleaks). `e2e/big-purchases.spec.ts` passes against the running stack.

## Approach

**Shared `goals` table plus a contribution ledger, with derived numbers computed on read and an advisory foundation check.** There is one `goals` table with a `kind` discriminator (`big_purchase` now; `emergency_fund`, `fire` and `custom` later) and a `tier` column pinned to its kind by CHECK constraints. Two child tables hang off it: `goal_contributions`, a manual ledger where allocated is always a sum and never stored, and `goal_cost_items`, the property and vehicle breakdown. The progress math lives in a pure `Application/Goals/GoalMath`. The foundation check (`Application/Goals/FoundationGate`) runs on a read-only scoring snapshot from `JourneyScoringService`, so it uses the exact same indicator code and bars as the pyramid rather than copies of the thresholds.

What it deliberately does not do: no recurring-goal math (`recurrence` is stored but `big_purchase` is one-off only), no non-IDR targets, no KPR product or rate comparison, no tax or fee rates, no Journey recalculation, and no quests. Order: docs and schema first (Phase 1), then the API (Phase 2), then the UI (Phase 3).

### Approaches considered

| | A — Spreadsheet port | **B — Shared goals + ledger (winner)** | C — Linked balances |
|---|---|---|---|
| Core idea | `big_purchases` table with an editable `allocated_amount` column | Generic `goals` + `goal_contributions` + `goal_cost_items`; allocated = sum of the ledger | Generic `goals`; allocated = the linked accounts' latest valuations, or tagged transactions; recalculated on events |
| User value | 3 — matches the sheet, but has no history or gate nuance | 5 | 4 — automatic, but the numbers surprise users |
| Scope fit | 5 | 4 | 2 — touches the import pipeline and valuations |
| Integration fit | 3 — the Goals page would need a second table | 4 | 3 — new event coupling |
| Testability | 4 | 5 — pure math plus a pure gate | 3 |
| Governance | 3 — fails the generic-model requirement | 5 | 4 |
| **Total** | **18/25** | **23/25** | **16/25** |

**Why not C:** a linked savings account is already counted as emergency-fund cover, so linking makes the same rupiah count twice. One account funding two goals needs split rules. Tagged transactions measure money paid in, not what the money is worth now, and they need a goal column on `transactions` plus pipeline changes. **Why not A:** the Goals page and Emergency Fund would need a second table later, and an editable allocated number has no audit trail. **Carried from C:** the optional `held_in_account_id` on contributions. It keeps the money's location without making it the source of truth, and the gate uses it to subtract earmarks from cover.

### How allocation is recorded (the brief's three options)

| Method | Honest? | Effort for the user | Double counting with L2 | Verdict |
|---|---|---|---|---|
| **Manual contribution ledger** | Yes: explicit, dated, auditable | One entry per transfer | Handled: `held_in_account_id` lets the gate subtract the earmark | **Chosen** |
| Linked account/asset balance | Partly: the value is real, but the earmark is implied | None | Yes: the same savings count as cushion and as goal | Rejected for v1. It becomes the funding source for `emergency_fund` goals later, behind the same read-time sum |
| Tagged transactions | Measures contributions, not value | Tag each transfer | No, but transfers between own accounts are hard to tell from spending | Rejected: needs pipeline and transaction changes |

### Review verdicts folded into this plan

- **/consult: PROCEED with one shared table.** The entity goes in `Domain/Entities` (the PostgREST model pattern, ARCH-03). The math and the gate go in `Application/Goals/` (mirroring `Application/Quests/`), and interfaces in `Application/Interfaces/` (ARCH-02). Landmine 1: never store `allocated`. Emergency Fund goals will be funded by valuations, so computing it on read keeps that a one-function change. Landmine 2: foreign keys bypass RLS, so child tables use a composite FK `(goal_id, user_id) → goals(id, user_id)`.
- **/cio: BUILD WITH GUARDRAILS.**
  - G1: no "buy now vs keep investing" comparison. The product cannot price the user's enjoyment of the purchase against the return it gives up, so that framing becomes a foundation check plus the true cash cost.
  - G2: the gate checks L1 and L2, since L3 sits on both. It requires both L2 indicators to be evaluated and the savings balances to be fresh (G6), which is stricter than level graduation. It is advisory and never blocks saving toward the goal.
  - G3: subtract earmarked money from cover.
  - G4: the monthly figure is straight-line, labelled "today's prices, no returns assumed". Price growth is an optional user assumption with no built-in default (FIN-02). For goals 5 or more years out without one, show a nudge (formulas.md §8).
  - G5: the pace projection only with at least 3 months of history, shown as a month and not a date, with its assumption on screen.
  - G6: show a post-purchase DTI preview from the planned instalment.
  - G7: no quest and no event (see Notes).
- **/compliance: SHIP WITH CHANGES (at ship time).**
  - Gradient level 2–3: personalized measurement and general guidance, with no instrument named. That is tool territory, not advice.
  - Changes:
    - (1) anchor "Not recommended yet" to the app's rule ("by the Defense rule");
    - (2) green copy must say it checks the foundation only, not whether the purchase is right;
    - (3) the DTI preview says it is not a loan eligibility check;
    - (4) the cost helper names taxes without rates, and asks rather than asserts whether the OTR price already includes BBNKB and PKB;
    - (5) the disclosure goes on the page itself;
    - (6) tests, seeds and docs use synthetic goals. The owner's real spreadsheet goals and amounts must not enter this public repo.
  - Final copy is in STEP 13.

## Affected Files

| File | Change |
|------|--------|
| `docs/references/finance-domain/formulas.md` | Edit: add §9 Goal funding (progress, months left, monthly needed, growth factor, pace, foundation check) |
| `docs/references/finance-domain/tax-id.md` | Edit: add a "Purchase costs: property and vehicles" section, every row ⚠ not verified, no rates |
| `supabase/migrations/20261109000000_pf_154_goals.sql` | Create: `goals`, `goal_contributions`, `goal_cost_items`, RLS, grants, indexes |
| `apps/api/src/PersonalFinance.Domain/Entities/Goal.cs` | Create: PostgREST model |
| `apps/api/src/PersonalFinance.Domain/Entities/GoalContribution.cs` | Create |
| `apps/api/src/PersonalFinance.Domain/Entities/GoalCostItem.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Goals/GoalMath.cs` | Create: pure progress and pace math |
| `apps/api/src/PersonalFinance.Application/Goals/GoalKinds.cs` | Create: kind, category, cost-item and status constants |
| `apps/api/src/PersonalFinance.Application/Goals/FoundationGate.cs` | Create: pure foundation check and per-goal gate |
| `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyScoringService.cs` | Edit: add read-only `LoadSnapshotAsync` |
| `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs` | Edit: implement `LoadSnapshotAsync`; make `MonthsBack` internal |
| `apps/api/src/PersonalFinance.Application/Interfaces/IGoalService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Services/GoalService.cs` | Create: Supabase-backed persistence |
| `apps/api/src/PersonalFinance.Application/Interfaces/IFoundationCheckService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Services/FoundationCheckService.cs` | Create: snapshot plus earmarks into `FoundationGate` |
| `apps/api/src/PersonalFinance.Application/Dtos/GoalDtos.cs` | Create: `GoalDto`, `GoalPageDto`, `FoundationCheckDto`, `GoalContributionDto`, `GoalCostItemDto` (money as strings) |
| `apps/api/src/PersonalFinance.Application/Commands/Goals/*.cs` | Create: queries and commands with handlers (list below) |
| `apps/api/src/PersonalFinance.Application/Validation/*Goal*Validator.cs` | Create: validators for create, update, contributions, cost items |
| `apps/api/src/PersonalFinance.Api/Controllers/GoalsController.cs` | Create: `/api/goals` |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit: register `IGoalService`, `IFoundationCheckService` |
| `apps/api/tests/PersonalFinance.Tests/Goals/*.cs` | Create: math, gate, validators, handlers, serialization, controller |
| `apps/frontend/src/types/Goal.ts` | Create |
| `apps/frontend/src/api/goalsApi.ts` | Create |
| `apps/frontend/src/lib/goals/money.ts` + `money.test.ts` | Create: string-only IDR format and parse |
| `apps/frontend/src/lib/goals/copy.ts` + `copy.test.ts` | Create: compliance-reviewed copy from states and reasons |
| `apps/frontend/src/components/goals/*.tsx` | Create: `FoundationCheckCard`, `GoalCard`, `GoalFormDialog`, `CostItemsEditor`, `ContributionDialog`, `GoalsDisclosure` |
| `apps/frontend/src/pages/big-purchases/BigPurchasesPage.tsx` | Create |
| `apps/frontend/src/App.tsx` | Edit: route `/big-purchases` |
| `apps/frontend/src/components/Sidebar.tsx` | Edit: `big-purchases` `live: true` (the SOON entry is an uncommitted change on main today) |
| `apps/frontend/package.json`, `.github/workflows/ci.yml` | Edit: `test:goals` script and CI line |
| `apps/frontend/e2e/big-purchases.spec.ts` | Create |
| `docs/architecture/API-endpoints.md`, `README.md` (L3 roadmap row, keep emojis) | Edit |

---

## TODO

## Phase 1 — Definitions, schema, pure math

### [ ] STEP 1 — Add §9 Goal funding to formulas.md

Append to `docs/references/finance-domain/formulas.md` (and add it to Contents):

```markdown
## 9. Goal funding

Used by Goals (PF-154 Big Purchases first). All money is `decimal`; dates are Asia/Jakarta calendar dates.

| Metric | Formula | Notes |
|--------|---------|-------|
| Allocated | `Σ goal_contributions.amount` | Withdrawals are negative rows. Never stored; always summed on read. |
| Effective target | `target × growth_factor(g, months_left)` when the user set a price-growth rate `g` and `months_left ≥ 1`, else `target` | Rounded half away from zero to Rp 0.01. |
| Growth factor | `(1+g)^Y × (1 + g × r/12)`, `Y = ⌊months/12⌋`, `r = months mod 12` | Annual compounding on whole years, linear for the part-year. Decimal-exact; no `Math.Pow`. `g` is the user's assumption; the product has no default (FIN-02). |
| Remaining | `max(effective_target − allocated, 0)` | |
| Surplus | `max(allocated − effective_target, 0)` | Over-funded goals show it; % can exceed 100. |
| % complete | `allocated / effective_target × 100`, truncated to 0.1 | Truncated so 99.96% never displays as 100% while money is still owed. |
| Months left | `(ty − cy)×12 + (tm − cm) − (td < cd ? 1 : 0)` | Whole months from today to the target date. Negative = target passed. |
| Monthly needed | `⌈remaining / months_left⌉` to whole rupiah, only when `months_left ≥ 1` and `remaining > 0` | Straight-line: today's prices (unless `g` set), **no investment returns assumed**. Rounded up so following it never falls short. |
| Timeline | `funded` (remaining 0) · `no_date` · `overdue` (target < today) · `due_soon` (months_left < 1) · `scheduled` | `due_soon` and `overdue` show the remaining as a lump sum instead of a monthly figure. |
| Pace | `Σ contributions in the 3 complete calendar months before this month / 3` | Only when the first contribution predates that window (≥ 3 months of history). Hidden when ≤ 0. |
| Reach month | `this month + ⌈remaining / pace⌉` | Shown as "around Mon YYYY". Above 600 months (a display cap, not a finance threshold), the text reads "more than 50 years". |

### Foundation check (Big Purchases gate)

A Big Purchase sits on L3, so it is checked against L1 and L2 using the live scoring code and its bars
(`JourneyScoringService.Score*` ≥ 70, the rubric's Cleared bar). The check is advisory and never blocks saving.

| Check | Input | Passes when |
|-------|-------|-------------|
| Spending | `spend_lt_income` | evaluated and score ≥ 70 (consumption ≤ 89% of income) |
| Cover after earmarks | `(liquid_total − earmarked_in_savings) / avg_monthly_consumption` | `ScoreLiquidSavings(months) ≥ 70` (≥ 2.1 months); every savings valuation fresh (G6) |
| Debt | `manageable_dti` | evaluated and score ≥ 70 (≤ 29.6%) |
| Post-purchase debt (per goal, if an instalment is planned) | `(Σ liabilities.monthly_payment + planned_instalment) / avg_monthly_income` | `ScoreDti(ratio) ≥ 70` |

`earmarked_in_savings` = Σ contributions of active goals whose `held_in_account_id` is a savings account, capped at `liquid_total`.
State: any evaluated check fails → `not_recommended_yet`; else any input missing or stale → `not_evaluated`; else `clear`.
This is stricter than level graduation (which ignores `no_data` indicators): a big purchase with unknown debt is exactly the case not to clear (CIO, PF-154).
```

> **Why:** FIN-02 requires every constant and formula in code to cite a line here. Writing it first means the code in STEPS 4–5 implements a reviewed definition instead of inventing one.
> **Check:** the §9 heading renders in Contents; every symbol in `GoalMath` (STEP 4) maps to a row.

---

### [ ] STEP 2 — Mark purchase taxes and fees as unverified in tax-id.md

Add this section after the rate table in `docs/references/finance-domain/tax-id.md`:

```markdown
## Purchase costs: property and vehicles (PF-154)

The product **never stores or computes these rates**. Big Purchases asks the user to enter amounts from their quote or invoice.
These rows exist so that any future rate hint goes through FIN-06 first. Most are set regionally, so a single national number would be wrong anyway.

| Cost | Who usually pays | Set by | Status |
|---|---|---|---|
| BPHTB (land and building acquisition duty) | Buyer | Regency or city regulation under UU 1/2022 (HKPD) | ⚠ not verified: rate, deduction (NPOPTKP) and region vary |
| PPh final on transfer of land/buildings | Seller (negotiable) | PP 34/2016 as amended | ⚠ not verified |
| PPN on new property from a developer | Buyer | UU PPN; incentive schemes change by year | ⚠ not verified: check whether an incentive applies on the purchase date |
| Notary / PPAT fees | Buyer and seller by agreement | Professional fee | ⚠ not a tax; varies |
| BBNKB (vehicle title transfer duty) | Buyer | Provincial regulation under UU 1/2022, plus opsen from 2025 | ⚠ not verified |
| PKB (annual vehicle tax) | Owner | Provincial regulation, plus opsen | ⚠ not verified |
| PPnBM (luxury goods sales tax, vehicles) | Inside the OTR price | PP 74/2021 as amended | ⚠ not verified |

**OTR price:** an on-the-road quote often already includes BBNKB and the first year's PKB. The UI asks the user to check rather than assuming either way.
```

> **Why:** FIN-06 says to check the Verified dates first. There are no property or vehicle rows, so nothing can be quoted. Recording them as ⚠ stops a later contributor from hard-coding "5% BPHTB" from memory.
> **Check:** every new row is ⚠, and no percentage appears in the section.

---

### [ ] STEP 3 — Migration: goals, contributions, cost items

Create `supabase/migrations/20261109000000_pf_154_goals.sql` (use the `db-migrate` skill to apply and verify):

```sql
-- PF-154: shared, tier-tagged goals. Big Purchases (kind big_purchase, tier L3) is the first user.
-- Owner-only, same pattern as PF-152. Allocated is never stored: it is the sum of goal_contributions.
BEGIN;

CREATE TABLE public.goals (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id),
  kind                       text NOT NULL CHECK (kind IN ('big_purchase', 'emergency_fund', 'fire', 'custom')),
  tier                       text NOT NULL CHECK (tier IN ('L1', 'L2', 'L3', 'L4', 'L5')),
  category                   text NOT NULL DEFAULT 'other',
  name                       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  notes                      text CHECK (notes IS NULL OR length(notes) <= 2000),
  priority                   smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
  recurrence                 text NOT NULL DEFAULT 'one_off' CHECK (recurrence IN ('one_off', 'monthly', 'annually')),
  target_amount              numeric(20,2) NOT NULL CHECK (target_amount > 0),
  currency                   char(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  target_date                date,
  price_growth_rate          numeric(7,6) CHECK (price_growth_rate IS NULL OR price_growth_rate BETWEEN 0 AND 1),
  planned_monthly_instalment numeric(20,2) CHECK (planned_monthly_instalment IS NULL OR planned_monthly_instalment >= 0),
  status                     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'achieved', 'cancelled')),
  achieved_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),                                         -- target of the composite FKs below
  CONSTRAINT goals_kind_tier CHECK (
       (kind <> 'big_purchase'   OR tier = 'L3')
   AND (kind <> 'emergency_fund' OR tier = 'L2')
   AND (kind <> 'fire'           OR tier = 'L4')),
  CONSTRAINT goals_big_purchase_shape CHECK (
    kind <> 'big_purchase'
    OR (recurrence = 'one_off' AND category IN ('house_land', 'vehicle', 'education', 'wedding', 'other'))),
  CONSTRAINT goals_achieved_stamp CHECK ((status = 'achieved') = (achieved_at IS NOT NULL))
);

CREATE INDEX goals_owner_list ON public.goals (user_id, kind, status, priority, target_date);

CREATE TABLE public.goal_contributions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id),
  goal_id            uuid NOT NULL,
  amount             numeric(20,2) NOT NULL CHECK (amount <> 0),          -- negative = withdrawal
  contributed_on     date NOT NULL,
  held_in_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  note               text CHECK (note IS NULL OR length(note) <= 280),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- FKs bypass RLS; the composite key stops a row attaching to another owner's goal.
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE
);

CREATE INDEX goal_contributions_goal ON public.goal_contributions (goal_id, contributed_on DESC);
CREATE INDEX goal_contributions_held_in ON public.goal_contributions (user_id, held_in_account_id)
  WHERE held_in_account_id IS NOT NULL;

CREATE TABLE public.goal_cost_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  goal_id    uuid NOT NULL,
  item_type  text NOT NULL CHECK (item_type IN ('purchase_price', 'down_payment', 'loan_principal', 'tax', 'fee', 'other')),
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  amount     numeric(20,2) NOT NULL CHECK (amount >= 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE
);

CREATE INDEX goal_cost_items_goal ON public.goal_cost_items (goal_id, sort_order);

ALTER TABLE public.goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_cost_items    ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_owner ON public.goals FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY goal_contributions_owner ON public.goal_contributions FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY goal_cost_items_owner ON public.goal_cost_items FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals, public.goal_contributions, public.goal_cost_items TO authenticated;

COMMIT;
```

```bash
supabase db push   # local stack; then verify with psql as below
```

> **Why:** schema changes live only in `supabase/migrations/`. The kind-to-tier CHECK stops `tier` and `kind` drifting apart. Contributions can be edited by the owner (corrections are normal), unlike the append-only `quest_completions`. `ON DELETE SET NULL` on the held-in account means deleting an account never deletes goal history.
> **Check:** in psql, as two different `request.jwt.claims` subs: owner B cannot `SELECT` owner A's goals; inserting a contribution with A's `goal_id` and B's `user_id` fails with a foreign-key violation; inserting `kind='big_purchase', tier='L2'` fails `goals_kind_tier`.

---

### [ ] STEP 4 — Domain entities and kind constants

Create `Domain/Entities/Goal.cs`, `GoalContribution.cs` and `GoalCostItem.cs`, following `Liability.cs`:
- `BaseModel`, `[Table("goals")]`, `[PrimaryKey("id", shouldInsert: false)]`, and one `[Column("snake_case")]` per column above.
- Money is `decimal`/`decimal?`, dates are `DateTime` (UTC kind) as in `Liability.StartDate`, and `created_at` uses `ignoreOnInsert: true` as in `QuestCompletion`.

Create `Application/Goals/GoalKinds.cs`:

```csharp
namespace PersonalFinance.Application.Goals;

/// <summary>Allowed values; mirror the CHECK constraints in 20261109000000_pf_154_goals.sql.</summary>
public static class GoalKinds
{
    public const string BigPurchase = "big_purchase";
    public static readonly IReadOnlyDictionary<string, string> TierFor = new Dictionary<string, string>
    {
        [BigPurchase] = "L3", ["emergency_fund"] = "L2", ["fire"] = "L4",
    };
    public static readonly IReadOnlySet<string> BigPurchaseCategories =
        new HashSet<string> { "house_land", "vehicle", "education", "wedding", "other" };
    public static readonly IReadOnlySet<string> Statuses =
        new HashSet<string> { "active", "paused", "achieved", "cancelled" };
    public static readonly IReadOnlySet<string> CostItemTypes =
        new HashSet<string> { "purchase_price", "down_payment", "loan_principal", "tax", "fee", "other" };
    /// <summary>The only cost line that is borrowed rather than saved for. Cash needed = every other line.</summary>
    public const string FinancedItemType = "loan_principal";
}
```

> **Why:** entities are anemic PostgREST models (ARCH-03, backend.md checklist item 1). Behaviour lives in Application, so Domain keeps zero logic.
> **Check:** `dotnet build` from `apps/api/`.

---

### [ ] STEP 5 — GoalMath (pure) with tests

Create `Application/Goals/GoalMath.cs`:

```csharp
namespace PersonalFinance.Application.Goals;

public sealed record GoalProgress(
    decimal Allocated, decimal EffectiveTarget, decimal Remaining, decimal Surplus, decimal PercentComplete,
    int? MonthsLeft, decimal? MonthlyNeeded, string Timeline);

public sealed record GoalPace(decimal? PerMonth, DateOnly? ReachMonth, bool BeyondCap);

/// <summary>Source: docs/references/finance-domain/formulas.md §9 Goal funding. Every line below maps to a row there.</summary>
public static class GoalMath
{
    // Source: formulas.md §9 "Reach month": display cap, not a finance threshold.
    internal const int PaceCapMonths = 600;

    public static int MonthsLeft(DateOnly today, DateOnly target)
    {
        var months = (target.Year - today.Year) * 12 + (target.Month - today.Month);
        return target.Day < today.Day ? months - 1 : months;
    }

    public static decimal GrowthFactor(decimal annualRate, int months)
    {
        if (months <= 0 || annualRate == 0m) return 1m;
        var factor = 1m;
        for (var y = 0; y < months / 12; y++) factor *= 1m + annualRate;
        return factor * (1m + annualRate * (months % 12) / 12m);
    }

    public static GoalProgress Compute(
        decimal target, decimal allocated, DateOnly? targetDate, decimal? growthRate, DateOnly today)
    {
        int? monthsLeft = targetDate is { } d ? MonthsLeft(today, d) : null;
        var effective = growthRate is { } g && monthsLeft is >= 1
            ? Math.Round(target * GrowthFactor(g, monthsLeft.Value), 2, MidpointRounding.AwayFromZero)
            : target;
        var remaining = Math.Max(effective - allocated, 0m);
        var surplus = Math.Max(allocated - effective, 0m);
        var percent = Math.Round(allocated / effective * 100m, 1, MidpointRounding.ToZero);

        string timeline;
        decimal? monthly = null;
        if (remaining == 0m) timeline = "funded";
        else if (targetDate is null) timeline = "no_date";
        else if (targetDate.Value < today) timeline = "overdue";
        else if (monthsLeft < 1) timeline = "due_soon";
        else { timeline = "scheduled"; monthly = Math.Ceiling(remaining / monthsLeft!.Value); }

        return new GoalProgress(allocated, effective, remaining, surplus, percent, monthsLeft, monthly, timeline);
    }

    public static GoalPace Pace(IReadOnlyList<(DateOnly On, decimal Amount)> contributions, decimal remaining, DateOnly today)
    {
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        var windowStart = thisMonth.AddMonths(-3);
        if (contributions.Count == 0 || contributions.Min(c => c.On) >= windowStart) return new(null, null, false);

        var perMonth = Math.Round(
            contributions.Where(c => c.On >= windowStart && c.On < thisMonth).Sum(c => c.Amount) / 3m,
            2, MidpointRounding.AwayFromZero);
        if (perMonth <= 0m) return new(null, null, false);
        if (remaining <= 0m) return new(perMonth, null, false);

        var months = Math.Ceiling(remaining / perMonth);
        return months > PaceCapMonths
            ? new(perMonth, null, true)
            : new(perMonth, thisMonth.AddMonths((int)months), false);
    }
}
```

Create `tests/PersonalFinance.Tests/Goals/GoalMathTests.cs` with at least these cases (use synthetic amounts only):

| Test | Input | Expected |
|---|---|---|
| `Compute_NoTargetDate_NoDateTimelineNoMonthly` | target 500,000,000, allocated 0, date null | `no_date`, `MonthlyNeeded` null |
| `Compute_TwentyFourMonthsLeft_StraightLine` | target 300,000,000, today 2026-11-09, date 2028-11-09 | months 24, monthly 12,500,000 |
| `Compute_UnevenDivision_RoundsUpToWholeRupiah` | remaining 100, months 3 | 34 |
| `Compute_TargetDayBeforeToday_CountsOneLessMonth` | today 11-09, date 2026-12-05 | months 0, `due_soon` |
| `Compute_TargetInPast_Overdue` | date 2026-10-01 | `overdue`, monthly null, remaining > 0 |
| `Compute_OverFunded_SurplusAndPercentAbove100` | target 100, allocated 120 | percent 120.0, surplus 20, `funded` |
| `Compute_NearlyFunded_PercentTruncatesBelow100` | target 10,000, allocated 9,999.6 | percent 99.9 |
| `GrowthFactor_TwoYearsSixMonths_AnnualPlusLinear` | g 0.05, 30 months | 1.05 × 1.05 × 1.025 = 1.13006250 |
| `Compute_GrowthWithPastDate_UsesTodayTarget` | g 0.05, overdue | effective = target |
| `Pace_LessThanThreeMonthsHistory_Null` | first contribution last month | `PerMonth` null |
| `Pace_NetWithdrawals_Null` | window sum negative | null |
| `Pace_Normal_ReachMonth` | one contribution in July, then 8,000,000 in each of Aug/Sep/Oct, remaining 40,000,000, today 2026-11-09 | per month 8,000,000, reach 2027-04-01 |
| `Pace_BeyondCap_FlagsBeyondCap` | remaining 1e15, pace 1 | `BeyondCap` true |

> **Why:** pure logic is TEST-03's preferred isolation, and these are the edge cases the brief names (past date, zero months, over-funded). `MidpointRounding.ToZero` on % and `Math.Ceiling` on the monthly figure are deliberate. A test pins each so nobody "simplifies" them.
> **Check:** `dotnet test --filter FullyQualifiedName~GoalMathTests` passes.

---

### [ ] STEP 6 — FoundationGate (pure) and a read-only scoring snapshot

1. In `IJourneyScoringService` add `Task<ScoringSnapshot> LoadSnapshotAsync(Guid userId, CancellationToken ct = default);`. Implement it in `JourneyScoringService` as: `LoadInputsAsync`, then the same indicator computation `RecalculateWithSnapshotAsync` performs, **without** persisting state, snapshots or achievements. Make `MonthsBack` `internal static`.
2. Create `Application/Goals/FoundationGate.cs`:

```csharp
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;

namespace PersonalFinance.Application.Goals;

public sealed record FoundationInputs(
    IndicatorScoreDto? Spend, IndicatorScoreDto? Cover, IndicatorScoreDto? Dti,
    bool SavingsFresh, decimal LiquidTotal, decimal AvgMonthlyConsumption, decimal EarmarkedInSavings,
    decimal AvgMonthlyIncome, decimal MonthlyDebtService);

public sealed record FoundationCheck(
    string State, decimal? CoverMonthsAfterEarmarks, decimal EarmarkedInSavings, decimal? CurrentDti,
    IReadOnlyList<string> Failing, IReadOnlyList<string> Missing);

public sealed record GoalGate(string State, decimal? PostPurchaseDti, IReadOnlyList<string> Failing, IReadOnlyList<string> Missing);

/// <summary>Source: formulas.md §9 "Foundation check". Bars are the live scoring functions at the rubric's
/// Cleared bar (70), never copied thresholds. Green only when every input was evaluated (FIN-04).</summary>
public static class FoundationGate
{
    // Source: scoring-rubric.md "Cleared = every live indicator scores at least 70".
    private const decimal ClearedBar = 70m;

    public static FoundationCheck Evaluate(FoundationInputs i)
    {
        var failing = new List<string>();
        var missing = new List<string>();

        if (i.Spend is null || i.Spend.Status == "no_data") missing.Add("spend_lt_income");
        else if (i.Spend.Score < ClearedBar) failing.Add("spend_lt_income");

        decimal? cover = null;
        if (i.Cover is null || i.Cover.Status == "no_data" || i.AvgMonthlyConsumption <= 0m) missing.Add("liquid_savings_ratio");
        else if (!i.SavingsFresh) missing.Add("savings_stale");
        else
        {
            var earmarked = Math.Min(i.EarmarkedInSavings, i.LiquidTotal);
            cover = Math.Round((i.LiquidTotal - earmarked) / i.AvgMonthlyConsumption, 2, MidpointRounding.ToZero);
            if (JourneyScoringService.ScoreLiquidSavings(cover.Value) < ClearedBar) failing.Add("cover_after_earmarks");
        }

        decimal? dti = null;
        if (i.Dti is null || i.Dti.Status == "no_data") missing.Add("manageable_dti");
        else { dti = i.Dti.RawValue; if (i.Dti.Score < ClearedBar) failing.Add("manageable_dti"); }

        return new FoundationCheck(StateFor(failing, missing), cover, i.EarmarkedInSavings, dti, failing, missing);
    }

    public static GoalGate ForGoal(FoundationCheck f, FoundationInputs i, decimal? plannedInstalment)
    {
        var failing = f.Failing.ToList();
        var missing = f.Missing.ToList();
        decimal? post = null;
        if (plannedInstalment is { } inst && inst > 0m)
        {
            if (f.CurrentDti is null || i.AvgMonthlyIncome <= 0m) missing.Add("post_purchase_dti");
            else
            {
                post = Math.Round((i.MonthlyDebtService + inst) / i.AvgMonthlyIncome, 4, MidpointRounding.AwayFromZero);
                if (JourneyScoringService.ScoreDti(post.Value) < ClearedBar) failing.Add("post_purchase_dti");
            }
        }
        return new GoalGate(StateFor(failing, missing), post, failing, missing);
    }

    private static string StateFor(List<string> failing, List<string> missing) =>
        failing.Count > 0 ? "not_recommended_yet" : missing.Count > 0 ? "not_evaluated" : "clear";
}
```

3. Create `tests/PersonalFinance.Tests/Goals/FoundationGateTests.cs`. Required cases:
   - every input passes → `clear`;
   - `spend_lt_income` no_data → `not_evaluated`;
   - cover passes but DTI no_data → `not_evaluated` (never `clear`, FIN-04);
   - stale savings → `not_evaluated` with `savings_stale`;
   - cover 2.6 months before earmarks, earmarks reduce it to 1.4 → `not_recommended_yet` with `cover_after_earmarks`;
   - earmarks larger than the liquid total → cover 0, not negative;
   - DTI fails and cover is missing → `not_recommended_yet` (a known failure outranks a missing input);
   - instalment pushes post-purchase DTI from 0.18 to 0.34 → per-goal `not_recommended_yet` with `post_purchase_dti`;
   - instalment set but DTI no_data → per-goal `not_evaluated`;
   - instalment 0 → no post-purchase check.

> **Why:** the gate reuses `ScoreLiquidSavings` and `ScoreDti` (already `internal static`), so a future rubric change moves the gate with it instead of leaving a stale copy (FIN-02). A read-only snapshot gives exact consumption and income without a second scoring implementation, and never writes Journey state from a page view.
> **Check:** `dotnet test --filter FullyQualifiedName~FoundationGateTests` passes. The existing `JourneyScoringService` tests still pass unchanged.

---

## Phase 2 — API

### [ ] STEP 7 — DTOs with money as strings

Create `Application/Dtos/GoalDtos.cs`. Every money and rate property carries
`[property: JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]` (System.Text.Json, no custom converter):

- `GoalDto`: Id, Kind, Tier, Category, Name, Notes, Priority, Recurrence, Status, AchievedAt.
  - Money: TargetAmount, EffectiveTarget, TotalCost (Σ all cost items, or null), Allocated, Remaining, Surplus, PercentComplete, MonthlyNeeded?, PriceGrowthRate?, PlannedMonthlyInstalment?, PacePerMonth?, PostPurchaseDti?.
  - Dates and states: TargetDate (`DateOnly?`), MonthsLeft?, Timeline, PaceReachMonth (`"yyyy-MM"` or null), PaceBeyondCap, GateState, GateFailing, GateMissing, CostItems.
- `GoalPageDto : PagedResult<GoalDto>`, plus `FoundationCheckDto Foundation`.
- `FoundationCheckDto`: State, CoverMonthsAfterEarmarks?, EarmarkedInSavings, CurrentDti?, Failing, Missing.
- `GoalContributionDto`: Id, Amount, ContributedOn, HeldInAccountId?, Note.
- `GoalCostItemDto`: Id, ItemType, Label, Amount, SortOrder.

Add `tests/PersonalFinance.Tests/Goals/GoalDtoSerializationTests.cs`. It serializes a `GoalDto` with `new JsonSerializerOptions(JsonSerializerDefaults.Web)` and asserts `"targetAmount":"300000000.00"` (a string), and that a null `monthlyNeeded` serializes as `null`.

> **Why:** FIN-01 forbids a JS `number` for money that is displayed. The rest of the API still sends numbers (a known gotcha), so this is opt-in per DTO, not a global serializer change that would break every existing page.
> **Check:** the serialization test passes.

---

### [ ] STEP 8 — IGoalService and GoalService (Supabase-backed)

`Application/Interfaces/IGoalService.cs` and `Application/Services/GoalService.cs` (inject `Supabase.Client`, `ILogger<GoalService>`):

- `Task<(IReadOnlyList<Goal> Items, int Total)> ListAsync(string? kind, string? status, int page, int pageSize, CancellationToken ct)`: order by priority asc, then target_date asc nulls last, then created_at. Use `.Range(from, to)` and an exact count, mirroring `TransactionService`'s paging.
- `GetAsync`, `InsertAsync`, `UpdateAsync`, `DeleteAsync` for `Goal`.
- `Task<IReadOnlyList<GoalContribution>> ContributionsForAsync(IReadOnlyList<Guid> goalIds, CancellationToken ct)`: **one** `In` query for the whole page, never one per goal (the PERF-01 spirit).
- `Task<(IReadOnlyList<GoalContribution> Items, int Total)> ContributionPageAsync(Guid goalId, int page, int pageSize, CancellationToken ct)`.
- `InsertContributionAsync`, `DeleteContributionAsync(Guid goalId, Guid id)`.
- `Task<IReadOnlyList<GoalCostItem>> CostItemsForAsync(IReadOnlyList<Guid> goalIds, CancellationToken ct)` and `ReplaceCostItemsAsync(Guid goalId, IReadOnlyList<GoalCostItem> items, CancellationToken ct)` (delete, then insert).
- `Task<decimal> EarmarkedInAccountsAsync(IReadOnlyCollection<Guid> accountIds, CancellationToken ct)`: Σ amount over contributions of goals with status `active` or `paused` whose `held_in_account_id` is in the set.

Supabase calls run under the caller's token, so RLS scopes every read. Owner IDs on insert come from `ICurrentUser` in the handlers, never from the request.

> **Why:** ARCH-05: handlers depend on an Application interface backed by Supabase. Batch loading keeps the list endpoint at four queries, whatever the page size.
> **Check:** `dotnet build`. The handler tests in STEP 10 mock this interface.

---

### [ ] STEP 9 — FoundationCheckService

`Application/Interfaces/IFoundationCheckService.cs` and `Application/Services/FoundationCheckService.cs` (inject `IJourneyScoringService`, `IGoalService`, `ILogger`):

1. `var s = await scoring.LoadSnapshotAsync(userId, ct)`.
2. Pick `spend_lt_income`, `liquid_savings_ratio` and `manageable_dti` from `s.Indicators`.
3. `SavingsFresh = s.SavingsAccounts is { } a && ValuationFreshness.AllFresh(a, s.Today)`. `LiquidTotal = Σ LatestValueIdr`.
4. `months = JourneyScoringService.MonthsBack(s.Today)`, then `AvgMonthlyConsumption` and `AvgMonthlyIncome` via `JourneyScoringRules`. `MonthlyDebtService = Σ s.Liabilities.MonthlyPayment ?? 0` (only used when the DTI indicator is evaluated, which already guarantees every payment is known).
5. `EarmarkedInSavings = await goals.EarmarkedInAccountsAsync(savingsAccountIds, ct)`.
6. Return `(FoundationInputs, FoundationCheck)` so the list handler can call `FoundationGate.ForGoal` per goal.

If the snapshot load throws, log the error and return a check with `State = "not_evaluated"` and `Missing = ["computation_error"]`. Never fail open to `clear`.

> **Why:** one snapshot per page view, shared by every goal on the page. A failure must degrade to neutral, never to green (FIN-04).
> **Check:** a unit test with mocked `IJourneyScoringService` throwing returns `not_evaluated`.

---

### [ ] STEP 10 — Queries, commands, validators, handlers

In `Application/Commands/Goals/`. **None implement `IAffectsJourney`**, so no `AssetUpdatedEvent` and no recalculation (Notes, decision 6).

| Request | Returns | Handler essentials |
|---|---|---|
| `GetGoalsQuery(string? Kind, string? Status, int Page, int PageSize)` | `GoalPageDto` | list, then batch-load contributions and cost items, then a foundation check once, then `GoalMath.Compute` + `Pace` + `FoundationGate.ForGoal` per goal (the gate only for `big_purchase`). `today` comes from the injected `TimeProvider` (`AppTimeProvider`, Asia/Jakarta). |
| `GetGoalQuery(Guid Id)` | `GoalDto?` | same mapping for one goal |
| `CreateGoalCommand(Category, Name, Notes?, Priority, TargetAmount, TargetDate?, PriceGrowthRate?, PlannedMonthlyInstalment?)` | `GoalDto` | `Kind = big_purchase`, `Tier = GoalKinds.TierFor[kind]` (never from the request), `UserId = caller.UserId` |
| `UpdateGoalCommand(Guid Id, … , Status)` | `GoalDto?` | `achieved` sets `AchievedAt = UtcNow`; leaving `achieved` clears it; sets `UpdatedAt` |
| `DeleteGoalCommand(Guid Id)` | `bool` | the cascade removes the children |
| `ReplaceGoalCostItemsCommand(Guid GoalId, List<GoalCostItemInput> Items)` | `GoalDto` | replace the set; if any items exist, set `TargetAmount = Σ items where type ≠ loan_principal`; reject when that sum is 0 |
| `AddGoalContributionCommand(Guid GoalId, decimal Amount, DateOnly ContributedOn, Guid? HeldInAccountId, string? Note)` | `GoalContributionDto` | reject (`ValidationException`) when a withdrawal would make allocated < 0; when `HeldInAccountId` is set it must be visible to the caller (an RLS read returning nothing becomes a 400) |
| `DeleteGoalContributionCommand(Guid GoalId, Guid ContributionId)` | `bool` | |
| `GetGoalContributionsQuery(Guid GoalId, int Page, int PageSize)` | `PagedResult<GoalContributionDto>` | newest first |

Validators in `Application/Validation/`:
- `CreateGoalCommandValidator` / `UpdateGoalCommandValidator`:
  - category in `GoalKinds.BigPurchaseCategories`;
  - name 1–120 characters after trimming;
  - priority 1–4;
  - target amount > 0 and < 10^18 (the `numeric(20,2)` bound);
  - target date ≥ today on create (update may keep a past date);
  - growth rate 0–1;
  - instalment ≥ 0;
  - status in `GoalKinds.Statuses` (update only).
- `AddGoalContributionCommandValidator`: amount ≠ 0, absolute value < 10^18, date ≤ today, note ≤ 280.
- `ReplaceGoalCostItemsCommandValidator`: ≤ 20 items, type in `GoalKinds.CostItemTypes`, label 1–80, amount ≥ 0.

Tests (`tests/PersonalFinance.Tests/Goals/`), named `MethodName_Condition_ExpectedResult`, with Moq for `IGoalService`, `IFoundationCheckService` and `ICurrentUser`:
- validator boundary tests for each rule;
- `Handle_Create_TierComesFromKindNotRequest`;
- `Handle_Create_UserIdFromCurrentUser`;
- `Handle_AddContribution_WithdrawalBelowZero_Throws`;
- `Handle_ReplaceCostItems_TargetExcludesLoanPrincipal`;
- `Handle_GetGoals_LoadsContributionsOnceForPage` (verify `ContributionsForAsync` is called exactly once);
- `Handle_Update_AchievedSetsAchievedAt`.

> **Why:** TEST-01 covers every public handler and validator. `Tier` derived from `Kind` server-side is the application half of the CHECK constraint, and the owner always comes from `ICurrentUser` (CLAUDE.md auth pattern).
> **Check:** `dotnet test` passes.

---

### [ ] STEP 11 — GoalsController and DI

`Api/Controllers/GoalsController.cs`, `[ApiController] [Route("api/[controller]")]`, `IMediator` only (no `Supabase.Client`):

| Verb | Route | Notes |
|---|---|---|
| GET | `/api/goals?kind=big_purchase&status=&page=1&pageSize=50` | `pageSize = Math.Clamp(pageSize, 1, 200)`, `page = Math.Max(page, 1)` (PERF-02) |
| GET | `/api/goals/{id}` | 404 when null |
| POST | `/api/goals` | |
| PUT | `/api/goals/{id}` | `command with { Id = id }` |
| DELETE | `/api/goals/{id}` | |
| PUT | `/api/goals/{id}/cost-items` | |
| GET | `/api/goals/{id}/contributions?page&pageSize` | PERF-02 |
| POST | `/api/goals/{id}/contributions` | |
| DELETE | `/api/goals/{id}/contributions/{contributionId}` | |

Every action stays ≤ 15 lines (ARCH-04). Register `IGoalService` and `IFoundationCheckService` as scoped in `Program.cs`. Add the endpoints to `docs/architecture/API-endpoints.md`.

Controller tests: page and pageSize clamping is passed to the query; 404 on a null result.

> **Why:** CQRS through MediatR keeps the controller thin. The existing `LiabilitiesController` reads Supabase directly, which is not a pattern to copy.
> **Check:** with the stack running, `curl -H "Authorization: Bearer $TOKEN" "http://localhost:7208/api/goals?kind=big_purchase&pageSize=500"` returns `pageSize: 200` and `foundation.state`.

---

## Phase 3 — UI

### [ ] STEP 12 — Types, API client, money helpers

- `src/types/Goal.ts`: interfaces mirroring STEP 7, with every money and rate field typed `string`.
- `src/api/goalsApi.ts`: `getGoals`, `getGoal`, `createGoal`, `updateGoal`, `deleteGoal`, `replaceCostItems`, `getContributions`, `addContribution`, `deleteContribution`, using `authenticatedFetch` and `VITE_API_URL` as in `liabilitiesApi.ts`. Money is sent as strings.
- `src/lib/goals/money.ts`:
  - `formatIdr(value: string): string`: groups the integer part with `.` via string ops and BigInt, then drops `.00` (`"12500000.00"` → `"Rp 12.500.000"`).
  - `parseIdrInput(input: string): string | null`: strips `Rp`, spaces and `.` separators, accepts `,` as the decimal mark, and returns the canonical `"12500000"` or null.
  - `percentForBar(value: string): number`: clamps to 0–100 for CSS width only. It is not money.
- `src/lib/goals/money.test.ts`: covers grouping, negatives, `.00` handling, invalid input, and values above `Number.MAX_SAFE_INTEGER`.
- Add `"test:goals": "vitest run src/lib/goals"` to `package.json` and `- run: npm run test:goals` after `test:networth` in `.github/workflows/ci.yml`.

> **Why:** FIN-01 for TS means strings or minor units; the frontend formats and never adds money. The progress bar width is the one place a float is fine, because it is a pixel ratio and not an amount.
> **Check:** `npm run test:goals` passes.

---

### [ ] STEP 13 — Copy module (compliance-reviewed strings)

`src/lib/goals/copy.ts` holds every user-facing Big Purchases string, so compliance reviews one file. It uses `formatIdr` and formats `yyyy-MM` as `Mon YYYY`. Final strings (the /compliance changes applied):

| Key | Text |
|---|---|
| gate.clear.title | Foundation checked |
| gate.clear.body | Your cushion ({cover} months) and debt payments ({dti}% of take-home income) are within the Defense bars. This checks your foundation, not whether this purchase is right for you. |
| gate.notRecommended.title | Not recommended yet |
| gate.notRecommended.cover | By the Defense rule, your cushion covers {cover} months and the bar is 2.1. You can keep saving here; the rule asks you to finish your cushion before you commit to this purchase. |
| gate.notRecommended.spend | By the Foundations rule, your spending is above 89% of your income. Get it under the bar before you commit to this purchase. |
| gate.notRecommended.dti | By the Defense rule, your debt payments are {dti}% of take-home income and the bar is 29.6%. |
| gate.notRecommended.postDti | With an instalment of {instalment}, your debt payments would be about {post}% of your current take-home income. The Defense bar is 29.6%. |
| gate.notEvaluated.title | Not checked yet |
| gate.notEvaluated.body | Record your savings balance and your debts, or confirm you have none, so we can check your foundation. (Missing: {list}) |
| gate.notEvaluated.stale | Your savings balance is older than last month. Update it so the check uses today's cushion. |
| earmark.note | {amount} set aside for goals is not counted as your cushion here. |
| next.scheduled | Set aside {monthly} a month to reach {target} by {Mon YYYY}. |
| next.dueSoon | {remaining} needed by {date}. |
| next.overdue | Target date passed, {remaining} still to go. Set a new date to see a monthly amount. |
| next.noDate | Set a target date to see a monthly amount. |
| next.funded | Fully funded. {surplus > 0 ? "{surplus} over target." : ""} |
| assumption.prices | Today's prices; no investment returns assumed. |
| assumption.growth | Includes your price-growth assumption of {g}% a year. |
| assumption.longNoGrowth | This is more than 5 years away. Prices usually rise; you can add a price-growth assumption. |
| pace.reach | At your average of {pace} a month over the last 3 months, you'd reach this around {Mon YYYY}. Arithmetic on your own entries, not a forecast. |
| pace.beyond | At your recent pace this would take more than 50 years. |
| postDti.label | Estimate at your current take-home income, not a loan eligibility check. |
| cost.helper | Taxes and fees such as BPHTB, notary/PPAT, PPN on new property, BBNKB, PKB and opsen are set by regulation and your region. Enter the amounts from your quote or invoice; we don't fill in rates. |
| cost.otr | Check whether your OTR price already includes BBNKB and the first year's PKB, so they aren't counted twice. |
| achieved.cta | Bought it? Record the property or vehicle, and any loan, in Assets. |
| disclosure | A personal planning tool, not financial advice. Numbers come from what you entered. |

`copy.test.ts`: covers state-to-title mapping, every missing and failing code having text, and `{Mon YYYY}` formatting.

> **Why:** FIN-05: every surface that projects carries its assumption on the same screen. The 2.1 and 29.6 numbers are the rubric's Cleared bars (scoring-rubric.md), not regulation, so they cite the rubric rather than tax-id.md.
> **Check:** `npm run test:goals`; no rate or percentage from tax-id.md appears in the file.

---

### [ ] STEP 14 — Components

Follow `ai/design/` (data-oriented-zenmode, `ui-rules.md`): `.pf-card p-5`, no `divide-*` or `border-t` separators, and secondary detail inside its card below a **dashed** `border-t`. Use shadcn/ui and lucide icons only. Never edit `src/components/ui/`.

- `FoundationCheckCard`: one card at the top. Its state pill is neutral grey (`not_evaluated`), amber (`not_recommended_yet`) or green (`clear`). The copy comes from STEP 13, with links to `/assets/accounts` (savings) and `/assets/liabilities` (debts) for missing inputs, and the earmark note when the earmarked amount is above 0.
- `GoalCard`: category icon (Home, Car, GraduationCap, Heart, Target), name, priority chip `P1`–`P4`, tier badge `L3 · Growth` in the sidebar's L3 colour, and the per-goal gate pill. Below that, a progress bar labelled "{allocated} of {effectiveTarget}" (never a bare %, per ui-rules), then the next-step line and its assumption line. Collapsible (dashed `border-t`): the cost breakdown with cash-needed vs total cost, the post-purchase DTI with its label, pace, notes, and recent contributions. Buttons: "Add money", "Edit", and a "…" menu (pause, mark achieved, cancel, delete with a confirm dialog).
- `GoalFormDialog`: react-hook-form + Zod. Amount fields are strings validated with `parseIdrInput`. The optional price-growth field is labelled "your assumption, % a year", with no default.
- `CostItemsEditor`: shown for `house_land` and `vehicle` only. Rows of type, label and amount, with `cost.helper` (and `cost.otr` for vehicles). It shows "Cash needed" and "Total cost" as returned by the API after save, never summed in the browser.
- `ContributionDialog`: amount, a deposit/withdraw toggle, date, an optional "Held in" account select (accounts from `accountsApi`), and a note.
- `GoalsDisclosure`: the `disclosure` string as a small muted line at the bottom of the page, always rendered.

> **Why:** zen mode makes one thing the hero, here the goal cards. The foundation check sits above them because sequencing is the point of putting this module on L3.
> **Check:** `npm run lint` and `npx tsc --noEmit` are clean; light and dark themes both render the three pill states.

---

### [ ] STEP 15 — Page, route, sidebar

- `src/pages/big-purchases/BigPurchasesPage.tsx`:
  - `PageHeader` "Big Purchases" with an "Add goal" button;
  - `useQuery(['goals', 'big_purchase', page])`;
  - `FoundationCheckCard`, then a responsive grid of `GoalCard`, then "Load more" while `items.length < total`;
  - an empty state ("Plan your first big purchase");
  - `GoalsDisclosure`.
  Mutations invalidate `['goals']`.
- `App.tsx`: `<Route path="/big-purchases" element={<BigPurchasesPage />} />` inside the authenticated `AppShell` routes.
- `Sidebar.tsx`: set `live: true` on `big-purchases`. Leave the top-level Goals button disabled (out of scope).

> **Why:** the route and sidebar flip land last, so the page never appears live half-built.
> **Check:** `npm run dev`; `/big-purchases` loads, and the sidebar item is clickable without a SOON badge.

---

### [ ] STEP 16 — E2E and docs

- `e2e/big-purchases.spec.ts`:
  - create a synthetic goal (vehicle, "Test vehicle", Rp 200.000.000, target 24 months out) and assert the monthly line shows "Rp 8.333.334";
  - add a contribution of Rp 50.000.000 and assert "Rp 50.000.000 of Rp 200.000.000";
  - assert a gate pill is present and is not green when the test user has no savings valuation;
  - delete the goal.
- `README.md`: add or flip the L3 Big Purchases roadmap row with the existing emoji style (🔜 until accepted).
- `docs/STATUS.md`: one line under active features.

> **Why:** Playwright is the project's functional coverage for UI (PF-038). Synthetic data only: compliance change 6, public repo.
> **Check:** `npx playwright test e2e/big-purchases.spec.ts` passes with the stack up (`docker-up`).

---

### [ ] STEP 17 — Full gate

```bash
# skill: ci-check (all gates)
cd apps/api && dotnet build && dotnet test
cd ../frontend && npm run lint && npx tsc --noEmit && npm run test:goals && npm run build
gitleaks detect --no-banner
```

> **Why:** CI-01. The new `test:goals` CI line must be proven locally before the push.
> **Check:** every command exits 0.

---

## Notes

- **Decision 6, the link to the pyramid: no quest and no `AssetUpdatedEvent`.**
  - A contribution is bookkeeping of an earmark, not new money. No indicator reads goals, so a recalculation would be a no-op that implies goals affect the score. The goal commands therefore don't carry `IAffectsJourney`, so `PublishAssetUpdatedBehavior` never fires for them.
  - A "goal completed" quest would reward consumption, which the product's sequencing thesis argues against. A funding-streak quest would reward self-reported entries, which is easy to game.
  - The real link happens when the goal is bought: the `achieved.cta` sends the owner to Assets to record the property or vehicle and any loan. Those existing commands do fire `AssetUpdatedEvent`, so the new liability lands in DTI, which is exactly the effect a purchase should have on the pyramid.
  - Revisit after a rubric change excludes earmarks from cover. Then an L3 quest such as "fund a goal without touching your fence" becomes measurable.
- **Gate vs Journey can disagree.** The Journey can show L2 cleared while the gate shows "Not recommended yet", because the gate subtracts earmarks and requires DTI to be evaluated. That is intended (CIO G2/G3), and the earmark note explains it. Making `liquid_savings_ratio` itself subtract earmarks is a rubric methodology change: route it through `/cio methodology` as a follow-up, never inside this ticket.
- **Recurrence** is stored for the future Goals page (monthly or annual goals such as a yearly premium), but `big_purchase` is one-off by constraint. Per-period math is a Goals-page ticket.
- **Currency** is IDR only (CHECK). A degree abroad priced in a foreign currency needs FX-dated targets, which is a follow-up.
- **Emergency Fund goals later:** their allocated amount should be the savings valuations, not ledger rows. Because allocated is computed on read, that is a branch in `GoalMath` input loading, not a migration. Do not create `emergency_fund` rows from the ledger, or the cushion would count twice.
- **Out of scope:** the Goals page, Emergency Fund, FIRE, Budgeting, KPR product or rate comparison, any tax or fee rate, and any minimum down payment rule (BI/OJK loan-to-value rules are regulatory; route them through `/compliance tax` if ever shown).
- **PII:** the owner's real spreadsheet goals and amounts stay out of the repo. Tests, seeds, e2e and docs use synthetic goals (compliance change 6).
- **Performance:** the list endpoint runs one goals query, one contributions `In` query, one cost-items `In` query, and one read-only scoring snapshot. Owner data is small (dozens of goals), so no caching.

## Execution Notes

Before you start: create the GitHub issue `[PF-154]`; commit or stash the uncommitted `Sidebar.tsx` SOON change on main so STEP 15 edits a clean file; have the local Supabase stack running (`docker-up`).

### Phase 1 — Definitions, schema, pure math

Model: **Opus 5.5** · Effort: **high**. Schema, RLS and money math, where a wrong guess is silent (Sensitive).

```
/execute plans/in-progress/PF-154-big-purchases-goal-model-todo.md phase 1
```

### Phase 2 — API

Model: **Opus 5.5** · Effort: **high**. It introduces the money-as-string contract and the fail-closed gate wiring.

```
/execute plans/in-progress/PF-154-big-purchases-goal-model-todo.md phase 2
```

### Phase 3 — UI

Model: **Sonnet 5.5** · Effort: **high**. Multi-component React work with exact copy and contracts already fixed.

```
/execute plans/in-progress/PF-154-big-purchases-goal-model-todo.md phase 3
```

### Stop and ask if

- STEP 6's read-only snapshot cannot be built without changing what `RecalculateWithSnapshotAsync` computes or persists.
- Any step seems to need a tax or fee rate in code or copy, or a change to a rubric breakpoint.
