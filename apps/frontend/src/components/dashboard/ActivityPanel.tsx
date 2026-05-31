import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import * as transactionsApi from '@/api/transactionsApi';
import { Transaction } from '@/types/Transaction';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useFocusMode } from '@/lib/focus-mode';
import { StreakHeatmap } from '@/components/journey/StreakHeatmap';

interface ActivityPanelProps {
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
}

const mapApiToTransaction = (t: transactionsApi.TransactionDto): Transaction => ({
  id: t.id.toString(),
  date: t.date,
  description: t.description,
  amount: t.flow === 'CR' ? Number(t.amountIdr) : -Number(t.amountIdr),
  type: (t.type.toLowerCase() === 'income' ? 'income' :
         t.type.toLowerCase().includes('transfer') || t.type.toLowerCase().includes('trar') ? 'transfer' : 'expense') as 'income' | 'expense' | 'transfer',
  category: t.category,
  bank: t.accountName,
});

const ActivityPanel = ({ selectedMonth, onMonthChange }: ActivityPanelProps) => {
  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: () => transactionsApi.getTransactionPage({ pageSize: 8, sortOrder: 'desc' }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { focused } = useFocusMode();
  const { pathname } = useLocation();
  const isJourney = pathname.startsWith('/journey');

  const recent = pagedResult?.items.map(mapApiToTransaction) || [];

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const quickFilters = [
    { label: 'This month', value: currentMonthKey },
    { label: 'Last month', value: lastMonthKey },
    { label: 'All time', value: 'all' },
  ];

  // Journey page — show streak heatmap instead of recent transactions
  if (isJourney) {
    return (
      <div className={cn(
        'w-80 flex-shrink-0 flex flex-col h-full bg-sidebar overflow-hidden',
        focused && 'focus-recessed',
      )}>
        <div className="px-5 pt-6 pb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">
            Activity Streak
          </span>
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            Transaction activity · last 12 weeks
          </p>
        </div>
        <div className="px-5">
          <StreakHeatmap />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'w-80 flex-shrink-0 flex flex-col h-full bg-sidebar overflow-hidden',
      focused && 'focus-recessed'
    )}>
      {/* Recent transactions */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-6 pb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">
            Recent
          </span>
        </div>
        <div className="space-y-0.5">
          {isLoading ? (
            <div className="px-5 py-8 flex items-center justify-center">
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            </div>
          ) : recent.length === 0 ? (
            <div className="px-5 py-8 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No recent transactions</span>
            </div>
          ) : (
            recent.map((tx) => (
              <div key={tx.id} className="px-5 py-2 hover:bg-foreground/[0.03] transition-all group cursor-default">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "w-1 h-1 rounded-full",
                        tx.type === 'income' ? 'bg-success' : 'bg-muted-foreground/30'
                      )} />
                      <span className="text-xs font-mono text-foreground/70 truncate leading-snug">
                        {tx.description}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-2.5">
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-tight font-medium">
                        {tx.bank}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-xs flex-shrink-0 tabular-nums',
                      tx.type === 'income' ? 'text-income' : 'text-expense'
                    )}
                  >
                    {(() => {
                      const absVal = Math.abs(tx.amount);
                      const formatted = formatCurrency(absVal).replace('Rp', '').trim();
                      return tx.amount > 0 ? `+${formatted}` : `(${formatted})`;
                    })()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Processing status */}
      <div className="px-5 py-6 mt-4 opacity-80">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">
          Processing
        </span>
        <p className="text-xs text-muted-foreground/60 mt-2 font-medium">No active uploads</p>
      </div>

      {/* Quick filters */}
      {onMonthChange && (
        <div className="px-5 py-6">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">
            Filters
          </span>
          <div className="mt-3 flex flex-col gap-0.5">
            {quickFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => onMonthChange(f.value)}
                className={cn(
                  'text-xs text-left px-2 py-1.5 rounded-md transition-all font-medium',
                  selectedMonth === f.value
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityPanel;
