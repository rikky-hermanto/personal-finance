# Handoff: Big Purchases (PF-154)

## Overview
UX for **Big Purchases**, the first consumer of the shared Goal model from `plans/backlog/PF-154-big-purchases-goal-model-todo.md`. It lives in the main sidebar under **Growth** (L3) at `/big-purchases`, with tabs **Plans** and **Achieved**. Users plan land/house, vehicle, education, wedding and other purchases, record contributions/withdrawals, and see a **Foundation check** (Defense gate) before committing.

The PF-154 plan is the source of truth for data model, formulas (formulas.md §9), gate rules, copy and acceptance criteria. This bundle is the source of truth for **layout, visual treatment and interaction**.

## About the Design Files
Files in `prototype/` are **design references built in HTML/React (Babel in-browser)**. They show intended look and behaviour; they are not production code. Recreate them in the real codebase (existing React + Tailwind + shadcn-style tokens) using its routing, data layer, form and dialog components. Open `prototype/Big Purchases Prototype.html` in a browser; the app opens on the last route, navigate to Growth → Big Purchases.

Relevant prototype files:
- `pf-bigpurchases.jsx`: the whole feature (page, cards, drawer, forms).
- `pf-goals-model.js`: §9 goal math, foundation gate, empty-state guidance and copy. Mirrors PF-154; use it to check numbers, not as the implementation. There is **no seed data**: the prototype starts empty, as a new user sees it (Tweaks → "Clear all goals" returns to that state).
- `pf-shell.jsx` / `pf-main.jsx`: shell; nav entry and route wiring only.
- Other files are the existing app shell for context.

## Fidelity
**High fidelity.** Match layout, spacing, type and colour. Use the codebase's existing tokens (values below are those tokens).

## Design principles (non-negotiable)
- Zen, compact, focused. **No table rules / divider lines** anywhere. Separate with whitespace, soft fills (`foreground/[0.025–0.06]`) and cards.
- Desktop first: container `max-w-7xl mx-auto`, page padding `p-8` (at least as wide as the Cashflow overview `max-w-6xl`).
- Layouts must reflow using container-relative grids (`repeat(auto-fill/auto-fit, minmax(...))`), never viewport breakpoints for card grids. No text overflow or overlap; big numbers `whitespace-nowrap`.
- Neutral icons. Colour is reserved for goal identity (progress bars) and status (success / warning).

## Screens / Views

### 1. Big Purchases · Plans (`/big-purchases/plans`)
Shell tab header already shows the title "Big Purchases" and tabs; the page does **not** render its own h1.

**Header row** (`flex items-center justify-between gap-4 flex-wrap mb-6`)
- Left: `text-sm text-muted-foreground`: "Save for land, a car, a degree or a wedding without touching your cushion."
- Right: secondary button "Record contribution" (`h-9 px-4 rounded-xl text-xs font-medium bg-foreground/[0.04] hover:bg-foreground/[0.07]`, disabled when no active goals) and primary "+ New goal" (`h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium`, Plus icon 14).

**Top row**: `grid grid-cols-12 gap-4 mb-8`.

Card base (used everywhere): `rounded-2xl bg-card border border-border/60 p-5`, shadow `0 1px 2px rgb(0 0 0/.03), 0 8px 24px -12px rgb(0 0 0/.06)`. Card title row: `text-[15px] font-medium` + optional right meta `text-[11px] text-muted-foreground`; row is `flex-wrap`.

**a) Monthly plan card** (`col-span-12 lg:col-span-7`, `flex flex-col`)
- Title "Monthly plan"; right meta "Today's prices · no returns assumed".
- Hero block (`flex-1 flex flex-col justify-center pt-2 pb-14`): vertically balanced in remaining space.
  - Number: `font-data` (Plus Jakarta Sans, tabular) `text-[44px] leading-none tracking-tight whitespace-nowrap`, e.g. **"Rp 12,3 jt"** followed by `<span text-lg text-muted-foreground> / month</span>`. Value = Σ `monthly_required` of active, dated, scheduled goals.
  - Subtext `text-sm text-muted-foreground mt-3`: "keeps {n} dated goals on time." If any active goal is overdue, append in `text-warning`: " {Goal name(s)} is/are past due by {Σ remaining}."
