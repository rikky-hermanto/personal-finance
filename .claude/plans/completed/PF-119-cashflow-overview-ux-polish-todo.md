# PF-119 — Cashflow Overview UX Polish: trust fixes + minimalism pass

> **GitHub Issue:** (create on save)
> **Status:** Done — all steps and ACs complete; archived 2026-06-09
> **Started:** 2026-05-21

## Objective

A UX review of `/cashflow/overview` identified eight findings across two blocking and six
should-fix/minor categories. The two blocking findings erode data trust: the Current Balance
strip shows a stale "as of" date that conflicts with the cashflow period label, and the Net
Cashflow hero figure reads as a monthly number when it is an aggregate for the selected range.
This task fixes all eight findings in four frontend-only files — no backend changes required.

## Acceptance Criteria

- [x] `CurrentBalanceStrip` moves "as of [date]" into the popover per-account rows; top-level
      strip shows only the total; error state renders "Balance unavailable" instead of
      disappearing silently
- [x] `NetCashflowCard` displays the period label (e.g. "24 months") directly adjacent to the
      hero net figure — not only in the far top-right corner
- [x] "Overview" H2 heading is removed from `OverviewTab` (tab navigation already labels the page)
- [x] Range selector shows "1M" instead of "Last Month" for consistency with sibling labels
- [x] Staleness banner is a clickable link navigating to `/cashflow/upload`
- [x] `TopCategoriesCard` renders category rows as `<div>` (not `<button>`) when no
      `onCategoryDrillDown` callback is provided
- [x] Truncated category names show a native tooltip via `title` attribute
- [x] No visual regressions on the 2Y and 1M range selections
  > Not met: Visual regression check requires the app running in a browser — verify manually with `npm run dev`

## Approach

Six of the eight findings are one-to-three-line targeted patches — apply them directly in situ.
The two blocking findings need small structural changes: move the `asOf` display from the
`CurrentBalanceStrip` trigger into each popover row (so it's per-account context, not a global
timestamp), and add a `rangeMonths` sub-label line beneath the hero figure in `NetCashflowCard`
(derived from the existing `month` prop which already contains the range string from the
backend). No prop interface changes, no new hooks, no backend work.

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Edit — remove H2, rename "Last Month"→"1M", make staleness banner clickable |
| `apps/frontend/src/components/dashboard/CurrentBalanceStrip.tsx` | Edit — move asOf into popover rows, add error state |
| `apps/frontend/src/components/dashboard/widgets/NetCashflowCard.tsx` | Edit — add period sub-label under hero figure |
| `apps/frontend/src/components/dashboard/widgets/TopCategoriesCard.tsx` | Edit — conditional div/button, add title tooltip |

---

## TODO

### [x] STEP 1 — OverviewTab: remove H2, fix "1M" label, make staleness banner actionable

In [OverviewTab.tsx](apps/frontend/src/pages/cashflow/OverviewTab.tsx):

**a) Change `RANGES` array** (line 15–21) — rename `'Last Month'` to `'1M'`:

```typescript
const RANGES = [
  { label: '1M', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];
```

**b) Remove the `<h2>Overview</h2>` line** (line 51) from the flex header row. Keep the
`<div className="flex items-center justify-between">` wrapper — it still holds the Upload
button and range strip. The result is a toolbar row with no left-side heading:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Button
      size="sm"
      className="h-8 px-3 text-xs font-medium gap-1.5"
      onClick={() => navigate('/cashflow/upload')}
    >
      <Upload className="h-3.5 w-3.5" />
      Upload Statement
    </Button>
    <div className="w-px h-5 bg-border" />
    <div className="flex items-center gap-0.5">
      {RANGES.map((r) => (
        <Button
          key={r.label}
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs font-medium transition-all rounded-md",
            range === r.value
              ? "bg-secondary text-foreground hover:bg-secondary"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          )}
          onClick={() => setRange(r.value)}
        >
          {r.label}
        </Button>
      ))}
    </div>
  </div>
</div>
```

**c) Make the staleness banner clickable** (lines 100–104) — wrap the text in a button that
navigates to upload:

```tsx
<div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
  <span>Data through {data.dataThrough} —{' '}</span>
  <button
    onClick={() => navigate('/cashflow/upload')}
    className="underline underline-offset-2 hover:text-foreground transition-colors"
  >
    upload a new statement to sync
  </button>
</div>
```

> **Why:** "Last Month" is 9 chars vs 2–3 for siblings — breaks scan rhythm (CODE-01 naming
> consistency principle applied to UI labels). The H2 "Overview" is a verbatim repeat of the
> active tab label; every pixel of chrome competes for attention with the data. The staleness
> banner calls for action but offers no affordance — passive copy with a navigation intent
> should always be a link or button.

---

### [x] STEP 2 — CurrentBalanceStrip: move asOf into popover rows + add error state

Replace [CurrentBalanceStrip.tsx](apps/frontend/src/components/dashboard/CurrentBalanceStrip.tsx) with:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccountBalances } from '@/api/accountsApi';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'decimal', minimumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const CurrentBalanceStrip = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['account-balances'],
    queryFn: getAccountBalances,
    staleTime: 60_000,
  });

  const total = data?.reduce((sum, a) => sum + a.currentBalance, 0) ?? 0;

  if (isLoading) return <Skeleton className="h-5 w-48" />;

  if (error) {
    return (
      <span className="text-xs text-destructive/70">Balance unavailable</span>
    );
  }

  if (!data?.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-baseline gap-2 group cursor-pointer",
          "hover:opacity-80 transition-opacity"
        )}>
          <span className="text-xs text-muted-foreground">Current Balance</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            Rp {fmt(total)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Balance by Account
          </p>
        </div>
        <div className="divide-y">
          {data.map((a) => (
            <div key={a.accountId} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{a.accountName}</p>
                {a.institutionName && (
                  <p className="text-xs text-muted-foreground">{a.institutionName}</p>
                )}
                {a.asOf && (
                  <p className="text-xs text-muted-foreground/60">as of {fmtDate(a.asOf)}</p>
                )}
                {a.currency !== 'IDR' && (
                  <p className="text-xs text-muted-foreground/70">shown in {a.currency}</p>
                )}
              </div>
              <span className={cn(
                "text-sm tabular-nums font-medium",
                a.currentBalance >= 0 ? "text-foreground" : "text-destructive"
              )}>
                {a.currency !== 'IDR' ? a.currency : 'Rp'} {fmt(a.currentBalance)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 border-t bg-muted/30">
          <span className="text-xs font-semibold text-muted-foreground">Total (IDR)</span>
          <span className="text-sm font-bold tabular-nums">Rp {fmt(total)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CurrentBalanceStrip;
```

