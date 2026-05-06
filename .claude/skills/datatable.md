# DataTable Standard — Personal Finance Frontend

> **Read this before building any table in this project.**
> All data tables MUST use `apps/frontend/src/components/DataTable.tsx`.

---

## Layout Contract

```
┌──────────────────────────────────────────────┐  ← bg-card, flex-col, height prop
│  [toolbar]         shrink-0 / FROZEN         │  ← search, global filters, action btns
├──────────────────────────────────────────────┤
│  <thead>           sticky top-0 / FROZEN     │  ← column headers + ▼ filter icon per col
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  <tbody>           overflow-auto flex-1      │  ← infinite scroll; sentinel at bottom
├──────────────────────────────────────────────┤
│  [footer]          shrink-0 / FROZEN         │  ← status area + optional action footer
└──────────────────────────────────────────────┘
```

---

## Cell Styling Conventions (High-Fidelity)

Adhere to these styles for a consistent, premium look:

| Content type        | Classes / Style                                                                            |
|---------------------|--------------------------------------------------------------------------------------------|
| **Description**     | `text-xs font-mono text-foreground/70 max-w-xs truncate block`                             |
| **Date / Time**     | `font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap`                   |
| **Amount (Base)**   | `font-mono text-xs tabular-nums text-right whitespace-nowrap`                              |
| **Income (+)**      | + `text-income/80` (emerald)                                                               |
| **Expense (-)**     | + `text-expense/80` (red)                                                                  |
| **Currency Val**    | Remove "Rp", use parentheses for negative: `(1.234.567)` instead of `-1.234.567`           |
| **Badge / Tag**     | `inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground` |
| **Muted Info**      | `text-[10px] text-muted-foreground uppercase tracking-widest`                              |
| **Action Btn**      | `text-muted-foreground hover:text-foreground transition-colors p-1`                        |

---

## Props API

```ts
interface DataTableColumn<TRow, TKey extends string = string> {
  key:       TKey;
  label:     string;
  sortable?: boolean;          // cycles sort via onSortChange(key)
  getValue?: (row: TRow) => string | null | undefined; // enables Excel checklist
  filterType?: 'date';         // enables date range filter
  getDate?: (row: TRow) => string | null | undefined; // required for date filter
  className?: string;          // extra <th> classes
}

interface DataTableProps<TRow, TKey extends string = string> {
  columns:        DataTableColumn<TRow, TKey>[];
  rows:           TRow[];          // pre-filtered + pre-sorted by parent
  renderRow:      (row: TRow, index: number) => ReactNode;
  toolbar?:       ReactNode;       // frozen top toolbar
  footer?:        ReactNode;       // frozen bottom action area
  emptyMessage?:  string;
  pageSize?:      number;          // default 50
  height?:        string;          // default "calc(100vh - 200px)"
  sort?:          SortState<TKey>;
  onSortChange?:  (key: TKey) => void;
}
```

---

## Column Filter Menu (Excel-style)

When a column has **`getValue`** or **`filterType: 'date'`** defined, hovering its header reveals an icon.
Clicking it opens a portal-rendered dropdown with:

- **Sort Asc/Desc**: Highlights active sort.
- **Clear Filter**: Resets the column filter.
- **Search box**: Filters the checklist (for `getValue`).
- **Date Range**: Precise date filtering (for `filterType: 'date'`).

Active filters make the icon always visible and blue. A **"Clear N column filters"** button appears in the toolbar.

---

## Copy-Paste Starter

```tsx
import { useState, useMemo } from 'react';
import DataTable, { DataTableColumn, SortState } from '@/components/DataTable';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Search, Edit2 } from 'lucide-react';

type MyRow = { id: string; description: string; category: string; amount: number; date: string; flow: 'CR' | 'DB' };
type ColKey = 'date' | 'description' | 'category' | 'amount' | 'actions';

const COLUMNS: DataTableColumn<MyRow, ColKey>[] = [
  { key: 'date',        label: 'Date',        sortable: true, filterType: 'date', getDate: r => r.date },
  { key: 'description', label: 'Description', sortable: false },
  { key: 'category',    label: 'Category',    getValue: r => r.category },
  { key: 'amount',      label: 'Amount',      className: 'text-right' },
  { key: 'actions',     label: '',            className: 'w-12' },
];

const formatValue = (val: number, flow: 'CR' | 'DB') => {
  const absVal = Math.abs(val);
  const formatted = formatCurrency(absVal).replace('Rp', '').trim();
  return flow === 'CR' ? formatted : `(${formatted})`;
};

export default function MyPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<ColKey>>({ key: 'date', order: 'desc' });

  const rows = useMemo(() =>
    RAW_DATA
      .filter(r => r.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => { /* ... sort logic ... */ return 0; }),
    [search, sort]
  );

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      sort={sort}
      onSortChange={key => setSort(prev => ({ key, order: prev.order === 'asc' ? 'desc' : 'asc' }))}
      toolbar={
        <div className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <input
            placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      }
      renderRow={(row) => (
        <tr key={row.id} className="hover:bg-accent transition-colors">
          <td className="px-5 py-3 font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
          </td>
          <td className="px-5 py-3 text-xs font-mono text-foreground/70 max-w-xs truncate block">
            {row.description}
          </td>
          <td className="px-5 py-3 whitespace-nowrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {row.category}
            </span>
          </td>
          <td className={cn(
            "px-5 py-3 font-mono text-xs tabular-nums text-right whitespace-nowrap",
            row.flow === 'CR' ? 'text-income/80' : 'text-expense/80'
          )}>
            {formatValue(row.amount, row.flow)}
          </td>
          <td className="px-5 py-3">
            <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </td>
        </tr>
      )}
    />
  );
}
```

---

## Key Rules

1. **Parent owns Data** — Fetch, search, and server-side sort in the parent. Pass final `rows`.
2. **Infinite Scroll is Internal** — DataTable slices `rows` for performance and handles the sentinel.
3. **Column Filters are additive** — They apply client-side on top of the parent's `rows`.
4. **Use `font-mono` for all data** — Descriptions, IDs, Dates, and Amounts should all use monospace for alignment.
5. **Negative values** — Always wrap in parentheses `()` instead of using a minus sign for financial tables.
6. **Height** — Ensure the `height` prop allows the table to take up available space while keeping headers sticky.
