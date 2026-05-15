import { useState, useMemo, useLayoutEffect, useRef } from 'react';
import { Transaction } from '@/types/Transaction';
import { Edit2, Check, Send, Hash, TrendingUp, TrendingDown, Wallet, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import * as transactionsApi from '@/api/transactionsApi';
import DataTable, { DataTableColumn } from '@/components/DataTable';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command';
import { extractKeyword } from '@/utils/keywordExtractor';

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
        className="font-bold whitespace-nowrap transition-[font-size] duration-200 tabular-nums"
        style={{ fontSize: `${fontSize}px` }}
      >
        {children}
      </span>
    </div>
  );
};

interface CategoryComboboxProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

const CategoryCombobox = ({ value, options, onChange }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;
  const canCreate = query.trim() !== '' && !options.some(o => o.toLowerCase() === query.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-between w-full text-xs bg-muted border border-border rounded px-2 py-1 text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-1 focus:ring-ring">
          <span className="truncate">{value}</span>
          <ChevronsUpDown className="w-3 h-3 ml-1 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-44" align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create…"
            value={query}
            onValueChange={setQuery}
            className="h-7 text-xs"
          />
          <CommandList className="max-h-52">
            {filtered.map(c => (
              <CommandItem
                key={c}
                value={c}
                onSelect={() => { onChange(c); setOpen(false); setQuery(''); }}
                className={cn("text-xs cursor-pointer", c === value && "font-medium")}
              >
                {c}
              </CommandItem>
            ))}
            {canCreate && (
              <CommandItem
                value={`__create__${query}`}
                onSelect={() => { onChange(query.trim()); setOpen(false); setQuery(''); }}
                className="text-xs cursor-pointer text-muted-foreground italic"
              >
                ＋ Create "{query.trim()}"
              </CommandItem>
            )}
            {filtered.length === 0 && !canCreate && (
              <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">Nothing found</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const TransactionPreview = ({ transactions, onConfirm, onBack, fileHash, fileName }: TransactionPreviewProps) => {
  const [editedTransactions, setEditedTransactions] = useState<Transaction[]>(transactions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [applyToSimilarMap, setApplyToSimilarMap] = useState<Record<string, boolean>>({});
  const [pendingKeywords, setPendingKeywords] = useState<Record<string, string>>({});
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const handleFieldChange = (transactionId: string, field: keyof Transaction, value: any) => {
    setEditedTransactions(prev =>
      prev.map(t => t.id === transactionId ? { ...t, [field]: value } : t)
    );
  };

  const handleCategoryChange = (id: string, newCategory: string) => {
    handleFieldChange(id, 'category', newCategory);

    if (applyToSimilarMap[id]) {
      const keyword = pendingKeywords[id]?.toLowerCase();
      if (!keyword) return;
      setEditedTransactions(prev =>
        prev.map(t =>
          t.id !== id && t.description.toLowerCase().includes(keyword)
            ? { ...t, category: newCategory }
            : t
        )
      );
    }
  };

  const toISODate = (ds: string) => {
    try {
      const d = new Date(ds);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split('T')[0];
    } catch {
      return "";
    }
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
        categoryRuleDto: applyToSimilarMap[t.id]
          ? {
              keyword: pendingKeywords[t.id] ?? extractKeyword(t.description),
              category: t.category,
              type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
              flow: t.flow || null,
            }
          : null
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

  const selectCls = 'bg-muted border border-border rounded text-foreground text-xs px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring w-full';

  const columns: DataTableColumn<Transaction>[] = [
    { key: 'date', label: 'Date', className: 'w-32' },
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Category', className: 'w-48', getValue: (tx) => tx.category },
    { key: 'amount', label: 'Amount', className: 'w-32' },
    { key: 'bank', label: 'Bank', className: 'w-32', getValue: (tx) => tx.bank },
    { key: 'actions', label: '', className: 'w-16' },
  ];

  const renderRow = (tx: Transaction) => {
    const isEditing = editingId === tx.id;
    
    const categoryOptions = [...new Set([...CORE_CATEGORIES, ...customCategories, tx.category])].sort();

    return (
      <tr key={tx.id} className={cn("hover:bg-accent transition-colors", isEditing && "bg-accent/40")}>
        <td className="px-4 py-2 whitespace-nowrap">
          {isEditing ? (
            <input
              type="date"
              value={toISODate(tx.date)}
              onChange={(e) => handleFieldChange(tx.id, 'date', e.target.value)}
              className={cn(selectCls, "w-32")}
              autoFocus
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatDate(tx.date)}
            </span>
          )}
        </td>
        <td className="px-4 py-2">
          {isEditing ? (
            <input
              type="text"
              value={tx.description}
              onChange={(e) => handleFieldChange(tx.id, 'description', e.target.value)}
              className={selectCls}
            />
          ) : (
            <span className="text-xs font-mono text-foreground/70 max-w-xs truncate block">
              {tx.description}
            </span>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          {isEditing ? (
            <div className="space-y-1">
              <CategoryCombobox
                value={tx.category}
                options={categoryOptions}
                onChange={(cat) => {
                  if (!CORE_CATEGORIES.includes(cat) && !customCategories.includes(cat)) {
                    setCustomCategories(prev => [...prev, cat]);
                  }
                  handleCategoryChange(tx.id, cat);
                }}
              />
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`apply-similar-${tx.id}`}
                  checked={applyToSimilarMap[tx.id] ?? false}
                  onCheckedChange={(checked) => {
                    setApplyToSimilarMap(prev => ({ ...prev, [tx.id]: !!checked }));
                    if (checked) setPendingKeywords(prev => ({ ...prev, [tx.id]: extractKeyword(tx.description) }));
                  }}
                />
                <label htmlFor={`apply-similar-${tx.id}`} className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                  Apply to similar
                </label>
                {applyToSimilarMap[tx.id] && (
                  <input
                    className="text-[10px] border border-border rounded px-1.5 py-0.5 font-mono bg-muted text-foreground flex-1 min-w-0"
                    value={pendingKeywords[tx.id] ?? ''}
                    onChange={e => setPendingKeywords(prev => ({ ...prev, [tx.id]: e.target.value }))}
                    placeholder="keyword…"
                  />
                )}
              </div>
            </div>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {tx.category}
            </span>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          {isEditing ? (
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[10px] text-muted-foreground">{tx.flow === 'CR' ? '+' : '-'}</span>
              <input
                type="number"
                value={Math.abs(tx.amount)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  handleFieldChange(tx.id, 'amount', tx.flow === 'CR' ? val : -val);
                }}
                className={cn(selectCls, "w-24 text-right")}
              />
            </div>
          ) : (
            <div className={cn(
              'font-mono text-xs tabular-nums text-right',
              tx.flow === 'CR' ? 'text-income/80' : 'text-expense/80'
            )}>
              {(() => {
                const absVal = Math.abs(tx.amount);
                const formatted = formatCurrency(absVal).replace('Rp', '').trim();
                return tx.flow === 'CR' ? formatted : `(${formatted})`;
              })()}
            </div>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          {isEditing ? (
            <input
              type="text"
              value={tx.bank}
              onChange={(e) => handleFieldChange(tx.id, 'bank', e.target.value)}
              className={cn(selectCls, "w-32")}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {tx.bank}
            </span>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          {!tx.isDuplicate && (
            isEditing ? (
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingId(null)}
                  className="text-success hover:text-success/80 transition-colors p-1"
                  title="Done"
                >
                  <Check className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingId(tx.id)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="mb-3 shrink-0">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">{newTransactions.length}</strong> new transactions ready to import.
          {duplicateTransactions.length > 0 && <span className="ml-1 text-muted-foreground/60">{duplicateTransactions.length} duplicates skipped.</span>}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4 shrink-0">
        <div className="flex items-center justify-between bg-card/40 border border-border/50 rounded-lg px-3 py-2.5 hover:bg-card/60 transition-colors">
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Transactions</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{summary.totalTransactions}</p>
          </div>
          <Hash className="w-3.5 h-3.5 text-muted-foreground/50" strokeWidth={2} />
        </div>

        <div className="flex items-center justify-between bg-card/40 border border-border/50 rounded-lg px-3 py-2.5 hover:bg-card/60 transition-colors">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-[9px] font-semibold text-income uppercase tracking-widest mb-0.5">Income</p>
            <AutoScalingText className="text-income">
              +{formatCurrency(summary.income)}
            </AutoScalingText>
          </div>
          <TrendingUp className="w-3.5 h-3.5 text-income/50 shrink-0" strokeWidth={2} />
        </div>

        <div className="flex items-center justify-between bg-card/40 border border-border/50 rounded-lg px-3 py-2.5 hover:bg-card/60 transition-colors">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-[9px] font-semibold text-expense uppercase tracking-widest mb-0.5">Expenses</p>
            <AutoScalingText className="text-expense">
              -{formatCurrency(Math.abs(summary.expenses))}
            </AutoScalingText>
          </div>
          <TrendingDown className="w-3.5 h-3.5 text-expense/50 shrink-0" strokeWidth={2} />
        </div>

        <div className="flex items-center justify-between bg-card/40 border border-border/50 rounded-lg px-3 py-2.5 hover:bg-card/60 transition-colors">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Net Balance</p>
            <AutoScalingText className={cn(summary.balance >= 0 ? 'text-income' : 'text-expense')}>
              {summary.balance >= 0 ? '+' : ''}{formatCurrency(summary.balance)}
            </AutoScalingText>
          </div>
          <Wallet className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" strokeWidth={2} />
        </div>
      </div>

      {/* Transactions Tables */}
      <div className="flex-1 min-h-0 mb-6 overflow-y-auto space-y-12 pr-2 custom-scrollbar">
        {/* Group 1: New Data & Actions (Frozen Header/Footer via DataTable) */}
        <div className="space-y-3 flex flex-col h-[600px] min-h-[400px]">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              Ready to Save ({newTransactions.length})
            </h3>
          </div>
          <div className="flex-1 min-h-0">
            <DataTable
              columns={columns}
              rows={newTransactions}
              height="100%"
              emptyMessage="No new transactions found."
              renderRow={renderRow}
              footer={(
                <div className="flex gap-3 justify-center py-1">
                  <button
                    onClick={onBack}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    Back to Files
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || newTransactions.length === 0}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send className="w-3 h-3" strokeWidth={1.5} />
                    {isSubmitting ? 'Submitting…' : `Submit (${newTransactions.length} new)`}
                  </button>
                </div>
              )}
            />
          </div>
          
          {/* Error - placed just outside/below the frozen footer if needed, or I could put it inside footer too */}
          {apiError && (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm shrink-0">
              {apiError}
            </div>
          )}
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
                  <div className="font-mono text-[10px] text-foreground/50 truncate">
                    {tx.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 italic">
                    {tx.category}
                  </div>
                  <div className={cn(
                    'font-mono text-[10px] tabular-nums text-right pr-4',
                    tx.flow === 'CR' ? 'text-income/60' : 'text-expense/60'
                  )}>
                    {(() => {
                      const absVal = Math.abs(tx.amount);
                      const formatted = formatCurrency(absVal).replace('Rp', '').trim();
                      return tx.flow === 'CR' ? formatted : `(${formatted})`;
                    })()}
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