- Goal bar (bottom): one row `flex h-2.5 gap-1`. One segment per **active + paused** goal (sorted priority asc, then target date asc, undated last). Segment `flex-grow = effective target`, `rounded-full`, track = goal colour at 20% (`color-mix(in oklch, C 20%, transparent)`), fill width = `percent` in solid goal colour. Tooltip: "{name} · {allocated} of {target}".
- Legend under bar: `mt-3 flex flex-wrap gap-x-4 gap-y-1.5`; each = 6px dot in goal colour + name, `text-[11px] text-muted-foreground`. Nothing else (no amounts, no explanation line).

**b) Foundation check card** (`col-span-12 lg:col-span-5`)
- Title "Foundation check"; right: gate label (dot + text, `text-[11px]`): Clear → "Foundation checked" (success), Not recommended yet → warning, Not evaluated → "Not checked yet" (muted).
- Body copy (`text-[13px] text-foreground/75 leading-relaxed`): gate copy per PF-154 (cover months vs 2.1, debt % vs 29.6%, stale savings, missing debts). Never use "you can't / blocked / denied".
- Three check rows (`rounded-xl px-3 py-2.5 bg-foreground/[0.025]`, gap 4px): 24px icon chip (Check = success/10 bg, X = warning/10, Minus = muted) · label + "Bar: …" (`text-[11px]`) · value right in `font-data`.
  - Spending: "68% of income", bar "at most 89%"
  - Cushion after goal money: "1.6 months", bar "at least 2.1 months" (or "Balance out of date")
  - Debt payments: "8.2% of take-home", bar "at most 29.6%" (or "Debts not recorded")
- Footnote `text-[11px]`: "Rp X in savings is set aside for goals, so it isn't counted as cushion." (only if earmarked > 0)

**Goals section**
- Header: "Goals · {count}" (`text-[15px] font-medium`, count muted) · right "Sorted by priority, then date" (`text-[11px]`).
- Grid: `grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4`.
- **Goal card** (card base, clickable → drawer, `hover:border-foreground/15`; paused = `opacity-70`):
  - Row: 40px icon tile `rounded-xl bg-foreground/[0.04]`, lucide icon 18 / stroke 1.5 `text-foreground/70` (house_land House, vehicle Car, education GraduationCap, wedding Gem, other Package). Name `text-[15px] font-medium truncate`; meta `text-[11px] muted` "{Category} · by {Mon YYYY}" or "· no date". Priority chip right `text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.05]` "P1–P4" (title = priority label).
  - Amount row `mt-5 flex items-baseline justify-between flex-wrap`: allocated `font-data text-2xl` ("Rp 38 jt"), "of Rp 85 jt" `text-xs muted`.
  - Progress `mt-2.5 h-2 rounded-full`, track goal colour 20%, fill solid goal colour.
  - Next step `text-[13px] text-foreground/80` (overdue → `text-warning`; paused → "Paused"). Strings per §9: "Rp 4.700.000 a month until Sep 2027", "Set a target date", "Target date passed, Rp X still to go", "Rp X needed by D Mon YYYY", "Fully funded (Rp X over)".
  - Footer: per-goal gate label (left) · ghost "+ Add" (`h-7 px-2.5 text-[11px]`) opens contribution form preset to this goal (click must not open drawer).
- Trailing tile: dashed `border-dashed border-border rounded-2xl min-h-[200px]`, plus tile + "New big purchase".
- Footer disclaimer `mt-10 text-[11px] text-muted-foreground/80`: "A personal planning tool, not financial advice. Numbers come from what you entered."

