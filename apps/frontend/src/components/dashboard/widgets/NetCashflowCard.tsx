import { TrendingUp, TrendingDown } from 'lucide-react';
import { DashboardCurrentMonth } from '@/types/Dashboard';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NetCashflowCardProps {
  data: DashboardCurrentMonth | null;
  isLoading?: boolean;
}

const NetCashflowCard = ({ data, isLoading }: NetCashflowCardProps) => {
  if (isLoading || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  const { income, expenses, net, month } = data;

  const isPositive = net >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Net Cashflow</h3>
        <span className="text-xs text-muted-foreground">{month ? formatMonth(month) : '—'}</span>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          {isPositive ? (
            <TrendingUp className="w-5 h-5 flex-shrink-0 text-success" />
          ) : (
            <TrendingDown className="w-5 h-5 flex-shrink-0 text-destructive" />
          )}
          <span
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums",
              isPositive ? "text-success" : "text-destructive"
            )}
          >
            {isPositive ? '+' : ''}{formatCurrency(net)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Income</p>
            <p className="font-mono text-sm tabular-nums text-success">
              +{formatCurrency(income)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Expenses</p>
            <p className="font-mono text-sm tabular-nums text-destructive">
              -{formatCurrency(expenses)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetCashflowCard;
