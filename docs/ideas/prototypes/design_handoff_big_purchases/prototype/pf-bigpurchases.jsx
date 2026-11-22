/* ── PF-154 Big Purchases (Growth · L3) ── zen, compact, no rule lines ── */
const G = window.PFGoals;
const BP_TWEAKS = /*EDITMODE-BEGIN*/{"foundation": "not_recommended_yet", "planView": "split"}/*EDITMODE-END*/;
const toneDot = { success: 'bg-success', warning: 'bg-warning', muted: 'bg-muted-foreground/40' };
const toneText = { success: 'text-success', warning: 'text-warning', muted: 'text-muted-foreground' };
const toneSoft = { success: 'bg-success/[0.06]', warning: 'bg-warning/[0.08]', muted: 'bg-foreground/[0.035]' };
const sortGoals = (gs) => [...gs].sort((a, b) => a.priority - b.priority || (a.date || '9999').localeCompare(b.date || '9999'));
const uid = () => Math.random().toString(36).slice(2, 9);
const digits = (s) => (s || '').replace(/[^\d]/g, '');

function MoneyInput({ value, onChange, placeholder = '0', autoFocus }) {
  return (
    <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-foreground/[0.04] focus-within:bg-foreground/[0.06] transition-colors">
      <span className="text-sm text-muted-foreground">Rp</span>
      <input autoFocus={autoFocus} inputMode="numeric" value={value ? Number(value).toLocaleString('id-ID') : ''} onChange={(e) => onChange(digits(e.target.value))} placeholder={placeholder} className="flex-1 min-w-0 bg-transparent outline-none text-sm font-data text-foreground placeholder:text-muted-foreground/50" />
    </div>
  );
}
const fieldCls = 'w-full px-3 h-10 rounded-xl bg-foreground/[0.04] focus:bg-foreground/[0.06] outline-none text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors';
function Field({ label, hint, children }) {
  return (<label className="flex flex-col gap-1.5"><span className="text-xs text-muted-foreground">{label}{hint && <span className="text-muted-foreground/60"> · {hint}</span>}</span>{children}</label>);
}
function Bar({ pct, tone = 'fg', h = 'h-1' }) {
  return (<div className={cx('w-full rounded-full bg-foreground/[0.06] overflow-hidden', h)}><div className={cx('grow-bar h-full rounded-full', tone === 'fg' ? 'bg-foreground/80' : 'bg-success')} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}></div></div>);
}
function GateLabel({ state, size = 'xs' }) {
  const m = G.GATE[state];
  return (<span className={cx('inline-flex items-center gap-1.5', size === 'xs' ? 'text-[11px]' : 'text-sm font-medium', toneText[m.tone])}><span className={cx('w-1.5 h-1.5 rounded-full', toneDot[m.tone])}></span>{m.title}</span>);
}

const Card = ({ className, children, onClick }) => <div onClick={onClick} className={cx('rounded-2xl bg-card border border-border/60 p-5', className)} style={{ boxShadow: '0 1px 2px rgb(0 0 0 / .03), 0 8px 24px -12px rgb(0 0 0 / .06)' }}>{children}</div>;
const CardTitle = ({ children, right }) => <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap min-h-[28px]"><h3 className="text-[15px] font-medium text-foreground whitespace-nowrap">{children}</h3>{right}</div>;
const pctTxt = (p) => p.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';

const GOAL_HUES = [155, 250, 300, 30, 200, 340, 95, 60];
const goalColor = (i) => `oklch(0.6 0.1 ${GOAL_HUES[i % GOAL_HUES.length]})`;
const mIdx = (k) => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
const mKey = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