**Empty state (no active or paused goals)**: guidance instead of sample data. Nothing here is saved, counted in a total or computed; it disappears as soon as one goal exists.
- Header row keeps the intro line but hides both buttons (a disabled "Record contribution" is noise when there is nothing to record).
- Top row: the Monthly plan card is replaced by a **"How Big Purchases works"** card (same slot and card base). Right meta "Your monthly plan shows here once you add a goal". Three numbered rows styled like the Foundation check rows (`rounded-xl px-3 py-2.5 bg-foreground/[0.025]`, 24px number chip `bg-foreground/[0.06] font-data`), title `text-[13px] font-medium`, body `text-[12px] muted`:
  1. "Name it and price it": "Enter the cash you need. For a house or a car you can break the cost down; a loan is borrowed, so it is not cash you save."
  2. "Pick a month": "You'll see what to set aside each month to get there, at today's prices."
  3. "Record what you set aside": "Add money as you save. The Foundation check tells you whether your cushion is ready before you commit."
  Then the primary button "+ Plan your first big purchase". The **Foundation check card stays** in its slot unchanged, so the first thing a new user learns is whether their foundation is ready.
- Goals section header becomes "Start with a goal" · right "The example shows what a goal looks like; it isn't saved".
- Grid holds two tiles:
  - **Example card**: same anatomy as a goal card, but a dashed border with no fill or shadow, content at `opacity-80`, not clickable. It shows the Car icon, "Family car", "Vehicle · in 24 months", an "Example" chip where the priority chip goes, "Rp 0" "of Rp 200 jt", an empty track in goal colour 0, and "Rp 8.333.334 a month for 24 months". The footnote `text-[11px] muted` reads "Each goal shows what you've set aside, the target, and the monthly amount that gets you there. This example isn't saved." Every value is fixed copy, never computed, and no date is shown, so the example never goes stale.
  - **Starter tile**: dashed, `min-h-[200px] p-5`, with a Plus tile, "Start a goal" and "What are you saving for?". Below are five rows, one per category (icon 14 · label · hint `text-[11px] muted truncate`: "A plot, a house or an apartment", "A car or a motorbike", "A degree, a course or school fees", "The ceremony and the reception", "Travel, a pilgrimage, anything big"). Each row opens the Create goal modal with that category preselected.

### 2. Big Purchases · Achieved (`/big-purchases/achieved`)
Same page, no header actions or top row. Grid of goal cards for status achieved/cancelled; footer shows "Achieved D Mon YYYY" or "Cancelled", no gate/Add. Empty: "Goals you mark achieved or cancel land here."

### 3. Goal detail drawer (slide-over right)
- Overlay `fixed inset-0 z-30 bg-foreground/[0.06]`; panel `max-w-[520px] h-full bg-card shadow-2xl`, enter animation 300ms `cubic-bezier(.16,1,.3,1)` (translateY 10px + fade). Esc / overlay click closes.
- Top: back arrow · meta "{Category} · P{n} {priority label}".
- Name `text-xl font-semibold`; status line if not active.
- Big allocated `font-data text-3xl` + "of {effective}"; bar h-1.5; "{pct}% set aside" · "Target D Mon YYYY".
- Next-step panel (`rounded-2xl bg-foreground/[0.035] px-4 py-3.5`): next step `text-[15px] font-medium`; assumption line ("Straight line at today's prices… No investment returns assumed."); pace line "At your pace of Rp X a month (last 3 months), around Mon YYYY." (hidden if not computable); ≥60 months & no growth hint.
- "Foundation for this goal": gate label + copy, incl. post-purchase DTI line when `planned_monthly_instalment` is set ("…would be about 31.1% of your current take-home income. The Defense bar is 29.6%." + "Estimate at your current take-home income, not a loan eligibility check.").
- Cost breakdown (house_land / vehicle with costs): rows label · amount; loan principal muted with "· borrowed, not saved"; "Cash you need" (excludes loan) bold; "Full cost including loan" muted. Vehicle: BBNKB/PKB hint.
- Contributions list: date · held-in/note · signed amount (withdrawals `text-expense`), trash on hover. "+ Record" link.
- Sticky footer: primary "Record contribution", ghost "Edit", ⋯ menu: Pause/Resume, Mark achieved, Back to plans, Cancel goal, Delete (destructive).

