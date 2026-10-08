# PF-107 Phase 5 — Auth Retrofit + Tax Reporting + Goals

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 5 of 6 — Security, compliance, and goals
> **Status:** Not started
> **Depends on:** Phase 4 complete + PF-S08 (Supabase Auth JWT middleware) complete
> **Blocks:** Nothing — this is the final phase

## Objective

Lock down the assets module with real authentication (coordinate with PF-S08's JwtBearer middleware), ship the realized-gains SPT tax report that directly helps the user at Indonesian tax-filing time, and add the Goals tab for savings runway tracking. After Phase 5, the Assets module is production-ready: multi-user safe, compliant with Indonesian tax reporting requirements, and feature-complete.

## Acceptance Criteria

- [ ] All assets tables RLS policies flipped from `USING (true)` to `USING (auth.uid() = user_id)`
- [ ] All assets controllers read `user_id` from JWT claim (via `HttpContext.User.GetUserId()` — PF-S08 pattern)
- [ ] User A cannot read or write User B's institutions, accounts, assets, holdings, valuations, liabilities
- [ ] **SPT Capital Gains Report**: CSV/XLSX export listing all Holdings sold (realized P&L) grouped by short-term (< 1 year) vs long-term (≥ 1 year) — downloadable from Assets → Investments tab
- [ ] **Goals tab** added to `/assets/goals`: user adds a goal (e.g. "Emergency Fund: Rp 500M", "Buy House Down Payment: Rp 300M"), app shows progress % and runway (months at current savings rate — **savings rate input is manual**, no cashflow coupling)
- [ ] All Phase 1A–4 verifications re-run with auth enabled — no regressions

## Approach

PF-S08 adds `JwtBearer` middleware to the .NET API and ensures `user_id` from JWT is available in controllers. The assets module's Phase 5 work is to: (1) flip RLS, (2) replace `Guid.Empty` placeholders with real `user_id` from JWT context, and (3) add the two new features. The SPT report is a server-side CSV generation from `holdings` history; no LLM or external service needed. Goals tab is purely frontend + a new `goals` table — no transactions dependency (user manually inputs monthly savings rate).

Out of scope: cashflow reconciliation (backlog), What-If scenarios (backlog), automated savings-rate computation from transactions (backlog).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/NNNN_assets_auth_rls.sql` | Create — flip 7 RLS policies to `auth.uid() = user_id` |
| `supabase/migrations/NNNN_goals.sql` | Create — `goals` table |
| `apps/api/src/PersonalFinance.Api/Controllers/AccountsController.cs` | Modify — inject real user_id from JWT |
| `apps/api/src/PersonalFinance.Api/Controllers/AssetsController.cs` | Modify — inject real user_id |
| `apps/api/src/PersonalFinance.Api/Controllers/LiabilitiesController.cs` | Modify — inject real user_id |
| `apps/api/src/PersonalFinance.Api/Controllers/NetWorthController.cs` | Modify — inject real user_id + scoped queries |
| `apps/api/src/PersonalFinance.Application/Commands/*/Create*CommandHandler.cs` | Modify — replace `Guid.Empty` with real user_id (all 6 entities) |
| `apps/api/src/PersonalFinance.Infrastructure/Jobs/DailySnapshotJob.cs` | Modify — scope snapshot to per-user |
| `apps/api/src/PersonalFinance.Infrastructure/Jobs/DailyPricingJob.cs` | Modify — scope pricing to per-user holdings |
| `apps/api/src/PersonalFinance.Api/Controllers/GoalsController.cs` | Create |
| `apps/frontend/src/pages/assets/AssetsLayout.tsx` | Modify — add Goals tab |
| `apps/frontend/src/pages/assets/GoalsTab.tsx` | Create |
| `apps/frontend/src/components/assets/GoalRunwayCard.tsx` | Create |
| `apps/frontend/src/api/goalsApi.ts` | Create |
| `apps/frontend/src/types/Goal.ts` | Create |

---

## TODO

### [ ] STEP 1 — Coordinate with PF-S08: confirm JWT user_id pattern

Before writing any auth code, check the PF-S08 implementation for the correct way to read user_id from JWT:

```csharp
// Expected pattern from PF-S08 (verify by reading AccountsController after PF-S08 merges):
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
             ?? throw new UnauthorizedException();
```

If PF-S08 uses a different claim name or extension method, use that. Don't define a parallel auth pattern — there must be exactly one way to get user_id across all controllers.

> **Why coordinate rather than implement independently?** PF-S08 is another sprint's work. If it uses `ClaimTypes.Sub` and this phase uses `ClaimTypes.NameIdentifier`, the two modules will silently use different claims and break auth for assets-module users when PF-S08 middleware processes the token differently. One pattern across the codebase.

---

### [ ] STEP 2 — Create RLS flip migration

```sql
-- supabase/migrations/NNNN_assets_auth_rls.sql
-- Run AFTER PF-S08 is deployed and tested end-to-end

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['institutions','accounts','assets','holdings',
                            'valuations','liabilities','fx_rates',
                            'daily_net_worth','net_worth_events','price_quotes']
  LOOP
    -- Drop permissive policy
    EXECUTE format('DROP POLICY IF EXISTS "%s_open" ON public.%I', t, t);
    -- Create restrictive policy
    EXECUTE format(
      'CREATE POLICY "%s_user_only" ON public.%I USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t, t
    );
  END LOOP;
END $$;
```

> **Why a separate migration file for the RLS flip instead of editing the Phase 1A migration?** Applied migrations are immutable — Supabase tracks which ones have run. Editing a previously-applied migration has no effect on an existing DB; you'd need to reset and reapply all migrations. A new migration is the correct pattern for any schema change after initial deploy.

---

### [ ] STEP 3 — Replace Guid.Empty in all command handlers

Global find: `grep -rn "Guid.Empty" apps/api/src/PersonalFinance.Application/Commands/`

For each handler found, replace `UserId = Guid.Empty` with the user_id from the command:

```csharp
// Pattern: Add UserId to each Create command record
public record CreateInstitutionCommand(
    Guid UserId,   // ← add this
    string Name,
    string Type,
    // ...
) : IRequest<Institution>;

// In controller:
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
var command = new CreateInstitutionCommand(Guid.Parse(userId), request.Name, request.Type);
await _mediator.Send(command);
```

> **Why pass UserId through the command instead of reading it in the handler?** Handlers should be testable without an HttpContext. Passing UserId explicitly via the command means unit tests can set any UserId they want. If the handler reads from IHttpContextAccessor, tests need to mock the full HTTP context stack.

---

### [ ] STEP 4 — Scope background jobs to per-user

`DailySnapshotJob` and `DailyPricingJob` currently process all rows without user filtering (permissive RLS). After the RLS flip, service-role key is required for background jobs (they run server-side, outside user context).

Ensure `JisdorFxRateService`, `CoinGeckoPricingService`, and snapshot jobs use the **Supabase service role key** (already configured as `Supabase__ServiceRoleKey` env var, used by `StorageService`). This bypasses RLS for legitimate server-side operations.

```csharp
// In DailySnapshotJob — use service-role client, not user-scoped client
var supabase = scope.ServiceProvider.GetRequiredKeyedService<Supabase.Client>("service");
```

---

### [ ] STEP 5 — Create goals table

```sql
CREATE TABLE public.goals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  name               text NOT NULL,
  target_idr         numeric(20,2) NOT NULL,
  current_idr        numeric(20,2) NOT NULL DEFAULT 0,
  monthly_savings_idr numeric(20,2),  -- user-entered manually
  target_date        date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_user_only" ON public.goals
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

> **Why `current_idr` as a stored field instead of computing from net worth?** Goals are independent of the assets module's net worth calculation. "Emergency fund of Rp 500M" tracks a specific sub-goal balance, not total NW. The user updates `current_idr` manually (or in a future phase we can suggest it from a tagged account). Storing it avoids coupling Goals to asset class aggregation logic.

---

### [ ] STEP 6 — Build Goals tab

```tsx
// pages/assets/GoalsTab.tsx
// Card grid — one GoalRunwayCard per goal

// GoalRunwayCard shows:
// - Goal name + target amount
// - Progress bar: current_idr / target_idr
// - Runway: "At Rp X/month → goal reached in Y months (Est. DATE)"
// - Status badge: On Track / Behind / Achieved
```

```tsx
// Runway computation (purely frontend):
const remainingIdr = goal.targetIdr - goal.currentIdr;
const monthsToGoal = goal.monthlySavingsIdr > 0
  ? Math.ceil(remainingIdr / goal.monthlySavingsIdr)
  : null;
```

`monthlySavingsIdr` is user-entered in the goal form. No cashflow coupling — the user knows their monthly savings rate from their own cashflow tracking.

---

### [ ] STEP 7 — Build SPT Capital Gains Report

```
GET /api/assets/tax/capital-gains?year=2025
→ CSV download
```

Report format (matches SPT Form 1770 Lampiran III logic):

| Nama Aset | Tanggal Beli | Harga Beli (IDR) | Tanggal Jual | Harga Jual (IDR) | Laba/Rugi (IDR) | Jangka |
|---|---|---|---|---|---|---|
| BBCA | 2024-03-15 | 50,000,000 | 2025-01-20 | 65,000,000 | 15,000,000 | Pendek (<1 th) |
| BTC | 2023-06-01 | 100,000,000 | 2025-08-10 | 200,000,000 | 100,000,000 | Panjang (≥1 th) |

Implementation: query `holdings` history (cost_basis at acquisition + any sell events in the target year). "Sell event" = a Valuation row with `notes LIKE '%sold%'` or a new `HoldingSale` record (add if needed).

> **Why SPT format specifically?** This is the Indonesian annual tax return (Surat Pemberitahuan Tahunan). Capital gains from stocks and crypto are reportable in SPT Form 1770. Giving the user a pre-formatted CSV that maps to SPT fields saves hours of manually calculating gains at tax time — one of the highest-friction financial tasks an Indonesian investor faces.

---

### [ ] STEP 8 — Integration test: multi-user isolation

Add to the test suite a test that creates two users (User A, User B), seeds data for each, then verifies User A's JWT cannot query User B's data:

```csharp
// PersonalFinance.Tests/Integration/AssetsAuthTests.cs
[Fact]
public async Task GetAccounts_UserAToken_ReturnsOnlyUserAAccounts()
{
    // Seed User A: 2 accounts
    // Seed User B: 3 accounts
    // Call GET /api/accounts with User A's JWT
    // Assert: response contains exactly 2 accounts, none belonging to User B
}
```

> **Why an integration test instead of unit test for auth?** RLS policies enforce isolation at the database level. A unit test mocking the Supabase client can't verify that the DB policy actually filters rows. This test must hit the real (local) Supabase instance to be meaningful.

---

## Notes

- **`Guid.Empty` grep is the Phase 5 starting checklist.** There should be exactly as many hits as there are Create command handlers (6 entities = 6 hits). If there are more, investigate before the RLS flip.
- **Service-role key in background jobs**: Already used by `StorageService` — follow the same DI registration pattern. Don't create a second `Supabase.Client` configuration; use the existing keyed service or extend it.
- **SPT "sell event" design decision**: If tracking sells is important (for tax), a dedicated `HoldingSale` entity (date, quantity, proceeds_idr) is cleaner than parsing `notes` text. Decide before implementing — if sells are rare, notes field is fine for Phase 5. Add `HoldingSale` entity only if user confirms they actively trade.
- **Goals and cashflow (future)**: In the Reconciliation Exploration phase, we can suggest `monthlySavingsIdr` from the user's actual cashflow (average monthly net = income − expenses). For now, manual entry is sufficient and avoids coupling.
- **Phase ordering dependency**: Do NOT run the STEP 2 RLS migration before PF-S08 middleware is confirmed working end-to-end. The flip is irreversible without another migration. Test PF-S08 with permissive RLS first, then flip. Staging environment strongly recommended.
