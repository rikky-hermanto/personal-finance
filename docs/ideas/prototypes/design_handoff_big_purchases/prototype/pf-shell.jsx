/* ── Shell: store hook, sidebar, activity panel, tab headers, toasts, routing ── */
const cx = (...a) => a.filter(Boolean).join(' ');

function useStore() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => PFStore.subscribe(force), []);
  return PFStore.state;
}
function useLS(key, init) {
  const [v, setV] = React.useState(() => { try { const r = localStorage.getItem(key); return r != null ? JSON.parse(r) : init; } catch { return init; } });
  const set = (nv) => { setV((old) => { const val = typeof nv === 'function' ? nv(old) : nv; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} return val; }); };
  return [v, set];
}
const fmtIDR = (n) => window.PF.formatCurrency(n);
const fmtPlain = (n) => window.PF.formatCurrency(Math.abs(n)).replace('Rp', '').trim();
const fmtCompact = (n) => { const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${s}${Math.round(a / 1e3)}K`; return `${s}${a}`; };
function fmtDate(ds) {
  const f = PFStore.state.settings.dateFormat; const d = new Date(ds);
  if (f === 'MM/DD/YYYY') return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  if (f === 'YYYY-MM-DD') return ds.slice(0, 10);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Toasts (shadcn-style, bottom-right) ──────────────────────────────
const ToastCtx = React.createContext(() => {});
function ToastHost({ children }) {
  const [items, setItems] = React.useState([]);
  const push = React.useCallback((t) => { const id = Math.random().toString(36).slice(2); setItems((xs) => [...xs, { ...t, id }]); setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600); }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {items.map((t) => (
          <div key={t.id} className={cx('rw-toast pf-card px-4 py-3 shadow-lg', t.variant === 'destructive' && 'border-destructive/40')}>
            <p className={cx('text-sm font-semibold', t.variant === 'destructive' && 'text-destructive')}>{t.title}</p>
            {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

const NAV = [
  { level: 'L1', label: 'Foundations', color: 'rgb(100 116 139)', items: [
    { id: 'cashflow', label: 'Cashflow', icon: 'PiggyBank', path: '/cashflow', live: true },
    { id: 'budgeting', label: 'Budgeting', icon: 'Wallet', live: false },
    { id: 'bills', label: 'Recurring', icon: 'Receipt', live: false }] },
  { level: 'L2', label: 'Defense', color: 'rgb(76 175 80)', items: [
    { id: 'emergency-fund', label: 'Emergency Fund', icon: 'Shield', live: false },
    { id: 'insurance', label: 'Insurance', icon: 'HeartPulse', live: false }] },
  { level: 'L3', label: 'Growth', color: 'rgb(56 142 60)', items: [
    { id: 'investment', label: 'Investments', icon: 'TrendingUp', path: '/investment', live: true },
    { id: 'big-purchases', label: 'Big Purchases', icon: 'ShoppingBag', path: '/big-purchases', live: true }] },
  { level: 'L4', label: 'Freedom', color: 'rgb(46 125 50)', items: [
    { id: 'fire', label: 'FIRE Calculator', icon: 'Flame', live: false },
    { id: 'passive-income', label: 'Passive Income', icon: 'Coins', live: false }] },
  { level: 'L5', label: 'Legacy', color: 'rgb(27 94 32)', items: [
    { id: 'estate', label: 'Estate Planning', icon: 'ScrollText', live: false },
    { id: 'succession', label: 'Succession', icon: 'Briefcase', live: false },
    { id: 'tax', label: 'Tax Planning', icon: 'FileText', live: false }] },
];

function AppSidebar({ route, onNav, dark, onToggleTheme, journey, focused }) {
  const s = useStore();
  const isJourney = route.startsWith('/journey');
  const rowCls = (active) => cx('w-full flex items-center text-left rounded-lg transition-all group px-3 py-2 gap-3', active ? 'bg-secondary text-foreground' : 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground');
  return (
    <div className={cx('bg-sidebar h-full flex flex-col flex-shrink-0 w-60 transition-opacity', focused && 'opacity-60 hover:opacity-100')}>
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 bg-foreground/5 rounded flex items-center justify-center border border-foreground/5"><Icon name="PiggyBank" size={16} className="text-foreground" /></div>
          <div className="text-sm font-semibold text-foreground tracking-tight">Finance</div>
        </div>
        <button className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"><Icon name="X" size={14} className="text-sidebar-foreground" /></button>
      </div>
      <div className="px-3 pt-4 pb-2">
        <button onClick={() => onNav('/journey')} className={cx('flex items-center gap-2 transition-all border relative overflow-hidden group px-3 py-2 w-full text-xs font-medium rounded-lg', isJourney ? 'bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-purple-500/30 text-foreground shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-transparent border-transparent hover:border-purple-500/40 text-sidebar-foreground hover:text-foreground')}>
          <Icon name="Mountain" size={16} strokeWidth={1.5} className={cx('flex-shrink-0 z-10', isJourney ? 'text-purple-600 dark:text-purple-400' : 'text-indigo-500/70 group-hover:text-purple-600')} />
          <span className={cx('z-10 font-semibold tracking-wide', isJourney ? 'bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400' : 'text-sidebar-foreground')}>Journey</span>
        </button>
      </div>
      {journey && <GardenWidget journey={journey} active={isJourney} onNav={() => onNav('/journey')} />}
      <div className="px-3 pb-1">
        <button onClick={() => onNav('/assets')} className={cx(rowCls(route.startsWith('/assets')), 'gap-2')}>
          <Icon name="Landmark" size={16} strokeWidth={1.5} className="flex-shrink-0" /><span className="flex-1 text-xs font-medium tracking-wide">Net Worth</span>
        </button>
      </div>
      <nav className="flex-1 pb-4 pt-2 overflow-y-auto">
        <div className="px-3">
          {NAV.map((sec, si) => (
            <div key={sec.level} className="flex">
              <div className="flex flex-col items-center w-5 flex-shrink-0 pt-[12px]">
                <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: sec.color }}></div>
                {si < NAV.length - 1 && <div className="flex-1 mt-1" style={{ width: '1.5px', borderLeft: '1.5px dashed rgba(150,150,150,0.18)' }}></div>}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <div className="pl-2 pt-1 pb-0.5"><span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: sec.color }}>{sec.label}</span></div>
                <ul className="space-y-0.5">
                  {sec.items.map((it) => {
                    const active = it.live && route.startsWith(it.path);
                    return (
                      <li key={it.id}>
                        <button onClick={() => it.live && onNav(it.path)} disabled={!it.live} className={cx('w-full flex items-center text-left rounded-lg transition-all px-2 py-1.5 gap-2.5', !it.live && 'opacity-45 cursor-default', active ? 'bg-secondary text-foreground' : it.live ? 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground' : 'text-sidebar-foreground')}>
                          <Icon name={it.icon} size={16} strokeWidth={1.5} className="flex-shrink-0" />
                          <span className="flex-1 text-xs font-medium tracking-wide">{it.label}</span>
                          {!it.live && <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/40">soon</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="px-3 pb-2">
        <button onClick={onToggleTheme} className="w-full flex items-center rounded-lg transition-colors text-sidebar-foreground hover:text-foreground px-3 py-2 gap-3">
          <Icon name={dark ? 'Sun' : 'Moon'} size={16} strokeWidth={1.5} /><span className="text-xs font-medium tracking-wide">{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="px-3 py-1 flex items-center gap-3">
          <Icon name="Bot" size={16} strokeWidth={1.5} className="text-sidebar-foreground" />
          <span className="flex-1 text-xs font-medium text-sidebar-foreground">Gemini 3.1 Pro (High)</span>
          <Icon name="ChevronDown" size={12} className="text-sidebar-foreground/50" />
        </div>
      </div>
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
        <button onClick={() => onNav('/settings')} className={rowCls(route.startsWith('/settings'))}>
          <Icon name="Settings" size={16} strokeWidth={1.5} /><span className="text-xs font-medium tracking-wide">Settings</span>
        </button>
        <p className="px-3 pt-2 truncate text-[11px] text-muted-foreground">{s.settings.email}</p>
        <button className={rowCls(false)}><Icon name="LogOut" size={16} strokeWidth={1.5} /><span className="text-xs font-medium tracking-wide">Sign out</span></button>
      </div>
    </div>
  );
}

function AppActivityPanel({ route, focused }) {
  useStore();
  const wrap = cx('w-80 flex-shrink-0 flex flex-col h-full bg-sidebar overflow-hidden transition-opacity', focused && 'opacity-60 hover:opacity-100');
  if (route.startsWith('/journey')) {
    return (
      <div className={wrap}>
        <div className="px-5 pt-6 pb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Activity Streak</span>
          <p className="text-[10px] text-muted-foreground/50 mt-1">Transaction activity · last 12 weeks</p>
        </div>
        <div className="px-5"><StreakHeatmap /></div>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-6 pb-2"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Recent</span></div>
        <div className="space-y-0.5">
          {window.PF.recentTransactions.map((tx) => (
            <div key={tx.id} className="px-5 py-2 hover:bg-foreground/[0.03] transition-all cursor-default">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cx('w-1 h-1 rounded-full', tx.type === 'income' ? 'bg-success' : 'bg-muted-foreground/30')}></span>
                    <span className="text-xs font-mono text-foreground/70 truncate leading-snug">{tx.description}</span>
                  </div>
                  <div className="mt-0.5 pl-2.5"><span className="text-[10px] text-muted-foreground/60 uppercase tracking-tight font-medium">{tx.bank}</span></div>
                </div>
                <span className={cx('font-mono text-xs flex-shrink-0 tabular-nums', tx.amount > 0 ? 'text-income' : 'text-expense')}>{tx.amount > 0 ? `+${fmtPlain(tx.amount)}` : `(${fmtPlain(tx.amount)})`}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-6 mt-4 opacity-80">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Processing</span>
        <p className="text-xs text-muted-foreground/60 mt-2 font-medium">No active uploads</p>
      </div>
    </div>
  );
}

function TabHeader({ title, tabs, active, onNav }) {
  return (
    <div className="flex items-center px-6 pt-6 pb-5 gap-6 flex-shrink-0 flex-wrap">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} disabled={t.disabled} onClick={() => !t.disabled && onNav(t.path)}
            className={cx('rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150', active === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5', t.disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent')}>
            {t.label}{t.disabled && <span className="ml-1.5 text-[10px] text-muted-foreground/50">soon</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const RANGES = [{ label: 'Last Month', value: 1 }, { label: '3M', value: 3 }, { label: '6M', value: 6 }, { label: '1Y', value: 12 }, { label: '2Y', value: 24 }, { label: 'YTD', value: 0 }, { label: 'All Time', value: -1 }];
function RangePills({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {RANGES.map((r) => (
        <button key={r.label} onClick={() => onChange(r.value)} className={cx('h-7 px-2.5 text-xs font-medium transition-all rounded-md', value === r.value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>{r.label}</button>
      ))}
    </div>
  );
}
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('h-7 px-2.5 text-xs font-medium transition-all rounded-md inline-flex items-center gap-1.5', value === o.value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>
          {o.icon && <Icon name={o.icon} size={13} />}{o.label}
        </button>
      ))}
    </div>
  );
}
function Modal({ onClose, children, width = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-foreground/25" onClick={onClose}>
      <div className={cx('pf-card w-full overflow-hidden', width)} onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 24px 60px -12px rgb(0 0 0 / 0.30)' }}>{children}</div>
    </div>
  );
}
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40';
const btnOutline = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border hover:bg-foreground/5 transition-colors';
const inputCls = 'w-full px-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

Object.assign(window, { cx, useStore, useLS, fmtIDR, fmtPlain, fmtCompact, fmtDate, ToastHost, useToast, AppSidebar, AppActivityPanel, TabHeader, RangePills, Segmented, Modal, btnPrimary, btnOutline, inputCls, RANGES });