### 4. Create / Edit goal (modal, `max-w-[520px]`)
- Category chips (`h-9 px-3 rounded-xl`, selected = `bg-foreground text-background`).
- Name (placeholder per category). Fields: `h-10 rounded-xl bg-foreground/[0.04]`, focus `bg-foreground/[0.06]`, no borders. Money input prefixed "Rp", formatted id-ID as you type.
- house_land/vehicle: segmented "One amount | Break down the cost". Breakdown rows: type select · label · amount · ×; "+ Add a cost"; regional tax hint; "Cash you need Rp X · full cost Rp Y". Target = cash needed (loan principal excluded).
- Target date (month picker, saved as last day of month; must be ≥ this month on create), Priority segmented P1–P4 with label hint.
- "More options" disclosure: Price growth (%/yr, "your assumption"), Planned instalment (Rp/month), Notes.
- Footer: live preview of next step (e.g. "Rp 3.973.685 a month until Jun 2028"), Cancel, "Create goal"/"Save" (disabled until name + amount > 0 + valid date).

### 5. Record contribution (modal, `max-w-[420px]`)
- Title switches with segmented "Add | Withdraw".
- Goal select (only when opened from header), Amount (autofocus), Date (≤ today), Held in (accounts, optional), Note.
- Savings account selected → hint "Money in a savings account set aside for goals won't count toward your emergency cushion."
- Withdraw > allocated → inline warning "Only Rp X is set aside for this goal." and Save disabled.
- Footer preview "Becomes Rp X · Y%". Toast on save ("Contribution recorded" / "Withdrawal recorded").

## Goal colour identity
Each goal gets a stable colour from its creation order (persist an index or derive from created_at order, never from current sort):
`oklch(0.6 0.1 H)` with H cycling `[155, 250, 300, 30, 200, 340, 95, 60]` (green, blue, violet, terracotta, teal, pink, olive, ochre). Track = same colour 20% via `color-mix(in oklch, C 20%, transparent)`. Used **only** for: Monthly plan bar + legend dots, goal card progress bar, drawer bar. Icons stay neutral.

## State
- goals[] (Goal + costs + contributions per PF-154 schema), foundation snapshot (cover, DTI, staleness), UI: openGoalId, form (new | goal), contribution (goal | pick).
- Derived per goal (§9): allocated, effective_target, remaining, surplus, percent (floor 1 dp), months_left, monthly_required (ceil), timeline (funded/no_date/overdue/due_soon/scheduled), pace.
- Page aggregate: Σ monthly_required (scheduled only), overdue Σ remaining, earmarked in savings.

## Design tokens (existing app, light)
- background `hsl(42 17% 94%)`, card `#fff`, foreground `hsl(35 9% 19%)`, muted-foreground `hsl(0 0% 42%)`, border `hsl(39 18% 88%)`, primary = foreground.
- success `hsl(170 90% 32%)`, warning `hsl(35 91% 50%)`, expense `hsl(354 70% 54%)`.
- Fonts: UI Inter; numbers `font-data` = Plus Jakarta Sans, tabular-nums.
- Radius: cards 16px (`rounded-2xl`), inputs/buttons 12px, chips 6px.
- Type scale used: 44 hero · 30/24 numbers · 15 titles · 13 body · 11–12 meta · 10 chips.
- Money format: full `Rp 4.700.000` (id-ID) in sentences/forms; short `Rp 12,3 jt` / `Rp 1,2 M` in headline numbers.

## Assets
Lucide icons only. No images.

## Out of scope for the prototype (follow PF-154)
API, migrations, persistence, auth, telemetry and exact gate inputs. The prototype fakes foundation states via Tweaks (Amber / Green / Grey).
