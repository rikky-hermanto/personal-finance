# PF-140 — Macro Scenario Lab

> **GitHub Issue:** _(none — local task tracking only)_
> **Status:** Done
> **Started:** 2026-09-02
> **Planned from branch:** main
> **Scope:** Big Bang (user chose comprehensive single-ticket scope over the phased "generic engine first" recommendation from the discovery/approach discussion)

## Objective

Port the domain logic from the throwaway reference artifact `docs/reference/simulator-makro-v3.jsx` (an
Indonesian macro-economy scenario simulator) into a new **Macro Scenario Lab** feature, rebuilt on this
app's own design system and — critically — personalized against the user's real portfolio, spending
history, and liabilities instead of the reference's generic assumptions. The reference file's visual
layer is discarded entirely; only its financial logic (solver, instrument pricing, stakeholder scoring)
is preserved, coefficient-for-coefficient.

## Acceptance Criteria

- [x] Domain module (`src/lib/macroScenario/`) imports nothing from React or the DOM and runs standalone in Node — verified by `vitest run src/lib/macroScenario` executing under Vitest's `node` environment with zero React/DOM imports in the module.
- [x] Every numeric coefficient from the reference model lives in `constants.ts`, named, with a one-line comment — verified by manual line-by-line port; no bare numeric literals remain in `solver.ts`/`instruments.ts`/`stakeholders.ts` model formulas.
- [x] The 4-round iterative FX↔inflation solver is preserved exactly (not collapsed to one pass) — verified by reading `solver.ts`'s `for (let k = 0; k < 4; k++)` loop.
- [x] No hardcoded color values in the new feature code; all styling goes through the project's Tailwind/shadcn tokens — verified by using only `hsl(var(--token))`, `text-*`/`bg-*`/`border-*` Tailwind classes, and existing shadcn primitives (Card via `.pf-card`, Slider, Collapsible, Badge, Button, Input) across all `components/macro-lab/*` files.
- [x] No new chart dependency added — verified by reusing the already-installed `recharts` (`StakeholderLedger.tsx`'s winners/losers bar chart mirrors `src/components/ui/chart.tsx`'s `hsl(var(--chart-N))` convention).
- [x] Real portfolio holdings replace the reference's fixed default weights, with per-position contribution shown — verified by `mapPortfolioToWeights()` + `PersonalImpactPanel`'s contribution list; falls back to `DEFAULT_PORTFOLIO_WEIGHTS` (source: `'default'`) when mapped coverage is too thin, with a visible "estimate" badge.
- [x] Personal spending mix replaces the reference's fixed 42/22/10/26 household basket, with a labeled fallback when data is thin — verified by `mapSpendingToWeights()` (falls back below 2 non-zero trailing categories) and `PersonalImpactPanel`'s source badge.
- [x] Liability and emergency-fund figures are recomputed under the scenario, not shown as today's values — verified by `estimateLiabilityImpact()` and `estimateEmergencyFundRunway()`, wired into `MacroLabPage` and displayed in `PersonalImpactPanel`.
- [x] A comparison mode shows the delta between a base and an alternative scenario — verified by `comparison.ts` + `ScenarioComparisonPanel` + the "Compare against an alternative" toggle in `MacroLabPage`.
- [x] Scenarios can be saved under a user-given name via the project's existing persistence layer (backend, not localStorage) — verified by the `macro_scenarios` table + CQRS command/query + `useMacroLab.ts` hooks, mirroring the Trading Desk mandate precedent (`deskApi.ts`).
- [x] Sliders are tiered: 6 primary drivers visible by default, 13 behind an "Advanced settings" disclosure — verified by `tier: 'primary' | 'advanced'` on every `SliderDef` in `presets.ts` and the `Collapsible` in `DriverConsole.tsx`.
- [x] Computed outputs (inflation, growth, unemployment, FX) are visually distinct from adjustable inputs — verified by `DerivedOutcomePanel`'s "computed — not directly adjustable" label and left-accent-border card styling, separate from the slider console.
- [x] Unit tests cover: golden snapshots for BASE + all 7 historical presets, convergence/NaN sweep across every slider's min/max, the required sign tests (oil×subsidy dual path, IDR weakness dual effect, informal-share Okun dampening, global real rate on gold+crypto), and personalization edge cases (empty portfolio, single-asset portfolio, out-of-taxonomy asset class) — verified by `npm run test:macro`: 26/26 passing.
- [x] A clear disclaimer states this is a heuristic educational index, not an economic projection or investment advice — verified by `MacroLabDisclaimer.tsx`, rendered at the bottom of `MacroLabPage`.
- [x] The reference file is moved out of the active tree — verified by `git mv docs/ideas/simulator-makro-v3.jsx docs/reference/simulator-makro-v3.jsx`.
- [x] Full-stack verification: `dotnet build` (0 errors), `dotnet test` (349 passed / 9 pre-existing skips / 0 failed), `tsc --noEmit` (0 errors), `npm run lint` (0 errors in new files — all 28 pre-existing findings are in files this task never touched), `npm run build` (succeeds), `npm run test:macro` (26/26).

