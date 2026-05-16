import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVarianceExplainer, VarianceDriver } from '@/api/spendingAnalysisApi';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.abs(n));

const fmtDelta = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(n)}`;

interface VarianceExplainerCardProps {
  wallet?: string;
}

const VISIBLE_DRIVERS = 6;

const VarianceExplainerCard = ({ wallet }: VarianceExplainerCardProps) => {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['variance-explainer', wallet],
    queryFn: () => getVarianceExplainer(wallet),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card animate-pulse">
        <div className="h-3 w-28 bg-muted rounded mb-4" />
        <div className="h-5 w-64 bg-muted rounded mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 w-full bg-muted rounded mb-3" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Variance Explainer</p>
        <p className="text-sm text-muted-foreground">Could not load data.</p>
      </div>
    );
  }

  const overall = data.delta >= 0;
  const overallColor = overall ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
  const drivers = showAll ? data.drivers : data.drivers.slice(0, VISIBLE_DRIVERS);
  const hiddenCount = data.drivers.length - VISIBLE_DRIVERS;

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Variance vs 3-Month Average
        </p>
        <p className="text-sm text-foreground leading-snug">
          You spent{' '}
          <span className={cn('font-mono font-semibold', overallColor)}>
            {fmtDelta(data.delta)}
          </span>{' '}
          vs your trailing average
          {data.deltaPct !== 0 && (
            <span className={cn('font-mono text-xs ml-1', overallColor)}>
              ({data.deltaPct > 0 ? '+' : ''}{data.deltaPct.toFixed(1)}%)
            </span>
          )}
          .
        </p>
        <div className="flex gap-4 mt-3">
          <Stat label="This month" value={data.currentMonthTotal} />
          <Stat label="3-mo avg" value={data.trailingAvgTotal} muted />
        </div>
      </div>

      {/* Driver rows */}
      {data.drivers.length === 0 ? (
        <p className="px-6 py-4 text-xs text-muted-foreground">No spending variance data yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {drivers.map(d => <DriverRow key={d.category} driver={d} />)}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full px-6 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors border-t border-border"
        >
          {showAll ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
};

const Stat = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
  <div>
    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className={cn('font-mono text-sm font-medium tabular-nums', muted ? 'text-muted-foreground' : 'text-foreground')}>
      {fmt(value)}
    </p>
  </div>
);

const DriverRow = ({ driver }: { driver: VarianceDriver }) => {
  const isOver = driver.delta > 0;
  const deltaColor = isOver ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';

  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground font-medium truncate">{driver.category}</span>
          {driver.isOneOff && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              one-off
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
          {fmt(driver.currentMonthSpend)} vs {fmt(driver.trailingAvg)} avg
        </p>
      </div>
      <span className={cn('font-mono text-xs font-semibold tabular-nums shrink-0', deltaColor)}>
        {fmtDelta(driver.delta)}
      </span>
    </div>
  );
};

export default VarianceExplainerCard;