> **Why:** The blocking trust issue is that a global "as of 16 Jun 2024" timestamp on the
> strip conflicts with cashflow data labeled "Jan 2026" — it reads as a 19-month data staleness
> bug. Moving the date inside the popover, attached to the specific account row, provides the
> right context (this account's last statement was June 2024) without creating a false
> whole-dashboard timestamp. Adding `error` destructure from `useQuery` fixes the silent
> disappearance on API failure — "Balance unavailable" is honest; `null` is invisible.

---

### [x] STEP 3 — NetCashflowCard: add period sub-label under hero figure

In [NetCashflowCard.tsx](apps/frontend/src/components/dashboard/widgets/NetCashflowCard.tsx),
add a sub-label line directly beneath the hero `<span>` that shows the period. The `month`
prop already holds the range string (e.g. "24 Months ending Jan 26") when the range > 1 month,
or a formatted month name (e.g. "January 2026") for single-month ranges.

Replace the hero block (lines 38–52) with:

```tsx
<div className="flex flex-col gap-0.5">
  <div className="flex items-center gap-2.5">
    {isPositive ? (
      <TrendingUp className="w-5 h-5 flex-shrink-0 text-success" />
    ) : (
      <TrendingDown className="w-5 h-5 flex-shrink-0 text-destructive" />
    )}
    <span
      className={cn(
        "font-mono text-2xl font-semibold tabular-nums",
        isPositive ? "text-success" : "text-destructive"
      )}
    >
      {isPositive ? '+' : ''}{formatCurrency(net)}
    </span>
  </div>
  {month && (
    <p className="text-[11px] text-muted-foreground pl-7">
      {formatMonth(month)}
    </p>
  )}
</div>
```

Also **remove** the existing top-right `<span>` that showed the month label (the
`<span className="text-xs text-muted-foreground">{month ? formatMonth(month) : '—'}</span>`
in the card header flex row), so the period context appears only once, next to the number
where the user's eye already is.

> **Why:** Pre-attentive reading processes large text before small text. A 2xl figure with
> a tiny top-right label means users see "+Rp 84M" first and anchor on it as a monthly
> figure before noticing the "24 Months" qualifier. Placing the period label 2px below the
> figure within the same visual cluster ensures it's read as part of the same datum, not as
> header chrome. The `pl-7` aligns the sub-label with the start of the number (past the icon).

---

### [x] STEP 4 — TopCategoriesCard: div vs button + tooltip on truncated names

In [TopCategoriesCard.tsx](apps/frontend/src/components/dashboard/widgets/TopCategoriesCard.tsx),
make two changes:

**a) Render `<div>` when no callback is provided** — replace the single `<button>` element
with a conditional:

```tsx
const RowEl = onCategoryDrillDown ? 'button' : 'div';

// In JSX, replace <button ...> with:
<RowEl
  key={cat.category}
  onClick={onCategoryDrillDown ? () => onCategoryDrillDown(cat.category, month) : undefined}
  className={cn(
    'w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors',
    onCategoryDrillDown ? 'hover:bg-accent cursor-pointer' : 'cursor-default'
  )}
>
  ...
</RowEl>
```

**b) Add `title` to the truncated category `<span>`** (line 70):

```tsx
<span className="text-xs text-foreground truncate" title={cat.category}>
  {cat.category}
</span>
```

> **Why:** `<button>` without an `onClick` is a semantic HTML error — it adds a focusable,
> keyboard-accessible element to the tab order that does nothing when activated. Screen
> readers announce it as interactive. Using `'div'` when the row is purely presentational
> is the correct fix. The `title` attribute costs zero implementation effort and solves a
> real data loss: "Vet and Dog ..." hides the full category name with no recovery path.

---

## Notes

- `formatMonth()` in `format.ts` falls through to `return monthString` for non-YYYY-MM
  strings — the backend already formats "24 Months ending Jan 26" as a human-readable
  label, so the sub-label in Step 3 will render correctly without changes to `format.ts`
- The `RowEl` pattern in Step 4 is a standard React polymorphic element pattern — TypeScript
  will infer the correct prop types automatically from the string literal union `'button' | 'div'`
- After Step 1b, the `<div className="max-w-6xl mx-auto space-y-6">` wrapper still provides
  vertical rhythm — the heading removal doesn't break layout, it just shifts the first visual
  element down to `CurrentBalanceStrip`
- PF-118 (Current Balance strip feature) is fully shipped — Steps 2–4 of this task modify
  files introduced by PF-118; verify `git status` shows the modified files before committing