## Approach

Everything lives in one ticket (the user's explicit "BIG BANG" choice over the phased alternative raised
during discovery). The domain module is pure TypeScript under `apps/frontend/src/lib/macroScenario/`,
directly mirroring the existing `src/lib/desk/` precedent (framework-free logic + a scoped Vitest config
run via a dedicated `npm run test:*` script, not a repo-wide Vitest rollout). Personalization reads the
user's *real* data — `Holding`/`Asset` (Assets module, not the Investment module's archetype-only
`InvestmentHolding`), `Liability`, the existing 3-month trailing `VarianceExplainer`, and
`BucketsResponse.emergencyFund` — through a dedicated mapping layer (`personalization.ts`) that always
degrades to a labeled default rather than guessing. Saved scenarios follow the Trading Desk mandate
precedent: a real backend table + CQRS command, not localStorage. The UI lives as a new "Lab" tab in the
Investment tab bar pointing at a new top-level route `/lab` (mirroring how Trading Desk is tabbed into
Investment while living at its own top-level `/desk` route).

**Two data-mapping gaps were resolved by explicit, documented design decisions (not schema migrations):**
1. The app's `AssetClass` taxonomy (9 coarse classes) is coarser than the reference model's 10 macro
   instrument classes — `mapPortfolioToWeights()` compresses to what the data actually supports (with an
   `asset.metadata.macroClass` escape hatch for power users) rather than guessing a finer split.
2. `Liability.interestRate` doesn't distinguish fixed vs. floating rate — every rate-bearing liability is
   treated as floating and the UI carries an explicit "assumes floating rate" badge, rather than silently
   projecting a payment change that could be wrong for a fixed-rate KPR.

Out of scope, deliberately: a new 12-month category-aggregation backend endpoint (the existing 3-month
`VarianceExplainer` is reused and honestly labeled as a 3-month window, not built out further); a schema
migration to add fixed/floating rate type to `Liability`; full amortization-schedule math for liability
payment deltas (a simple-interest-on-principal approximation is used instead, labeled as directional).

## Affected Files

