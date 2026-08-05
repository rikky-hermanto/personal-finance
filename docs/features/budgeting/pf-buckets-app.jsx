/* ── Shell: state switcher + rationale rail + tweaks ──────────────────────── */
const B2 = window.BK;
const acn = (...a) => a.filter(Boolean).join(' ');

const BK_STATES = [
  { id: 'learning', label: 'Learning' },
  { id: 'daily', label: 'Daily' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'exhausted', label: 'Free exhausted' },
  { id: 'shortfall', label: 'Shortfall' },
  { id: 'close', label: 'Month close' },
];

const BK_WHY = {
  learning: {
    title: 'Unevaluated renders as unevaluated',
    body: 'Under 3 months of data there is no daily number — only what is genuinely certain (fixed bills) and the date the number arrives. Jago needs a personality quiz because it has no transaction history. We have one, so we wait instead of guessing.',
  },
  daily: {
    title: 'One number, one screen',
    body: 'The hero is a daily allowance, not a spending permission — “after Committed & Future” is a measurement, not a blessing. Committed is tappable because the figure is a categorization guess, and a caveat with no way to check it is anxiety without agency.',
  },
  forecast: {
    title: 'The warning arrives while it can still be acted on',
    body: 'This state was not in the original three-screen spec. Month-end reconciliation is a postmortem — nothing can be fixed. Day 26 still has 5 days, so the forecast is paired with one concrete correction. Amber, not red: red is reserved for Committed at risk.',
  },
  exhausted: {
    title: 'A negative number is never the hero',
    body: '“−Rp 43,000” large and red is a guilt screen appearing exactly when the design matters most. What shows instead: a neutral fact, then the two things still safe (Committed, Future), then the single biggest driver — one, not five.',
  },
  shortfall: {
    title: 'The failure path Jago leaves undefined',
    body: 'Income arrived below median. The buckets fill as an ordered cascade — Committed, then Future, then Free — so the shortfall stops at one named point instead of being spread pro-rata and silently. Jago\u2019s Auto-Budgeting only offers “make sure the balance is enough,” which fails hardest in the month that needs the discipline most.',
  },
  lumpy: {
    title: 'A daily allowance assumes a salary; not everyone has one',
    body: 'Income swinging 34% month to month breaks the daily number — on day 3 of a bad month it would show a generous allowance funded by money that is not coming. Same data, honest framing: liquidity across all four accounts measured against committed bills, expressed as the date cover runs out.',
  },
  close: {
    title: 'Cross-account reconciliation — what Jago structurally cannot do',
    body: 'Jago executes the allocation but can only see Jago. We execute nothing, but we ingest BCA, Superbank, Jago and Wise — so we can say “planned Rp 1M, Rp 600K arrived” and show which transfers. Opens with the win; a shortfall always sits on the same line as its cause. The next-month slider is pre-filled: fresh-start effect, one tap.',
  },
};

