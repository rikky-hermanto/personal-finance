import { NetWorthSummary } from '@/api/netWorthApi';
import {
  MonthPoint,
  formatCompactIdr,
  formatPct,
  formatSignedIdr,
  heroParts,
  monthName,
} from '@/lib/netWorth';
import { cn } from '@/lib/utils';
import { rise } from './motion';
import { ZenBar, ZenLabel } from './primitives';

interface Props {
  summary: NetWorthSummary;
  series: MonthPoint[];
  delta: { abs: number; pct: number | null; prevKey: string } | null;
  asOfLabel: string;
  debtRatio: number;
  sentence: string;
  animate: boolean;
}

/** View A: one figure, one line, one sentence. */
export function NetWorthQuiet({ summary, series, delta, asOfLabel, debtRatio, sentence, animate }: Props) {
  const hero = heroParts(summary.netWorthIdr);
  const hasDebt = summary.liabilitiesIdr > 0;
  const showTrend = series.length >= 2;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 pt-16">
      <div className="flex w-full max-w-[760px] flex-col items-center">
        <ZenLabel className={rise(animate, 0)}>Net worth · {asOfLabel}</ZenLabel>

        <p data-testid="net-worth-headline" className={cn('font-data mt-3.5 text-[52px] font-normal leading-none tracking-[-0.035em] text-foreground md:text-[84px]', rise(animate, 1))}>
          <span className="mr-2 align-[0.55em] text-[0.5em] tracking-normal text-zen-faint">Rp</span>
          {hero.sign}{hero.int}
          <span className="ml-0.5 text-[0.4em] tracking-normal text-zen-faint">,{hero.dec}</span>
        </p>

        {showTrend && delta && (
          <p className={cn('mt-[18px] text-[15px]', rise(animate, 2))}>
            <span className={cn('font-data', delta.abs >= 0 ? 'text-zen-positive' : 'text-zen-negative')}>
              {formatSignedIdr(delta.abs)}
            </span>{' '}
            <span className="text-zen-faint">
              since {monthName(delta.prevKey, 'long')}
              {delta.pct != null && <> · <span className="font-data">{formatPct(delta.pct)}</span></>}
            </span>
          </p>
        )}

        {showTrend && (
          <div className={cn('mt-14 w-full', rise(animate, 3))}>
            <Sparkline values={series.map(s => s.valueIdr)} />
            <div className="mt-2 flex justify-between text-xs text-zen-faint">
              <span>{monthName(series[0].key)}</span>
              <span>{series.length} months</span>
              <span>{monthName(series[series.length - 1].key)}</span>
            </div>
          </div>
        )}

        <div className={cn('mt-14 w-full', rise(animate, 4))}>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>You own <span className="font-data font-medium text-foreground">Rp {formatCompactIdr(summary.assetsIdr)}</span></span>
            {hasDebt
              ? <span>You owe <span className="font-data font-medium text-foreground">Rp {formatCompactIdr(summary.liabilitiesIdr)}</span></span>
              : <span>No debts</span>}
          </div>
          {hasDebt && (
            <>
              <ZenBar value={debtRatio} tone="warm" track="strong" className="my-3 h-2" />
              <p className="text-sm text-muted-foreground">{sentence}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const W = 760;
  const H = 100;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pts = values.map((v, i) => [
    pad + (i * (W - 2 * pad)) / (values.length - 1),
    span === 0 ? 55 : 5 + H - ((v - min) / span) * H,
  ]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [ex, ey] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} 110`} className="block h-auto w-full overflow-visible" aria-hidden="true">
      <path d={d} fill="none" className="stroke-foreground" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={9} className="fill-foreground" opacity={0.08} />
      <circle cx={ex} cy={ey} r={4} className="fill-foreground" />
    </svg>
  );
}