| File | Change |
|------|--------|
| `docs/reference/simulator-makro-v3.jsx` | Moved from `docs/ideas/` — read-only spec, no longer an active component |
| `apps/frontend/src/lib/macroScenario/constants.ts` | Create — every model coefficient, named and commented |
| `apps/frontend/src/lib/macroScenario/types.ts` | Create — `MacroDrivers`, `MacroState`, `InstrumentView`, `StakeholderRow`, etc. |
| `apps/frontend/src/lib/macroScenario/solver.ts` | Create — 4-round iterative FX/inflation solve + household/bank/corp/gov derived state |
| `apps/frontend/src/lib/macroScenario/instruments.ts` | Create — 10-instrument real-return pricing + fear/greed sentiment + portfolio blending |
| `apps/frontend/src/lib/macroScenario/stakeholders.ts` | Create — 6 stakeholder scores, regime classification, narrative text (translated to English) |
| `apps/frontend/src/lib/macroScenario/presets.ts` | Create — `BASE`, tiered `DRIVER_GROUPS`, 7 historical `PRESETS` |
| `apps/frontend/src/lib/macroScenario/personalization.ts` | Create — portfolio/spending/liability/emergency-fund mapping with labeled fallbacks |
| `apps/frontend/src/lib/macroScenario/comparison.ts` | Create — base-vs-alternative scenario delta |
| `apps/frontend/src/lib/macroScenario/index.ts` | Create — `computeScenario()` composition root + public exports |
| `apps/frontend/src/lib/macroScenario/__tests__/solver.test.ts` | Create — golden snapshots, convergence sweep, sign tests |
| `apps/frontend/src/lib/macroScenario/__tests__/personalization.test.ts` | Create — empty/single-asset/out-of-taxonomy portfolio tests |
| `apps/frontend/package.json` | Edit — add `test:macro` script |
| `apps/api/src/PersonalFinance.Domain/Entities/MacroScenario.cs` | Create — saved-scenario entity (`RawJsonConverter` for the `drivers_json` jsonb column) |
| `apps/api/src/PersonalFinance.Domain/Events/MacroScenarioCreatedEvent.cs` | Create — domain event published on save |
| `supabase/migrations/20260902000001_macro_scenarios.sql` | Create — `macro_scenarios` table + RLS placeholder |
| `apps/api/src/PersonalFinance.Application/Dtos/MacroScenarioDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/MacroScenarios/CreateMacroScenarioCommand.cs` + Handler | Create |
| `apps/api/src/PersonalFinance.Application/Commands/MacroScenarios/DeleteMacroScenarioCommand.cs` + Handler | Create |
| `apps/api/src/PersonalFinance.Application/Validation/CreateMacroScenarioCommandValidator.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Interfaces/IMacroScenarioService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Services/MacroScenarioService.cs` | Create — `GetAllAsync` |
| `apps/api/src/PersonalFinance.Api/Controllers/MacroScenariosController.cs` | Create — GET/POST/DELETE `api/macro-scenarios` |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register `IMacroScenarioService` |
| `apps/api/tests/PersonalFinance.Tests/Commands/CreateMacroScenarioCommandHandlerTests.cs` | Create — validator tests |
| `apps/frontend/src/types/MacroScenario.ts` | Create — `SavedMacroScenario` |
| `apps/frontend/src/api/macroScenarioApi.ts` | Create — fetch client |
| `apps/frontend/src/hooks/useMacroLab.ts` | Create — React Query hooks (mirrors `useDeskState.ts`) |
| `apps/frontend/src/components/macro-lab/*.tsx` (10 files) | Create — `StatTile`, `DriverSlider`, `DriverConsole`, `DerivedOutcomePanel`, `CapitalFlowPanel`, `InstrumentRotationTable`, `StakeholderLedger`, `PersonalImpactPanel`, `ScenarioComparisonPanel`, `MacroLabDisclaimer` |
| `apps/frontend/src/pages/lab/MacroLabPage.tsx` | Create — composition, data fetching, comparison state |
| `apps/frontend/src/App.tsx` | Edit — register `/lab` top-level route |
| `apps/frontend/src/pages/investment/InvestmentLayout.tsx` | Edit — add "Lab" tab pointing to `/lab` |

---

## TODO

### [x] STEP 1 — Discovery: reference file, design system, existing domain models
Read `docs/ideas/simulator-makro-v3.jsx` in full; surveyed the frontend design system (tokens, shadcn
primitives, chart library), the real holdings/assets/liabilities data shape vs. the Investment module's
separate archetype data, the existing `/api/spending-analysis/variance` and `/api/buckets` endpoints, the
Investment tab bar precedent for module placement, and confirmed Vitest's actual scoping mechanism.

> **Why:** THINK-01/THINK-02 (governance.md) — architecture and routing decisions need explicit reasoning
> before code, especially since the reference's 10-class instrument model doesn't map 1:1 onto this app's
> `AssetClass` taxonomy. Getting this wrong would mean silently mislabeled financial output (FIN-02).

---

### [x] STEP 2 — Port model constants (`constants.ts`)
Extracted every numeric coefficient from `computeModel()` into named exports with a one-line comment,
organized by formula section (output gap, Phillips curve, capital flow, FX, labor market, household
prices, instruments, sentiment, central bank, banks, corporates, government, people, regime).

> **Why:** FIN-02 — "no magic thresholds... a threshold nobody can trace cannot be defended or updated."
> This was an explicit hard requirement from the user's brief, not optional cleanup.

---

### [x] STEP 3 — Port core types (`types.ts`)
`MacroDrivers` (19 exogenous inputs), `MacroState` (all computed "results, not choices"),
`CapitalFlowComponent`, `InstrumentView`, `PortfolioAggregate`, `StakeholderRow`, `RegimeClassification`,
`SliderDef`/`DriverGroup` (with a `tier` field for progressive disclosure), `ScenarioPreset`.

> **Why:** Establishes the contract the rest of the module is built against before any formula logic is written.

---