function BucketsApp() {
  const [tw, setTweak] = useTweaks({
    state: 'daily', lumpy: false, dark: false, caveat: true, rail: true, zen: true, future: 1000000, everyday: false,
  });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const state = tw.state;
  const freeLabel = tw.everyday ? 'Everyday' : 'Free';
  const why = BK_WHY[state === 'daily' && tw.lumpy ? 'lumpy' : state];

  React.useEffect(() => { document.documentElement.classList.toggle('dark', tw.dark); }, [tw.dark]);

  return (
    <div className={acn('min-h-screen w-full', tw.zen && 'zen-canvas')} style={{ background: 'hsl(var(--background))' }}>
      <div className="mx-auto max-w-[1100px] px-8 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Buckets</h1>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-[62ch]" style={{ textWrap: 'pretty' }}>
            One card, six states. Not three separate screens — the card changes state as the month moves. Committed · Future · {freeLabel}, derived from your own {B2.months.join('–')} median.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2 flex-wrap">
          <div className="flex p-0.5 rounded-lg border border-border" style={{ background: 'hsl(var(--card))' }}>
            {BK_STATES.map((s) => (
              <button key={s.id} onClick={() => setTweak(s.id === 'close' ? { state: s.id, future: B2.states.close.suggest } : { state: s.id })}
                className={acn('text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                  state === s.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                style={state === s.id ? { background: 'hsl(var(--primary))' } : undefined}>
                {s.id === 'exhausted' ? freeLabel + ' exhausted' : s.label}
              </button>
            ))}
          </div>
          <button onClick={() => setTweak({ lumpy: !tw.lumpy, state: 'daily' })} title="Hero becomes durability instead of a daily allowance"
            className={acn('flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-2 rounded-lg border transition-colors whitespace-nowrap',
              tw.lumpy ? 'border-foreground/25 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            style={{ background: tw.lumpy ? 'hsl(var(--foreground) / 0.06)' : 'hsl(var(--card))' }}>
            <Icon name="Waves" size={13} />Variable income
          </button>
        </div>

        <div className="mt-7 flex gap-8 items-start flex-wrap">
          <div className="w-[452px] flex-shrink-0">
            <BucketsCard state={state} futurePlan={tw.future} setFuturePlan={(v) => setTweak('future', v)}
              lumpy={tw.lumpy} showCaveat={tw.caveat} sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} freeLabel={freeLabel} />
            <div className="mt-3 flex items-start gap-2 px-1">
              <Icon name="Layers" size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground leading-snug">This card lives on the dashboard — not its own tab, not a one-time onboarding flow.</span>
            </div>
          </div>

          {tw.rail && (
            <div className="flex-1 min-w-[290px] max-w-[400px] pt-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Why it looks like this</div>
              <div className="mt-3 text-[13.5px] font-semibold tracking-tight leading-snug" style={{ textWrap: 'pretty' }}>{why.title}</div>
              <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed" style={{ textWrap: 'pretty' }}>{why.body}</p>

              <div className="mt-6 pt-5 border-t border-border">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Derived from</div>
                <div className="mt-3 flex flex-col gap-2">
                  {[['Committed', B2.median.committed, 'committed'], [freeLabel, B2.median.free, 'free'], ['Leftover → Future', B2.median.leftover, 'future']].map(([l, v, k]) => (
                    <div key={l} className="flex items-center gap-2.5">
                      <BkGlyph kind={k} size={20} />
                      <span className="text-[12px] flex-1">{l}</span>
                      <span className="font-data text-[12px] font-semibold tabular-nums">{B2.rp(v)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                  Median of {B2.months.join(' · ')} — not the mean, so one Lebaran month can't set the year's budget. No 50/30/20 rule anywhere.
                </p>
              </div>

              <div className="mt-6 pt-5 border-t border-border">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Buckets are not goals</div>
                <p className="mt-3 text-[12px] text-muted-foreground leading-relaxed" style={{ textWrap: 'pretty' }}>
                  A bucket measures flow and resets monthly. A goal accumulates and has a date. Future is the tap; goals are what it fills — and the emergency fund is the one goal that must stay in cash, because its draw date is unknown.
                </p>
                <div className="mt-3 pf-card px-3.5 py-3">
                  <div className="flex flex-col gap-1.5 text-[11.5px]">
                    <div className="flex items-center gap-2"><span className="font-data font-semibold tabular-nums">{B2.rpShort(B2.median.income)}</span><span className="text-muted-foreground">income</span></div>
                    {[['committed', 'Committed', 'leaves this month'], ['free', freeLabel, 'spent, then resets'], ['future', 'Future', 'flows into goals']].map(([k, l, note]) => (
                      <div key={k} className="flex items-center gap-2 pl-1">
                        <span className="text-muted-foreground/50">└</span>
                        <BkGlyph kind={k} size={17} />
                        <span className="font-medium">{l}</span>
                        <span className="text-muted-foreground text-[11px]">{note}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pl-[26px] text-[11px]">
                      <span className="text-muted-foreground/50">└</span>
                      <span>{B2.goal.label}</span>
                      <span className="text-[9.5px] font-medium px-1 py-px rounded text-muted-foreground whitespace-nowrap" style={{ background: 'hsl(var(--foreground) / 0.05)' }}>cash · mandatory</span>
                    </div>
                    <div className="pl-[26px] text-[11px] text-muted-foreground/70">└ future goals — each one carries a target date</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <TweaksPanel title="Buckets">
        <TweakSection label="State">
          <TweakSelect label="Month phase" value={tw.state} options={BK_STATES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setTweak('state', v)} />
          <TweakToggle label="Variable income" value={tw.lumpy} onChange={(v) => setTweak('lumpy', v)} />
        </TweakSection>
        <TweakSection label="Naming">
          <TweakToggle label="Use “Everyday” for Free" value={tw.everyday} onChange={(v) => setTweak('everyday', v)} />
        </TweakSection>
        <TweakSection label="Budget">
          <TweakSlider label="Future / month" value={tw.future} min={0} max={2400000} step={50000} onChange={(v) => setTweak('future', v)} />
          <TweakButton label="Open Committed breakdown" onClick={() => setSheetOpen(true)} />
        </TweakSection>
        <TweakSection label="Presentation">
          <TweakToggle label="Derivation caveat" value={tw.caveat} onChange={(v) => setTweak('caveat', v)} />
          <TweakToggle label="Rationale notes" value={tw.rail} onChange={(v) => setTweak('rail', v)} />
          <TweakToggle label="Zen grid" value={tw.zen} onChange={(v) => setTweak('zen', v)} />
          <TweakToggle label="Dark mode" value={tw.dark} onChange={(v) => setTweak('dark', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<BucketsApp />);
