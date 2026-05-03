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
│  [footer]          shrink-0 / FROZEN         │  ← spinner / "Showing all N rows"
└──────────────────────────────────────────────┘
```

---

## Props API

```ts
interface DataTableColumn<TRow, TKey extends string = string> {
  key:       TKey;
  label:     string;
  sortable?: boolean;          // clicking label calls onSortChange(key)
  getValue?: (row: TRow) => string | null | undefined;
                               // ← enables Excel-style value-filter checklist
  className?: string;          // extra <th> classes
}

interface SortState<TKey extends string = string> {
  key:   TKey;
  order: 'asc' | 'desc';
}

interface DataTableProps<TRow, TKey extends string = string> {
  columns:        DataTableColumn<TRow, TKey>[];
  rows:           TRow[];          // pre-filtered + pre-sorted by parent
  renderRow:      (row: TRow, index: number) => ReactNode;
  toolbar?:       ReactNode;       // frozen toolbar content
  emptyMessage?:  string;          // default "No data found."
  pageSize?:      number;          // default 50
  height?:        string;          // default "calc(100vh - 200px)"
  sort?:          SortState<TKey>; // controlled sort state
  onSortChange?:  (key: TKey) => void;
}
```

---

## Column Filter Menu (Excel-style)

When a column has **`getValue`** defined, hovering its header reveals a funnel icon (🔽).
Clicking it opens a portal-rendered dropdown with:

| Section | Behaviour |
|---------|-----------|
| **Sort Ascending / Descending** | Only shown when `sortable: true`. Calls `onSortChange`. Active direction is highlighted. |
| **Clear Filter** | Shown only when a value filter is active. Resets to show all. |
| **Search box** | Filters the value checklist client-side. |
| **Select All** | Checks / unchecks all visible values. Indeterminate when partial. |
| **Value checkboxes** | Unique string values from `rows`. DataTable maintains selection internally. |

- Active filters: funnel icon is always visible + filled blue. A **"Clear N column filters"** button appears in the toolbar.
- Column filters stack with the parent's global filters (`rows` is applied first, then column filters on top).

---

## Infinite Scroll

- First `pageSize` rows (default 50) render on mount.
- An `IntersectionObserver` watches a 2 px sentinel `<div>` at the bottom of the scroll container.
- When the sentinel enters the viewport, `displayCount` increments by `pageSize` (with a 150 ms delay for paint).
- `displayCount` resets to `pageSize` automatically when `filteredRows` reference changes.

---

## Sorting Convention

The parent owns sort state and logic. DataTable only renders the sort indicator.

```ts
// Standard sort handler pattern
const handleSortChange = (key: ColKey) => {
  setSort(prev =>
    prev.key === key
      ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
      : { key, order: 'desc' }   // default desc on new column
  );
};
```

Apply sort inside the parent's `useMemo` before passing `rows` to `<DataTable>`.

---

## Copy-Paste Starter

```tsx
import { useState, useMemo } from 'react';
import DataTable, { DataTableColumn, SortState } from '@/components/DataTable';
import { Search } from 'lucide-react';

type MyRow = { id: string; name: string; category: string; amount: number; date: string };
type ColKey = 'name' | 'category' | 'amount' | 'date';

const COLUMNS: DataTableColumn<MyRow, ColKey>[] = [
  { key: 'name',     label: 'Name',     sortable: false },
  { key: 'category', label: 'Category', sortable: false, getValue: r => r.category },
  { key: 'amount',   label: 'Amount',   sortable: true  },
  { key: 'date',     label: 'Date',     sortable: true  },
];

export default function MyPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<ColKey>>({ key: 'date', order: 'desc' });

  const rows = useMemo(() =>
    RAW_DATA
      .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const cmp = sort.key === 'date'
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : a.amount - b.amount;
        return sort.order === 'asc' ? cmp : -cmp;
      }),
    [search, sort]
  );

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      sort={sort}
      onSortChange={key =>
        setSort(prev =>
          prev.key === key
            ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
            : { key, order: 'desc' }
        )
      }
      toolbar={
        <div className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <input
            placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      }
      emptyMessage="No results found."
      renderRow={(row) => (
        <tr key={row.id} className="hover:bg-accent transition-colors">
          <td className="px-5 py-3 text-sm text-foreground">{row.name}</td>
          <td className="px-5 py-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {row.category}
            </span>
          </td>
          <td className="px-5 py-3 font-mono text-sm tabular-nums">{row.amount}</td>
          <td className="px-5 py-3 font-mono text-xs text-muted-foreground tabular-nums">{row.date}</td>
        </tr>
      )}
    />
  );
}
```

---

## Cell Styling Conventions

| Content type        | Classes                                                                                    |
|---------------------|--------------------------------------------------------------------------------------------|
| Date / timestamp    | `font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap`                   |
| Currency / number   | `font-mono text-sm tabular-nums whitespace-nowrap`                                         |
| Positive (credit)   | + `text-success`                                                                           |
| Negative (debit)    | + `text-destructive`                                                                       |
| Badge / tag         | `inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground` |
| Long text (truncate)| `text-sm text-foreground max-w-xs truncate`                                                |
| Muted secondary     | `text-xs text-muted-foreground`                                                            |
| Action button cell  | `whitespace-nowrap` + button: `text-muted-foreground hover:text-foreground transition-colors` |

---

## Key Rules

1. **DataTable owns layout, not data** — fetch, filter, and sort in the parent; pass the final array as `rows`.
2. **Sort externally** — `rows` must arrive pre-sorted. DataTable only renders the indicator.
3. **Column filters are internal** — DataTable manages its own value-filter state on top of `rows`.
4. **Always provide `getValue`** for enum-like columns (category, status, type, wallet) so users get the checklist.
5. **Don't add `getValue` to high-cardinality columns** (description, id, free-text) — too many checkboxes is unusable.
6. **Height** — default `calc(100vh - 200px)` fits the standard `p-8` page shell. Override per page as needed.
