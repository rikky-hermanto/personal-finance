import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Transaction } from '@/types/Transaction';
import { Search, Edit2, Loader2 } from 'lucide-react';
import * as transactionsApi from '@/api/transactionsApi';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import DataTable, { DataTableColumn, SortState } from '@/components/DataTable';

interface TransactionTableProps {
  onTransactionUpdate: (id: string, updates: Partial<Transaction>) => void;
  accountIdFilter?: string;
}

const mapApiToTransaction = (t: transactionsApi.TransactionDto): Transaction => ({
  id: t.id.toString(),
  date: t.date,
  description: t.description,
  flow: t.flow,
  amount: t.flow === 'CR' ? Number(t.amountIdr) : -Number(t.amountIdr),
  type: (t.type.toLowerCase() === 'income' ? 'income' :
         t.type.toLowerCase().includes('transfer') || t.type.toLowerCase().includes('trar') ? 'transfer' : 'expense') as 'income' | 'expense' | 'transfer',
  category: t.category,
  bank: t.accountName,
  accountId: t.accountId,
  balance: t.balance,
});

const formatDate = (ds: string) => {
  const format = localStorage.getItem('pf_date_format') || 'DD/MM/YYYY';
  const d = new Date(ds);
  if (format === 'MM/DD/YYYY') return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  if (format === 'YYYY-MM-DD') return d.toISOString().split('T')[0];
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

type ColKey = 'date' | 'description' | 'category' | 'account' | 'amount' | 'balance' | 'actions';

const COLUMNS: DataTableColumn<Transaction, ColKey>[] = [
  { key: 'date',        label: 'Date',         sortable: true, filterType: 'date', getDate: (tx) => tx.date },
  { key: 'description', label: 'Description',  sortable: false },
  { key: 'category',    label: 'Category',     sortable: false, getValue: (tx) => tx.category },
  { key: 'account',     label: 'Bank Account', sortable: false, getValue: (tx) => tx.bank },
  { key: 'amount',      label: 'Amount',       sortable: false },
  { key: 'balance',     label: 'Balance',      sortable: false },
  { key: 'actions',     label: '',             sortable: false },
];

const PAGE_SIZE = 50;

const TransactionTable = ({ onTransactionUpdate, accountIdFilter }: TransactionTableProps) => {
  // ── Server-side state ──────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal]               = useState(0);
  const [currentPage, setCurrentPage]   = useState(1);
  const [isLoading, setIsLoading]       = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore]           = useState(true);

  // ── Filter / sort state (changing these resets to page 1) ─────────────────
  const [searchTerm, setSearchTerm]     = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [sort, setSort]                 = useState<SortState<ColKey>>({ key: 'date', order: 'desc' });

  // ── Inline edit ───────────────────────────────────────────────────────────
  const [editingId, setEditingId]       = useState<string | null>(null);

  // ── Sentinel for server-side infinite scroll ──────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Derive API query params from current filter/sort state
  const query = useMemo<transactionsApi.TransactionQuery>(() => ({
    pageSize:  PAGE_SIZE,
    accountId: accountIdFilter || undefined,
    search:    searchTerm || undefined,
    category:  categoryFilter !== 'all' ? categoryFilter : undefined,
    type:      typeFilter    !== 'all' ? typeFilter    : undefined,
    sortOrder: sort.order,
  }), [accountIdFilter, searchTerm, categoryFilter, typeFilter, sort.order]);

  // ── Fetch page 1 whenever filters/sort change ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setCurrentPage(1);
    setHasMore(true);

    transactionsApi.getTransactionPage({ ...query, page: 1 })
      .then((data) => {
        if (cancelled) return;
        setTransactions(data.items.map(mapApiToTransaction));
        setTotal(data.total);
        setHasMore(data.items.length === PAGE_SIZE && data.total > PAGE_SIZE);
        setCurrentPage(1);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [query]);

  // ── Fetch next page ───────────────────────────────────────────────────────
  const fetchNextPage = useCallback(() => {
    if (isFetchingMore || !hasMore || isLoading) return;

    const nextPage = currentPage + 1;
    setIsFetchingMore(true);

    transactionsApi.getTransactionPage({ ...query, page: nextPage })
      .then((data) => {
        setTransactions((prev) => {
          const merged = [...prev, ...data.items.map(mapApiToTransaction)];
          setHasMore(merged.length < data.total);
          return merged;
        });
        setTotal(data.total);
        setCurrentPage(nextPage);
      })
      .catch(console.error)
      .finally(() => setIsFetchingMore(false));
  }, [isFetchingMore, hasMore, isLoading, currentPage, query]);

  // ── Intersection observer on sentinel ─────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchNextPage(); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextPage]);

  // ── Derive category list from loaded rows (good enough for dropdown) ──────
  const categories = useMemo(() =>
    Array.from(new Set(transactions.map((t) => t.category))).sort()
  , [transactions]);

  const handleSortChange = (key: ColKey) => {
    if (key !== 'date') return; // only date is server-sortable
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'desc' }
    );
  };

  const inputCls = 'bg-muted border border-border rounded text-foreground text-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring w-full';

  const toolbar = (
    <>
      <div className="relative flex-1 min-w-48">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Search transactions…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        className="px-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All Categories</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
        className="px-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All Types</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
    </>
  );

  // Footer shown below DataTable (outside DataTable's own footer slot)
  const footer = (
    <div className="flex items-center justify-center min-h-[40px]">
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </div>
      )}
      {isFetchingMore && !isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading more…
        </div>
      )}
      {!isLoading && !isFetchingMore && !hasMore && transactions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {transactions.length} of {total} transaction{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col">
      <DataTable
        columns={COLUMNS}
        rows={transactions}
        sort={sort}
        onSortChange={handleSortChange}
        toolbar={toolbar}
        emptyMessage={isLoading ? 'Loading transactions…' : 'No transactions found matching your criteria.'}
        renderRow={(tx) => (
          <tr key={tx.id} className="hover:bg-accent transition-colors">
            <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
              {formatDate(tx.date)}
            </td>
            <td className="px-5 py-3 text-xs text-foreground/80 max-w-xs truncate">
              {tx.description}
            </td>
            <td className="px-5 py-3 whitespace-nowrap">
              {editingId === tx.id ? (
                <select
                  value={tx.category}
                  autoFocus
                  onBlur={() => setEditingId(null)}
                  onChange={(e) => {
                    onTransactionUpdate(tx.id, { category: e.target.value });
                    setEditingId(null);
                  }}
                  className={inputCls}
                >
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                  {tx.category}
                </span>
              )}
            </td>
            <td className="px-5 py-3 whitespace-nowrap text-xs text-muted-foreground">
              {tx.bank}
            </td>
            <td className={cn(
              'px-5 py-3 whitespace-nowrap font-mono text-xs tabular-nums text-right',
              tx.flow === 'CR' ? 'text-income/80' : 'text-expense/80'
            )}>
              {(() => {
                const absVal = Math.abs(tx.amount);
                const formatted = formatCurrency(absVal).replace('Rp', '').trim();
                return tx.flow === 'CR' ? formatted : `(${formatted})`;
              })()}
            </td>
            <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums text-right">
              {tx.balance !== 0
                ? formatCurrency(tx.balance).replace('Rp', '').trim()
                : '—'}
            </td>
            <td className="px-5 py-3 whitespace-nowrap">
              <button
                onClick={() => setEditingId(tx.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </td>
          </tr>
        )}
      />
      {/* Sentinel div — triggers next page fetch when it enters the viewport */}
      <div ref={sentinelRef} className="h-1" />
      {/* Status footer */}
      <div className="px-5 py-3 border-t border-border bg-card rounded-b-lg">
        {footer}
      </div>
    </div>
  );
};

export default TransactionTable;
