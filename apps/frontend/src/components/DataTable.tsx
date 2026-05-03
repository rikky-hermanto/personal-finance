/**
 * DataTable — project-standard table component
 *
 * Layout (top → bottom, all inside a fixed-height card):
 *   ┌──────────────────────────────────┐
 *   │  [toolbar]  shrink-0 / frozen    │
 *   ├──────────────────────────────────┤
 *   │  <thead>  sticky top-0 / frozen  │
 *   │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
 *   │  <tbody>  overflow-auto / scroll │  ← infinite scroll loads rows here
 *   ├──────────────────────────────────┤
 *   │  [footer]  shrink-0 / frozen     │
 *   └──────────────────────────────────┘
 *
 * Usage:
 *   <DataTable
 *     columns={columns}
 *     rows={filteredRows}
 *     renderRow={(row) => <tr>…</tr>}
 *     toolbar={<>…search / filter elements…</>}
 *     emptyMessage="No items found."   // optional
 *     pageSize={50}                    // optional, default 50
 *     height="calc(100vh - 200px)"    // optional, default calc(100vh - 200px)
 *   />
 */

import { useEffect, useRef, useState, useMemo, useCallback, ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Column definition ────────────────────────────────────────────────────────

export interface DataTableColumn<TKey extends string = string> {
  key: TKey;
  label: string;
  /** If true, clicking the header calls onSortChange(key) */
  sortable?: boolean;
  /** Extra className(s) for the <th> */
  className?: string;
}

// ─── Sort state ───────────────────────────────────────────────────────────────

export interface SortState<TKey extends string = string> {
  key: TKey;
  order: 'asc' | 'desc';
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DataTableProps<TRow, TKey extends string = string> {
  /** Column definitions rendered in <thead> */
  columns: DataTableColumn<TKey>[];
  /** Full filtered/sorted row array — DataTable handles slicing for infinite scroll */
  rows: TRow[];
  /** Render one <tr> (or null to skip) for a given row */
  renderRow: (row: TRow, index: number) => ReactNode;
  /** Optional toolbar content (search inputs, filter dropdowns, etc.) */
  toolbar?: ReactNode;
  /** Message shown when rows.length === 0. Default: "No data found." */
  emptyMessage?: string;
  /** Number of rows per infinite-scroll batch. Default: 50 */
  pageSize?: number;
  /** CSS height of the whole card. Default: "calc(100vh - 200px)" */
  height?: string;
  /** Controlled sort state (for external sort logic) */
  sort?: SortState<TKey>;
  /** Called when user clicks a sortable column header */
  onSortChange?: (key: TKey) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

function DataTable<TRow, TKey extends string = string>({
  columns,
  rows,
  renderRow,
  toolbar,
  emptyMessage = 'No data found.',
  pageSize = 50,
  height = 'calc(100vh - 200px)',
  sort,
  onSortChange,
}: DataTableProps<TRow, TKey>) {
  const [displayCount, setDisplayCount] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset to first page whenever the source rows change (filter / sort)
  useEffect(() => {
    setDisplayCount(pageSize);
  }, [rows, pageSize]);

  const visibleRows = useMemo(() => rows.slice(0, displayCount), [rows, displayCount]);
  const hasMore = displayCount < rows.length;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount((c) => Math.min(c + pageSize, rows.length));
      setIsLoadingMore(false);
    }, 150);
  }, [isLoadingMore, hasMore, pageSize, rows.length]);

  // Intersection Observer — fires when the sentinel enters the scroll viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div
      className="bg-card rounded-lg border border-border flex flex-col overflow-hidden"
      style={{ height }}
    >
      {/* ── Frozen toolbar ─────────────────────────────────────────────────── */}
      {toolbar && (
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3 shrink-0">
          {toolbar}
        </div>
      )}

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full">

          {/* Sticky header */}
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-card">
              {columns.map(({ key, label, sortable, className }) => (
                <th
                  key={key}
                  onClick={sortable && onSortChange ? () => onSortChange(key) : undefined}
                  className={cn(
                    'px-5 py-3 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-card',
                    sortable && onSortChange && 'cursor-pointer hover:text-foreground select-none',
                    className,
                  )}
                >
                  {label}
                  {sortable && sort?.key === key && (
                    <ChevronDown
                      className={cn('w-3 h-3 inline ml-1 transition-transform', sort.order === 'asc' && 'rotate-180')}
                      strokeWidth={1.5}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body rows */}
          <tbody className="divide-y divide-border">
            {visibleRows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>

        {/* Sentinel — must be inside the scroll container */}
        <div ref={sentinelRef} className="h-2" />

        {rows.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>

      {/* ── Frozen footer ──────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-center min-h-[44px]">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading more…
          </div>
        )}
        {!isLoadingMore && !hasMore && rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing all {rows.length} row{rows.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export default DataTable;