### [x] STEP 4 — Port the iterative solver (`solver.ts`)
`solveMacro(drivers, spendingWeights?)` — the 4-round fixed-point loop (output gap → GDP → Phillips curve
→ capital flow → FX → repeat), plus all derived household/bank/corporate/government/people state fields.
Accepts an optional `spendingWeights` override (food/rent/fuel/core) so the same pure function serves both
the generic model and Fase 2.2's personalized felt-inflation weighting — no separate post-processing pass.

> **Why:** The 4-round loop is load-bearing — collapsing it to one pass removes the depreciation →
> imported-inflation feedback (explicit hard constraint). Threading `spendingWeights` through the solver
> itself (rather than recomputing `cpiBottom` externally) keeps the pure module the single source of
> truth for the formula, satisfying both Fase 1 (framework-free, exact port) and Fase 2.2 (personalization)
> without duplicating the calculation.

---

### [x] STEP 5 — Port instrument pricing (`instruments.ts`)
`priceInstruments(state, drivers)` — all 10 instruments' real IDR returns, fear/greed sentiment, and
crowded/hated-but-cheap flags, sorted best-to-worst. `blendPortfolio(instruments, weights)` — generic
weighted-basket blending used both by the model's own default weights and by real personalized weights.

> **Why:** Split out per the user's explicit file layout so instrument logic can be tested and reasoned
> about independently of the core macro solve.

---

### [x] STEP 6 — Port stakeholder scoring + regime + narrative (`stakeholders.ts`)
`scoreStakeholders()` — central bank, banks, corporates, government, investors (fed by `blendPortfolio`),
households. `classifyRegime()`, `flowNarrative()`, and the branching `mechanism()` narrative text —
translated from Indonesian to English to match this app's existing UI language convention (confirmed via
`JourneyPage.tsx`/`AchievementsPage.tsx`/`InvestmentLayout.tsx`, which are English despite the domain
being Indonesian finance).

> **Why:** A UI that mixes the reference's Indonesian copy with the rest of the app's English chrome would
> read as a tacked-on component, violating the "looks like the same person wrote it" success criterion.

---

### [x] STEP 7 — Historical presets and slider metadata (`presets.ts`)
`BASE`, `DRIVER_GROUPS` (4 groups, 19 sliders, each tagged `tier: 'primary' | 'advanced'` — 6 primary
across all 4 groups, 13 advanced), `PRESETS` (7 historical scenarios, labels translated, all numeric
values unchanged from the reference).

> **Why:** 19 sliders open at once is too many (explicit Fase 3 instruction) — tiering happens at the data
> level so the UI component stays a dumb renderer of the metadata.

---

### [x] STEP 8 — Composition root (`index.ts`)
`computeScenario(drivers, options)` wires solver → instruments → stakeholders → regime into one
`MacroScenarioResult`, taking optional `spendingWeights`/`portfolioWeights` for personalization.

> **Why:** Gives the UI layer one entry point instead of requiring every consumer to know the internal
> call order and data dependencies between the three sub-modules.

---

### [x] STEP 9 — Personalization mapping layer (`personalization.ts`)
- `mapPortfolioToWeights(holdings, assets)` — maps real `Holding`/`Asset` records to the model's
  instrument names via `AssetClass` (with an `metadata.macroClass` override escape hatch), excludes
  out-of-taxonomy classes explicitly (reported, not guessed into a bucket), falls back to
  `DEFAULT_PORTFOLIO_WEIGHTS` below 5% mapped coverage.
- `mapSpendingToWeights(drivers)` — maps trailing category spend to food/rent/fuel/core via keyword/regex
  matching against real category names (`Groceries`, `Food & Dining`, `Transportation`, rent-pattern
  regex), falls back to the model's default basket below 2 non-zero categories. Uses the existing 3-month
  trailing window from `/api/spending-analysis/variance`, honestly labeled as 3 months rather than
  building a new 12-month endpoint.
- `estimateLiabilityImpact(liabilities, baselineRate, scenarioRate)` — simple-interest approximation on
  principal, explicitly labeled as assuming floating-rate exposure.
- `estimateEmergencyFundRunway(fundNow, todayMonthlyCost, todayMonths, scenarioFeltInflation)` — recomputes
  runway using the scenario's felt inflation applied to today's cost of living.

> **Why:** This is the entire point of building this feature inside the personal finance app instead of
> just linking the reference artifact — "Ini inti nilai fiturnya" (Fase 2). Every mapping degrades to a
> labeled default instead of a silent guess, per the explicit instruction and per FIN-02/FIN-05.

