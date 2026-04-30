import { Transaction } from '@/types/Transaction';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ActivityPanelProps {
  transactions: Transaction[];
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
}

const ActivityPanel = ({ transactions, selectedMonth, onMonthChange }: ActivityPanelProps) => {
  const recent = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const quickFilters = [
    { label: 'This month', value: currentMonthKey },
    { label: 'Last month', value: lastMonthKey },
    { label: 'All time', value: 'all' },
  ];

  return (
    <div className="w-72 flex-shrink-0 border-l border-border flex flex-col h-full bg-sidebar overflow-hidden">
      {/* Recent transactions */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-5 pb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Recent
          </span>
        </div>
        <div className="divide-y divide-border">
          {recent.map((tx) => (
            <div key={tx.id} className="px-4 py-2.5 hover:bg-accent transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                      tx.type === 'income' ? 'bg-success' : 'bg-destructive'
                    )}
                  />
                  <span className="text-xs text-foreground truncate leading-snug">
                    {tx.description.length > 28
                      ? tx.description.slice(0, 28) + '…'
                      : tx.description}
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-xs flex-shrink-0 tabular-nums',
                    tx.type === 'income' ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {tx.type === 'expense' ? '−' : '+'}
                  {formatCurrency(Math.abs(tx.amount)).replace('Rp', '').trim()}
                </span>
              </div>
              <div className="ml-3.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{tx.bank}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Processing status */}
      <div className="border-t border-border px-4 py-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Processing
        </span>
        <p className="text-xs text-muted-foreground mt-2">No active uploads</p>
      </div>

      {/* Quick filters */}
      {onMonthChange && (
        <div className="border-t border-border px-4 py-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Quick filters
          </span>
          <div className="mt-2 flex flex-col gap-1">
            {quickFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => onMonthChange(f.value)}
                className={cn(
                  'text-xs text-left px-2 py-1.5 rounded transition-colors',
                  selectedMonth === f.value
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
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
