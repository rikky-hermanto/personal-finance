/* ── Spend Pulse (Buckets + Variance), Achievements, Net Worth tabs ── */
const fmtR = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('en-US');
const fmtRS = (n) => { const a = Math.abs(n), s = n < 0 ? '−' : ''; if (a >= 1e6) { const v = a / 1e6; return `${s}Rp ${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}M`; } if (a >= 1e3) return `${s}Rp ${Math.round(a / 1e3)}K`; return `${s}Rp ${a}`; };

const GLYPH = { committed: ['Lock', 'text-foreground bg-foreground/10'], future: ['Shield', 'text-success bg-success/10'], free: ['Coffee', 'text-blue-600 dark:text-blue-400 bg-blue-600/10'] };
const Glyph = ({ kind, size = 26 }) => <div className={cx('grid place-items-center rounded-md flex-shrink-0', GLYPH[kind][1])} style={{ width: size, height: size }}><Icon name={GLYPH[kind][0]} size={Math.round(size * 0.54)} strokeWidth={1.9} /></div>;
const Bar = ({ pct, tone = 'bg-foreground', height = 6 }) => <div className="w-full rounded-full overflow-hidden bg-foreground/[0.07]" style={{ height }}><div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}></div></div>;

function bucketState(d) {
  const freeLeft = d.freeBudget - d.freeSpent;
  if (d.monthsAvailable < 2) return 'learning';
  if (freeLeft <= 0) return 'exhausted';
  const daysLeft = Math.max(1, d.daysInMonth - d.day);
  if (d.day >= 26 && (d.last7DayFreeSpend / 7) * daysLeft - freeLeft > 0) return 'forecast';
  return 'daily';
}