---

### [x] STEP 10 — Scenario comparison (`comparison.ts`)
`compareScenarios()` reduces two `MacroScenarioResult`s (+ optional personalization figures) to inflation/
growth/unemployment/FX/portfolio-return/purchasing-power/portfolio-value/liability-payment/emergency-fund
deltas.

> **Why:** Fase 2.4 — answers "what does this mean for me" relative to a baseline, not just an absolute
> scenario in isolation.

---

### [x] STEP 11 — Domain module tests (`__tests__/`)
`solver.test.ts` — golden snapshots (BASE + 7 presets), a convergence/NaN sweep across every slider's
min/max one at a time, and the required sign tests: oil price hurts govScore when subsidy is high AND
raises headline inflation when subsidy is low (two distinct paths, verified as genuinely different
magnitudes); IDR weakness raises FX-asset real IDR return AND raises NPL when FX debt is high (driven
end-to-end via `dxy`); informal-sector share dampens unemployment's sensitivity to the output gap (with
the output gap itself held numerically identical across the comparison); a higher global real rate pushes
gold and crypto down together. `personalization.test.ts` — empty portfolio, single mapped asset,
out-of-taxonomy asset class exclusion, foreign-currency holding routing, spending-weight fallback/
derivation, liability impact, emergency fund runway.

**Result:** `npm run test:macro` → 26/26 passing on first run (8 snapshots written).

> **Why:** THINK-04 — tests are the way to catch a subtly-wrong port before it reaches a user as a
> plausible-looking wrong number. Running this *before* building the UI on top of the solver caught
> nothing wrong here, but validated the port was faithful before 2,000+ more lines were built on it.

---

### [x] STEP 12 — Backend: saved-scenario persistence
`MacroScenario` entity (mirrors `DeskMandateVersion`'s `RawJsonConverter` pattern for the jsonb
`drivers_json` column — PostgREST returns jsonb as native JSON, not a quoted string, so a plain `string`
property throws without the converter). Migration `20260902000001_macro_scenarios.sql` (permissive RLS
placeholder pending PF-S08, matching every other table in this app). `CreateMacroScenarioCommand`/Handler/
Validator (name required ≤100 chars, `DriversJson` must parse as JSON), `DeleteMacroScenarioCommand`/
Handler. `IMacroScenarioService`/`MacroScenarioService.GetAllAsync()`. `MacroScenariosController` —
injects the service (not a raw `Supabase.Client`) for the list endpoint, per backend.md's stated
Clean Architecture rule, rather than following `LiabilitiesController`'s existing direct-Supabase-in-
controller pattern for GETs.

> **Why:** Fase 2.5 ("skenario tersimpan... lewat lapisan persistensi yang sudah dipakai proyek") plus the
> discovery finding that Trading Desk mandates are backend-persisted, not localStorage — that's this
> project's established pattern once data is more than a UI preference. MediatR/FluentValidation
> auto-register via assembly scanning (confirmed in `Program.cs`), so only the service needed explicit DI.

---

### [x] STEP 13 — Backend tests
`CreateMacroScenarioCommandHandlerTests.cs` — validator-only tests (empty name, name too long, invalid
JSON, valid command), mirroring the `CreateAssetCommandHandlerTests.cs` reference pattern named in
backend.md (validator testing, no DB needed).

**Result:** 4/4 new tests passing; full suite 349 passed / 9 pre-existing skips / 0 failed.

> **Why:** TEST-01/TEST-02 governance rules — every public validator needs a test, named
> `MethodName_Condition_ExpectedResult`.

---

### [x] STEP 14 — Frontend: saved-scenario API client + types
`SavedMacroScenario` type, `macroScenarioApi.ts` (`getMacroScenarios`/`createMacroScenario`/
`deleteMacroScenario`), `useMacroLab.ts` hooks (`useSavedMacroScenarios`, `useSaveMacroScenario`,
`useDeleteMacroScenario`, plus `useMacroLabPersonalizationData` bundling holdings/assets/liabilities/
variance/buckets queries) — mirrors `useDeskState.ts`'s query-key-constant + mutation-invalidates-query
pattern exactly.

> **Why:** Matches the established API-client/hook-file split convention instead of fetching inline in the
> page component.

---