function PlanSplit({ all }) {
  const tint = (c) => `color-mix(in oklch, ${c} 20%, transparent)`;
  const sub = (x) => x.g.status === 'paused' ? 'Paused' : x.r.timeline === 'overdue' ? `Past due · ${G.rpShort(x.r.remaining)}` : x.r.timeline === 'no_date' ? 'No target date' : x.r.timeline === 'funded' ? 'Funded' : `until ${G.ym(x.g.date.slice(0, 7))}`;
  return (<>
    <div className="flex h-2.5 gap-1">
      {all.map((x) => (
        <div key={x.g.id} title={`${x.g.name} · ${G.rpShort(x.r.allocated)} of ${G.rpShort(x.r.effective)}`} className="h-full rounded-full overflow-hidden" style={{ flexGrow: x.r.effective, flexBasis: 0, background: tint(x.color) }}>
          <div className="h-full grow-bar" style={{ width: `${Math.min(100, x.r.percent)}%`, background: x.color }}></div>
        </div>
      ))}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {all.map((x) => <span key={x.g.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full" style={{ background: x.color }}></span>{x.g.name}</span>)}
    </div>
  </>);
}

function PlanSteps({ sched, total }) {
  const now = mIdx(G.TODAY.slice(0, 7)); const byDate = [...sched].sort((a, b) => a.g.date.localeCompare(b.g.date));
  const segs = []; let start = now, v = total;
  byDate.forEach((x) => { const end = mIdx(x.g.date.slice(0, 7)); const len = end - start + 1; if (len > 0) { segs.push({ len, v, to: mKey(end), names: [x.g.name] }); start = end + 1; } else if (segs.length) segs[segs.length - 1].names.push(x.g.name); v -= x.r.monthly; });
  const max = Math.max(...segs.map((s) => s.v), 1);
  return (<>
    <div className="flex items-end gap-1 h-24">
      {segs.map((s, i) => (
        <div key={i} className="min-w-0 flex flex-col justify-end h-full" style={{ flexGrow: s.len, flexBasis: 0 }}>
          <div className={cx('text-[12px] font-data truncate mb-1.5', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>{G.rpShort(s.v)}<span className="text-[10px]">/mo</span></div>
          <div className={cx('rounded-lg grow-bar', i === 0 ? 'bg-foreground/85' : 'bg-foreground/[0.1]')} style={{ height: `${Math.max(6, (s.v / max) * 60)}px` }}></div>
        </div>
      ))}
    </div>
    <div className="flex gap-1 mt-2.5">
      {segs.map((s, i) => (
        <div key={i} className="min-w-0" style={{ flexGrow: s.len, flexBasis: 0 }}>
          <div className="text-[11px] text-foreground truncate">{s.names.join(', ')} due</div>
          <div className="text-[10px] text-muted-foreground truncate">{G.ym(s.to)} · {s.len} mo</div>
        </div>
      ))}
    </div>
    <p className="text-[11px] text-muted-foreground mt-4">The monthly amount steps down as each goal reaches its date.</p>
  </>);
}

function PlanThisMonth({ sched, onContribute }) {
  const mk = G.TODAY.slice(0, 7);
  const rows = sched.map((x) => { const need = G.compute({ ...x.g, contributions: x.g.contributions.filter((c) => !c.on.startsWith(mk)) }).monthly || 0; const done = x.g.contributions.filter((c) => c.on.startsWith(mk)).reduce((s, c) => s + c.amount, 0); return { ...x, need, done: Math.max(done, 0) }; });
  const N = rows.reduce((s, r) => s + r.need, 0), D = rows.reduce((s, r) => s + Math.min(r.done, r.need), 0);
  return (<>
    <div className="flex items-baseline justify-between gap-3 flex-wrap"><span className="text-[13px] text-foreground">{G.ym(mk).split(' ')[0]}: <span className="font-data">{G.rpShort(D)}</span> <span className="text-muted-foreground">of {G.rpShort(N)} set aside</span></span><span className="text-[11px] text-muted-foreground">{rows.filter((r) => r.done >= r.need).length} of {rows.length} goals done</span></div>
    <div className="mt-3 flex flex-col gap-1">
      {rows.map((r) => { const ok = r.done >= r.need; return (
        <div key={r.g.id} className="group flex items-center gap-3 min-w-0 rounded-xl px-3 py-2 bg-foreground/[0.025]">
          <span className={cx('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0', ok ? 'bg-success text-white' : 'border border-border')}>{ok && <Icon name="Check" size={11} strokeWidth={3} />}</span>
          <div className="flex-1 min-w-0"><div className={cx('text-[13px] truncate', ok ? 'text-muted-foreground' : 'text-foreground')}>{r.g.name}</div><div className="text-[11px] font-data text-muted-foreground truncate"><span className="text-foreground/80">{G.rpShort(r.done)}</span> / {G.rpShort(r.need)}</div></div>
          <div className="w-20 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden hidden sm:block flex-shrink-0"><div className="h-full rounded-full grow-bar" style={{ width: `${Math.min(100, (r.done / r.need) * 100)}%`, background: ok ? 'var(--color-success, #16a34a)' : r.color }}></div></div>
                    <button onClick={() => onContribute(r.g)} className={cx('h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card flex-shrink-0', ok && 'invisible')}><Icon name="Plus" size={13} /></button>
        </div>); })}
    </div>
  </>);
}

function PlanCard({ goals, view, onContribute, colorOf }) {
  const all = sortGoals(goals.filter((g) => g.status === 'active' || g.status === 'paused')).map((g) => ({ g, r: G.compute(g), color: colorOf(g.id) }));
  const rs = all.filter((x) => x.g.status === 'active');
  const sched = rs.filter((x) => x.r.monthly);
  const undated = rs.filter((x) => x.r.timeline === 'no_date');
  const monthly = sched.reduce((s, x) => s + x.r.monthly, 0);
  const lump = rs.filter((x) => x.r.timeline === 'overdue' || x.r.timeline === 'due_soon').reduce((s, x) => s + x.r.remaining, 0);
  const alloc = rs.reduce((s, x) => s + x.r.allocated, 0), tgt = rs.reduce((s, x) => s + x.r.effective, 0);
  return (
    <Card className="col-span-12 lg:col-span-7 flex flex-col">
      <CardTitle right={<span className="text-[11px] text-muted-foreground">Today's prices · no returns assumed</span>}>Monthly plan</CardTitle>
      <div className="flex-1 flex flex-col justify-center pt-2 pb-14">
        <div className="font-data text-[44px] leading-none tracking-tight text-foreground whitespace-nowrap">{G.rpShort(monthly)}<span className="text-lg text-muted-foreground"> / month</span></div>
        <p className="text-sm text-muted-foreground mt-3 text-pretty">keeps {sched.length} dated goals on time.{lump > 0 && <span className="text-warning"> {rs.filter((x) => x.r.timeline === 'overdue').map((x) => x.g.name).join(', ') || 'Some goals'} {rs.filter((x) => x.r.timeline === 'overdue').length > 1 ? 'are' : 'is'} past due by {G.rpShort(lump)}.</span>}</p>
      </div>
      <div>
        {view === 'steps' ? <PlanSteps sched={sched} total={monthly} /> : view === 'month' ? <PlanThisMonth sched={sched} onContribute={onContribute} /> : <PlanSplit all={all} />}
      </div>
    </Card>
  );
}

function FoundationCard({ f }) {
  const m = G.GATE[f.state]; const body = G.gateBody(f);
  const icon = { pass: ['Check', 'text-success bg-success/10'], fail: ['X', 'text-warning bg-warning/10'], missing: ['Minus', 'text-muted-foreground bg-foreground/[0.05]'] };
  return (
    <Card className="col-span-12 lg:col-span-5 flex flex-col">
      <CardTitle right={<GateLabel state={f.state} />}>Foundation check</CardTitle>
      <p className="text-[13px] text-foreground/75 mt-3 leading-relaxed text-pretty">{body[0]}</p>
      {body.slice(1).map((b, i) => <p key={i} className="text-[13px] text-foreground/75 mt-1 leading-relaxed text-pretty">{b}</p>)}
      <div className="mt-4 flex flex-col gap-1">
        {f.checks.map((c) => (
          <div key={c.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-foreground/[0.025]">
            <span className={cx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', icon[c.state][1])}><Icon name={icon[c.state][0]} size={13} strokeWidth={2.25} /></span>
            <div className="flex-1 min-w-0"><div className="text-[13px] text-foreground">{c.label}</div><div className="text-[11px] text-muted-foreground">Bar: {c.bar}</div></div>
            <span className="text-[13px] font-data text-foreground text-right">{c.value}</span>
          </div>
        ))}
      </div>
      {f.earmarked > 0 && <p className="text-[11px] text-muted-foreground mt-3">{G.rp(f.earmarked)} in savings is set aside for goals, so it isn't counted as cushion.</p>}
    </Card>
  );
}

/* ── Empty state: shown on Plans while there are no active or paused goals. Guidance only, never data. ── */
function GuideCard({ onNew }) {
  return (
    <Card className="col-span-12 lg:col-span-7 flex flex-col">
      <CardTitle right={<span className="text-[11px] text-muted-foreground">Your monthly plan shows here once you add a goal</span>}>How Big Purchases works</CardTitle>
      <ol className="mt-4 flex flex-col gap-1 flex-1">
        {G.GUIDE.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-xl px-3 py-2.5 bg-foreground/[0.025]">
            <span className="w-6 h-6 rounded-lg bg-foreground/[0.06] text-[11px] font-semibold font-data text-foreground/70 flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground">{s.title}</div>
              <div className="text-[12px] text-muted-foreground leading-relaxed mt-0.5 text-pretty">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <button onClick={() => onNew()} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90"><Icon name="Plus" size={14} />Plan your first big purchase</button>
      </div>
    </Card>
  );
}

function ExampleGoalCard() {
  const E = G.EXAMPLE; const cat = G.CATEGORIES[E.category]; const color = goalColor(0);
  return (
    <div aria-label="Example goal, not saved" className="rounded-2xl border border-dashed border-border p-5 flex flex-col select-none">
      <div className="flex items-start gap-3 opacity-80">
        <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center flex-shrink-0"><Icon name={cat.icon} size={18} strokeWidth={1.5} className="text-foreground/70" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-foreground truncate">{E.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{E.meta}</div>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.05] text-foreground/60 flex-shrink-0">Example</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-x-3 flex-wrap opacity-80">
        <span className="text-2xl font-data text-foreground tracking-tight whitespace-nowrap">{E.allocated}</span>
        <span className="text-xs text-muted-foreground font-data whitespace-nowrap">{E.target}</span>
      </div>
      <div className="mt-2.5 w-full h-2 rounded-full opacity-80" style={{ background: `color-mix(in oklch, ${color} 20%, transparent)` }}></div>
      <div className="mt-4 flex-1 text-[13px] leading-snug text-foreground/70">{E.next}</div>
      <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed text-pretty">Each goal shows what you've set aside, the target, and the monthly amount that gets you there. This example isn't saved.</p>
    </div>
  );
}

function StarterTile({ onStart }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-5 flex flex-col min-h-[200px]">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center text-muted-foreground flex-shrink-0"><Icon name="Plus" size={18} strokeWidth={1.5} /></span>
        <div className="min-w-0"><div className="text-[15px] font-medium text-foreground">Start a goal</div><div className="text-[11px] text-muted-foreground">What are you saving for?</div></div>
      </div>
      <div className="mt-3 flex flex-col gap-0.5">
        {Object.entries(G.CATEGORIES).map(([k, c]) => (
          <button key={k} onClick={() => onStart(k)} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] outline-none transition-colors min-w-0">
            <Icon name={c.icon} size={14} strokeWidth={1.5} className="text-foreground/60 flex-shrink-0" />
            <span className="text-[13px] text-foreground whitespace-nowrap">{c.label}</span>
            <span className="text-[11px] text-muted-foreground truncate">{c.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal, f, onOpen, onContribute, color }) {
  const r = G.compute(goal); const gate = G.goalGate(f, goal); const cat = G.CATEGORIES[goal.category];
  const paused = goal.status === 'paused', closed = goal.status === 'achieved' || goal.status === 'cancelled';
  return (
    <Card onClick={onOpen} className={cx('group cursor-pointer flex flex-col hover:border-foreground/15 transition-colors', paused && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center flex-shrink-0"><Icon name={cat.icon} size={18} strokeWidth={1.5} className="text-foreground/70" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-foreground truncate">{goal.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{cat.label}{goal.date ? ` · by ${G.ym(goal.date.slice(0, 7))}` : ' · no date'}</div>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.05] text-foreground/60 flex-shrink-0" title={G.PRIORITY[goal.priority]}>P{goal.priority}</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-x-3 flex-wrap">
        <span className="text-2xl font-data text-foreground tracking-tight whitespace-nowrap">{G.rpShort(r.allocated)}</span>
        <span className="text-xs text-muted-foreground font-data whitespace-nowrap">of {G.rpShort(r.effective)}</span>
      </div>
      <div className="mt-2.5 w-full h-2 rounded-full overflow-hidden" style={{ background: `color-mix(in oklch, ${color} 20%, transparent)` }}><div className="grow-bar h-full rounded-full" style={{ width: `${Math.min(100, r.percent)}%`, background: color }}></div></div>
      <div className="mt-4 flex-1">
        {closed ? <div className="text-[13px] text-muted-foreground">{goal.status === 'achieved' ? `Achieved ${goal.achievedAt ? G.dmy(goal.achievedAt) : ''}` : 'Cancelled'}</div>
          : <div className={cx('text-[13px] leading-snug', r.timeline === 'overdue' ? 'text-warning' : 'text-foreground/80')}>{paused ? 'Paused' : G.nextStep(r, goal)}</div>}
      </div>
      {!closed && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <GateLabel state={gate.state} />
          <button onClick={(e) => { e.stopPropagation(); onContribute(); }} className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1 transition-colors"><Icon name="Plus" size={12} />Add</button>
        </div>
      )}
    </Card>
  );
}

/* Drill-down detail — slide-over */
function GoalDrawer({ goal, f, onClose, onEdit, onContribute, onDeleteContribution, onStatus, onDelete }) {
  const [menu, setMenu] = React.useState(false);
  const r = G.compute(goal); const gate = G.goalGate(f, goal); const cat = G.CATEGORIES[goal.category];
  const acc = (id) => G.ACCOUNTS.find((a) => a.id === id)?.name;
  const cs = [...goal.contributions].sort((a, b) => b.on.localeCompare(a.on));
  React.useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const longNoGrowth = r.monthsLeft >= 60 && !goal.growth;
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-foreground/[0.06]" onClick={onClose}>
      <div className="h-full w-full max-w-[520px] bg-card flex flex-col shadow-2xl rw-toast" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5">
          <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5"><Icon name="ArrowLeft" size={16} /></button>
          <span className="text-[11px] text-muted-foreground truncate ml-3">{cat.label} · P{goal.priority} {G.PRIORITY[goal.priority].toLowerCase()}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <h2 className="text-xl font-semibold text-foreground tracking-tight mt-4">{goal.name}</h2>
          {goal.status !== 'active' && <p className="text-xs text-muted-foreground mt-1 capitalize">{goal.status}{goal.achievedAt ? ` · ${G.dmy(goal.achievedAt)}` : ''}</p>}
          <div className="mt-6 flex items-baseline gap-2"><span className="text-3xl font-data text-foreground tracking-tight">{G.rp(r.allocated)}</span><span className="text-sm text-muted-foreground font-data">of {G.rp(r.effective)}</span></div>
          <div className="mt-3"><Bar pct={r.percent} h="h-1.5" /></div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{r.percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}% set aside</span>{goal.date && <span>Target {G.dmy(goal.date)}</span>}</div>

          <div className="mt-6 rounded-2xl bg-foreground/[0.035] px-4 py-3.5">
            <div className={cx('text-[15px] font-medium', r.timeline === 'overdue' ? 'text-warning' : 'text-foreground')}>{G.nextStep(r, goal)}</div>
            {r.timeline === 'scheduled' && <div className="text-[11px] text-muted-foreground mt-1">Straight line at today's prices{goal.growth ? `, prices up ${(goal.growth * 100).toFixed(1)}% a year (your assumption)` : ''}. No investment returns assumed.</div>}
            {r.pace && (r.pace.reach || r.pace.beyond) && <div className="text-xs text-foreground/70 mt-2.5">At your pace of {G.rp(r.pace.per)} a month (last 3 months), {r.pace.beyond ? 'more than 50 years' : `around ${G.ym(r.pace.reach)}`}.</div>}
            {longNoGrowth && <div className="text-xs text-muted-foreground mt-2.5">This is 5+ years away. Prices may rise by then; you can add a price-growth assumption in Edit.</div>}
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Foundation for this goal</span><GateLabel state={gate.state} /></div>
            <div className="mt-2 flex flex-col gap-1.5 text-[13px] text-foreground/80 leading-relaxed">
              {G.gateBody(f).map((b, i) => <p key={i}>{b}</p>)}
              {gate.extra.includes('post_purchase_dti') && <p>With an instalment of {G.rp(goal.instalment)}, your debt payments would be about {(gate.post * 100).toFixed(1)}% of your current take-home income. The Defense bar is 29.6%.</p>}
              {gate.post != null && !gate.extra.includes('post_purchase_dti') && <p>With an instalment of {G.rp(goal.instalment)}, debt payments would be about {(gate.post * 100).toFixed(1)}% of take-home income, within the 29.6% bar.</p>}
              {gate.post != null && <p className="text-[11px] text-muted-foreground">Estimate at your current take-home income, not a loan eligibility check.</p>}
            </div>
          </div>

          {goal.costs && goal.costs.length > 0 && (
            <div className="mt-7">
              <span className="text-xs text-muted-foreground">Cost breakdown</span>
              <div className="mt-2 flex flex-col gap-1">
                {goal.costs.map((k) => (
                  <div key={k.id} className={cx('flex justify-between text-[13px]', k.type === 'loan_principal' ? 'text-muted-foreground' : 'text-foreground/80')}><span>{k.label}{k.type === 'loan_principal' && <span className="text-[11px]"> · borrowed, not saved</span>}</span><span className="font-data">{G.rp(k.amount)}</span></div>
                ))}
                <div className="flex justify-between text-[13px] font-medium text-foreground mt-2"><span>Cash you need</span><span className="font-data">{G.rp(G.cashNeeded(goal.costs))}</span></div>
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>Full cost including loan</span><span className="font-data">{G.rp(G.totalCost(goal.costs))}</span></div>
              </div>
              {goal.category === 'vehicle' && <p className="text-[11px] text-muted-foreground mt-2">Does your on-the-road quote already include BBNKB and the first year's PKB? Check with the dealer before adding them.</p>}
            </div>
          )}

          <div className="mt-7">
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Contributions · {cs.length}</span><button onClick={onContribute} className="text-xs text-foreground hover:opacity-70 inline-flex items-center gap-1"><Icon name="Plus" size={12} />Record</button></div>
            <div className="mt-2 flex flex-col">
              {cs.map((x) => (
                <div key={x.id} className="group flex items-center gap-3 py-1.5 -mx-2 px-2 rounded-lg hover:bg-foreground/[0.03]">
                  <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">{G.dmy(x.on)}</span>
                  <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{[acc(x.held), x.note].filter(Boolean).join(' · ')}</span>
                  <span className={cx('text-[13px] font-data', x.amount < 0 ? 'text-expense' : 'text-foreground')}>{x.amount < 0 ? '−' : '+'}{G.rp(x.amount)}</span>
                  <button onClick={() => onDeleteContribution(x.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><Icon name="Trash2" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
          {goal.notes && <p className="mt-6 text-xs text-muted-foreground">{goal.notes}</p>}
        </div>
        <div className="px-6 py-4 flex items-center gap-2 relative">
          <button onClick={onContribute} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">Record contribution</button>
          <button onClick={onEdit} className="h-9 px-3 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/5">Edit</button>
          <div className="flex-1"></div>
          <button onClick={() => setMenu((m) => !m)} className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-foreground/5"><Icon name="Ellipsis" size={16} /></button>
          {menu && (
            <div className="absolute right-6 bottom-14 w-48 pf-card p-1 flex flex-col rw-toast" style={{ boxShadow: '0 12px 32px -8px rgb(0 0 0 / .18)' }}>
              {goal.status === 'active' && <button onClick={() => onStatus('paused')} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-foreground/5">Pause</button>}
              {goal.status === 'paused' && <button onClick={() => onStatus('active')} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-foreground/5">Resume</button>}
              {goal.status !== 'achieved' && <button onClick={() => onStatus('achieved')} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-foreground/5">Mark achieved</button>}
              {(goal.status === 'achieved' || goal.status === 'cancelled') && <button onClick={() => onStatus('active')} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-foreground/5">Back to plans</button>}
              {goal.status !== 'cancelled' && <button onClick={() => onStatus('cancelled')} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-foreground/5">Cancel goal</button>}
              <button onClick={onDelete} className="text-left text-xs px-3 py-2 rounded-lg hover:bg-destructive/10 text-destructive">Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Create / edit */
function GoalForm({ initial, presetCategory, onSave, onClose }) {
  const [d, setD] = React.useState(() => initial ? { ...initial, target: String(initial.target), growth: initial.growth ? String(initial.growth * 100) : '', instalment: initial.instalment ? String(initial.instalment) : '', month: initial.date ? initial.date.slice(0, 7) : '', costs: (initial.costs || []).map((k) => ({ ...k, amount: String(k.amount) })), breakdown: !!(initial.costs && initial.costs.length) }
    : { category: presetCategory || 'house_land', name: '', priority: 2, target: '', month: '', growth: '', instalment: '', notes: '', costs: [], breakdown: false, more: false });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const cat = G.CATEGORIES[d.category];
  const useCosts = cat.costs && d.breakdown;
  const costNums = d.costs.map((k) => ({ ...k, amount: Number(k.amount || 0) }));
  const target = useCosts ? G.cashNeeded(costNums) : Number(d.target || 0);
  const lastDay = (m) => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`; };
  const date = d.month ? lastDay(d.month) : null;
  const pastDate = !initial && date && date < G.TODAY;
  const preview = target > 0 ? G.compute({ target, date, growth: d.growth ? Number(d.growth) / 100 : null, contributions: initial ? initial.contributions : [] }) : null;
  const valid = d.name.trim() && target > 0 && !pastDate;
  const addCost = () => set('costs', [...d.costs, { id: uid(), type: d.costs.length ? 'fee' : 'down_payment', label: '', amount: '' }]);
  const upCost = (id, k, v) => set('costs', d.costs.map((c) => (c.id === id ? { ...c, [k]: v } : c)));
  const save = () => onSave({ ...(initial || { id: uid(), status: 'active', contributions: [] }), category: d.category, name: d.name.trim(), priority: d.priority, target, date, growth: d.growth ? Number(d.growth) / 100 : null, instalment: d.instalment ? Number(d.instalment) : null, notes: d.notes || '', costs: useCosts ? costNums.map((k) => ({ ...k, label: k.label || G.COST_TYPES[k.type] })) : [] });
  return (
    <Modal onClose={onClose} width="max-w-[520px]">
      <div className="px-6 pt-6 pb-2 max-h-[80vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-foreground">{initial ? 'Edit goal' : 'New big purchase'}</h3>
        <div className="mt-5 flex gap-1.5 flex-wrap">
          {Object.entries(G.CATEGORIES).map(([k, c]) => (
            <button key={k} onClick={() => set('category', k)} className={cx('h-9 px-3 rounded-xl text-xs inline-flex items-center gap-1.5 transition-colors', d.category === k ? 'bg-foreground text-background' : 'bg-foreground/[0.04] text-muted-foreground hover:text-foreground')}><Icon name={c.icon} size={13} strokeWidth={1.75} />{c.label}</button>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Name"><input autoFocus value={d.name} onChange={(e) => set('name', e.target.value)} placeholder={d.category === 'vehicle' ? 'e.g. Family car' : d.category === 'house_land' ? 'e.g. Land in Sleman' : 'Name this goal'} className={fieldCls} /></Field>
          {cat.costs && (
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-foreground/[0.04] self-start">
              {[[false, 'One amount'], [true, 'Break down the cost']].map(([v, l]) => <button key={l} onClick={() => { set('breakdown', v); if (v && !d.costs.length) setD((x) => ({ ...x, breakdown: true, costs: [{ id: uid(), type: 'down_payment', label: 'Down payment', amount: '' }, { id: uid(), type: 'loan_principal', label: 'Loan', amount: '' }] })); }} className={cx('h-8 px-3 rounded-[10px] text-xs transition-colors', d.breakdown === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>{l}</button>)}
            </div>
          )}
          {useCosts ? (
            <div className="flex flex-col gap-2">
              {d.costs.map((k) => (
                <div key={k.id} className="flex items-center gap-2">
                  <select value={k.type} onChange={(e) => upCost(k.id, 'type', e.target.value)} className={cx(fieldCls, 'w-36 flex-shrink-0 appearance-none')}>{Object.entries(G.COST_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <input value={k.label} onChange={(e) => upCost(k.id, 'label', e.target.value)} placeholder="Label" className={cx(fieldCls, 'flex-1 min-w-0')} />
                  <div className="w-40 flex-shrink-0"><MoneyInput value={k.amount} onChange={(v) => upCost(k.id, 'amount', v)} /></div>
                  <button onClick={() => set('costs', d.costs.filter((c) => c.id !== k.id))} className="text-muted-foreground hover:text-destructive"><Icon name="X" size={14} /></button>
                </div>
              ))}
              <button onClick={addCost} className="self-start text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"><Icon name="Plus" size={12} />Add a cost</button>
              <p className="text-[11px] text-muted-foreground">Enter amounts from your quote or invoice. Taxes like BPHTB{d.category === 'vehicle' ? ', BBNKB or PKB' : ''} vary by region, so the app doesn't estimate them.</p>
              <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Cash you need</span><span className="font-data text-foreground">{G.rp(target)}<span className="text-muted-foreground text-xs"> · full cost {G.rp(G.totalCost(costNums))}</span></span></div>
            </div>
          ) : (
            <Field label="Target amount"><MoneyInput value={d.target} onChange={(v) => set('target', v)} /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target date" hint="optional"><input type="month" value={d.month} min={initial ? undefined : G.TODAY.slice(0, 7)} onChange={(e) => set('month', e.target.value)} className={fieldCls} /></Field>
            <Field label="Priority" hint={G.PRIORITY[d.priority].toLowerCase()}>
              <div className="flex gap-1 h-10 p-0.5 rounded-xl bg-foreground/[0.04]">{[1, 2, 3, 4].map((p) => <button key={p} onClick={() => set('priority', p)} className={cx('flex-1 rounded-[10px] text-xs transition-colors', d.priority === p ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground')}>P{p}</button>)}</div>
            </Field>
          </div>
          {pastDate && <p className="text-xs text-warning -mt-2">Pick this month or later.</p>}
          <button onClick={() => set('more', !d.more)} className="self-start text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">More options<Icon name="ChevronDown" size={12} className={cx('transition-transform', d.more && 'rotate-180')} /></button>
          {d.more && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price growth" hint="% a year, your assumption"><input inputMode="decimal" value={d.growth} onChange={(e) => set('growth', e.target.value.replace(/[^\d.]/g, ''))} placeholder="None" className={fieldCls} /></Field>
                <Field label="Planned instalment" hint="per month"><MoneyInput value={d.instalment} onChange={(v) => set('instalment', v)} placeholder="None" /></Field>
              </div>
              <Field label="Notes"><input value={d.notes} onChange={(e) => set('notes', e.target.value)} className={fieldCls} /></Field>
            </div>
          )}
        </div>
      </div>
      <div className="px-6 py-4 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{preview ? <span><span className="text-foreground font-medium">{G.nextStep(preview, { date })}</span></span> : 'Add an amount to see the monthly figure'}</div>
        <button onClick={onClose} className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button disabled={!valid} onClick={save} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-30">{initial ? 'Save' : 'Create goal'}</button>
      </div>
    </Modal>
  );
}

function ContributionForm({ goal, goals, onSave, onClose }) {
  const [gid, setGid] = React.useState(goal ? goal.id : sortGoals(goals.filter((g) => g.status === 'active'))[0]?.id);
  const g = goals.find((x) => x.id === gid);
  const [kind, setKind] = React.useState('add');
  const [amt, setAmt] = React.useState('');
  const [on, setOn] = React.useState(G.TODAY);
  const [held, setHeld] = React.useState(() => g?.contributions.at(-1)?.held || '');
  const [note, setNote] = React.useState('');
  const alloc = g ? G.allocatedOf(g) : 0; const n = Number(amt || 0) * (kind === 'add' ? 1 : -1);
  const tooMuch = kind === 'withdraw' && alloc + n < 0; const future = on > G.TODAY;
  const after = g ? G.compute({ ...g, contributions: [...g.contributions, { amount: n, on }] }) : null;
  return (
    <Modal onClose={onClose} width="max-w-[420px]">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{kind === 'add' ? 'Record contribution' : 'Record withdrawal'}</h3>
          <div className="flex p-0.5 rounded-xl bg-foreground/[0.04]">{[['add', 'Add'], ['withdraw', 'Withdraw']].map(([v, l]) => <button key={v} onClick={() => setKind(v)} className={cx('h-7 px-3 rounded-[10px] text-xs', kind === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>{l}</button>)}</div>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          {!goal && <Field label="Goal"><select value={gid} onChange={(e) => setGid(e.target.value)} className={cx(fieldCls, 'appearance-none')}>{sortGoals(goals.filter((x) => x.status === 'active' || x.status === 'paused')).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          <Field label="Amount"><MoneyInput autoFocus value={amt} onChange={setAmt} /></Field>
          {tooMuch && <p className="text-xs text-warning -mt-2">Only {G.rp(alloc)} is set aside for this goal.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" value={on} max={G.TODAY} onChange={(e) => setOn(e.target.value)} className={fieldCls} /></Field>
            <Field label="Held in" hint="optional"><select value={held} onChange={(e) => setHeld(e.target.value)} className={cx(fieldCls, 'appearance-none')}><option value="">Not specified</option>{G.ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          </div>
          <Field label="Note" hint="optional"><input value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} /></Field>
          {held && G.ACCOUNTS.find((a) => a.id === held)?.type === 'savings' && <p className="text-[11px] text-muted-foreground -mt-1">Money in a savings account set aside for goals won't count toward your emergency cushion.</p>}
        </div>
      </div>
      <div className="px-6 py-4 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{after && n !== 0 && !tooMuch ? <span>Becomes <span className="text-foreground font-data">{G.rp(after.allocated)}</span> · {after.percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span> : g?.name}</div>
        <button onClick={onClose} className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button disabled={!n || tooMuch || future || !g} onClick={() => onSave(gid, { id: uid(), on, amount: n, held: held || null, note })} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-30">Save</button>
      </div>
    </Modal>
  );
}

function BigPurchasesPage({ tab }) {
  const [t, setTweak] = useTweaks(BP_TWEAKS);
  const [goals, setGoals] = useLS('pf_bp_goals_v3', []);
  const [openId, setOpenId] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [preset, setPreset] = React.useState(null);
  const newGoal = (category) => { setPreset(category || null); setForm('new'); };
  const [contrib, setContrib] = React.useState(null);
  const toast = useToast();
  const f = G.foundation(goals, t.foundation);
  const active = sortGoals(goals.filter((g) => g.status === 'active' || g.status === 'paused'));
  const done = goals.filter((g) => g.status === 'achieved' || g.status === 'cancelled');
  const colorOf = (id) => goalColor(Math.max(0, goals.findIndex((g) => g.id === id)));
  const open = goals.find((g) => g.id === openId);
  const up = (id, fn) => setGoals((gs) => gs.map((g) => (g.id === id ? fn(g) : g)));
  const list = tab === 'achieved' ? done : active;
  const empty = tab !== 'achieved' && active.length === 0;
  return (
    <div className="p-8 min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-sm text-muted-foreground">{tab === 'achieved' ? 'Goals you finished or let go.' : 'Save for land, a car, a degree or a wedding without touching your cushion.'}</p>
          </div>
          {tab !== 'achieved' && !empty && (
            <div className="flex items-center gap-2">
              <button onClick={() => setContrib('pick')} className="h-9 px-4 rounded-xl text-xs font-medium text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.07]">Record contribution</button>
              <button onClick={() => newGoal()} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90"><Icon name="Plus" size={14} />New goal</button>
            </div>
          )}
        </div>
        {tab !== 'achieved' && <div className="grid grid-cols-12 gap-4 mb-8">{empty ? <GuideCard onNew={newGoal} /> : <PlanCard goals={goals} colorOf={colorOf} view={t.planView} onContribute={(g) => setContrib(g)} />}<FoundationCard f={f} /></div>}
        {tab !== 'achieved' && (empty
          ? <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3"><h2 className="text-[15px] font-medium text-foreground">Start with a goal</h2><span className="text-[11px] text-muted-foreground">The example shows what a goal looks like; it isn't saved</span></div>
          : <div className="flex items-baseline justify-between mb-3"><h2 className="text-[15px] font-medium text-foreground">Goals <span className="text-muted-foreground font-normal">· {active.length}</span></h2><span className="text-[11px] text-muted-foreground">Sorted by priority, then date</span></div>)}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {empty && <><ExampleGoalCard /><StarterTile onStart={newGoal} /></>}
          {list.map((g) => <GoalCard key={g.id} goal={g} color={colorOf(g.id)} f={f} onOpen={() => setOpenId(g.id)} onContribute={() => setContrib(g)} />)}
          {tab !== 'achieved' && !empty && (
            <button onClick={() => newGoal()} className="rounded-2xl border border-dashed border-border min-h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02] transition-colors">
              <span className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center"><Icon name="Plus" size={18} strokeWidth={1.5} /></span>
              <span className="text-[13px]">New big purchase</span>
            </button>
          )}
          {tab === 'achieved' && list.length === 0 && <div className="col-span-full py-20 text-center text-sm text-muted-foreground">Goals you mark achieved or cancel land here.</div>}
        </div>
        <p className="mt-10 text-[11px] text-muted-foreground/80">A personal planning tool, not financial advice. Numbers come from what you entered.</p>
      </div>

      {open && <GoalDrawer goal={open} f={f} onClose={() => setOpenId(null)} onEdit={() => setForm(open)} onContribute={() => setContrib(open)}
        onDeleteContribution={(cid) => up(open.id, (g) => ({ ...g, contributions: g.contributions.filter((x) => x.id !== cid) }))}
        onStatus={(s) => { up(open.id, (g) => ({ ...g, status: s, achievedAt: s === 'achieved' ? G.TODAY : undefined })); toast({ title: s === 'achieved' ? 'Marked achieved' : s === 'paused' ? 'Goal paused' : s === 'cancelled' ? 'Goal cancelled' : 'Back in your plans', description: open.name }); setOpenId(null); }}
        onDelete={() => { setGoals((gs) => gs.filter((g) => g.id !== open.id)); toast({ title: 'Goal deleted', description: open.name }); setOpenId(null); }} />}
      {form && <GoalForm initial={form === 'new' ? null : form} presetCategory={preset} onClose={() => setForm(null)} onSave={(g) => { setGoals((gs) => gs.some((x) => x.id === g.id) ? gs.map((x) => (x.id === g.id ? g : x)) : [...gs, g]); setForm(null); toast({ title: form === 'new' ? 'Goal created' : 'Goal saved', description: g.name }); }} />}
      {contrib && <ContributionForm goal={contrib === 'pick' ? null : contrib} goals={goals} onClose={() => setContrib(null)} onSave={(gid, x) => { up(gid, (g) => ({ ...g, contributions: [...g.contributions, x] })); setContrib(null); toast({ title: x.amount < 0 ? 'Withdrawal recorded' : 'Contribution recorded', description: G.rp(x.amount) }); }} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Monthly plan card">
          <TweakRadio label="View" value={t.planView} options={[{ value: 'split', label: 'By goal' }, { value: 'steps', label: 'Steps' }, { value: 'month', label: 'This month' }]} onChange={(v) => setTweak('planView', v)} />
        </TweakSection>
        <TweakSection label="Foundation check">
          <TweakRadio label="State" value={t.foundation} options={[{ value: 'not_recommended_yet', label: 'Amber' }, { value: 'clear', label: 'Green' }, { value: 'not_evaluated', label: 'Grey' }]} onChange={(v) => setTweak('foundation', v)} />
        </TweakSection>
        <TweakSection label="Data">
          <TweakButton label="Clear all goals" secondary onClick={() => { setGoals([]); setOpenId(null); }} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

Object.assign(window, { BigPurchasesPage });