function BucketsCard() {
  const s = useStore();
  const d = React.useMemo(() => PFStore.buckets(), [s]);
  const [sheet, setSheet] = React.useState(false);
  const [editFuture, setEditFuture] = React.useState(null);
  const state = bucketState(d);
  const freeLeft = d.freeBudget - d.freeSpent; const daysLeft = Math.max(1, d.daysInMonth - d.day);
  const paid = d.items.filter((i) => i.paid).length;
  const goalPct = d.emergencyFund.target ? Math.round(d.emergencyFund.now / d.emergencyFund.target * 100) : 0;
  const demote = (key) => PFStore.update((st) => ({ ...st, buckets: { ...st.buckets, demoted: [...st.buckets.demoted, key] } }));
  const saveFuture = () => { PFStore.update((st) => ({ ...st, buckets: { ...st.buckets, futurePlanned: editFuture } })); setEditFuture(null); };
  let head;
  if (state === 'exhausted') {
    head = (
      <div className="px-5 pt-5 pb-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-warning">Free · fully used</div>
        <div className="font-semibold tracking-[-0.02em] mt-1.5 text-[21px] leading-snug max-w-[30ch]">You’ve used this month’s Free — {d.daysInMonth - d.day} days left.</div>
        <div className="text-[12px] text-muted-foreground mt-2.5 leading-snug max-w-[46ch]">Committed and Future are untouched — both were set aside at the start of the month. Only day-to-day spending went over.</div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="px-3 py-2.5 rounded-lg bg-success/10"><div className="text-[10px] uppercase tracking-wider text-success">Committed</div><div className="text-[12px] font-medium mt-1 flex items-center gap-1"><Icon name="Check" size={12} strokeWidth={3} className="text-success" />All covered</div></div>
          <div className="px-3 py-2.5 rounded-lg bg-success/10"><div className="text-[10px] uppercase tracking-wider text-success">Future</div><div className="text-[12px] font-medium mt-1">{fmtR(d.futurePlanned)} intact</div></div>
        </div>
        {d.biggestDriverCategory && <div className="mt-3 text-[12px] text-muted-foreground leading-snug">Biggest driver: <span className="text-foreground font-medium">{d.biggestDriverCategory}</span> {fmtRS(d.biggestDriverAmount)}.</div>}
      </div>
    );
  } else if (state === 'forecast') {
    const pace = d.last7DayFreeSpend / 7; const over = pace * daysLeft - freeLeft;
    head = (
      <div className="px-5 pt-5 pb-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-warning">Forecast · {daysLeft} days left</div>
        <div className="font-semibold tracking-[-0.03em] mt-1.5 text-[24px] leading-tight">Free is heading <span className="text-warning">±{fmtRS(over)} over</span></div>
        <div className="text-[12px] text-muted-foreground mt-2 leading-snug">Your last 7 days ran {fmtR(pace)}/day. {fmtR(freeLeft)} is left.</div>
      </div>
    );
  } else {
    head = (
      <div className="px-5 pt-5 pb-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">Daily remaining</div>
        <div className="font-mono font-semibold tracking-[-0.03em] tabular-nums mt-1.5 text-[36px] leading-tight">{fmtR(Math.floor(freeLeft / daysLeft / 1000) * 1000)}</div>
        <div className="text-[12px] text-muted-foreground mt-2 leading-snug">After Committed &amp; Future. {fmtR(freeLeft)} left for {daysLeft} days.</div>
      </div>
    );
  }
  const over = freeLeft < 0;
  return (
    <>
      <div className="pf-card overflow-hidden">
        <div className="px-5 pt-4 flex items-center gap-2"><span className="text-[13px] font-semibold tracking-tight">Buckets</span><span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground bg-foreground/5">Day {d.day}</span></div>
        {head}
        <button onClick={() => setSheet(true)} className="w-full text-left px-5 py-3.5 flex items-center gap-3 border-t border-border hover:bg-foreground/[0.025] transition-colors">
          <Glyph kind="committed" />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">Committed</div><div className="text-[11px] text-muted-foreground mt-0.5">{paid} of {d.items.length} bills have left</div></div>
          <div className="text-right"><div className="font-mono text-[13px] font-semibold tabular-nums">{fmtRS(d.committed)}</div><div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-end gap-0.5">breakdown <Icon name="ChevronRight" size={10} /></div></div>
        </button>
        <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
          <Glyph kind="future" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5"><span className="text-[13px] font-medium">Future</span><Icon name="ArrowRight" size={10} className="text-muted-foreground" /><span className="text-[11px] text-muted-foreground">Emergency fund</span><span className="text-[9.5px] font-medium px-1 py-px rounded text-muted-foreground bg-foreground/5">cash</span></div>
            <div className="mt-2 flex items-center gap-2.5"><div className="flex-1"><Bar pct={goalPct} tone="bg-success" /></div><span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtRS(d.emergencyFund.now)} of {fmtRS(d.emergencyFund.target)}</span></div>
          </div>
          <button onClick={() => setEditFuture(d.futurePlanned)} className="text-right group"><div className="font-mono text-[13px] font-semibold tabular-nums text-success">{fmtRS(d.futurePlanned)}</div><div className="text-[10px] text-muted-foreground mt-0.5 group-hover:text-foreground">per month · edit</div></button>
        </div>
        {editFuture !== null && (
          <div className="px-5 py-4 border-t border-border bg-foreground/[0.015]">
            <div className="flex items-baseline justify-between"><span className="text-[12px] font-medium">Future per month</span><span className="font-mono text-[15px] font-semibold tabular-nums text-success">{fmtR(editFuture)}</span></div>
            <input type="range" min={0} max={Math.max(d.income - d.committed, editFuture)} step={50000} value={editFuture} onChange={(e) => setEditFuture(+e.target.value)} className="w-full mt-3 accent-emerald-600" />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>Free becomes <span className="font-mono font-semibold text-foreground">{fmtR(d.income - d.committed - editFuture)}</span></span><span>your median {fmtRS(d.medianFree)}</span></div>
            {d.income - d.committed - editFuture < d.softFloor && <div className="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-md bg-warning/10"><Icon name="TriangleAlert" size={12} className="mt-px text-warning" /><span className="text-[11px] text-warning">You usually spend {fmtR(d.medianFree)} a month. Sure {fmtR(d.income - d.committed - editFuture)} is enough?</span></div>}
            <div className="flex gap-2 mt-3"><button onClick={saveFuture} className={cx(btnPrimary, 'flex-1')}>Use this</button><button onClick={() => setEditFuture(null)} className={btnOutline}>Cancel</button></div>
          </div>
        )}
        <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
          <Glyph kind="free" />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">Free</div><div className="mt-2 flex items-center gap-2.5"><div className="flex-1"><Bar pct={over ? 100 : d.freeSpent / d.freeBudget * 100} tone={over ? 'bg-warning' : 'bg-blue-600 dark:bg-blue-400'} /></div><span className={cx('text-[11px] whitespace-nowrap', over && 'text-warning')}>{over ? 'fully used' : `${fmtRS(freeLeft)} left`}</span></div></div>
          <div className="text-right"><div className="font-mono text-[13px] font-semibold tabular-nums">{fmtRS(d.freeBudget)}</div><div className="text-[10px] text-muted-foreground mt-0.5">this month</div></div>
        </div>
        <div className="px-5 py-2.5 border-t border-border flex items-start gap-2 bg-foreground/[0.02]">
          <Icon name="Sparkles" size={12} className="text-muted-foreground mt-px" />
          <span className="text-[11px] text-muted-foreground leading-snug">Estimated from your transaction categories — <button onClick={() => setSheet(true)} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-2">check anything that looks wrong</button>.</span>
        </div>
      </div>
      {sheet && (
        <Modal onClose={() => setSheet(false)} width="max-w-[520px]">
          <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-border">
            <Glyph kind="committed" size={30} />
            <div className="flex-1"><div className="text-[15px] font-semibold tracking-tight">Committed</div><div className="text-xs text-muted-foreground mt-0.5">{fmtR(d.committed)} · {d.items.length} commitments · {d.items.filter((i) => !i.certain).length} still inferred</div></div>
            <button onClick={() => setSheet(false)} className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground"><Icon name="X" size={15} /></button>
          </div>
          <div className="max-h-[42vh] overflow-y-auto">
            {d.items.map((it) => (
              <div key={it.key} className="group px-5 py-3 flex items-center gap-3 border-b border-border/60 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[13px] font-medium truncate">{it.name}</span>{!it.certain && <span className="text-[10px] font-medium px-1.5 py-px rounded text-warning bg-warning/10">inferred</span>}{it.paid && <Icon name="Check" size={12} className="text-success" />}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{it.due} · {it.source}{it.note ? ` · ${it.note}` : ''}</div>
                </div>
                <div className="font-mono text-[13px] font-semibold tabular-nums">{fmtR(it.amount)}</div>
                <button onClick={() => demote(it.key)} className="text-[11px] font-medium px-2 py-1 rounded-md border border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all whitespace-nowrap">Not committed</button>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-secondary/60 flex items-center gap-2"><Icon name="Info" size={13} className="text-muted-foreground" /><span className="text-[11px] text-muted-foreground">Moving a commitment to ‘Free’ also corrects how future transactions are categorized.</span></div>
        </Modal>
      )}
    </>
  );
}

function VarianceCard() {
  const s = useStore();
  const d = React.useMemo(() => PFStore.variance(), [s]);
  const [all, setAll] = React.useState(false);
  const f = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.abs(n));
  const fd = (n) => `${n >= 0 ? '+' : '−'}${f(n)}`;
  const tone = (v) => (v >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400');
  const drivers = all ? d.drivers : d.drivers.slice(0, 6);
  return (
    <div className="border border-border rounded-lg bg-card self-start">
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Variance vs 3-Month Average</p>
        <p className="text-sm text-foreground leading-snug">You spent <span className={cx('font-mono font-semibold', tone(d.delta))}>{fd(d.delta)}</span> vs your trailing average<span className={cx('font-mono text-xs ml-1', tone(d.delta))}>({d.deltaPct > 0 ? '+' : ''}{d.deltaPct.toFixed(1)}%)</span>.</p>
        <div className="flex gap-4 mt-3">
          <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">This month</p><p className="font-mono text-sm font-medium tabular-nums">{f(d.currentMonthTotal)}</p></div>
          <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">3-mo avg</p><p className="font-mono text-sm font-medium tabular-nums text-muted-foreground">{f(d.trailingAvgTotal)}</p></div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {drivers.map((x) => (
          <div key={x.category} className="flex items-center gap-3 px-6 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="text-xs font-medium truncate">{x.category}</span>{x.isOneOff && <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-600 border border-amber-500/20">one-off</span>}</div>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{f(x.currentMonthSpend)} vs {f(x.trailingAvg)} avg</p>
            </div>
            <span className={cx('font-mono text-xs font-semibold tabular-nums', tone(x.delta))}>{fd(x.delta)}</span>
          </div>
        ))}
      </div>
      {d.drivers.length > 6 && <button onClick={() => setAll((v) => !v)} className="w-full px-6 py-3 text-xs text-muted-foreground hover:text-foreground border-t border-border">{all ? 'Show less' : `Show ${d.drivers.length - 6} more`}</button>}
    </div>
  );
}

