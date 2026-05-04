import { useState, useMemo, useLayoutEffect, useRef } from 'react';
import { Transaction } from '@/types/Transaction';
import { Edit2, Check, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import * as transactionsApi from '@/api/transactionsApi';
import DataTable, { DataTableColumn } from '@/components/DataTable';

interface TransactionPreviewProps {
  transactions: Transaction[];
  onConfirm: (transactions: Transaction[]) => void;
  onBack: () => void;
  fileHash?: string | null;
  fileName?: string | null;
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

const formatDate = (ds: string) => {
  const format = localStorage.getItem('pf_date_format') || 'DD/MM/YYYY';
  const d = new Date(ds);
  if (format === 'MM/DD/YYYY') return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  if (format === 'YYYY-MM-DD') return d.toISOString().split('T')[0];
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Auto-scaling text component to prevent overflow in cards
 */
const AutoScalingText = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number>(24); // Start at 24px (text-2xl)

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    let currentSize = 24;
    text.style.fontSize = `${currentSize}px`;

    // Scale down if text is wider than container
    while (text.offsetWidth > container.offsetWidth && currentSize > 12) {
      currentSize -= 1;
      text.style.fontSize = `${currentSize}px`;
    }
    setFontSize(currentSize);
  }, [children]);

  return (
    <div ref={containerRef} className={cn("w-full overflow-hidden", className)}>
      <span 
        ref={textRef} 
        className="font-bold whitespace-nowrap transition-[font-size] duration-200"
        style={{ fontSize: `${fontSize}px` }}
      >
        {children}
      </span>
    </div>
  );
};

const TransactionPreview = ({ transactions, onConfirm, onBack, fileHash, fileName }: TransactionPreviewProps) => {
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

  const newTransactions = useMemo(() => editedTransactions.filter(t => !t.isDuplicate), [editedTransactions]);
  const duplicateTransactions = useMemo(() => editedTransactions.filter(t => t.isDuplicate), [editedTransactions]);

  const summary = useMemo(() => {
    const income = newTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = newTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Net Balance = sum of real income + sum of real expenses.
    return { 
      income, 
      expenses, 
      balance: income + expenses, 
      totalTransactions: newTransactions.length 
    };
  }, [newTransactions]);

  const handleSubmit = async () => {
    if (newTransactions.length === 0) {
      setApiError("No new transactions to submit.");
      return;
    }

    setIsSubmitting(true);
    setApiError(null);
    try {
      const payload: transactionsApi.TransactionDto[] = newTransactions.map(t => ({
        id: 0,
        date: t.date,
        description: t.description,
        remarks: "",
        flow: t.flow!,
        type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
        category: t.category,
        wallet: t.bank,
        amountIdr: Math.abs(t.amount),
        currency: "IDR",
        exchangeRate: null,
        balance: 0,
        isDuplicate: false,
        categoryRuleDto: null
      }));
      await transactionsApi.submitTransactions(payload, fileHash || undefined, fileName || undefined);
      onConfirm(newTransactions);
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

  const selectCls = 'bg-muted border border-border rounded text-foreground text-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring w-full';

  const columns: DataTableColumn<Transaction>[] = [
    { key: 'date', label: 'Date', className: 'w-32' },
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Category', className: 'w-48', getValue: (tx) => tx.category },
    { key: 'amount', label: 'Amount', className: 'w-32' },
    { key: 'bank', label: 'Bank', className: 'w-32', getValue: (tx) => tx.bank },
    { key: 'actions', label: '', className: 'w-16' },
  ];

  const renderRow = (tx: Transaction) => (
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
        {!tx.isDuplicate && (
          editingId === tx.id ? (
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
          )
        )}
      </td>
    </tr>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <p className="text-sm text-muted-foreground">
          Review the parsed transactions below. <strong>{newTransactions.length}</strong> new transactions will be imported.
          Duplicate transactions are shown for verification.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 shrink-0">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">New Transactions</p>
          <p className="text-2xl font-bold text-foreground">{summary.totalTransactions}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 text-success">New Income</p>
          <AutoScalingText className="text-success">
            +{formatCurrency(summary.income)}
          </AutoScalingText>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 text-destructive">New Expenses</p>
          <AutoScalingText className="text-destructive">
            -{formatCurrency(Math.abs(summary.expenses))}
          </AutoScalingText>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Net Balance (New)</p>
          <AutoScalingText className={summary.balance >= 0 ? 'text-success' : 'text-destructive'}>
            {summary.balance >= 0 ? '+' : ''}{formatCurrency(summary.balance)}
          </AutoScalingText>
        </div>
      </div>

      {/* Transactions Tables */}
      <div className="flex-1 min-h-0 mb-6 overflow-y-auto space-y-12 pr-2 custom-scrollbar">
        {/* Group 1: New Data & Actions */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                Ready to Save ({newTransactions.length})
              </h3>
            </div>
            <div className="border border-border rounded-lg overflow-hidden bg-card/50">
              <DataTable
                columns={columns}
                rows={newTransactions}
                height="auto"
                emptyMessage="No new transactions found."
                renderRow={renderRow}
              />
            </div>
          </div>

          {/* Error */}
          {apiError && (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {apiError}
            </div>
          )}

          {/* Actions - Now directly under the first table */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded text-sm font-medium bg-muted border border-border text-foreground hover:bg-accent transition-colors"
            >
              Back to Files
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || newTransactions.length === 0}
              className="px-4 py-2 rounded text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
              {isSubmitting ? 'Submitting…' : `Submit (${newTransactions.length} new)`}
            </button>
          </div>
        </div>

        {/* Group 2: Duplicate Transactions (Subtle Text Grid) */}
        {duplicateTransactions.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-muted-foreground/40 flex items-center gap-2 uppercase tracking-[0.2em]">
                Duplicates (Already in DB: {duplicateTransactions.length})
              </h3>
            </div>
            
            <div className="space-y-1.5 px-5">
              {duplicateTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="grid grid-cols-[8rem_1fr_12rem_8rem_8rem] gap-4 items-center opacity-60 hover:opacity-100 transition-opacity"
                >
                  <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatDate(tx.date)}
                  </div>
                  <div className="text-[11px] text-foreground/80 truncate">
                    {tx.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 italic">
                    {tx.category}
                  </div>
                  <div className={cn(
                    'font-mono text-[11px] tabular-nums text-right pr-4',
                    tx.flow === 'CR' ? 'text-success/70' : 'text-destructive/70'
                  )}>
                    {tx.flow === 'CR' ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 text-right">
                    {tx.bank}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionPreview;
