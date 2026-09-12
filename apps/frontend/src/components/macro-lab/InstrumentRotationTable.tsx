import { cn } from '@/lib/utils';
import type { InstrumentView } from '@/lib/macroScenario';

interface InstrumentRotationTableProps {
  instruments: InstrumentView[];
}

function tendency(v: number, rank: number): { label: string; className: string } {
  if (v >= 4 && rank < 4) return { label: 'Add weight', className: 'text-success' };
  if (v >= 1) return { label: 'Mildly positive', className: 'text-warning' };
  if (v > -2) return { label: 'Neutral', className: 'text-muted-foreground' };
  return { label: 'Trim weight', className: 'text-destructive' };
}

function sentimentLabel(v: number): string {
  if (v < 20) return 'Extreme fear';
  if (v < 40) return 'Fear';
  if (v < 60) return 'Neutral';
  if (v < 80) return 'Greed';
  return 'Extreme greed';
}

function sentimentClass(v: number): string {
  if (v < 20) return 'text-info';
  if (v < 40) return 'text-info';
  if (v < 60) return 'text-muted-foreground';
  if (v < 80) return 'text-warning';
  return 'text-destructive';
}

const InstrumentRotationTable = ({ instruments }: InstrumentRotationTableProps) => {
  const max = Math.max(...instruments.map((x) => Math.abs(x.realReturnPct)), 5);

  return (
    <div className="pf-card p-4 mb-5">
      <div className="flex items-center text-[11px] text-muted-foreground border-b border-border pb-1.5 mb-1">
        <div className="flex-1">Instrument</div>
        <div className="w-24 shrink-0">Real return (IDR)</div>
        <div className="w-32 shrink-0">Market sentiment</div>
        <div className="w-24 shrink-0 text-right">Signal</div>
      </div>
      {instruments.map((it, k) => {
        const td = tendency(it.realReturnPct, k);
        const wBar = (Math.abs(it.realReturnPct) / max) * 50;
        return (
          <div key={it.name} className="flex items-center py-2 border-b border-border/60 last:border-none">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-foreground truncate">{it.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                <span className={it.category === 'Global' ? 'text-info' : 'text-primary'}>{it.category}</span> · {it.driver}
                {it.flag && <span className="text-warning"> · {it.flag === 'crowded' ? 'crowded' : 'hated but cheap'}</span>}
              </div>
            </div>
            <div className="w-24 shrink-0">
              <div className={cn('font-data text-[13.5px] mb-0.5 tabular-nums', it.realReturnPct >= 0 ? 'text-success' : 'text-destructive')}>
                {it.realReturnPct >= 0 ? '+' : ''}{it.realReturnPct.toFixed(1)}%
              </div>
              <div className="relative h-1 bg-secondary">
                <div className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px bg-border" />
                <div
                  className={cn('absolute top-0 bottom-0', it.realReturnPct >= 0 ? 'bg-success' : 'bg-destructive')}
                  style={{ left: it.realReturnPct >= 0 ? '50%' : `${50 - wBar}%`, width: `${wBar}%` }}
                />
              </div>
            </div>
            <div className="w-32 shrink-0 pr-3">
              <div className={cn('text-[11.5px] mb-0.5', sentimentClass(it.sentiment))}>
                {sentimentLabel(it.sentiment)} <span className="font-data text-muted-foreground tabular-nums">{it.sentiment.toFixed(0)}</span>
              </div>
              <div className="relative h-1 bg-secondary">
                <div className={cn('absolute -top-0.5 -bottom-0.5 w-0.5', sentimentClass(it.sentiment).replace('text-', 'bg-'))} style={{ left: `calc(${it.sentiment}% - 1px)` }} />
              </div>
            </div>
            <div className={cn('w-24 shrink-0 text-right text-xs', td.className)}>{td.label}</div>
          </div>
        );
      })}
    </div>
  );
};

export default InstrumentRotationTable;
