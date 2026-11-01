import { useEffect, useId, useState } from 'react';
import {
  MonthPoint,
  Projection,
  biggestMover,
  formatCompactIdr,
  formatIdr,
  formatMilestone,
  formatPct,
  formatSignedIdr,
  monthName,
} from '@/lib/netWorth';
import { cn } from '@/lib/utils';
import { Valuation } from '@/types/Valuation';
import { rise } from './motion';
import { ZenLabel } from './primitives';

interface Props {
  netWorthIdr: number;
  series: MonthPoint[];
  projection: Projection | null;
  holdings: { ticker: string; history: Valuation[] }[];
  animate: boolean;
}

const W = 1200;
const H = 300; // plot height; the svg is 330 tall with 20px headroom and a 10px floor
const FUTURE_UNITS = 1.6; // the "→ year" column is 1.6 months wide

/** View C: the chart is the page. Past is solid, the next marker dashed. */
export function NetWorthHorizon({ netWorthIdr, series, projection, holdings, animate }: Props) {
  const last = series.length - 1;
  const [selected, setSelected] = useState(last);

  useEffect(() => setSelected(last), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if (e.key === 'ArrowLeft') setSelected(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setSelected(i => Math.min(last, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const etaYear = projection?.etaKey.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-12">
      <div className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', rise(animate, 0))}>
        <div>
          <ZenLabel>Net worth</ZenLabel>
          <p className="font-data mt-2.5 text-[40px] leading-none tracking-[-0.035em] text-foreground md:text-[60px]">
            Rp {formatIdr(netWorthIdr)}
          </p>
        </div>
        {projection && (
          <div className="text-sm leading-relaxed text-muted-foreground md:text-right">
            Next marker <span className="font-data font-medium text-foreground">{formatMilestone(projection.milestoneIdr)}</span>
            <br />
            <span className="font-data">Rp {formatCompactIdr(projection.remainingIdr)}</span> away · around {monthName(projection.etaKey)} {etaYear} at this pace
            <br />
            <span className="text-xs text-zen-faint">A straight line through your last {series.length} months, not a forecast.</span>
          </div>
        )}
      </div>

      {series.length < 2 ? (
        <p className={cn('mt-24 text-center text-sm text-muted-foreground', rise(animate, 1))}>
          This chart fills in once two months have balances.
        </p>
      ) : (
        <>
          <Chart series={series} projection={projection} selected={selected} onSelect={setSelected} className={rise(animate, 1)} />
          <MonthStrip series={series} futureYear={projection ? etaYear : undefined} selected={selected} onSelect={setSelected} className={rise(animate, 2)} />
          <Readouts series={series} index={selected} holdings={holdings} className={rise(animate, 3)} />
        </>
      )}
    </div>
  );
}

function Chart({ series, projection, selected, onSelect, className }: {
  series: MonthPoint[];
  projection: Projection | null;
  selected: number;
  onSelect: (i: number) => void;
  className?: string;
}) {
  const gradientId = `nw-fill-${useId().replace(/:/g, '')}`;
  const units = series.length + (projection ? FUTURE_UNITS : 0);
  const cw = W / units;

  const values = series.map(s => s.valueIdr);
  if (projection) values.push(projection.milestoneIdr);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.abs(max) || 1;
  const lo = min - range * 0.15;
  const hi = max + range * 0.06;
  const y = (v: number) => 20 + H - ((v - lo) / (hi - lo)) * H;

  const pts = series.map((s, i) => [cw * i + cw / 2, y(s.valueIdr)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0]} 330 L ${pts[0][0]} 330 Z`;
  const [lx, ly] = pts[pts.length - 1];
  const goal = projection ? { x: W - 6, y: y(projection.milestoneIdr) } : null;

  const [sx, sy] = pts[selected] ?? pts[pts.length - 1];
  const tipLabel = monthName(series[selected].key);
  const tipValue = selected > 0
    ? formatSignedIdr(series[selected].valueIdr - series[selected - 1].valueIdr, true)
    : `Rp ${formatCompactIdr(series[selected].valueIdr)}`;
  const tipW = Math.max(tipLabel.length * 7, tipValue.length * 8) + 24;
  const tipX = Math.min(Math.max(sx - tipW / 2, 0), W - tipW);
  const tipY = Math.max(0, sy - 70);

  return (
    <svg viewBox={`0 0 ${W} 330`} className={cn('mt-16 block h-auto w-full overflow-visible', className)} role="img" aria-label="Net worth by month">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopOpacity={0.35} className="[stop-color:hsl(var(--zen-warm))]" />
          <stop offset="1" stopOpacity={0} className="[stop-color:hsl(var(--zen-warm))]" />
        </linearGradient>
      </defs>

      {goal && projection && (
        <>
          <line x1={0} x2={W} y1={goal.y} y2={goal.y} className="stroke-zen-bar" strokeDasharray="2 6" />
          <text x={0} y={goal.y - 10} fontSize={12} className="fill-zen-faint">{formatMilestone(projection.milestoneIdr, 'short')}</text>
        </>
      )}

      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />

      {goal && (
        <path d={`M ${lx} ${ly} L ${goal.x} ${goal.y}`} fill="none" className="stroke-zen-faint" strokeWidth={1.6} strokeDasharray="4 6" />
      )}

      <line x1={sx} x2={sx} y1={sy} y2={330} className="stroke-foreground" strokeOpacity={0.15} />

      {pts.map(([px, py], i) => (
        <circle key={series[i].key} cx={px} cy={py} r={i === selected ? 5 : 2.5} className={i === selected ? 'fill-foreground' : 'fill-zen-bar'} />
      ))}

      {goal && <circle cx={goal.x} cy={goal.y} r={4} className="fill-background stroke-zen-faint" strokeWidth={1.6} />}

      {/* Hit areas: a full-height column per month */}
      {pts.map(([px], i) => (
        <rect
          key={`hit-${series[i].key}`}
          x={px - cw / 2}
          y={0}
          width={cw}
          height={330}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onSelect(i)}
        />
      ))}

      <g className="pointer-events-none [filter:drop-shadow(0_4px_16px_rgba(0,0,0,0.05))]">
        <rect x={tipX} y={tipY} width={tipW} height={46} rx={10} className="fill-card stroke-border" />
        <text x={tipX + 12} y={tipY + 18} fontSize={12} className="fill-zen-faint">{tipLabel}</text>
        <text x={tipX + 12} y={tipY + 36} fontSize={14} className="font-data fill-foreground">{tipValue}</text>
      </g>
    </svg>
  );
}

function MonthStrip({ series, futureYear, selected, onSelect, className }: {
  series: MonthPoint[];
  futureYear?: string;
  selected: number;
  onSelect: (i: number) => void;
  className?: string;
}) {
  const spansYears = series[0].key.slice(0, 4) !== series[series.length - 1].key.slice(0, 4);
  const label = (key: string, i: number) =>
    spansYears && (i === 0 || key.endsWith('-01')) ? `${monthName(key)} ’${key.slice(2, 4)}` : monthName(key);

  return (
    <div className={cn('mt-5 flex text-xs text-zen-faint', className)} role="tablist" aria-label="Months">
      {series.map((s, i) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={i === selected}
          onClick={() => onSelect(i)}
          className={cn(
            'min-w-0 flex-1 truncate border-t border-border pt-2.5 text-left transition-colors hover:text-foreground focus-visible:outline-none',
            i === selected && 'border-t-2 border-foreground pt-[9px] text-foreground',
          )}
        >
          {label(s.key, i)}
        </button>
      ))}
      {futureYear && <div className="flex-[1.6] truncate border-t border-dashed border-zen-bar pt-2.5">→ {futureYear}</div>}
    </div>
  );
}

function Readouts({ series, index, holdings, className }: {
  series: MonthPoint[];
  index: number;
  holdings: { ticker: string; history: Valuation[] }[];
  className?: string;
}) {
  if (index < 1) return null;
  const cur = series[index];
  const prev = series[index - 1];
  const assetsChange = cur.assetsIdr - prev.assetsIdr;
  const debtChange = prev.liabilitiesIdr - cur.liabilitiesIdr; // positive = paid down
  const mover = biggestMover(holdings, prev.key, cur.key);

  const items: { label: string; value: string }[] = [
    { label: 'Assets change', value: formatSignedIdr(assetsChange, true) },
  ];
  if (debtChange > 0) items.push({ label: 'Debt paid down', value: `Rp ${formatCompactIdr(debtChange)}` });
  if (debtChange < 0) items.push({ label: 'New debt', value: `Rp ${formatCompactIdr(-debtChange)}` });
  if (mover) items.push({ label: 'Biggest mover', value: `${mover.ticker} ${mover.pct >= 0 ? '+' : '−'}${formatPct(mover.pct, 1)}` });

  return (
    <div className={cn('mt-10 flex flex-wrap gap-x-16 gap-y-6 text-sm text-muted-foreground', className)}>
      {items.map(item => (
        <div key={item.label}>
          {item.label}
          <span className="font-data mt-1.5 block text-xl tracking-[-0.01em] text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
