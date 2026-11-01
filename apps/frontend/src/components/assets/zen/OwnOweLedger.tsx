import { useEffect, useRef } from 'react';
import { NetWorthSummary } from '@/api/netWorthApi';
import {
  LedgerRow,
  formatCompactIdr,
  formatIdr,
  formatPct,
  formatShare,
  monthName,
} from '@/lib/netWorth';
import { cn } from '@/lib/utils';
import { rise } from './motion';
import { ZenBar, ZenLabel } from './primitives';

export type LedgerFocus = 'owned' | 'owed';

interface Props {
  summary: NetWorthSummary;
  delta: { abs: number; pct: number | null; prevKey: string } | null;
  own: { rows: LedgerRow[] };
  owe: { rows: LedgerRow[] };
  focus: LedgerFocus;
  onRowClick: (row: LedgerRow) => void;
  animate: boolean;
}

/** View B: net worth as a plain subtraction, two quiet ledgers side by side. */
export function OwnOweLedger({ summary, delta, own, owe, focus, onRowClick, animate }: Props) {
  const ownRef = useRef<HTMLElement>(null);
  const oweRef = useRef<HTMLElement>(null);

  // Stacked below 1024px, so bring the chosen column into view.
  useEffect(() => {
    const el = focus === 'owned' ? ownRef.current : oweRef.current;
    if (el && window.matchMedia('(max-width: 1023px)').matches) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 pb-16 pt-12">
      <header className={cn('text-center', rise(animate, 0))}>
        <ZenLabel>Net worth</ZenLabel>
        <p className="font-data mt-2 text-[44px] leading-tight tracking-[-0.03em] text-foreground">
          Rp {formatIdr(summary.netWorthIdr)}
        </p>
        {delta?.pct != null && (
          <p className="mt-1.5 text-sm">
            <span className={cn('font-data', delta.abs >= 0 ? 'text-zen-positive' : 'text-zen-negative')}>
              {delta.abs >= 0 ? '+' : '−'}{formatPct(delta.pct)}
            </span>{' '}
            <span className="text-zen-faint">vs {monthName(delta.prevKey, 'long')}</span>
          </p>
        )}
      </header>

      <div className="mt-12 grid grid-cols-1 gap-y-14 lg:grid-cols-2">
        <Column
          sectionRef={ownRef}
          title="What you own"
          total={summary.assetsIdr}
          rows={own.rows}
          tone="neutral"
          empty="Nothing recorded yet."
          dimmed={focus === 'owed'}
          onRowClick={onRowClick}
          className={cn('lg:pr-12', rise(animate, 1))}
        />
        <Column
          sectionRef={oweRef}
          title="What you owe"
          total={summary.liabilitiesIdr}
          rows={owe.rows}
          tone="warm"
          empty="No debts"
          dimmed={focus === 'owned'}
          onRowClick={onRowClick}
          className={cn('lg:border-l lg:border-border lg:pl-12', rise(animate, 2))}
        />
      </div>

      <p className={cn('mt-14 text-center text-[15px] text-muted-foreground', rise(animate, 3))}>
        <span className="font-data">Rp {formatCompactIdr(summary.liquidIdr)}</span> of it is liquid, ready within a few days.
      </p>
    </div>
  );
}

interface ColumnProps {
  sectionRef: React.Ref<HTMLElement>;
  title: string;
  total: number;
  rows: LedgerRow[];
  tone: 'neutral' | 'warm';
  empty: string;
  dimmed: boolean;
  onRowClick: (row: LedgerRow) => void;
  className?: string;
}

function Column({ sectionRef, title, total, rows, tone, empty, dimmed, onRowClick, className }: ColumnProps) {
  return (
    <section
      ref={sectionRef}
      aria-label={title}
      className={cn('scroll-mt-6 transition-opacity duration-200', dimmed && 'opacity-70 hover:opacity-100', className)}
    >
      <div className="flex items-baseline justify-between pb-3">
        <span className={cn('text-[13px] transition-colors', dimmed ? 'text-zen-faint' : 'text-foreground')}>{title}</span>
        <span className="font-data text-[26px] tracking-[-0.02em] text-foreground">Rp {formatIdr(total)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-[18px] text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {rows.map(row => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onRowClick(row)}
                className="-mx-3 block w-[calc(100%+1.5rem)] rounded-lg px-3 py-[18px] text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="flex justify-between gap-4 text-sm">
                  <span className="truncate text-foreground">{row.name}</span>
                  <span className="font-data font-medium text-foreground">{formatIdr(row.amountIdr)}</span>
                </span>
                <span className="mt-1 flex justify-between gap-4 text-xs text-zen-faint">
                  <span className={cn('truncate', row.caution && 'text-zen-caution')}>{row.meta}</span>
                  <span className="font-data">{formatShare(row.share)}</span>
                </span>
                <ZenBar value={row.share} tone={tone} className="mt-2.5 h-1" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
