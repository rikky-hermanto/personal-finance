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
      <div className="pf-card p-5 animate-pulse">
        <div className="flex justify-between mb-5">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-3">
          <div className="pr-4 space-y-2">
            <div className="h-3 w-8 bg-muted rounded" />
            <div className="h-7 w-36 bg-muted rounded" />
          </div>
          <div className="px-4 space-y-2">
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-5 w-28 bg-muted rounded" />
          </div>
          <div className="pl-4 space-y-2">
            <div className="h-3 w-14 bg-muted rounded" />
            <div className="h-5 w-28 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  const { income, expenses, net, month } = data;
  const isPositive = net >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="pf-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-foreground">Net Cashflow</h3>
        {month && <p className="text-[11px] text-muted-foreground">{formatMonth(month)}</p>}
      </div>
      <div className="grid grid-cols-3">
        <div className="pr-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <Icon className={cn("w-3 h-3", isPositive ? "text-success" : "text-destructive")} />
            Net
          </p>
          <p className={cn("font-mono text-xl font-semibold tabular-nums", isPositive ? "text-success" : "text-destructive")}>
            {isPositive ? '+' : ''}{formatCurrency(net)}
          </p>
        </div>
        <div className="px-6">
          <p className="text-[11px] text-muted-foreground mb-1.5">Income</p>
          <p className="font-mono text-sm tabular-nums text-success">+{formatCurrency(income)}</p>
        </div>
        <div className="pl-6">
          <p className="text-[11px] text-muted-foreground mb-1.5">Expenses</p>
          <p className="font-mono text-sm tabular-nums text-destructive">-{formatCurrency(expenses)}</p>
        </div>
      </div>
    </div>
  );
};

export default NetCashflowCard;
