import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, Check, ChevronRight, Coffee, Info, Lock,
  Minus, Shield, Sparkles, TriangleAlert, Waves, X,
} from 'lucide-react';
import {
  demoteCommittedItem, getBuckets, getMonthClose, setFuturePlan,
  type BucketsResponse, type CommittedItem, type EmergencyFundProgress, type WaterfallResult,
} from '@/api/bucketsApi';
import { cn } from '@/lib/utils';

// Mirrors apps/api/.../Constants/BucketDefaults.cs — state selection lives client-side (the
// backend only supplies derived numbers), so these thresholds must stay in sync with the backend's.
const FORECAST_DAY = 26;
const FORECAST_PACE_WINDOW_DAYS = 7;
const MIN_MONTHS_FOR_DAILY = 2;
const MONTH_CLOSE_WINDOW_DAYS = 2;

const FREE_LABEL = 'Free';

const fmtIDR = (n: number) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('en-US');
const fmtIDRShort = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e6) {
    const v = a / 1e6;
    const t = v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return `${s}Rp ${t}M`;
  }
  if (a >= 1e3) return `${s}Rp ${Math.round(a / 1e3)}K`;
  return `${s}Rp ${a}`;
};

type BucketState = 'learning' | 'setup' | 'daily' | 'daily-variable' | 'forecast' | 'exhausted' | 'shortfall' | 'close';

function selectState(data: BucketsResponse, opts?: { skipClose?: boolean }): BucketState {
  if (data.shortfall) return 'shortfall';
  if (!opts?.skipClose && data.day <= MONTH_CLOSE_WINDOW_DAYS && data.monthsAvailable >= MIN_MONTHS_FOR_DAILY) return 'close';
  if (data.needsSetup) return 'setup';
  if (data.monthsAvailable < MIN_MONTHS_FOR_DAILY) return 'learning';

  const freeLeft = data.freeBudget - data.freeSpent;
  if (freeLeft <= 0) return 'exhausted';
  if (data.variableIncome) return 'daily-variable';

  const daysLeft = Math.max(1, data.daysInMonth - data.day);
  const pace7 = data.last7DayFreeSpend / FORECAST_PACE_WINDOW_DAYS;
  const projectedOver = pace7 * daysLeft - freeLeft;
  if (data.day >= FORECAST_DAY && projectedOver > 0) return 'forecast';

  return 'daily';
}

type GlyphKind = 'committed' | 'future' | 'free';

const GLYPH_ICON: Record<GlyphKind, typeof Lock> = { committed: Lock, future: Shield, free: Coffee };
const GLYPH_TONE: Record<GlyphKind, string> = {
  committed: 'text-foreground bg-foreground/10',
  future: 'text-success bg-success/10',
  free: 'text-blue-600 dark:text-blue-400 bg-blue-600/10 dark:bg-blue-400/10',
};

const Glyph = ({ kind, size = 26 }: { kind: GlyphKind; size?: number }) => {
  const IconComp = GLYPH_ICON[kind];
  return (
    <div className={cn('grid place-items-center rounded-md flex-shrink-0', GLYPH_TONE[kind])} style={{ width: size, height: size }}>
      <IconComp size={Math.round(size * 0.54)} strokeWidth={1.9} />
    </div>
  );
};

