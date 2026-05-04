/**
 * DataTable — project-standard table component
 *
 * Features:
 *  - Frozen toolbar (search / global filters)
 *  - Sticky <thead> with Excel-style per-column menus:
 *      · sortable columns  → sort asc / desc
 *      · getValue columns  → value checklist filter
 *      · filterType:'date' → date filter (exact, before, after, range)
 *  - Infinite-scroll <tbody>
 *  - Frozen footer (count / spinner)
 */

import {
  useEffect, useRef, useState, useMemo, useCallback,
  ReactNode, CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, ArrowUp, ArrowDown, Filter, X, Search, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Date filter — one of four mutually-exclusive modes */
export type DateFilterMode = 'exact' | 'before' | 'after' | 'range';

export interface DateFilter {
  mode: DateFilterMode;
  /** ISO date string (YYYY-MM-DD) — used for exact / before / after */
  date?: string;
  /** ISO date strings for range mode */
  from?: string;
  to?: string;
}

export interface DataTableColumn<TRow, TKey extends string = string> {
  key: TKey;
  label: string;
  /** Clicking the label cycles sort asc/desc via onSortChange */
  sortable?: boolean;
  /**
   * Provide this to enable the Excel-style value-filter checklist for this column.
   * Should return the human-readable string for the cell (used to build the list).
   */
  getValue?: (row: TRow) => string | null | undefined;
  /**
   * Set to 'date' to enable the date-range filter menu instead of the value checklist.
   * The column's raw value must be parseable by `new Date()`.
   */
  filterType?: 'date';
  /** Raw ISO date string accessor — required when filterType === 'date' */
  getDate?: (row: TRow) => string | null | undefined;
  className?: string;
}

export interface SortState<TKey extends string = string> {
  key: TKey;
  order: 'asc' | 'desc';
}

export interface DataTableProps<TRow, TKey extends string = string> {
  columns: DataTableColumn<TRow, TKey>[];
  /** Pre-filtered + pre-sorted rows from the parent. DataTable only slices for infinite scroll + applies column-value / date filters on top. */
  rows: TRow[];
  renderRow: (row: TRow, index: number) => ReactNode;
  toolbar?: ReactNode;
  emptyMessage?: string;
  pageSize?: number;
  height?: string;
  sort?: SortState<TKey>;
  onSortChange?: (key: TKey) => void;
  footer?: ReactNode;
}

// ─── Date filter panel ────────────────────────────────────────────────────────

const DATE_MODE_LABELS: { mode: DateFilterMode; label: string }[] = [
  { mode: 'exact', label: 'Exact date' },
  { mode: 'before', label: 'Before' },
  { mode: 'after', label: 'After' },
  { mode: 'range', label: 'Date range' },
];

interface DateFilterPanelProps {
  value: DateFilter | null;
  onChange: (f: DateFilter | null) => void;
  onClose: () => void;
}

function DateFilterPanel({ value, onChange, onClose }: DateFilterPanelProps) {
  const [mode, setMode] = useState<DateFilterMode>(value?.mode ?? 'exact');
  const [date, setDate] = useState(value?.date ?? '');
  const [from, setFrom] = useState(value?.from ?? '');
  const [to, setTo] = useState(value?.to ?? '');

  const inputCls =
    'w-full px-2 py-1 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring text-foreground';

  const apply = () => {
    if (mode === 'range') {
      if (!from && !to) { onChange(null); onClose(); return; }
      onChange({ mode, from: from || undefined, to: to || undefined });
    } else {
      if (!date) { onChange(null); onClose(); return; }
      onChange({ mode, date });
    }
    onClose();
  };

  const clear = () => { onChange(null); onClose(); };

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Mode tabs */}
      <div className="grid grid-cols-2 gap-1">
        {DATE_MODE_LABELS.map(({ mode: m, label }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-2 py-1 text-[11px] rounded border transition-colors',
              mode === m
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      {mode === 'range' ? (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {mode === 'exact' ? 'Date' : mode === 'before' ? 'Before' : 'After'}
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={clear}
          className="flex-1 px-2 py-1 text-xs bg-muted border border-border rounded hover:bg-accent transition-colors text-muted-foreground"
        >
          Clear
        </button>
        <button
          onClick={apply}
          className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ─── Column menu (portal) ─────────────────────────────────────────────────────

interface ColMenuProps<TRow, TKey extends string> {
  column: DataTableColumn<TRow, TKey>;
  anchorRect: DOMRect;
  allValues: string[];
  selected: Set<string>;
  dateFilter: DateFilter | null;
  sort?: SortState<TKey>;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilterChange: (next: Set<string>) => void;
  onDateFilterChange: (f: DateFilter | null) => void;
  onClear: () => void;
  onClose: () => void;
}

function ColMenu<TRow, TKey extends string>({
  column, anchorRect, allValues, selected,
  dateFilter, sort, onSortAsc, onSortDesc,
  onFilterChange, onDateFilterChange, onClear, onClose,
}: ColMenuProps<TRow, TKey>) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => allValues.filter(v => v.toLowerCase().includes(search.toLowerCase())),
    [allValues, search],
  );

  const allChecked = visible.length > 0 && visible.every(v => selected.has(v));
  const someChecked = visible.some(v => selected.has(v));
  const isValueFiltered = selected.size > 0;
  const isDateFiltered = dateFilter !== null;
  const isFiltered = isValueFiltered || isDateFiltered;
  const isSortedAsc = sort?.key === column.key && sort.order === 'asc';
  const isSortedDesc = sort?.key === column.key && sort.order === 'desc';

  const isDateMode = column.filterType === 'date';
  const hasValueFilter = !!column.getValue;

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Flip to left-align if near right edge
  const viewW = window.innerWidth;
  const menuW = 240;
  const left = anchorRect.left + menuW > viewW ? anchorRect.right - menuW : anchorRect.left;

  const style: CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left,
    width: menuW,
    zIndex: 9999,
  };

  const toggle = (val: string) => {
    const next = new Set(selected);
    next.has(val) ? next.delete(val) : next.add(val);
    onFilterChange(next);
  };

  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) visible.forEach(v => next.delete(v));
    else visible.forEach(v => next.add(v));
    onFilterChange(next);
  };

  return createPortal(
    <div ref={ref} style={style}
      className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden text-foreground">

      {/* ── Sort ── */}
      {column.sortable && (
        <>
          <button onClick={() => { onSortAsc(); onClose(); }}
            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors',
              isSortedAsc && 'text-primary font-medium')}>
            <ArrowUp className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
            Sort Ascending
          </button>
          <button onClick={() => { onSortDesc(); onClose(); }}
            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors',
              isSortedDesc && 'text-primary font-medium')}>
            <ArrowDown className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
            Sort Descending
          </button>
          {(hasValueFilter || isDateMode || isFiltered) && <div className="border-t border-border my-0.5" />}
        </>
      )}

      {/* ── Clear active filter ── */}
      {isFiltered && (
        <>
          <button onClick={() => { onClear(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors">
            <X className="w-3.5 h-3.5 shrink-0" />
            Clear Filter
          </button>
          <div className="border-t border-border my-0.5" />
        </>
      )}

      {/* ── Date filter panel ── */}
      {isDateMode && (
        <>
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <Calendar className="w-3 h-3" />
            Date Filter
          </div>
          <DateFilterPanel
            value={dateFilter}
            onChange={onDateFilterChange}
            onClose={onClose}
          />
        </>
      )}

      {/* ── Value checklist ── */}
      {hasValueFilter && (
        <>
          {/* Search */}
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus type="text" placeholder="Search…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto border-t border-border">
            {/* Select All */}
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer text-sm font-medium border-b border-border">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                onChange={toggleAll} className="accent-primary w-3 h-3" />
              (Select All)
            </label>
            {visible.map(val => (
              <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer text-sm">
                <input type="checkbox" checked={selected.has(val)}
                  onChange={() => toggle(val)} className="accent-primary w-3 h-3" />
                {val || <span className="text-muted-foreground italic">(blank)</span>}
              </label>
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No values found</p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-3 py-2 flex gap-2 justify-end">
            <button onClick={onClose}
              className="px-3 py-1 text-xs bg-muted rounded hover:bg-accent transition-colors">
              Close
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns true if `rowDate` passes the `DateFilter` */
function matchesDateFilter(rawDate: string | null | undefined, f: DateFilter): boolean {
  if (!rawDate) return false;
  const d = new Date(rawDate);
  d.setHours(0, 0, 0, 0);

  if (f.mode === 'exact' && f.date) {
    const target = new Date(f.date);
    target.setHours(0, 0, 0, 0);
    return d.getTime() === target.getTime();
  }
  if (f.mode === 'before' && f.date) {
    const target = new Date(f.date);
    target.setHours(0, 0, 0, 0);
    return d < target;
  }
  if (f.mode === 'after' && f.date) {
    const target = new Date(f.date);
    target.setHours(0, 0, 0, 0);
    return d > target;
  }
  if (f.mode === 'range') {
    const from = f.from ? new Date(f.from) : null;
    const to   = f.to   ? new Date(f.to)   : null;
    if (from) { from.setHours(0, 0, 0, 0); if (d < from) return false; }
    if (to)   { to.setHours(23, 59, 59, 999); if (d > to) return false; }
    return true;
  }
  return true;
}

// ─── DataTable ────────────────────────────────────────────────────────────────

function DataTable<TRow, TKey extends string = string>({
  columns, rows, renderRow, toolbar,
  emptyMessage = 'No data found.',
  pageSize = 50,
  height = 'calc(100vh - 200px)',
  sort, onSortChange,
  footer,
}: DataTableProps<TRow, TKey>) {

  // ── Infinite scroll ───────────────────────────────────────────────────────
  const [displayCount, setDisplayCount] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Column value filters ──────────────────────────────────────────────────
  // key → Set of selected values (empty Set = show all)
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  // key → DateFilter | null
  const [colDateFilters, setColDateFilters] = useState<Record<string, DateFilter | null>>({});
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  // Unique values per column derived from the parent's rows
  const uniqueValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    columns.forEach(col => {
      if (!col.getValue) return;
      result[col.key] = Array.from(
        new Set(rows.map(r => col.getValue!(r) ?? '').filter(Boolean))
      ).sort();
    });
    return result;
  }, [rows, columns]);

  // Apply column filters on top of parent rows
  const filteredRows = useMemo(() =>
    rows.filter(row =>
      columns.every(col => {
        // value checklist filter
        const sel = colFilters[col.key];
        if (sel && sel.size > 0 && col.getValue) {
          if (!sel.has(col.getValue(row) ?? '')) return false;
        }
        // date filter
        const df = colDateFilters[col.key];
        if (df && col.getDate) {
          if (!matchesDateFilter(col.getDate(row), df)) return false;
        }
        return true;
      })
    ), [rows, colFilters, colDateFilters, columns]);

  // Reset page when source changes
  useEffect(() => { setDisplayCount(pageSize); }, [filteredRows, pageSize]);

  const visibleRows = useMemo(() => filteredRows.slice(0, displayCount), [filteredRows, displayCount]);
  const hasMore = displayCount < filteredRows.length;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(c => Math.min(c + pageSize, filteredRows.length));
      setIsLoadingMore(false);
    }, 150);
  }, [isLoadingMore, hasMore, pageSize, filteredRows.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // ── Menu helpers ──────────────────────────────────────────────────────────
  const openMenu = (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (openMenuKey === key) { setOpenMenuKey(null); return; }
    setMenuRect(e.currentTarget.getBoundingClientRect());
    setOpenMenuKey(key);
  };
  const closeMenu = useCallback(() => setOpenMenuKey(null), []);

  const clearColFilter = (key: string) => {
    setColFilters(prev => ({ ...prev, [key]: new Set() }));
    setColDateFilters(prev => ({ ...prev, [key]: null }));
  };

  const activeFilterCount =
    Object.values(colFilters).filter(s => s.size > 0).length +
    Object.values(colDateFilters).filter(Boolean).length;

  const clearAllFilters = () => {
    setColFilters({});
    setColDateFilters({});
  };

  const openCol = columns.find(c => c.key === openMenuKey);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card rounded-lg border border-border flex flex-col overflow-hidden" style={{ height }}>

      {/* ── Frozen toolbar ── */}
      {(toolbar || activeFilterCount > 0) && (
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3 shrink-0">
          {toolbar}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap">
              <X className="w-3 h-3" />
              Clear {activeFilterCount} column filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-card">
              {columns.map(col => {
                const isValueFiltered = (colFilters[col.key]?.size ?? 0) > 0;
                const isDateFiltered = !!colDateFilters[col.key];
                const isFiltered = isValueFiltered || isDateFiltered;
                const hasMenu = col.sortable || !!col.getValue || col.filterType === 'date';
                return (
                  <th key={col.key}
                    className={cn(
                      'px-5 py-3 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-card',
                      col.className,
                    )}>
                    <div className="flex items-center gap-1 group">
                      {/* Sortable label */}
                      <span
                        onClick={col.sortable && onSortChange ? () => onSortChange(col.key) : undefined}
                        className={cn(col.sortable && onSortChange && 'cursor-pointer hover:text-foreground select-none')}>
                        {col.label}
                        {col.sortable && sort?.key === col.key && (
                          <ChevronDown
                            className={cn('w-3 h-3 inline ml-1 transition-transform', sort.order === 'asc' && 'rotate-180')}
                            strokeWidth={1.5} />
                        )}
                      </span>

                      {/* Column menu button */}
                      {hasMenu && (
                        <button
                          onClick={e => openMenu(col.key, e)}
                          className={cn(
                            'ml-auto p-0.5 rounded transition-colors',
                            'opacity-0 group-hover:opacity-100 focus:opacity-100',
                            (isFiltered || openMenuKey === col.key) && '!opacity-100',
                            isFiltered ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                          )}
                          title="Column options">
                          {col.filterType === 'date'
                            ? <Calendar className={cn('w-3 h-3', isFiltered && 'fill-primary/20')} strokeWidth={1.5} />
                            : <Filter className={cn('w-3 h-3', isFiltered && 'fill-primary/20')} strokeWidth={1.5} />
                          }
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {visibleRows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>

        {/* Sentinel */}
        <div ref={sentinelRef} className="h-2" />

        {filteredRows.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>

      {/* ── Frozen footer ── */}
      {(isLoadingMore || (!hasMore && filteredRows.length > 0) || footer) && (
        <div className="border-t border-border bg-card shrink-0">
          {/* Status area (loading or end-of-list) */}
          {(isLoadingMore || (!hasMore && filteredRows.length > 0)) && (
            <div className="px-5 py-2 flex items-center justify-center min-h-[32px]">
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-muted-foreground/60 text-[10px] uppercase tracking-widest font-medium animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                  Loading more
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium">
                  All {filteredRows.length} records loaded
                </p>
              )}
            </div>
          )}

          {/* Separator line if both status and footer exist */}
          {(isLoadingMore || (!hasMore && filteredRows.length > 0)) && footer && (
            <div className="px-10">
              <div className="h-px bg-border/50" />
            </div>
          )}

          {/* Action footer */}
          {footer && (
            <div className="px-5 py-3">
              <div className="w-full">
                {footer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Column menu portal ── */}
      {openMenuKey && openCol && menuRect && (
        <ColMenu
          column={openCol}
          anchorRect={menuRect}
          allValues={uniqueValues[openMenuKey] ?? []}
          selected={colFilters[openMenuKey] ?? new Set()}
          dateFilter={colDateFilters[openMenuKey] ?? null}
          sort={sort}
          onSortAsc={() => {
            if (sort?.key !== openMenuKey || sort.order !== 'asc') onSortChange?.(openMenuKey as TKey);
          }}
          onSortDesc={() => {
            if (sort?.key !== openMenuKey || sort.order !== 'desc') onSortChange?.(openMenuKey as TKey);
          }}
          onFilterChange={next =>
            setColFilters(prev => ({ ...prev, [openMenuKey]: next }))
          }
          onDateFilterChange={f =>
            setColDateFilters(prev => ({ ...prev, [openMenuKey]: f }))
          }
          onClear={() => clearColFilter(openMenuKey)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

export default DataTable;
