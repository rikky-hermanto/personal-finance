import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, TrendingUp, TrendingDown, X, LayoutList, LayoutGrid, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TransactionTable from '@/components/TransactionTable';
import CashflowStatementTable from '@/components/CashflowStatementTable';
import { getAccountSummaries, getCashflowStatement, AccountSummary } from '@/api/transactionsApi';
import { CashflowStatement } from '@/types/CashflowStatement';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/Transaction';

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

type ViewMode = 'table' | 'statement';

const AccountCard = ({
  summary,
  selected,
  onClick,
}: {
  summary: AccountSummary;
  selected: boolean;
  onClick: () => void;
}) => {
  const net = summary.netPosition ?? 0;
  const isPositive = net >= 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg border transition-all duration-150',
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border bg-card hover:bg-muted/50 text-foreground',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold',
            selected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {summary.accountName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium block truncate">{summary.accountName}</span>
            {summary.institutionName && (
              <span className="text-[10px] text-muted-foreground">{summary.institutionName}</span>
            )}
          </div>
        </div>
        <span className={cn(
          'text-xs font-mono font-medium shrink-0 ml-2',
          isPositive ? 'text-emerald-400' : 'text-red-400'
        )}>
          {isPositive ? '+' : ''}Rp {formatCompact(net)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground font-mono">Rp {formatCompact(summary.totalIn)}</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-400" />
          <span className="text-[11px] text-muted-foreground font-mono">Rp {formatCompact(summary.totalOut)}</span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {summary.transactionCount > 0
          ? `${summary.transactionCount.toLocaleString()} transactions`
          : 'No transactions yet'}
      </div>
    </button>
  );
};

const AccountsTab = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Clear stale localStorage key from old custom-wallets system
  useEffect(() => {
    localStorage.removeItem('pf_custom_wallets');
  }, []);

  // Statement controls
  const [range, setRange] = useState(6);
  const [groupBy, setGroupBy] = useState<'quarterly' | 'monthly'>('quarterly');
  const [statementData, setStatementData] = useState<CashflowStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ['account-summaries'],
    queryFn: () => getAccountSummaries(12),
    staleTime: 60_000,
  });

  const totals = summaries.reduce(
    (acc, s) => ({
      income:   acc.income   + s.totalIn,
      expenses: acc.expenses + s.totalOut,
      count:    acc.count    + s.transactionCount,
    }),
    { income: 0, expenses: 0, count: 0 }
  );
  const totalNet = totals.income - totals.expenses;

  const selectedSummary = summaries.find(s => s.accountId === selectedAccountId);

  // Fetch statement whenever view/account/range/groupBy changes
  useEffect(() => {
    if (viewMode !== 'statement') return;
    let cancelled = false;
    setStatementLoading(true);
    getCashflowStatement(range, selectedAccountId ?? undefined, groupBy)
      .then((data) => { if (!cancelled) setStatementData(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setStatementLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, selectedAccountId, range, groupBy]);

  const handleTransactionUpdate = useCallback((_id: string, _updates: Partial<Transaction>) => {}, []);

  const btnCls = (active: boolean) => cn(
    'h-7 px-2.5 text-xs font-medium transition-all rounded-md gap-1.5',
    active
      ? 'bg-secondary text-foreground shadow-none'
      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
  );

  const displayTitle = selectedSummary?.accountName ?? 'All Bank Accounts';

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel — account list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Bank Accounts</h2>
          </div>

          {/* Net position summary card */}
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Position</div>
            <div className={cn(
              'text-lg font-bold font-mono',
              totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {totalNet >= 0 ? '+' : ''}Rp {formatCompact(totalNet)}
            </div>
            <div className="flex gap-3 mt-1.5">
              <span className="text-emerald-400 font-mono text-[10px]">↑ Rp {formatCompact(totals.income)}</span>
              <span className="text-red-400 font-mono text-[10px]">↓ Rp {formatCompact(totals.expenses)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {/* All accounts option */}
          <button
            onClick={() => setSelectedAccountId(null)}
            className={cn(
              'w-full text-left px-4 py-2.5 rounded-lg border transition-all duration-150',
              selectedAccountId === null
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground',
            )}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="text-sm font-medium">All Bank Accounts</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-6">
              {totals.count.toLocaleString()} transactions
            </div>
          </button>

          {/* Per-account cards */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading accounts…</div>
          ) : summaries.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No accounts yet.
              <br />
              <span className="text-[11px]">Add in Settings → Banks &amp; Accounts.</span>
            </div>
          ) : (
            summaries.map((summary) => (
              <AccountCard
                key={summary.accountId}
                summary={summary}
                selected={selectedAccountId === summary.accountId}
                onClick={() => setSelectedAccountId(
                  summary.accountId === selectedAccountId ? null : summary.accountId
                )}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header row */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {displayTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedAccountId
                  ? `Transactions for ${displayTitle}`
                  : 'View transactions across all bank accounts'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                <Button variant="ghost" size="sm" className={btnCls(viewMode === 'table')} onClick={() => setViewMode('table')}>
                  <LayoutList className="w-3.5 h-3.5" />
                  Table
                </Button>
                <Button variant="ghost" size="sm" className={btnCls(viewMode === 'statement')} onClick={() => setViewMode('statement')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Statement
                </Button>
              </div>

              {/* Statement controls — only visible in statement view */}
              {viewMode === 'statement' && (
                <>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                    <Button variant="ghost" size="sm" className={btnCls(groupBy === 'quarterly')} onClick={() => setGroupBy('quarterly')}>
                      <LayoutGrid className="w-3 h-3" />
                      Quarterly
                    </Button>
                    <Button variant="ghost" size="sm" className={btnCls(groupBy === 'monthly')} onClick={() => setGroupBy('monthly')}>
                      <Calendar className="w-3 h-3" />
                      Monthly
                    </Button>
                  </div>

                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                    {RANGES.map((r) => (
                      <Button
                        key={r.label}
                        variant="ghost"
                        size="sm"
                        className={btnCls(range === r.value)}
                        onClick={() => setRange(r.value)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              {selectedAccountId && (
                <Button variant="ghost" size="sm" className="text-muted-foreground h-7" onClick={() => setSelectedAccountId(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {viewMode === 'table' ? (
            <TransactionTable
              key={selectedAccountId ?? '__all__'}
              onTransactionUpdate={handleTransactionUpdate}
              accountIdFilter={selectedAccountId ?? undefined}
            />
          ) : (
            <CashflowStatementTable
              data={statementData}
              isLoading={statementLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountsTab;
