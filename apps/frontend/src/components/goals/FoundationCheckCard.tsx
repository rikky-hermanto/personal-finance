import { Link } from 'react-router-dom';
import { Check, Minus, X } from 'lucide-react';
import { COPY, earmarkNote, gateBody } from '@/lib/goals/copy';
import { formatDecimal, formatRatioPercent, isPositiveMoney } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { FoundationCheck } from '@/types/Goal';
import { CARD, CardTitle } from './goalUi';
import { GateLabel } from './GateLabel';

type RowState = 'pass' | 'fail' | 'missing';

const CHIP: Record<RowState, { Icon: typeof Check; cls: string }> = {
  pass: { Icon: Check, cls: 'text-success bg-success/10' },
  fail: { Icon: X, cls: 'text-warning bg-warning/10' },
  missing: { Icon: Minus, cls: 'text-muted-foreground bg-foreground/[0.05]' },
};

interface Row {
  key: string;
  label: string;
  bar: string;
  value: string;
  state: RowState;
}

/** Row states come only from the API's failing and missing codes. A row is never "pass" while its input is missing (FIN-04). */
function rows(f: FoundationCheck): Row[] {
  const broken = f.missing.includes('computation_error');
  const spendMissing = broken || f.missing.includes('spend_lt_income') || f.spendRatio == null;
  const coverStale = f.missing.includes('savings_stale');
  const coverMissing = broken || f.missing.includes('liquid_savings_ratio') || (!coverStale && f.coverMonthsAfterEarmarks == null);
  const dtiMissing = broken || f.missing.includes('manageable_dti') || f.currentDti == null;
  return [
    {
      key: 'spend',
      label: COPY.checkSpend,
      bar: COPY.checkSpendBar,
      value: spendMissing ? COPY.checkSpendMissing : `${formatRatioPercent(f.spendRatio as string, 0)}% of income`,
      state: spendMissing ? 'missing' : f.failing.includes('spend_lt_income') ? 'fail' : 'pass',
    },
    {
      key: 'cover',
      label: COPY.checkCover,
      bar: COPY.checkCoverBar,
      value: coverStale ? COPY.checkCoverStale : coverMissing ? COPY.checkCoverMissing : `${formatDecimal(f.coverMonthsAfterEarmarks as string, 1)} months`,
      state: coverStale || coverMissing ? 'missing' : f.failing.includes('cover_after_earmarks') ? 'fail' : 'pass',
    },
    {
      key: 'dti',
      label: COPY.checkDti,
      bar: COPY.checkDtiBar,
      value: dtiMissing ? COPY.checkDtiMissing : `${formatRatioPercent(f.currentDti as string, 1)}% of take-home`,
      state: dtiMissing ? 'missing' : f.failing.includes('manageable_dti') ? 'fail' : 'pass',
    },
  ];
}

export const FoundationCheckCard = ({ foundation }: { foundation: FoundationCheck }) => {
  const body = gateBody({ foundation, state: foundation.state, failing: foundation.failing, missing: foundation.missing, variant: 'page' });
  const list = rows(foundation);
  const needSavings = list[1].state === 'missing';
  const needDebts = list[2].state === 'missing';
  return (
    <section className={`${CARD} flex-[5_1_340px] min-w-0 flex flex-col`} aria-label={COPY.checkTitle} data-testid="foundation-check">
      <CardTitle right={<GateLabel state={foundation.state} />}>{COPY.checkTitle}</CardTitle>
      {body.map((b, i) => (
        <p key={i} className={cn('text-[13px] text-foreground/75 leading-relaxed text-pretty', i === 0 ? 'mt-3' : 'mt-1')}>
          {b}
        </p>
      ))}
      <div className="mt-4 flex flex-col gap-1">
        {list.map((r) => {
          const { Icon, cls } = CHIP[r.state];
          return (
            <div key={r.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-foreground/[0.025]" data-check={r.key} data-state={r.state}>
              <span className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', cls)}>
                <Icon size={13} strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-foreground">{r.label}</div>
                <div className="text-[11px] text-muted-foreground">Bar: {r.bar}</div>
              </div>
              <span className="text-[13px] font-data text-foreground text-right max-w-[50%]">{r.value}</span>
            </div>
          );
        })}
      </div>
      {(needSavings || needDebts) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {needSavings && (
            <Link to="/assets/accounts" className="text-foreground underline-offset-2 hover:underline">
              {COPY.checkLinkSavings}
            </Link>
          )}
          {needDebts && (
            <Link to="/assets/liabilities" className="text-foreground underline-offset-2 hover:underline">
              {COPY.checkLinkDebts}
            </Link>
          )}
        </div>
      )}
      {isPositiveMoney(foundation.earmarkedInSavings) && (
        <p className="text-[11px] text-muted-foreground mt-3">{earmarkNote(foundation.earmarkedInSavings)}</p>
      )}
    </section>
  );
};
