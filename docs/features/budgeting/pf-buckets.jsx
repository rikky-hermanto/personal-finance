/* ── Buckets: one card, six states. Committed sheet. Waterfall on shortfall. ── */
const B = window.BK;
const bcn = (...a) => a.filter(Boolean).join(' ');

const BK_TONE = {
  committed: 'hsl(var(--foreground))',
  future: 'hsl(var(--success))',
  free: 'hsl(220 55% 55%)',
  over: 'hsl(var(--warning))',
  risk: 'hsl(var(--destructive))',
};
const BK_ICON = { committed: 'Lock', future: 'Shield', free: 'Coffee' };

function BkGlyph({ kind, size = 26 }) {
  const tone = BK_TONE[kind];
  return (
    <div className="grid place-items-center rounded-md flex-shrink-0"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${tone} 12%, transparent)`, color: tone }}>
      <Icon name={BK_ICON[kind]} size={Math.round(size * 0.54)} strokeWidth={1.9} />
    </div>
  );
}

function BkBar({ pct, tone, height = 6, track = 0.07 }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: `hsl(var(--foreground) / ${track})` }}>
      <div className="grow-bar h-full rounded-full" style={{ width: Math.max(0, Math.min(100, pct)) + '%', background: tone }} />
    </div>
  );
}

/* Committed is a categorization guess until confirmed. Expandable, correctable. */
function BkCommittedSheet({ open, onClose, items, onDemote }) {
  if (!open) return null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const guessed = items.filter((i) => !i.certain).length;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ background: 'hsl(var(--foreground) / 0.28)' }} onClick={onClose}>
      <div className="pf-card w-full max-w-[520px] overflow-hidden pop-in" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 24px 60px -12px rgb(0 0 0 / 0.30)' }}>
        <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-border">
          <BkGlyph kind="committed" size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">Committed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{B.rp(total)} · {items.length} commitments · {guessed === 0 ? 'all confirmed' : guessed + ' still inferred'}</div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 -mt-1 rounded-md hover:bg-foreground/5 text-muted-foreground transition-colors"><Icon name="X" size={15} /></button>
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="group px-5 py-3 flex items-center gap-3 border-b border-border/60 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{it.name}</span>
                  {!it.certain && <span className="text-[10px] font-medium px-1.5 py-px rounded" style={{ color: 'hsl(var(--warning))', background: 'hsl(var(--warning) / 0.12)' }}>inferred</span>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{it.due} · {it.src}{it.note ? ' · ' + it.note : ''}</div>
              </div>
              <div className="font-data text-[13px] font-semibold tabular-nums">{B.rp(it.amount)}</div>
              <button onClick={() => onDemote(it.id)}
                className="text-[11px] font-medium px-2 py-1 rounded-md border border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-foreground/25 transition-all whitespace-nowrap">
                Not committed
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-secondary/60 flex items-center gap-2">
          <Icon name="Info" size={13} className="text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground leading-snug">Moving a commitment to {'\u2018'}Free{'\u2019'} also corrects how future transactions are categorized.</span>
        </div>
      </div>
    </div>
  );
}

/* The three-row strip. Committed = streak, Future = the only goal bar, Free = depleting bar. */
function BkStrip({ committed, future, freeBudget, freeSpent, streak, mode, onOpenCommitted, items, freeLabel }) {
  const freeLeft = freeBudget - freeSpent;
  const over = freeLeft < 0;
  const goalPct = Math.round((B.goal.now / B.goal.target) * 100);
  const paid = items.filter((i) => i.paid).length;
  return (
    <div className="flex flex-col">
      <button onClick={onOpenCommitted} className="text-left px-5 py-3.5 flex items-center gap-3 border-t border-border hover:bg-foreground/[0.025] transition-colors">
        <BkGlyph kind="committed" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Committed</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {mode === 'close'
              ? <span className="inline-flex items-center gap-1" style={{ color: BK_TONE.future }}><Icon name="Check" size={11} strokeWidth={3} />all paid — {streak} months running</span>
              : <>{paid} of {items.length} bills have left · rest due Aug 10–20</>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums">{B.rpShort(committed)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-end gap-0.5">breakdown <Icon name="ChevronRight" size={10} /></div>
        </div>
      </button>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <BkGlyph kind="future" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium">Future</span>
            <Icon name="ArrowRight" size={10} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{B.goal.label}</span>
            <span className="text-[9.5px] font-medium px-1 py-px rounded text-muted-foreground" style={{ background: 'hsl(var(--foreground) / 0.05)' }}>cash</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><BkBar pct={goalPct} tone={BK_TONE.future} /></div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{B.rpShort(B.goal.now)} of {B.rpShort(B.goal.target)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums" style={{ color: BK_TONE.future }}>{B.rpShort(future)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">per month</div>
        </div>
      </div>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <BkGlyph kind="free" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{freeLabel}</div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><BkBar pct={over ? 100 : (freeSpent / freeBudget) * 100} tone={over ? BK_TONE.over : BK_TONE.free} /></div>
            <span className="text-[11px] whitespace-nowrap" style={{ color: over ? BK_TONE.over : undefined }}>
              {over ? 'fully used' : B.rpShort(freeLeft) + ' left'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums">{B.rpShort(freeBudget)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">this month</div>
        </div>
      </div>
    </div>
  );
}

function BkHero({ label, value, caption, tone, small }) {
  return (
    <div className="px-5 pt-5 pb-4">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">{label}</div>
      <div className="font-data font-semibold tracking-[-0.03em] tabular-nums mt-1.5" style={{ fontSize: small ? 30 : 42, lineHeight: 1.05, color: tone }}>{value}</div>
      {caption && <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[44ch]" style={{ textWrap: 'pretty' }}>{caption}</div>}
    </div>
  );
}

function BkCaveat({ onOpen }) {
  return (
    <div className="px-5 py-2.5 border-t border-border flex items-start gap-2" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>
      <Icon name="Sparkles" size={12} className="text-muted-foreground mt-px flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground leading-snug">
        Estimated from your transaction categories — <button onClick={onOpen} className="font-medium text-foreground underline decoration-foreground/25 hover:decoration-foreground underline-offset-2">check anything that looks wrong</button>.
      </span>
    </div>
  );
}

/* Ordered cascade. A shortfall stops at a named point — never pro-rata, never silent. */
function BkWaterfall({ arrived, committed, future, freeBudget, freeLabel }) {
  let rest = arrived;
  const tiers = [
    { kind: 'committed', name: 'Committed', want: committed },
    { kind: 'future', name: 'Future', want: future },
    { kind: 'free', name: freeLabel, want: freeBudget },
  ].map((t) => {
    const got = Math.max(0, Math.min(t.want, rest));
    rest -= got;
    return { ...t, got, short: t.want - got };
  });
  const stop = tiers.find((t) => t.short > 0);
  return (
    <div className="px-5 pb-4">
      <div className="flex flex-col gap-2.5">
        {tiers.map((t) => {
          const isStop = stop && stop.name === t.name;
          const full = t.short <= 0;
          return (
            <div key={t.name} className="flex items-center gap-3">
              <BkGlyph kind={t.kind} size={22} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium">{t.name}</span>
                  <span className="font-data text-[11px] tabular-nums" style={{ color: full ? BK_TONE.future : BK_TONE.over }}>
                    {full ? B.rp(t.got) + ' funded' : B.rp(t.got) + ' of ' + B.rp(t.want)}
                  </span>
                </div>
                <div className="mt-1.5"><BkBar pct={(t.got / t.want) * 100} tone={full ? BK_TONE.future : BK_TONE.over} height={5} /></div>
                {isStop && <div className="text-[11px] mt-1.5" style={{ color: BK_TONE.over }}>Cascade stops here — short {B.rp(t.short)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BkFutureSlider({ value, onChange, free, tight, freeLabel }) {
  return (
    <div className="px-5 py-4 border-t border-border">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium">Future next month</span>
        <span className="font-data text-[15px] font-semibold tabular-nums" style={{ color: BK_TONE.future }}>{B.rp(value)}</span>
      </div>
      <input type="range" min={0} max={2400000} step={50000} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full mt-3 bk-range" />
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{freeLabel} becomes <span className="font-data font-semibold tabular-nums text-foreground">{B.rp(free)}</span></span>
        <span className="text-muted-foreground">your median {B.rpShort(B.median.free)}</span>
      </div>
      {tight && (
        <div className="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-md" style={{ background: 'hsl(var(--warning) / 0.1)' }}>
          <Icon name="TriangleAlert" size={12} className="mt-px flex-shrink-0" style={{ color: 'hsl(var(--warning))' }} />
          <span className="text-[11px] leading-snug" style={{ color: 'hsl(var(--warning))' }}>
            You usually spend {B.rp(B.median.free)} a month. Sure {B.rp(free)} is enough?
          </span>
        </div>
      )}
    </div>
  );
}

/* ── The card ─────────────────────────────────────────────────────────────── */
function BucketsCard({ state, futurePlan, setFuturePlan, lumpy, showCaveat, sheetOpen, setSheetOpen, freeLabel }) {
  const [demoted, setDemoted] = React.useState([]);
  const items = B.committedItems.filter((i) => !demoted.includes(i.id));
  const committed = items.reduce((s, i) => s + i.amount, 0);
  const freeBudget = B.median.income - committed - futurePlan;
  const tight = freeBudget < B.softFloor;
  const f = B.states[state];
  const openSheet = () => setSheetOpen(true);
  const strip = { committed, future: futurePlan, freeBudget, items, freeLabel, onOpenCommitted: openSheet };

  const certain = items.filter((i) => i.certain);
  const certainTotal = certain.reduce((s, i) => s + i.amount, 0);
  const chip = { learning: 'Learning', daily: 'Day 17', forecast: 'Day 26', exhausted: 'Day 24', shortfall: 'Day 3', close: 'July close' }[state];

  let body = null;
  if (state === 'learning') {
    body = (
      <>
        <BkHero label="Buckets" small value="Still learning" caption="We've seen 1 of 3 months of your transactions. The daily number appears once your spending pattern is clear enough — around October 8." />
        <div className="px-5 pb-4">
          <div className="flex gap-1.5">{[1, 0, 0].map((on, i) => <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: on ? 'hsl(var(--foreground) / 0.55)' : 'hsl(var(--foreground) / 0.09)' }} />)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">August recorded · September &amp; October in progress</div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex items-center gap-3">
          <BkGlyph kind="committed" />
          <div className="flex-1 text-[12px] text-muted-foreground leading-snug">What we can already confirm: <span className="text-foreground font-medium">{certain.length} fixed bills</span> worth {B.rpShort(certainTotal)}.</div>
          <button onClick={openSheet} className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border hover:border-foreground/25 transition-colors whitespace-nowrap">View</button>
        </div>
      </>
    );
  } else if (state === 'shortfall') {
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Income arrived {f.arrivedOn}</div>
          <div className="font-data font-semibold tracking-[-0.03em] tabular-nums mt-1.5" style={{ fontSize: 34, lineHeight: 1.05 }}>{B.rp(f.arrived)}</div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]" style={{ textWrap: 'pretty' }}>
            {B.rpShort(B.median.income - f.arrived)} below your {B.rpShort(B.median.income)} median. Buckets fill in order, so you can see exactly where it runs out.
          </div>
        </div>
        <BkWaterfall arrived={f.arrived} committed={committed} future={futurePlan} freeBudget={freeBudget} freeLabel={freeLabel} />
        <div className="px-5 pb-4">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--success) / 0.08)' }}>
            <Icon name="Check" size={13} strokeWidth={3} style={{ color: BK_TONE.future }} className="mt-px flex-shrink-0" />
            <span className="text-[12px] leading-snug">Every bill and your full {B.rp(futurePlan)} to {B.goal.label} are covered. The shortfall lands entirely in {freeLabel}.</span>
          </div>
        </div>
      </>
    );
  } else if (state === 'daily' && lumpy) {
    body = (
      <>
        <BkHero label="Committed covered through" value={B.runway.coversUntil}
          caption={`${B.rp(B.runway.liquid)} liquid across 4 accounts covers ${B.rp(committed)} of monthly bills for ${B.runway.days} days. Your income swings 34% month to month, so we show durability instead of a daily allowance.`} />
        <div className="px-5 pb-4 flex items-center gap-2">
          <Icon name="Waves" size={13} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Variable income detected · daily allowance switched off</span>
        </div>
        <BkStrip {...strip} freeSpent={f.spent} streak={3} mode="daily" />
      </>
    );
  } else if (state === 'daily') {
    const left = freeBudget - f.spent, days = B.daysInMonth - f.day;
    body = (
      <>
        <BkHero label="Daily remaining" value={B.rp(Math.floor(left / days / 1000) * 1000)} caption={`After Committed & Future. ${B.rp(left)} left for ${days} days.`} />
        <BkStrip {...strip} freeSpent={f.spent} streak={3} mode="daily" />
      </>
    );
  } else if (state === 'forecast') {
    const left = freeBudget - f.spent, days = B.daysInMonth - f.day;
    const over = f.pace7 * days - left;
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em]" style={{ color: BK_TONE.over }}>Forecast · {days} days left</div>
          <div className="font-semibold tracking-[-0.03em] mt-1.5" style={{ fontSize: 30, lineHeight: 1.1 }}>
            {freeLabel} is heading <span style={{ color: BK_TONE.over }}>±{B.rpShort(over)} over</span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]" style={{ textWrap: 'pretty' }}>
            Your last 7 days ran {B.rp(f.pace7)}/day. {B.rp(left)} is left — {Math.floor(left / f.pace7)} more days at that pace.
          </div>
          <div className="mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--warning) / 0.09)' }}>
            <Icon name="ArrowDownRight" size={14} style={{ color: BK_TONE.over }} className="flex-shrink-0" />
            <span className="text-[12px] leading-snug">Drop to <span className="font-data font-semibold tabular-nums">{B.rp(Math.floor(left / days / 1000) * 1000)}/day</span> and the month still fits.</span>
          </div>
        </div>
        <BkStrip {...strip} freeSpent={f.spent} streak={3} mode="forecast" />
      </>
    );
  } else if (state === 'exhausted') {
    const days = B.daysInMonth - f.day;
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em]" style={{ color: BK_TONE.over }}>{freeLabel} · fully used</div>
          <div className="font-semibold tracking-[-0.02em] mt-1.5" style={{ fontSize: 25, lineHeight: 1.2, maxWidth: '30ch' }}>
            You{'\u2019'}ve used this month{'\u2019'}s {freeLabel} — {days} days left.
          </div>
          <div className="text-[12px] text-muted-foreground mt-2.5 leading-snug max-w-[46ch]" style={{ textWrap: 'pretty' }}>
            Committed and Future are untouched — both were set aside at the start of the month. Only day-to-day spending went over.
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--success) / 0.08)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: BK_TONE.future }}>Committed</div>
              <div className="text-[12px] font-medium mt-1 flex items-center gap-1"><Icon name="Check" size={12} strokeWidth={3} style={{ color: BK_TONE.future }} />All covered</div>
            </div>
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--success) / 0.08)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: BK_TONE.future }}>Future</div>
              <div className="text-[12px] font-medium mt-1">{B.rp(futurePlan)} intact</div>
            </div>
          </div>
          <div className="mt-3 text-[12px] text-muted-foreground leading-snug">
            Biggest driver: <span className="text-foreground font-medium">{f.biggest.name}</span> {B.rpShort(f.biggest.amount)} — usually {B.rpShort(f.biggest.usual)}.
          </div>
        </div>
        <BkStrip {...strip} freeSpent={f.spent} streak={3} mode="exhausted" />
      </>
    );
  } else {
    const pct = Math.round((f.futureActual / f.futurePlanned) * 100);
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">July · month close</div>
          <div className="flex items-start gap-2.5 mt-2">
            <div className="grid place-items-center rounded-full flex-shrink-0 mt-0.5" style={{ width: 22, height: 22, background: 'hsl(var(--success) / 0.14)', color: BK_TONE.future }}>
              <Icon name="Check" size={13} strokeWidth={3} />
            </div>
            <div className="font-semibold tracking-[-0.02em]" style={{ fontSize: 23, lineHeight: 1.22, maxWidth: '28ch' }}>
              Everything committed was paid. Three months running.
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <BkGlyph kind="future" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">Future</span>
                <span className="font-data text-[12px] tabular-nums text-muted-foreground">{B.rp(f.futureActual)} of {B.rp(f.futurePlanned)}</span>
              </div>
              <div className="mt-2"><BkBar pct={pct} tone={BK_TONE.future} height={7} /></div>
            </div>
          </div>
          <div className="mt-3 ml-[38px] rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-medium border-b border-border" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>What we found across your accounts</div>
            {f.transfers.map((t, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2 text-[11px] border-b border-border/60 last:border-0">
                <span className="text-muted-foreground whitespace-nowrap">{t.date}</span>
                <span className="flex-1 truncate">{t.from} <span className="text-muted-foreground">→</span> {t.to}</span>
                <span className="font-data font-semibold tabular-nums">{B.rp(t.amount)}</span>
              </div>
            ))}
            <div className="px-3 py-2 text-[11px] flex items-center gap-1.5" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>
              <Icon name="Minus" size={11} className="text-muted-foreground" />
              <span className="text-muted-foreground">Planned {B.rp(f.futurePlanned)} on the 25th · {B.rp(f.futureActual)} arrived</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-start gap-3">
          <BkGlyph kind="free" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">{freeLabel}</span>
              <span className="font-data text-[12px] font-semibold tabular-nums" style={{ color: BK_TONE.over }}>over by {B.rp(f.freeOver)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              Almost all of it from <span className="text-foreground font-medium">{f.biggest.name}</span> at {B.rp(f.biggest.amount)} — usually {B.rp(f.biggest.usual)}.
            </div>
          </div>
        </div>

        <BkFutureSlider value={futurePlan} onChange={setFuturePlan} free={freeBudget} tight={tight} freeLabel={freeLabel} />
        <div className="px-5 pb-5 pt-1 flex gap-2">
          <button className="flex-1 text-[12px] font-semibold py-2.5 rounded-lg text-primary-foreground hover:opacity-90 transition-opacity" style={{ background: 'hsl(var(--primary))' }}>Use this for August</button>
          <button className="text-[12px] font-medium py-2.5 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">Later</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pf-card overflow-hidden" style={{ boxShadow: '0 1px 2px rgb(0 0 0/0.04), 0 12px 32px -18px rgb(0 0 0/0.16)' }}>
        <div className="px-5 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">Buckets</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground" style={{ background: 'hsl(var(--foreground) / 0.05)' }}>{chip}</span>
          </div>
          <button className="p-1 -mr-1 rounded hover:bg-foreground/5 text-muted-foreground transition-colors"><Icon name="Ellipsis" size={15} /></button>
        </div>
        {body}
        {showCaveat && state !== 'close' && <BkCaveat onOpen={openSheet} />}
      </div>
      <BkCommittedSheet open={sheetOpen} onClose={() => setSheetOpen(false)} items={items} onDemote={(id) => setDemoted((d) => [...d, id])} />
    </>
  );
}

Object.assign(window, { BucketsCard, BkCommittedSheet, BkStrip, BkGlyph, BkBar, BkWaterfall, BK_TONE });
