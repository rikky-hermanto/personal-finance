import { useState, useMemo, useEffect } from 'react';
import { Transaction } from '@/types/Transaction';
import { Search, Edit2 } from 'lucide-react';
import * as transactionsApi from '@/api/transactionsApi';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import DataTable, { DataTableColumn, SortState } from '@/components/DataTable';

interface TransactionTableProps {
  onTransactionUpdate: (id: string, updates: Partial<Transaction>) => void;
}

const mapApiTransactionToTransaction = (t: transactionsApi.TransactionDto): Transaction => ({
  id: t.id.toString(),
  date: t.date,
  description: t.description,
  flow: t.flow,
  amount: t.flow === 'CR' ? Number(t.amountIdr) : -Number(t.amountIdr),
  type: t.type.toLowerCase() as 'income' | 'expense',
  category: t.category,
  bank: t.wallet,
  balance: t.balance,
});

const formatDate = (ds: string) =>
  new Date(ds).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

type ColKey = 'date' | 'description' | 'category' | 'wallet' | 'amount' | 'balance' | 'actions';

const COLUMNS: DataTableColumn<Transaction, ColKey>[] = [
  { key: 'date',        label: 'Date',        sortable: true, filterType: 'date', getDate: (tx) => tx.date },
  { key: 'description', label: 'Description', sortable: false },
  { key: 'category',    label: 'Category',    sortable: false, getValue: (tx) => tx.category },
  { key: 'wallet',      label: 'Wallet',      sortable: false, getValue: (tx) => tx.bank },
  { key: 'amount',      label: 'Amount',      sortable: true  },
  { key: 'balance',     label: 'Balance',     sortable: false },
  { key: 'actions',     label: '',            sortable: false },
];

const TransactionTable = ({ onTransactionUpdate }: TransactionTableProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState<SortState<ColKey>>({ key: 'date', order: 'desc' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    transactionsApi.getTransactions()
      .then((data) => setTransactions(data.map(mapApiTransactionToTransaction)))
      .catch(console.error);
  }, []);

  const categories = useMemo(() =>
    Array.from(new Set(transactions.map((t) => t.category))).sort()
  , [transactions]);

  const filtered = useMemo(() => {
    const rows = transactions.filter((tx) => {
      const matchesSearch =
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || tx.category === categoryFilter;
      const matchesType = typeFilter === 'all' || tx.type === typeFilter;
      return matchesSearch && matchesCategory && matchesType;
    });

    return rows.sort((a, b) => {
      const cmp =
        sort.key === 'date'
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : Math.abs(a.amount) - Math.abs(b.amount);
      return sort.order === 'asc' ? cmp : -cmp;
    });
  }, [transactions, searchTerm, categoryFilter, typeFilter, sort]);

  const handleSortChange = (key: ColKey) => {
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

  return (
    <DataTable
      columns={COLUMNS}
      rows={filtered}
      sort={sort}
      onSortChange={handleSortChange}
      toolbar={toolbar}
      emptyMessage="No transactions found matching your criteria."
      renderRow={(tx) => (
        <tr key={tx.id} className="hover:bg-accent transition-colors">
          <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
            {formatDate(tx.date)}
          </td>
          <td className="px-5 py-3 text-sm text-foreground max-w-xs truncate">
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
            'px-5 py-3 whitespace-nowrap font-mono text-sm tabular-nums',
            tx.flow === 'CR' ? 'text-success' : 'text-destructive'
          )}>
            {tx.flow === 'CR' ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}
          </td>
          <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
            {tx.balance != null ? formatCurrency(tx.balance) : '—'}
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
  );
};

export default TransactionTable;