const SpendPulseTab = () => <div className="p-6"><div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start"><BucketsCard /><VarianceCard /></div></div>;

const ALL_ACHIEVEMENTS = [
  { code: 'positive_cashflow_3mo', name: 'Positive Cashflow Streak', desc: '3 consecutive months spending less than income' },
  { code: 'emergency_ready', name: 'Emergency Ready', desc: '3 months of expenses saved in liquid accounts' },
  { code: 'debt_free', name: 'Light Footprint', desc: 'Debt-to-income ratio below 20%' },
  { code: 'consistent_investor', name: 'Steady Builder', desc: 'Investing ≥15% of income for 3 months' },
  { code: 'graduated_l1', name: 'Level 1 Cleared', desc: 'All Cashflow indicators scored ≥70' },
  { code: 'graduated_l2', name: 'Level 2 Cleared', desc: 'All Defense indicators scored ≥70' },
  { code: 'graduated_l3', name: 'Level 3 Cleared', desc: 'All Growth indicators scored ≥70' },
];
function AchievementsPage({ onNav }) {
  const s = useStore();
  const got = s.journey.achievements;
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => onNav('/journey')} className="inline-flex items-center h-8 px-2.5 text-sm rounded-md hover:bg-foreground/5"><Icon name="ArrowLeft" size={16} className="mr-1" />Journey</button>
        <div><h1 className="text-2xl font-semibold">Achievements</h1><p className="text-sm text-muted-foreground">{got.length} / {ALL_ACHIEVEMENTS.length} unlocked</p></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ALL_ACHIEVEMENTS.map((a) => {
          const u = got.find((g) => g.code === a.code);
          return (
            <div key={a.code} title={a.desc} className={cx('pf-card cursor-default transition-colors pt-4 pb-3 px-3 text-center flex flex-col items-center gap-2', u ? 'ring-1 ring-amber-300 bg-amber-50/50 dark:bg-amber-500/5' : 'opacity-50')}>
              <div className={cx('w-10 h-10 rounded-full flex items-center justify-center', u ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground')}><Icon name={u ? 'Trophy' : 'Lock'} size={u ? 20 : 16} /></div>
              <p className="text-xs font-semibold leading-tight">{a.name}</p>
              <p className="text-[10px] text-muted-foreground">{u ? new Date(u.unlockedAt).toLocaleDateString() : a.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Net Worth ────────────────────────────────────────────────────────
function TrendChart({ data }) {
  const w = 640, h = 300, p = { l: 44, r: 12, t: 12, b: 28 };
  const vals = data.map((d) => d.valueIdr); const min = Math.min(...vals) - 5e7, max = Math.max(...vals) + 5e7;
  const x = (i) => p.l + (i / Math.max(1, data.length - 1)) * (w - p.l - p.r); const y = (v) => p.t + (1 - (v - min) / (max - min)) * (h - p.t - p.b);
  const line = data.map((d, i) => `${x(i)},${y(d.valueIdr)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((k) => min + (max - min) * k / 3);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id="nwg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(220 80% 55%)" stopOpacity="0.3" /><stop offset="95%" stopColor="hsl(220 80% 55%)" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t, i) => <g key={i}><line x1={p.l} x2={w - p.r} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="3 3" /><text x={p.l - 6} y={y(t) + 3} textAnchor="end" fontSize="11" fill="hsl(var(--muted-foreground))">{(t / 1e9).toFixed(2)}B</text></g>)}
      <polygon points={`${x(0)},${h - p.b} ${line} ${x(data.length - 1)},${h - p.b}`} fill="url(#nwg)" />
      <polyline points={line} fill="none" stroke="hsl(220 80% 55%)" strokeWidth="2.5" />
      {data.map((d, i) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">{new Date(d.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</text>)}
    </svg>
  );
}
const CHART_COLORS = ['hsl(220 80% 55%)', 'hsl(170 90% 32%)', 'hsl(280 66% 65%)', 'hsl(355 85% 58%)', 'hsl(35 91% 50%)', 'hsl(200 15% 60%)'];
function Donut({ data, size = 200, thickness = 34 }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]); const total = entries.reduce((x, e) => x + e[1], 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r; let off = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {entries.map(([k, v], i) => { const len = v / total * c; const el = <circle key={k} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART_COLORS[i % 6]} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} />; off += len; return el; })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {entries.map(([k, v], i) => <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % 6] }}></span>{k.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())} <span className="font-mono text-foreground/70">{Math.round(v / total * 100)}%</span></span>)}
      </div>
    </div>
  );
}
const Kpi = ({ label, value, sub, subCls = 'text-muted-foreground', big }) => (
  <div className="p-5 flex flex-col justify-center hover:bg-foreground/[0.02] transition-colors">
    <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground mb-1.5">{label}</h2>
    <div className={cx('font-mono tracking-tight font-semibold text-foreground', big ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl')}>{value}</div>
    <div className={cx('text-xs font-mono mt-2', subCls)}>{sub}</div>
  </div>
);
function AssetsOverviewTab() {
  const s = useStore();
  const nw = React.useMemo(() => PFStore.netWorth(), [s]);
  const dar = nw.liabilitiesIdr / nw.assetsIdr * 100;
  const exportTemplate = () => {
    const rows = [...s.accounts.map((a) => ['account', a.id, a.name, a.currency]), ...s.holdings.map((h) => ['holding', h.id, h.symbol, h.currency]), ...s.properties.map((p) => ['asset', p.id, p.name, 'IDR'])];
    downloadText(`assets-valuation-template-${PFStore.TODAY}.csv`, ['subject_type,subject_id,name,currency,value_native,valued_at'].concat(rows.map((r) => r.join(',') + ',,')).join('\n'));
  };
  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border border border-border rounded-lg bg-card overflow-hidden">
          <Kpi big label="Current Net Worth" value={fmtIDR(nw.netWorthIdr)} sub={`${nw.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(nw.deltaPct).toFixed(2)}% vs last month`} subCls={nw.deltaPct >= 0 ? 'text-green-600' : 'text-red-600'} />
          <Kpi label="Liquid Assets" value={fmtIDR(nw.liquidIdr)} sub="Cash & Investments" />
          <Kpi label="Total Liabilities" value={fmtIDR(nw.liabilitiesIdr)} sub={`${s.liabilities.length} active loans`} />
          <Kpi label="Debt to Asset Ratio" value={`${dar.toFixed(2)}%`} sub={dar < 30 ? 'Very Healthy' : dar < 50 ? 'Healthy' : 'Watch'} subCls={dar < 50 ? 'text-green-600' : 'text-amber-600'} />
        </div>
        <button onClick={exportTemplate} className={btnOutline}><Icon name="Download" size={14} />Export Template</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col border border-border rounded-lg bg-card h-[400px] overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex justify-between items-center"><h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Net Worth Trend</h3><span className="text-xs text-muted-foreground font-mono">Past 8 Months</span></div>
          <div className="flex-1 p-5 pb-2 min-h-0"><TrendChart data={nw.history} /></div>
        </div>
        <div className="flex flex-col border border-border rounded-lg bg-card h-[400px] overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Asset Allocation</h3></div>
          <div className="flex-1 p-4 flex items-center justify-center"><Donut data={nw.allocation} /></div>
        </div>
      </div>
    </div>
  );
}

const thc = 'px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground';
function ValuationDialog({ account, onClose }) {
  const cur = PFStore.balances()[account.id];
  const [v, setV] = React.useState(String(Math.round(cur)));
  const save = () => {
    const diff = Number(v) - cur; if (!diff) return onClose();
    PFStore.update((st) => ({ ...st, transactions: [...st.transactions, { id: 'adj' + Date.now(), date: PFStore.TODAY, description: 'Balance adjustment', amount: Math.abs(diff), flow: diff > 0 ? 'CR' : 'DB', type: 'transfer', category: 'Transfer', accountId: account.id }] }));
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <div className="p-6 space-y-4">
        <div><h2 className="text-sm font-semibold">Update {account.name}</h2><p className="text-xs text-muted-foreground mt-0.5">Records a manual valuation as of today</p></div>
        <input value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ''))} className={cx(inputCls, 'font-mono')} />
        <div className="flex justify-end gap-2"><button onClick={onClose} className={btnOutline}>Cancel</button><button onClick={save} className={btnPrimary}>Save valuation</button></div>
      </div>
    </Modal>
  );
}
function HoldingsTable({ holdings }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-muted/30">{['Symbol', 'Class', 'Units', 'Avg Cost', 'Price', 'Value (IDR)', 'Gain'].map((h, i) => <th key={h} className={cx(thc, 'py-3', i > 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {holdings.map((h) => { const g = (h.price - h.avgCost) / h.avgCost * 100; return (
            <tr key={h.id} className="hover:bg-foreground/[0.02]">
              <td className="px-5 py-3"><div className="text-xs font-semibold">{h.symbol}</div><div className="text-[10px] text-muted-foreground">{h.name}</div></td>
              <td className="px-5 py-3"><span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">{h.assetClass.replace('_', ' ')}</span></td>
              <td className="px-5 py-3 font-mono text-right text-xs">{h.units.toLocaleString('id-ID')}</td>
              <td className="px-5 py-3 font-mono text-right text-xs text-muted-foreground">{fmtPlain(h.avgCost)}</td>
              <td className="px-5 py-3 font-mono text-right text-xs">{fmtPlain(h.price)}</td>
              <td className="px-5 py-3 font-mono text-right text-xs">{fmtIDR(PFStore.holdingValue(h))}</td>
              <td className={cx('px-5 py-3 font-mono text-right text-xs', g >= 0 ? 'text-success' : 'text-destructive')}>{g >= 0 ? '+' : ''}{g.toFixed(1)}%</td>
            </tr>); })}
        </tbody>
      </table>
    </div>
  );
}
function AssetsInvestmentsTab() {
  const s = useStore(); const total = s.holdings.reduce((x, h) => x + PFStore.holdingValue(h), 0);
  return <div className="px-6 py-6 space-y-6"><div><p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Investments</p><p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{fmtIDR(total)}</p></div><HoldingsTable holdings={s.holdings} /></div>;
}
function PropertiesTab() {
  const s = useStore();
  return (
    <div className="px-6 py-6 space-y-6">
      <div><p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Property Value</p><p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{fmtIDR(s.properties.reduce((x, p) => x + p.value, 0))}</p></div>
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">{['Name', 'Type', 'Purchase', 'Current Value', 'Valued'].map((h, i) => <th key={h} className={cx(thc, 'py-3', i > 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{s.properties.map((p) => (
            <tr key={p.id}><td className="px-5 py-3.5 font-medium text-xs">{p.name}</td><td className="px-5 py-3.5 text-xs text-muted-foreground">{p.type}</td><td className="px-5 py-3.5 font-mono text-right text-xs text-muted-foreground">{fmtIDR(p.purchasePrice)}</td><td className="px-5 py-3.5 font-mono text-right text-xs">{fmtIDR(p.value)}</td><td className="px-5 py-3.5 font-mono text-right text-xs text-muted-foreground">{fmtDate(p.valuedAt)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
const LT_LABEL = { revolving: 'Revolving', installment: 'Installment', personal: 'Personal' };
const LT_CLS = { revolving: 'text-amber-500 bg-amber-500/10 border-amber-500/20', installment: 'text-blue-500 bg-blue-500/10 border-blue-500/20', personal: 'text-muted-foreground bg-muted border-border' };
const LtvBadge = ({ ltv }) => ltv == null ? <span className="text-xs text-muted-foreground">—</span> : <span className={cx('text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border', ltv < 0.7 ? 'text-green-600 bg-green-500/10 border-green-500/20' : ltv < 0.9 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20' : 'text-red-600 bg-red-500/10 border-red-500/20')}>{Math.round(ltv * 100)}%</span>;
function AddLiabilityDialog({ onClose }) {
  const [f, setF] = React.useState({ name: '', liabilityType: 'personal', principal: '', interestRate: '', monthlyPayment: '' });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name && Number(f.principal) > 0;
  const save = () => { PFStore.update((st) => ({ ...st, liabilities: [...st.liabilities, { id: 'l' + Date.now(), name: f.name, liabilityType: f.liabilityType, principal: Number(f.principal), interestRate: f.interestRate ? Number(f.interestRate) : null, monthlyPayment: f.monthlyPayment ? Number(f.monthlyPayment) : null, ltv: null }] })); onClose(); };
  const lbl = 'text-[11px] font-medium text-muted-foreground';
  return (
    <Modal onClose={onClose}>
      <div className="p-6 space-y-3">
        <h2 className="text-sm font-semibold">Add Liability</h2>
        <div className="space-y-1"><p className={lbl}>Name</p><input value={f.name} onChange={up('name')} placeholder="e.g. Car loan — Mandiri" className={inputCls} /></div>
        <div className="space-y-1"><p className={lbl}>Type</p><select value={f.liabilityType} onChange={up('liabilityType')} className={inputCls}><option value="revolving">Revolving</option><option value="installment">Installment</option><option value="personal">Personal</option></select></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><p className={lbl}>Principal (IDR)</p><input value={f.principal} onChange={up('principal')} className={cx(inputCls, 'font-mono')} /></div>
          <div className="space-y-1"><p className={lbl}>Rate %</p><input value={f.interestRate} onChange={up('interestRate')} className={cx(inputCls, 'font-mono')} /></div>
          <div className="space-y-1"><p className={lbl}>Monthly</p><input value={f.monthlyPayment} onChange={up('monthlyPayment')} className={cx(inputCls, 'font-mono')} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className={btnOutline}>Cancel</button><button disabled={!ok} onClick={save} className={btnPrimary}>Add liability</button></div>
      </div>
    </Modal>
  );
}
function LiabilitiesTab() {
  const s = useStore(); const [add, setAdd] = React.useState(false);
  const remove = (id) => PFStore.update((st) => ({ ...st, liabilities: st.liabilities.filter((l) => l.id !== id) }));
  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Liabilities</p><p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{fmtIDR(s.liabilities.reduce((x, l) => x + l.principal, 0))}</p></div>
        <button onClick={() => setAdd(true)} title="A debt you owe — credit card, mortgage, personal loan, or installment." className="px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90">Add Liability</button>
      </div>
      {s.liabilities.length === 0 ? <p className="text-sm text-muted-foreground text-center py-12">No liabilities yet. Add one to get started.</p> : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">{['Name', 'Type', 'Principal', 'Rate', 'Monthly', 'LTV', ''].map((h, i) => <th key={i} className={cx(thc, 'py-3', i > 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{s.liabilities.map((l) => (
              <tr key={l.id} className="group hover:bg-foreground/[0.02]">
                <td className="px-5 py-3.5 font-medium text-xs">{l.name}</td>
                <td className="px-5 py-3.5"><span className={cx('text-[10px] font-medium px-2 py-0.5 rounded border', LT_CLS[l.liabilityType])}>{LT_LABEL[l.liabilityType]}</span></td>
                <td className="px-5 py-3.5 font-mono text-right text-xs">{fmtIDR(l.principal)}</td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">{l.interestRate != null ? `${l.interestRate.toFixed(1)}%` : '—'}</td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">{l.monthlyPayment != null ? fmtIDR(l.monthlyPayment) : '—'}</td>
                <td className="px-5 py-3.5 text-right"><LtvBadge ltv={l.ltv} /></td>
                <td className="px-3 py-3.5 text-right"><button onClick={() => remove(l.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Icon name="Trash2" size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {add && <AddLiabilityDialog onClose={() => setAdd(false)} />}
    </div>
  );
}

Object.assign(window, { SpendPulseTab, AchievementsPage, AssetsOverviewTab, AssetsInvestmentsTab, PropertiesTab, LiabilitiesTab, HoldingsTable, Donut, CHART_COLORS });