const Bar = ({ pct, tone = 'bg-foreground', height = 6 }: { pct: number; tone?: string; height?: number }) => (
  <div className="w-full rounded-full overflow-hidden bg-foreground/[0.07]" style={{ height }}>
    <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

interface CommittedSheetProps {
  open: boolean;
  onClose: () => void;
  items: CommittedItem[];
  onDemote: (key: string) => void;
}

const CommittedSheet = ({ open, onClose, items, onDemote }: CommittedSheetProps) => {
  if (!open) return null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const guessed = items.filter(i => !i.certain).length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-foreground/25" onClick={onClose}>
      <div
        className="pf-card w-full max-w-[520px] overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 60px -12px rgb(0 0 0 / 0.30)' }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-border">
          <Glyph kind="committed" size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">Committed</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtIDR(total)} &middot; {items.length} commitments &middot; {guessed === 0 ? 'all confirmed' : `${guessed} still inferred`}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 -mt-1 rounded-md hover:bg-foreground/5 text-muted-foreground transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {items.map(it => (
            <div key={it.key} className="group px-5 py-3 flex items-center gap-3 border-b border-border/60 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{it.name}</span>
                  {!it.certain && (
                    <span className="text-[10px] font-medium px-1.5 py-px rounded text-warning bg-warning/10">inferred</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {it.due} &middot; {it.source}{it.note ? ` · ${it.note}` : ''}
                </div>
              </div>
              <div className="font-mono text-[13px] font-semibold tabular-nums">{fmtIDR(it.amount)}</div>
              <button
                onClick={() => onDemote(it.key)}
                className="text-[11px] font-medium px-2 py-1 rounded-md border border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-foreground/25 transition-all whitespace-nowrap"
              >
                Not committed
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-secondary/60 flex items-center gap-2">
          <Info size={13} className="text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground leading-snug">
            Moving a commitment to &lsquo;Free&rsquo; also corrects how future transactions are categorized.
          </span>
        </div>
      </div>
    </div>
  );
};

interface StripProps {
  committed: number;
  future: number;
  freeBudget: number;
  freeSpent: number;
  items: CommittedItem[];
  freeLabel: string;
  onOpenCommitted: () => void;
  emergencyFund: EmergencyFundProgress;
}

const Strip = ({ committed, future, freeBudget, freeSpent, items, freeLabel, onOpenCommitted, emergencyFund }: StripProps) => {
  const freeLeft = freeBudget - freeSpent;
  const over = freeLeft < 0;
  const goalPct = emergencyFund.target > 0 ? Math.round((emergencyFund.now / emergencyFund.target) * 100) : 0;
  const paid = items.filter(i => i.paid).length;

  return (
    <div className="flex flex-col">
      <button onClick={onOpenCommitted} className="text-left px-5 py-3.5 flex items-center gap-3 border-t border-border hover:bg-foreground/[0.025] transition-colors">
        <Glyph kind="committed" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Committed</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{paid} of {items.length} bills have left</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-semibold tabular-nums">{fmtIDRShort(committed)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-end gap-0.5">breakdown <ChevronRight size={10} /></div>
        </div>
      </button>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <Glyph kind="future" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium">Future</span>
            <ArrowRight size={10} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Emergency fund</span>
            <span className="text-[9.5px] font-medium px-1 py-px rounded text-muted-foreground bg-foreground/5">cash</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><Bar pct={goalPct} tone="bg-success" /></div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtIDRShort(emergencyFund.now)} of {fmtIDRShort(emergencyFund.target)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-semibold tabular-nums text-success">{fmtIDRShort(future)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">per month</div>
        </div>
      </div>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <Glyph kind="free" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{freeLabel}</div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><Bar pct={over ? 100 : (freeSpent / freeBudget) * 100} tone={over ? 'bg-warning' : 'bg-blue-600 dark:bg-blue-400'} /></div>
            <span className={cn('text-[11px] whitespace-nowrap', over && 'text-warning')}>
              {over ? 'fully used' : `${fmtIDRShort(freeLeft)} left`}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-semibold tabular-nums">{fmtIDRShort(freeBudget)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">this month</div>
        </div>
      </div>
    </div>
  );
};

const WaterfallView = ({ result, freeLabel }: { result: WaterfallResult; freeLabel: string }) => (
  <div className="px-5 pb-4">
    <div className="flex flex-col gap-2.5">
      {result.tiers.map(t => {
        const isStop = result.stoppedAtTier === t.name;
        const full = t.short <= 0;
        const label = t.kind === 'free' ? freeLabel : t.name;
        return (
          <div key={t.kind} className="flex items-center gap-3">
            <Glyph kind={t.kind as GlyphKind} size={22} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium">{label}</span>
                <span className={cn('font-mono text-[11px] tabular-nums', full ? 'text-success' : 'text-warning')}>
                  {full ? `${fmtIDR(t.got)} funded` : `${fmtIDR(t.got)} of ${fmtIDR(t.want)}`}
                </span>
              </div>
              <div className="mt-1.5"><Bar pct={t.want > 0 ? (t.got / t.want) * 100 : 100} tone={full ? 'bg-success' : 'bg-warning'} height={5} /></div>
              {isStop && <div className="text-[11px] mt-1.5 text-warning">Cascade stops here &mdash; short {fmtIDR(t.short)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

interface FutureSliderProps {
  value: number;
  onChange: (value: number) => void;
  free: number;
  tight: boolean;
  freeLabel: string;
  medianFree: number;
  max: number;
}

const FutureSlider = ({ value, onChange, free, tight, freeLabel, medianFree, max }: FutureSliderProps) => (
  <div className="px-5 py-4 border-t border-border">
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] font-medium">Future per month</span>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-success">{fmtIDR(value)}</span>
    </div>
    <input
      type="range"
      min={0}
      max={Math.max(max, value, 50_000)}
      step={50_000}
      value={value}
      onChange={e => onChange(+e.target.value)}
      className="w-full mt-3 accent-success"
    />
    <div className="mt-2 flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{freeLabel} becomes <span className="font-mono font-semibold tabular-nums text-foreground">{fmtIDR(free)}</span></span>
      <span className="text-muted-foreground">your median {fmtIDRShort(medianFree)}</span>
    </div>
    {tight && (
      <div className="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-md bg-warning/10">
        <TriangleAlert size={12} className="mt-px flex-shrink-0 text-warning" />
        <span className="text-[11px] leading-snug text-warning">
          You usually spend {fmtIDR(medianFree)} a month. Sure {fmtIDR(free)} is enough?
        </span>
      </div>
    )}
  </div>
);

const BucketsCard = () => {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftFuture, setDraftFuture] = useState<number | null>(null);
  const [dismissedClose, setDismissedClose] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['buckets'],
    queryFn: getBuckets,
    staleTime: 60_000,
  });

  const state = data ? selectState(data, { skipClose: dismissedClose }) : null;

  const { data: closeData, isLoading: closeLoading } = useQuery({
    queryKey: ['buckets', 'month-close'],
    queryFn: getMonthClose,
    enabled: state === 'close',
    staleTime: 60_000,
  });

  const futureMutation = useMutation({
    mutationFn: setFuturePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets'] });
      setDraftFuture(null);
    },
  });

  const demoteMutation = useMutation({
    mutationFn: demoteCommittedItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buckets'] }),
  });

  if (isLoading) {
    return (
      <div className="pf-card p-6 animate-pulse">
        <div className="h-3 w-24 bg-muted rounded mb-4" />
        <div className="h-10 w-48 bg-muted rounded mb-2" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (isError || !data || !state) {
    return (
      <div className="pf-card p-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Buckets</p>
        <p className="text-sm text-muted-foreground">Could not load data.</p>
      </div>
    );
  }

  const future = draftFuture ?? data.futurePlanned;
  const freeBudgetAtDraft = data.income - data.committed - future;
  const tight = freeBudgetAtDraft < data.softFloor;
  const sliderMax = Math.max(data.income - data.committed, 0);

  const chip: Record<BucketState, string> = {
    learning: 'Learning',
    setup: 'Setup',
    daily: `Day ${data.day}`,
    'daily-variable': `Day ${data.day}`,
    forecast: `Day ${data.day}`,
    exhausted: `Day ${data.day}`,
    shortfall: `Day ${data.day}`,
    close: closeData?.monthLabel ?? 'Month close',
  };

  let body: React.ReactNode = null;

  if (state === 'learning') {
    const certain = data.items.filter(i => i.certain);
    const certainTotal = certain.reduce((s, i) => s + i.amount, 0);
    const monthsToGo = Math.max(1, MIN_MONTHS_FOR_DAILY - data.monthsAvailable);
    const arrives = new Date();
    arrives.setMonth(arrives.getMonth() + monthsToGo, 1);

    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">Buckets</div>
          <div className="font-mono font-semibold tracking-[-0.03em] mt-1.5 text-[30px] leading-tight">Still learning</div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[44ch]">
            We&rsquo;ve seen {data.monthsAvailable} of 3 months of your transactions. The daily number appears once your
            spending pattern is clear enough &mdash; around {arrives.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.
          </div>
        </div>
        <div className="px-5 pb-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className={cn('h-1.5 flex-1 rounded-full', i < data.monthsAvailable ? 'bg-foreground/55' : 'bg-foreground/[0.09]')} />
            ))}
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex items-center gap-3">
          <Glyph kind="committed" />
          <div className="flex-1 text-[12px] text-muted-foreground leading-snug">
            What we can already confirm: <span className="text-foreground font-medium">{certain.length} fixed bills</span> worth {fmtIDRShort(certainTotal)}.
          </div>
          <button onClick={() => setSheetOpen(true)} className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border hover:border-foreground/25 transition-colors whitespace-nowrap">
            View
          </button>
        </div>
      </>
    );
  } else if (state === 'setup') {
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">Here&rsquo;s what your last 3 months look like</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Committed</div>
              <div className="font-mono text-[15px] font-semibold mt-0.5">{fmtIDRShort(data.committed)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Free</div>
              <div className="font-mono text-[15px] font-semibold mt-0.5">{fmtIDRShort(data.medianFree)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Future</div>
              <div className="font-mono text-[15px] font-semibold mt-0.5 text-success">{fmtIDRShort(Math.max(0, data.income - data.committed - data.medianFree))}</div>
            </div>
          </div>
        </div>
        <FutureSlider value={future} onChange={setDraftFuture} free={freeBudgetAtDraft} tight={tight} freeLabel={FREE_LABEL} medianFree={data.medianFree} max={sliderMax} />
        <div className="px-5 pb-5 pt-1">
          <button
            onClick={() => futureMutation.mutate(future)}
            disabled={futureMutation.isPending}
            className="w-full text-[12px] font-semibold py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Use this
          </button>
        </div>
      </>
    );
  } else if (state === 'shortfall' && data.shortfall) {
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Income arrived {data.incomeArrivedDate ?? ''}</div>
          <div className="font-mono font-semibold tracking-[-0.03em] tabular-nums mt-1.5 text-[32px] leading-tight">{fmtIDR(data.incomeArrivedThisMonth)}</div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]">
            {fmtIDRShort(Math.max(0, data.income - data.incomeArrivedThisMonth))} below your {fmtIDRShort(data.income)} median. Buckets fill in order, so you can see exactly where it runs out.
          </div>
        </div>
        <WaterfallView result={data.shortfall} freeLabel={FREE_LABEL} />
        {data.shortfall.stoppedAtTier === FREE_LABEL && (
          <div className="px-5 pb-4">
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-success/10">
              <Check size={13} strokeWidth={3} className="text-success mt-px flex-shrink-0" />
              <span className="text-[12px] leading-snug">
                Every bill and your full {fmtIDR(data.futurePlanned)} to Future are covered. The shortfall lands entirely in {FREE_LABEL}.
              </span>
            </div>
          </div>
        )}
      </>
    );
  } else if (state === 'daily-variable') {
    const dailyCommittedRate = data.daysInMonth > 0 ? data.committed / data.daysInMonth : 0;
    const days = dailyCommittedRate > 0 ? Math.floor(data.emergencyFund.now / dailyCommittedRate) : 0;
    const coversUntil = new Date();
    coversUntil.setDate(coversUntil.getDate() + days);

    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">Committed covered through</div>
          <div className="font-mono font-semibold tracking-[-0.03em] mt-1.5 text-[28px] leading-tight">
            {coversUntil.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]">
            {fmtIDR(data.emergencyFund.now)} liquid covers {fmtIDR(data.committed)} of monthly bills for {days} days. Your
            income swings {Math.round(data.incomeVariancePct * 100)}% month to month, so we show durability instead of a daily allowance.
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center gap-2">
          <Waves size={13} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Variable income detected &middot; daily allowance switched off</span>
        </div>
        <Strip committed={data.committed} future={data.futurePlanned} freeBudget={data.freeBudget} freeSpent={data.freeSpent} items={data.items} freeLabel={FREE_LABEL} onOpenCommitted={() => setSheetOpen(true)} emergencyFund={data.emergencyFund} />
      </>
    );
  } else if (state === 'forecast') {
    const daysLeft = Math.max(1, data.daysInMonth - data.day);
    const freeLeft = data.freeBudget - data.freeSpent;
    const pace7 = data.last7DayFreeSpend / FORECAST_PACE_WINDOW_DAYS;
    const over = pace7 * daysLeft - freeLeft;
    const dailyTarget = Math.floor(freeLeft / daysLeft / 1000) * 1000;

    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-warning">Forecast &middot; {daysLeft} days left</div>
          <div className="font-semibold tracking-[-0.03em] mt-1.5 text-[24px] leading-tight">
            {FREE_LABEL} is heading <span className="text-warning">&plusmn;{fmtIDRShort(over)} over</span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]">
            Your last 7 days ran {fmtIDR(pace7)}/day. {fmtIDR(freeLeft)} is left &mdash; {pace7 > 0 ? Math.floor(freeLeft / pace7) : 0} more days at that pace.
          </div>
          <div className="mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-warning/10">
            <ArrowDownRight size={14} className="text-warning flex-shrink-0" />
            <span className="text-[12px] leading-snug">Drop to <span className="font-mono font-semibold tabular-nums">{fmtIDR(dailyTarget)}/day</span> and the month still fits.</span>
          </div>
        </div>
        <Strip committed={data.committed} future={data.futurePlanned} freeBudget={data.freeBudget} freeSpent={data.freeSpent} items={data.items} freeLabel={FREE_LABEL} onOpenCommitted={() => setSheetOpen(true)} emergencyFund={data.emergencyFund} />
      </>
    );
  } else if (state === 'exhausted') {
    const daysLeft = Math.max(0, data.daysInMonth - data.day);
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-warning">{FREE_LABEL} &middot; fully used</div>
          <div className="font-semibold tracking-[-0.02em] mt-1.5 text-[21px] leading-snug max-w-[30ch]">
            You&rsquo;ve used this month&rsquo;s {FREE_LABEL} &mdash; {daysLeft} days left.
          </div>
          <div className="text-[12px] text-muted-foreground mt-2.5 leading-snug max-w-[46ch]">
            Committed and Future are untouched &mdash; both were set aside at the start of the month. Only day-to-day spending went over.
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="px-3 py-2.5 rounded-lg bg-success/10">
              <div className="text-[10px] uppercase tracking-wider text-success">Committed</div>
              <div className="text-[12px] font-medium mt-1 flex items-center gap-1"><Check size={12} strokeWidth={3} className="text-success" />All covered</div>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-success/10">
              <div className="text-[10px] uppercase tracking-wider text-success">Future</div>
              <div className="text-[12px] font-medium mt-1">{fmtIDR(data.futurePlanned)} intact</div>
            </div>
          </div>
          {data.biggestDriverCategory && (
            <div className="mt-3 text-[12px] text-muted-foreground leading-snug">
              Biggest driver: <span className="text-foreground font-medium">{data.biggestDriverCategory}</span> {fmtIDRShort(data.biggestDriverAmount)} &mdash; usually {fmtIDRShort(data.biggestDriverUsual)}.
            </div>
          )}
        </div>
        <Strip committed={data.committed} future={data.futurePlanned} freeBudget={data.freeBudget} freeSpent={data.freeSpent} items={data.items} freeLabel={FREE_LABEL} onOpenCommitted={() => setSheetOpen(true)} emergencyFund={data.emergencyFund} />
      </>
    );
  } else if (state === 'close') {
    if (closeLoading || !closeData) {
      body = <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading month close&hellip;</div>;
    } else {
      const pct = closeData.futurePlanned > 0 ? Math.round((closeData.futureActual / closeData.futurePlanned) * 100) : 0;
      const nextFuture = draftFuture ?? closeData.suggestedNextFuture;
      const nextFree = data.income - data.committed - nextFuture;

      body = (
        <>
          <div className="px-5 pt-5 pb-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{closeData.monthLabel} &middot; month close</div>
            <div className="flex items-start gap-2.5 mt-2">
              <div className="grid place-items-center rounded-full flex-shrink-0 mt-0.5 bg-success/15 text-success" style={{ width: 22, height: 22 }}>
                <Check size={13} strokeWidth={3} />
              </div>
              <div className="font-semibold tracking-[-0.02em] text-[18px] leading-snug max-w-[30ch]">
                {closeData.allCommittedPaid
                  ? `Everything committed was paid. ${closeData.committedStreakMonths} months running.`
                  : 'Some commitments were missed this month.'}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Glyph kind="future" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">Future</span>
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{fmtIDR(closeData.futureActual)} of {fmtIDR(closeData.futurePlanned)}</span>
                </div>
                <div className="mt-2"><Bar pct={pct} tone="bg-success" height={7} /></div>
              </div>
            </div>
            {closeData.transfers.length > 0 && (
              <div className="mt-3 ml-[38px] rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-medium border-b border-border bg-foreground/[0.02]">What we found across your accounts</div>
                {closeData.transfers.map((t, i) => (
                  <div key={i} className="px-3 py-2 flex items-center gap-2 text-[11px] border-b border-border/60 last:border-0">
                    <span className="text-muted-foreground whitespace-nowrap">{t.date}</span>
                    <span className="flex-1 truncate">{t.from} <span className="text-muted-foreground">&rarr;</span> {t.to}</span>
                    <span className="font-mono font-semibold tabular-nums">{fmtIDR(t.amount)}</span>
                  </div>
                ))}
                <div className="px-3 py-2 text-[11px] flex items-center gap-1.5 bg-foreground/[0.02]">
                  <Minus size={11} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Planned {fmtIDR(closeData.futurePlanned)} &middot; {fmtIDR(closeData.futureActual)} arrived</span>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border flex items-start gap-3">
            <Glyph kind="free" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">{FREE_LABEL}</span>
                <span className={cn('font-mono text-[12px] font-semibold tabular-nums', closeData.freeOverBy > 0 ? 'text-warning' : 'text-success')}>
                  {closeData.freeOverBy > 0 ? `over by ${fmtIDR(closeData.freeOverBy)}` : 'within budget'}
                </span>
              </div>
              {closeData.freeOverBy > 0 && closeData.biggestDriverCategory && (
                <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                  Almost all of it from <span className="text-foreground font-medium">{closeData.biggestDriverCategory}</span> at {fmtIDR(closeData.biggestDriverAmount)} &mdash; usually {fmtIDR(closeData.biggestDriverUsual)}.
                </div>
              )}
            </div>
          </div>

          <FutureSlider value={nextFuture} onChange={setDraftFuture} free={nextFree} tight={nextFree < data.softFloor} freeLabel={FREE_LABEL} medianFree={data.medianFree} max={sliderMax} />
          <div className="px-5 pb-5 pt-1 flex gap-2">
            <button
              onClick={() => futureMutation.mutate(nextFuture)}
              disabled={futureMutation.isPending}
              className="flex-1 text-[12px] font-semibold py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Use this next month
            </button>
            <button
              onClick={() => setDismissedClose(true)}
              className="text-[12px] font-medium py-2.5 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Later
            </button>
          </div>
        </>
      );
    }
  } else {
    const freeLeft = data.freeBudget - data.freeSpent;
    const daysLeft = Math.max(1, data.daysInMonth - data.day);
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">Daily remaining</div>
          <div className="font-mono font-semibold tracking-[-0.03em] tabular-nums mt-1.5 text-[36px] leading-tight">
            {fmtIDR(Math.floor(freeLeft / daysLeft / 1000) * 1000)}
          </div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[44ch]">
            After Committed &amp; Future. {fmtIDR(freeLeft)} left for {daysLeft} days.
          </div>
        </div>
        <Strip committed={data.committed} future={data.futurePlanned} freeBudget={data.freeBudget} freeSpent={data.freeSpent} items={data.items} freeLabel={FREE_LABEL} onOpenCommitted={() => setSheetOpen(true)} emergencyFund={data.emergencyFund} />
      </>
    );
  }

  return (
    <>
      <div className="pf-card overflow-hidden">
        <div className="px-5 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">Buckets</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground bg-foreground/5">{chip[state]}</span>
          </div>
        </div>
        {body}
        {state !== 'close' && (
          <div className="px-5 py-2.5 border-t border-border flex items-start gap-2 bg-foreground/[0.02]">
            <Sparkles size={12} className="text-muted-foreground mt-px flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground leading-snug">
              Estimated from your transaction categories &mdash;{' '}
              <button onClick={() => setSheetOpen(true)} className="font-medium text-foreground underline decoration-foreground/25 hover:decoration-foreground underline-offset-2">
                check anything that looks wrong
              </button>.
            </span>
          </div>
        )}
      </div>
      <CommittedSheet open={sheetOpen} onClose={() => setSheetOpen(false)} items={data.items} onDemote={key => demoteMutation.mutate(key)} />
    </>
  );
};

export default BucketsCard;
