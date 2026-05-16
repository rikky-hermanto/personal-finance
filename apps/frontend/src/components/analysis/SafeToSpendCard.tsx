import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getSafeToSpend } from '@/api/spendingAnalysisApi';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

const STATUS_BAR: Record<string, string> = {
  ok: 'border-l-green-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-red-500',
};

interface SafeToSpendCardProps {
  wallet?: string;
}

const SafeToSpendCard = ({ wallet }: SafeToSpendCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['safe-to-spend', wallet],
    queryFn: () => getSafeToSpend(wallet),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card animate-pulse">
        <div className="h-3 w-24 bg-muted rounded mb-4" />
        <div className="h-10 w-48 bg-muted rounded mb-2" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Safe to Spend</p>
        <p className="text-sm text-muted-foreground">Could not load data.</p>
      </div>
    );
  }

  const statusColor = STATUS_COLOR[data.status] ?? STATUS_COLOR.ok;
  const barColor = STATUS_BAR[data.status] ?? STATUS_BAR.ok;

  return (
    <div className={cn('border border-border border-l-4 rounded-lg bg-card', barColor)}>
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Safe to Spend
        </p>
        <p className={cn('font-mono text-4xl font-semibold tracking-tight leading-none', statusColor)}>
          {fmt(data.amount)}
        </p>
        <p className="text-xs text-muted-foreground mt-2 font-mono">
          per day &middot; {data.daysRemaining} days left this month
        </p>
      </div>

      {/* Expandable breakdown */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-6 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <span className="font-medium">Breakdown</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 divide-y divide-border">
          <BreakdownRow label="Income baseline (3-mo avg)" value={data.incomeBaseline} positive />
          <BreakdownRow label="Committed bills remaining" value={-data.committedBillsRemaining} />
          <BreakdownRow label="Already spent this month" value={-data.alreadySpent} />
          <BreakdownRow label="Savings goal" value={-data.savingsGoal} />
        </div>
      )}
    </div>
  );
};

const BreakdownRow = ({ label, value, positive }: { label: string; value: number; positive?: boolean }) => (
  <div className="flex items-center justify-between py-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn(
      'font-mono text-xs font-medium tabular-nums',
      positive ? 'text-foreground' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
    )}>
      {fmt(Math.abs(value))}
    </span>
  </div>
);

export default SafeToSpendCard;
