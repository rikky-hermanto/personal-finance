/* ── Investment tabs + Settings tabs ── */
const MARKET = [
  { label: 'IHSG', value: '6,723', change: -1.98, flag: '🇮🇩' }, { label: 'S&P 500', value: '5,908', change: 0.24, flag: '🇺🇸' },
  { label: 'NASDAQ', value: '19,230', change: -0.41, flag: '🇺🇸' }, { label: 'Nikkei', value: '37,120', change: -0.88, flag: '🇯🇵' },
  { label: 'Gold', value: '3,280', change: 0.51, flag: '🥇' }, { label: 'USD/IDR', value: '16,240', change: 0.32, flag: '💱' },
];
const REVIEWS = [
  { id: 'r3', date: '2026-10-02', value: 0, note: 'Equity concentration within Balanced range. BBCA up since last review — consider trimming 5% to rebalance.', items: ['Equity concentration within archetype range. Monitor IHSG correction risk.', 'BBCA has appreciated since last review. Consider trimming 5% to rebalance.', 'Add bonds exposure — current allocation below the 25–30% target for Balanced.'] },
  { id: 'r2', date: '2026-07-04', value: -0.06, note: 'TLKM below cost basis; thesis unchanged. Gold allocation adequate as hedge.', items: [] },
  { id: 'r1', date: '2026-04-06', value: -0.11, note: 'Initial review. Cash drag from money-market fund above 25%.', items: [] },
];
const invTotals = (s) => { const v = s.holdings.reduce((x, h) => x + PFStore.holdingValue(h), 0); const c = s.holdings.reduce((x, h) => x + h.units * h.avgCost, 0); return { v, c, ret: (v - c) / c * 100 }; };
const MetricCard = ({ label, value, sub, positive }) => (
  <div className="pf-card flex-1 min-w-0 p-4">
    <div className="text-xs text-muted-foreground mb-1">{label}</div>
    <div className="text-xl font-semibold tracking-tight">{value}</div>
    {sub && <div className={cx('text-xs mt-0.5 font-medium', positive === true ? 'text-emerald-500' : positive === false ? 'text-red-500' : 'text-muted-foreground')}>{sub}</div>}
  </div>
);
function InvestmentHome({ onNav }) {
  const s = useStore(); const t = invTotals(s);
  const alloc = {}; s.holdings.forEach((h) => { alloc[h.assetClass] = (alloc[h.assetClass] || 0) + PFStore.holdingValue(h); });
  const allocList = Object.entries(alloc).sort((a, b) => b[1] - a[1]);
  return (
    <div className="p-6">
      <div className="flex gap-3 mb-5">
        <MetricCard label="Total Portfolio" value={`Rp ${fmtCompact(t.v)}`} sub="across 1 setup" />
        <MetricCard label="Est. Return" value={`${t.ret >= 0 ? '+' : ''}${t.ret.toFixed(1)}%`} sub={`${t.v >= t.c ? '+' : ''}Rp ${fmtCompact(t.v - t.c)}`} positive={t.ret >= 0} />
        <MetricCard label="Holdings" value={String(s.holdings.length)} sub={`${s.holdings.length} positions`} />
        <MetricCard label="Last Review" value="Oct 2026" sub="23 days ago" />
      </div>
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <button onClick={() => onNav('/investment/holdings')} className="pf-card text-left p-4 group hover:border-foreground/25 transition-all">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base bg-indigo-500/10">⚖️</div>
                <div><div className="font-semibold text-sm leading-tight">Core Portfolio</div><div className="text-xs text-muted-foreground mt-0.5">Balanced<span className="mx-1">·</span><span className="text-[10px] font-medium uppercase tracking-wide opacity-60">IDR</span></div></div>
              </div>
              <Icon name="ChevronRight" size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100" />
            </div>
            <div className="flex rounded overflow-hidden h-1.5 w-full gap-px">{allocList.map(([k, v], i) => <div key={k} style={{ width: `${v / t.v * 100}%`, background: CHART_COLORS[i] }}></div>)}</div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Icon name="BarChart3" size={12} />{s.holdings.length} holdings</span><span className="flex items-center gap-1"><Icon name="Clock" size={12} />Oct 2026</span></div>
              <div className="text-right"><div className="text-xs font-semibold tabular-nums">Rp {fmtCompact(t.v)}</div><div className={cx('text-[10px] font-medium', t.ret >= 0 ? 'text-emerald-500' : 'text-red-500')}>{t.ret >= 0 ? '+' : ''}{t.ret.toFixed(1)}% return</div></div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">{allocList.map(([k, v], i) => <div key={k} className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ background: CHART_COLORS[i] }}></div><span className="text-[10px] text-muted-foreground">{k.replace('_', ' ')} {Math.round(v / t.v * 100)}%</span></div>)}</div>
          </button>
          <p className="text-[11px] text-muted-foreground/50 text-center pt-1">Portfolio values and returns are illustrative — connect holdings to a price feed to see live data.</p>
        </div>
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <div className="pf-card px-4 pt-4 pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Market Pulse</p>
            <div className="divide-y divide-border">{MARKET.map((m) => <div key={m.label} className="flex items-center justify-between py-1.5"><div className="flex items-center gap-2"><span className="text-base leading-none">{m.flag}</span><span className="text-xs font-medium">{m.label}</span></div><div className="flex items-center gap-2"><span className="text-xs tabular-nums">{m.value}</span><span className={cx('text-[10px] font-semibold tabular-nums w-14 text-right', m.change >= 0 ? 'text-emerald-500' : 'text-red-500')}>{m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%</span></div></div>)}</div>
          </div>
          <div className="pf-card p-4">
            <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last AI Insight</p><span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">Oct 2026</span></div>
            <div className="flex flex-col gap-2.5">{REVIEWS[0].items.map((x, i) => <div key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed"><Icon name="Zap" size={12} className="mt-0.5 flex-shrink-0 text-amber-500" /><span>{x}</span></div>)}</div>
            <button onClick={() => onNav('/investment/ai-review')} className={cx(btnOutline, 'w-full mt-3 h-7')}>View full analysis <Icon name="ArrowUpRight" size={12} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
function HoldingsTab() { const s = useStore(); return <div className="p-6"><HoldingsTable holdings={s.holdings} /></div>; }
function SnapshotsTab() {
  const s = useStore(); const t = invTotals(s);
  return (
    <div className="p-6">
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">{['Snapshot', 'Portfolio value', 'Notes'].map((h, i) => <th key={h} className={cx('px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground', i === 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{REVIEWS.map((r) => <tr key={r.id}><td className="px-5 py-3 font-mono text-xs">{fmtDate(r.date)}</td><td className="px-5 py-3 font-mono text-xs text-right">{fmtIDR(t.v * (1 + r.value))}</td><td className="px-5 py-3 text-xs text-muted-foreground">{r.note}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
function AIReviewTab() {
  const r = REVIEWS[0];
  return (
    <div className="p-6 max-w-3xl">
      <div className="pf-card p-5">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Core Portfolio · review</h3><span className="text-[11px] text-muted-foreground font-mono">{fmtDate(r.date)}</span></div>
        <div className="mt-4 space-y-3">{r.items.map((x, i) => <div key={i} className="flex gap-2.5 text-sm leading-relaxed"><Icon name="Zap" size={14} className="mt-1 flex-shrink-0 text-amber-500" /><span>{x}</span></div>)}</div>
        <p className="text-[11px] text-muted-foreground mt-5">AI review is informational — not investment advice.</p>
      </div>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────
function OptionTile({ active, onClick, children }) {
  return <button onClick={onClick} className={cx('flex flex-col items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all bg-card hover:border-foreground/30', active ? 'border-foreground/40 ring-1 ring-foreground/20' : 'border-border')}>{children}</button>;
}
const SettingsSection = ({ title, sub, children }) => <section className="space-y-4"><div><h3 className="text-sm font-semibold">{title}</h3>{sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}</div>{children}</section>;
const SettingsPage = ({ title, sub, children }) => <div className="p-8"><div className="max-w-2xl mx-auto space-y-10"><div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="text-sm text-muted-foreground mt-1">{sub}</p></div>{children}</div></div>;

function AppearanceTab({ app }) {
  const [style, setStyle] = useLS('pf_journey_style_v', null);
  const cur = (() => { try { return localStorage.getItem('pf_journey_style') || 'tree'; } catch { return 'tree'; } })();
  const pick = (id) => { try { localStorage.setItem('pf_journey_style', id); } catch {} setStyle(id); };
  const styles = [{ id: 'tree', label: 'Tree', desc: 'Living garden', icon: 'TreePine' }, { id: 'skyline', label: 'Skyline', desc: 'City of tiers', icon: 'Building2' }, { id: 'crystal', label: 'Diamond', desc: 'Faceted gem', icon: 'Gem' }];
  return (
    <SettingsPage title="Appearance" sub="Customize how the app looks and feels.">
      <SettingsSection title="Theme" sub="Dark keeps the current Toloshi palette. Light switches to the warm zen canvas.">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <OptionTile active={app.dark} onClick={() => app.setDark(true)}><div className="w-10 h-10 rounded-lg bg-[#08080a] border border-white/10 flex items-center justify-center"><Icon name="Moon" size={16} className="text-blue-400" /></div><span className="text-xs font-medium">Dark</span></OptionTile>
          <OptionTile active={!app.dark} onClick={() => app.setDark(false)}><div className="w-10 h-10 rounded-lg bg-[#F5F3EE] border border-black/10 flex items-center justify-center"><Icon name="Sun" size={16} className="text-amber-600" /></div><span className="text-xs font-medium">Light</span></OptionTile>
        </div>
      </SettingsSection>
      <div className="border-t border-border"></div>
      <SettingsSection title="Journey Visualization" sub="How your financial progress pyramid is displayed on the Journey page.">
        <div className="grid grid-cols-3 gap-3">{styles.map((o) => <OptionTile key={o.id} active={(style || cur) === o.id} onClick={() => pick(o.id)}><div className="w-14 h-14 rounded-lg bg-muted/60 flex items-center justify-center"><Icon name={o.icon} size={22} className="text-muted-foreground" /></div><div className="text-center"><div className="text-xs font-medium">{o.label}</div><div className="text-[10px] text-muted-foreground">{o.desc}</div></div></OptionTile>)}</div>
      </SettingsSection>
      <div className="border-t border-border"></div>
      <SettingsSection title="Focus mode" sub="Recesses the sidebar and activity panel so the active feature takes the full stage. Best combined with the Light theme.">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card max-w-sm">
          <div className="flex items-center gap-3">
            <div className={cx('w-8 h-8 rounded-lg flex items-center justify-center', app.focused ? 'bg-foreground text-background' : 'bg-foreground/5 text-muted-foreground')}><Icon name="Maximize2" size={14} /></div>
            <div><div className="text-xs font-medium">{app.focused ? 'Active' : 'Inactive'}</div><div className="text-[10px] text-muted-foreground mt-0.5 font-mono">⌘. to toggle anywhere</div></div>
          </div>
          <button onClick={() => app.setFocused((f) => !f)} className={cx('w-9 h-5 rounded-full relative transition-colors', app.focused ? 'bg-foreground' : 'bg-input border border-border')}><span className={cx('absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-all', app.focused ? 'left-[18px]' : 'left-0.5')}></span></button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
function CategoriesTab() {
  const s = useStore(); const [name, setName] = React.useState('');
  const counts = {}; s.transactions.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
  const add = () => { const n = name.trim(); if (!n || s.categories.includes(n)) return; PFStore.update((st) => ({ ...st, categories: [...st.categories, n] })); setName(''); };
  const del = (c) => PFStore.update((st) => ({ ...st, categories: st.categories.filter((x) => x !== c) }));
  return (
    <SettingsPage title="Categories" sub="Categories used for transactions, statements and Buckets.">
      <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New category name" className={inputCls} /><button onClick={add} className={btnPrimary}>Add</button></div>
      <div className="border border-border rounded-lg bg-card divide-y divide-border">
        {s.categories.map((c) => (
          <div key={c} className="group flex items-center justify-between px-4 py-2.5">
            <span className="text-sm">{c}</span>
            <div className="flex items-center gap-3"><span className="text-[11px] text-muted-foreground font-mono">{counts[c] || 0} tx</span>{!counts[c] ? <button onClick={() => del(c)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Icon name="Trash2" size={13} /></button> : <span className="w-[13px]"></span>}</div>
          </div>
        ))}
      </div>
    </SettingsPage>
  );
}
function RegionalTab() {
  const s = useStore();
  const set = (k, v) => PFStore.update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));
  return (
    <SettingsPage title="Regional" sub="Date and number formatting.">
      <SettingsSection title="Date format" sub={`Example: ${fmtDate(PFStore.TODAY)}`}>
        <div className="flex gap-2">{['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => <button key={f} onClick={() => { set('dateFormat', f); try { localStorage.setItem('pf_date_format', f); } catch {} }} className={cx('px-3 py-1.5 rounded-md text-xs font-mono border', s.settings.dateFormat === f ? 'border-foreground/40 bg-secondary' : 'border-border text-muted-foreground hover:text-foreground')}>{f}</button>)}</div>
      </SettingsSection>
      <SettingsSection title="Base currency" sub="All balances and statements are reported in this currency.">
        <div className="text-sm font-mono px-3 py-2 rounded-md border border-border bg-card inline-block">IDR — Indonesian Rupiah</div>
      </SettingsSection>
    </SettingsPage>
  );
}
function DataTab() {
  const s = useStore(); const toast = useToast(); const [confirm, setConfirm] = React.useState(false);
  const exportJson = () => downloadText('personal-finance-sample.json', JSON.stringify(s, null, 2), 'application/json');
  return (
    <SettingsPage title="Data" sub="This prototype keeps its sample data in your browser. Every edit you make is saved here.">
      <div className="grid grid-cols-3 gap-3">
        {[['Transactions', s.transactions.length], ['Accounts', s.accounts.length], ['Liabilities', s.liabilities.length]].map(([k, v]) => <div key={k} className="bg-muted/50 rounded-lg px-3 py-2"><p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{k}</p><p className="text-lg font-mono font-semibold mt-0.5">{v}</p></div>)}
      </div>
      <SettingsSection title="Export" sub="Download the full sample dataset as JSON.">
        <button onClick={exportJson} className={btnOutline}><Icon name="Download" size={14} />Export JSON</button>
      </SettingsSection>
      <SettingsSection title="Reset sample data" sub="Restores the original 12-month ledger, accounts, holdings and liabilities. Your edits are discarded.">
        {confirm ? (
          <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Discard all changes?</span><button onClick={() => { PFStore.reset(); setConfirm(false); toast({ title: 'Sample data restored' }); }} className="px-2.5 py-1 rounded bg-destructive text-destructive-foreground font-medium">Yes, reset</button><button onClick={() => setConfirm(false)} className="px-2.5 py-1 rounded border border-border">Cancel</button></div>
        ) : <button onClick={() => setConfirm(true)} className={cx(btnOutline, 'text-destructive border-destructive/30 hover:bg-destructive/10')}><Icon name="RotateCcw" size={14} />Reset sample data</button>}
      </SettingsSection>
    </SettingsPage>
  );
}
function BanksTab() {
  const s = useStore(); const [f, setF] = React.useState({ name: '', institutionId: 'inst-bca', openingBalance: '' });
  const add = () => { if (!f.name) return; PFStore.update((st) => ({ ...st, accounts: [...st.accounts, { id: 'acc-' + Date.now(), name: f.name, institutionId: f.institutionId, currency: 'IDR', openingBalance: Number(f.openingBalance) || 0, openingDate: PFStore.TODAY }] })); setF({ ...f, name: '', openingBalance: '' }); };
  return (
    <SettingsPage title="Banks & Accounts" sub="Institutions and the accounts statements are matched to.">
      <div className="border border-border rounded-lg bg-card divide-y divide-border">
        {s.institutions.map((i) => { const accs = s.accounts.filter((a) => a.institutionId === i.id); return (
          <div key={i.id} className="px-4 py-3">
            <div className="flex items-center gap-2"><span className="text-sm font-medium">{i.name}</span><span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{i.type}</span></div>
            {accs.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{accs.map((a) => <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{a.name}</span>)}</div>}
          </div>); })}
      </div>
      <SettingsSection title="Add account">
        <div className="grid grid-cols-[1fr_1fr_140px_auto] gap-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Account name" className={inputCls} />
          <select value={f.institutionId} onChange={(e) => setF({ ...f, institutionId: e.target.value })} className={inputCls}>{s.institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <input value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Opening balance" className={cx(inputCls, 'font-mono')} />
          <button onClick={add} className={btnPrimary}>Add</button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

Object.assign(window, { InvestmentHome, HoldingsTab, SnapshotsTab, AIReviewTab, AppearanceTab, CategoriesTab, RegionalTab, DataTab, BanksTab });
