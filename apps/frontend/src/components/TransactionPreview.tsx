import { useState, useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { Edit2, Check, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import * as transactionsApi from '@/api/transactionsApi';

interface TransactionPreviewProps {
  transactions: Transaction[];
  onConfirm: (transactions: Transaction[]) => void;
  onBack: () => void;
}

const CORE_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Travel',
  'Education',
  'Groceries',
  'Gas & Fuel',
  'Income',
  'Transfer',
  'Investment',
  'Insurance',
  'Other'
];

const formatDate = (ds: string) =>
  new Date(ds).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const TransactionPreview = ({ transactions, onConfirm, onBack }: TransactionPreviewProps) => {
  const [editedTransactions, setEditedTransactions] = useState<Transaction[]>(transactions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleCategoryChange = (transactionId: string, newCategory: string) => {
    setEditedTransactions(prev =>
      prev.map(t => t.id === transactionId ? { ...t, category: newCategory } : t)
    );
    setEditingId(null);
  };

  const summary = useMemo(() => {
    const income = editedTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = editedTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, balance: income - expenses, totalTransactions: editedTransactions.length };
  }, [editedTransactions]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      const payload: transactionsApi.TransactionDto[] = editedTransactions.map(t => ({
        id: 0,
        date: t.date,
        description: t.description,
        remarks: "",
        flow: t.flow,
        type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
        category: t.category,
        wallet: t.bank,
        amountIdr: Math.abs(t.amount),
        currency: "IDR",
        exchangeRate: null,
        balance: 0,
        categoryRuleDto: null
      }));
      await transactionsApi.submitTransactions(payload);
      onConfirm(editedTransactions);
    } catch (error: any) {
      let message = "Failed to submit transactions";
      try {
        if (error?.response && typeof error.response.json === 'function') {
          const data = await error.response.json();
          if (data?.Message) message = message + (data.Detail ? `: ${data.Detail}` : "");
        } else if (error instanceof Error && error.message) {
          try {
            const data = JSON.parse(error.message);
            if (data?.Message) message = message + (data.Detail ? `: ${data.Detail}` : "");
          } catch {
            message = error.message;
          }
        }
      } catch { /* fallback */ }
      setApiError(message);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectCls = 'bg-muted border border-border rounded text-foreground text-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring w-44';

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Review the parsed transactions below. Categories have been automatically assigned.
          You can edit any category before submitting.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-foreground">{summary.totalTransactions}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Income</p>
          <p className="text-2xl font-bold text-success">+{formatCurrency(summary.income)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Expenses</p>
          <p className="text-2xl font-bold text-destructive">-{formatCurrency(summary.expenses)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Net Balance</p>
          <p className={cn('text-2xl font-bold', summary.balance >= 0 ? 'text-success' : 'text-destructive')}>
            {summary.balance >= 0 ? '+' : ''}{formatCurrency(summary.balance)}
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Date', 'Description', 'Category', 'Amount', 'Bank', ''].map((label) => (
                  <th
                    key={label}
                    className="px-5 py-3 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {editedTransactions.map((tx) => (
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
                        onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                        className={selectCls}
                      >
                        {CORE_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                        {tx.category}
                      </span>
                    )}
                  </td>
                  <td className={cn(
                    'px-5 py-3 whitespace-nowrap font-mono text-sm tabular-nums',
                    tx.flow === 'CR' ? 'text-success' : 'text-destructive'
                  )}>
                    {tx.flow === 'CR' ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {tx.bank}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {editingId === tx.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-success hover:text-success/80 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingId(tx.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editedTransactions.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No transactions to review.</p>
          </div>
        )}
      </div>

      {/* Error */}
      {apiError && (
        <div className="mb-4 p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {apiError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded text-sm font-medium bg-muted border border-border text-foreground hover:bg-accent transition-colors"
        >
          Back to Files
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 rounded text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
          {isSubmitting ? 'Submitting…' : `Submit Data (${editedTransactions.length} transactions)`}
        </button>
      </div>
    </div>
  );
};

export default TransactionPreview;