### [x] STEP 15 — Frontend UI components
`StatTile` (shared metric tile, tone-based left border), `DriverSlider`, `DriverConsole` (tiered sliders +
Collapsible advanced section + preset picker + saved-scenario save/load/delete), `DerivedOutcomePanel`
(visually marked as computed output, not input — left-accent border + "computed — not directly
adjustable" label), `CapitalFlowPanel` (flow bar + 8-component breakdown + FX-feedback callout),
`InstrumentRotationTable`, `StakeholderLedger` (6 rows + recharts winners/losers bar chart, theme-token
colors matching `ui/chart.tsx`'s `hsl(var(--chart-N))` convention), `PersonalImpactPanel` (portfolio
contribution breakdown, felt inflation with source badge, liability payment delta with floating-rate
caveat, emergency fund runway), `ScenarioComparisonPanel`, `MacroLabDisclaimer` (mirrors
`DeskDisclaimer.tsx`'s exact styling).

> **Why:** Fase 3 — input/output visual separation is a deliberate design decision ("user needs to
> understand unemployment is a consequence of the policy rate, not a separate dial"), and every primitive
> used (Card via `.pf-card`, Slider, Collapsible, Badge, Button, Input, recharts) already exists in this
> repo — zero new dependencies, zero hardcoded colors.

---

### [x] STEP 16 — Page composition + routing
`MacroLabPage.tsx` — drivers state, comparison-mode state (snapshots base drivers into `altDrivers` on
"Compare"), personalization data fetching, `useMemo`-computed `computeScenario()` calls, liability/
emergency-fund impact, save/delete handlers wired to `useToast` (matching the established
`@/hooks/use-toast` convention used everywhere else in this app, not `sonner`, despite `<Sonner />` also
being mounted in `App.tsx`). Registered `/lab` as a top-level route in `App.tsx` (mirroring `/desk`) and
added a "Lab" tab to `InvestmentLayout.tsx`'s `TABS` array pointing at it (mirroring the existing
Trading-Desk-tab-points-to-external-top-level-route precedent).

> **Why:** Cross-cutting features that read Investment + Assets + Cashflow data live better as their own
> top-level route than nested under any one module — exactly the precedent Trading Desk already set.

---

### [x] STEP 17 — Move the reference file
`git mv docs/ideas/simulator-makro-v3.jsx docs/reference/simulator-makro-v3.jsx`.

> **Why:** Explicit hard constraint #3 — the reference is a read-only spec, not a component to leave live
> in the tree once the port is complete.

---

### [x] STEP 18 — Full-stack verification
`tsc --noEmit` (0 errors) → `npm run lint` (0 errors in any new file; all 28 findings are pre-existing, in
files this task never touched) → `npm run build` (succeeds) → `npm run test:macro` (26/26) →
`npm run test:desk` (12/12, confirming no regression to the shared Vitest config) → `dotnet build` (0
errors) → `dotnet test` (349 passed / 9 pre-existing skips / 0 failed) → grep-based cross-file wiring
check (`IMacroScenarioService` has an implementation, a DI registration, and a controller consumer;
`MacroLabPage` is referenced from both `App.tsx`'s route table and `InvestmentLayout.tsx`'s tab array).

> **Why:** superpowers:verification-before-completion — evidence before claiming the feature works, not
> "should work."

---

## Notes

- **Not yet done, by design:** a true 12-month category-spend endpoint (Gap noted in STEP 9); a
  fixed-vs-floating rate column on `Liability` (Gap noted in STEP 12/Approach); full amortization-schedule
  liability math. All three are documented, labeled-fallback decisions, not oversights — revisit only if a
  future ticket specifically asks for tighter liability or inflation-weight precision.
- **Governance follow-up:** per `.claude/rules/finance-domain.md`'s routing table, this feature "ranks/
  projects money outcomes" (FIN-05) and should go through `/cio` and `/compliance` before it's considered
  ready to ship to real users, even though the build itself is complete and verified. The in-UI disclaimer
  (`MacroLabDisclaimer.tsx`) satisfies the disclosure requirement but not the review itself.
- **Auth note:** `MacroScenario.UserId` is `Guid.Empty` (same placeholder pattern as every other entity in
  this codebase pending PF-S08 Supabase Auth) — saved scenarios are effectively global, not per-user, until
  that lands.
- **Bundle size:** `npm run build` reports the main chunk exceeds Vite's 500 kB warning threshold — this is
  pre-existing (not caused by this feature) and out of scope for PF-140.
