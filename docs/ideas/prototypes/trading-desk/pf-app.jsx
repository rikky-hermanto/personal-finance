/* ── App shell: Sidebar + ActivityPanel + routing ── */
const cna = (...a) => a.filter(Boolean).join(' ');
const D = window.PF;

const NAV_SECTIONS = [
  { level: 'L1', label: 'Foundations', color: 'rgb(100 116 139)', items: [
    { id: 'cashflow', label: 'Cashflow', icon: 'PiggyBank', path: '/cashflow', live: true },
    { id: 'budgeting', label: 'Budgeting', icon: 'Wallet', path: '/budgeting', live: false },
    { id: 'bills', label: 'Recurring', icon: 'Receipt', path: '/bills', live: false },
  ]},
  { level: 'L2', label: 'Defense', color: 'rgb(76 175 80)', items: [
    { id: 'emergency-fund', label: 'Emergency Fund', icon: 'Shield', path: '/emergency-fund', live: false },
    { id: 'insurance', label: 'Insurance', icon: 'HeartPulse', path: '/insurance', live: false },
  ]},
  { level: 'L3', label: 'Growth', color: 'rgb(56 142 60)', items: [
    { id: 'investment', label: 'Investments', icon: 'TrendingUp', path: '/investment', live: true },
    { id: 'goals', label: 'Savings Goals', icon: 'Target', path: '/goals', live: false },
  ]},
  { level: 'L4', label: 'Freedom', color: 'rgb(46 125 50)', items: [
    { id: 'fire', label: 'FIRE Calculator', icon: 'Flame', path: '/fire', live: false },
    { id: 'passive-income', label: 'Passive Income', icon: 'Coins', path: '/passive-income', live: false },
  ]},
  { level: 'L5', label: 'Legacy', color: 'rgb(27 94 32)', items: [
    { id: 'estate', label: 'Estate Planning', icon: 'ScrollText', path: '/estate', live: false },
    { id: 'succession', label: 'Succession', icon: 'Briefcase', path: '/succession', live: false },
    { id: 'tax', label: 'Tax Planning', icon: 'FileText', path: '/tax', live: false },
  ]},
];

function Sidebar({ route, onNav, dark, onToggleTheme, journey }) {
  const isJourney = route.startsWith('/journey');
  const isAssets = route.startsWith('/assets');
  return (
    <div className="bg-sidebar h-full flex flex-col flex-shrink-0 w-60 border-r border-sidebar-border">
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 bg-foreground/5 rounded flex items-center justify-center border border-foreground/5">
            <Icon name="PiggyBank" size={16} className="text-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground tracking-tight">Finance</div>
        </div>
        <button className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"><Icon name="X" size={14} className="text-sidebar-foreground" /></button>
      </div>

      {/* Journey CTA */}
      <div className="px-3 pt-4 pb-2">
        <button onClick={() => onNav('/journey')}
          className={cna('flex items-center gap-2 transition-all border relative overflow-hidden group px-3 py-2 w-full text-xs font-medium rounded-lg',
            isJourney ? 'bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-purple-500/30 text-foreground' : 'bg-transparent border-transparent hover:border-purple-500/40 text-sidebar-foreground hover:text-foreground')}>
          <Icon name="Mountain" size={16} strokeWidth={1.5} className={cna('flex-shrink-0 z-10', isJourney ? 'text-purple-500' : 'text-indigo-500/70 group-hover:text-purple-500')} />
          <span className={cna('z-10 font-semibold tracking-wide', isJourney ? 'bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600' : 'text-sidebar-foreground')}>Journey</span>
        </button>
      </div>

      {/* Persistent garden widget — reward loop lives on every page */}
      {journey && <GardenWidget journey={journey} active={isJourney} onNav={() => onNav('/journey')} />}

      {/* Net Worth */}
      <div className="px-3 pb-1">
        <button onClick={() => onNav('/assets')}
          className={cna('w-full flex items-center justify-start text-left rounded-lg transition-all group px-3 py-2 gap-2',
            isAssets ? 'bg-secondary text-foreground' : 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground')}>
          <Icon name="Landmark" size={16} strokeWidth={1.5} className="flex-shrink-0" />
          <span className="flex-1 text-xs font-medium tracking-wide">Net Worth</span>
        </button>
      </div>

      {/* Pyramid nav */}
      <nav className="flex-1 pb-4 pt-2 overflow-y-auto">
        <div className="px-3">
          {NAV_SECTIONS.map((section, sIdx) => {
            const isLast = sIdx === NAV_SECTIONS.length - 1;
            return (
              <div key={section.level} className="flex gap-0">
                <div className="flex flex-col items-center w-5 flex-shrink-0 pt-[12px]">
                  <div className="w-[7px] h-[7px] rounded-full flex-shrink-0 relative z-10" style={{ backgroundColor: section.color }} />
                  {!isLast && <div className="flex-1 mt-1" style={{ width: '1.5px', borderLeft: '1.5px dashed rgba(150,150,150,0.18)' }} />}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <div className="pl-2 pt-1 pb-0.5">
                    <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: section.color }}>{section.label}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = item.live && route.startsWith(item.path);
                      return (
                        <li key={item.id}>
                          <button onClick={() => item.live && onNav(item.path)} disabled={!item.live}
                            className={cna('w-full flex items-center justify-start text-left rounded-lg transition-all group px-2 py-1.5 gap-2.5',
                              !item.live && 'opacity-45 cursor-default',
                              isActive ? 'bg-secondary text-foreground' : item.live ? 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground' : 'text-sidebar-foreground')}>
                            <Icon name={item.icon} size={16} strokeWidth={1.5} className="flex-shrink-0" />
                            <span className="flex-1 text-xs font-medium tracking-wide">{item.label}</span>
                            {!item.live && <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-foreground/6 text-foreground/40">soon</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Theme toggle */}
      <div className="px-3 pb-2">
        <button onClick={onToggleTheme} className="w-full flex items-center rounded-lg transition-colors group text-sidebar-foreground hover:text-foreground px-3 py-2 gap-3">
          <Icon name={dark ? 'Sun' : 'Moon'} size={16} strokeWidth={1.5} className="flex-shrink-0" />
          <span className="text-xs font-medium tracking-wide">{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>

      {/* AI model */}
      <div className="px-3 pb-2">
        <div className="px-3 py-1 flex items-center gap-3">
          <Icon name="Bot" size={16} strokeWidth={1.5} className="flex-shrink-0 text-sidebar-foreground" />
          <span className="flex-1 text-xs font-medium text-sidebar-foreground">Gemini 3.1 Pro (High)</span>
          <Icon name="ChevronDown" size={12} className="text-sidebar-foreground/50" />
        </div>
      </div>

      {/* Settings */}
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
        <button onClick={() => onNav('/settings')} className="w-full flex items-center rounded-lg transition-all group px-3 py-2 gap-3 text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground">
          <Icon name="Settings" size={16} strokeWidth={1.5} className="flex-shrink-0" />
          <span className="text-xs font-medium tracking-wide">Settings</span>
        </button>
      </div>
    </div>
  );
}

// ── Right activity panel ───────────────────────────────────────────────
function ActivityPanel({ route }) {
  const isJourney = route.startsWith('/journey');
  if (isJourney) {
    return (
      <div className="w-80 flex-shrink-0 flex flex-col h-full bg-sidebar border-l border-sidebar-border overflow-hidden">
        <div className="px-5 pt-6 pb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Activity Streak</span>
          <p className="text-[10px] text-muted-foreground/50 mt-1">Transaction activity · last 12 weeks</p>
        </div>
        <div className="px-5"><StreakHeatmap /></div>
        <div className="px-5 pt-6">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Achievements</span>
          <div className="mt-3 space-y-2">
            {D.journeyState.achievements.map((a) => (
              <div key={a.code} className="flex items-center gap-2.5">
                <Icon name="Trophy" size={14} className="text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground/80 truncate">{a.name}</p>
                  <p className="text-[10px] text-muted-foreground/50">{new Date(a.unlockedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // Cashflow recent
  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full bg-sidebar border-l border-sidebar-border overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-6 pb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Recent</span>
        </div>
        <div className="space-y-0.5">
          {D.recentTransactions.map((tx) => {
            const abs = Math.abs(tx.amount);
            const formatted = D.formatCurrency(abs).replace('Rp', '').trim();
            return (
              <div key={tx.id} className="px-5 py-2 hover:bg-foreground/[0.03] transition-all cursor-default">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cna('w-1 h-1 rounded-full', tx.type === 'income' ? 'bg-success' : 'bg-muted-foreground/30')} />
                      <span className="text-xs font-mono text-foreground/70 truncate leading-snug">{tx.description}</span>
                    </div>
                    <div className="mt-0.5 pl-2.5">
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-tight font-medium">{tx.bank}</span>
                    </div>
                  </div>
                  <span className={cna('font-mono text-xs flex-shrink-0 tabular-nums', tx.type === 'income' ? 'text-income' : 'text-expense')}>
                    {tx.amount > 0 ? `+${formatted}` : `(${formatted})`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 py-6 mt-4 opacity-80">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Processing</span>
        <p className="text-xs text-muted-foreground/60 mt-2 font-medium">No active uploads</p>
      </div>
    </div>
  );
}

// ── Cashflow header: title + tab pills (matches CashflowLayout) ────────
const CF_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'accounts', label: 'Bank Accounts' },
  { id: 'statement', label: 'Statements' },
  { id: 'analysis', label: 'Spend Pulse' },
];
function CashflowHeader() {
  const [tab, setTab] = React.useState('overview');
  return (
    <div className="flex items-center px-6 pt-6 pb-5 border-b border-border gap-6 flex-shrink-0">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Cashflow</h1>
      <div className="flex items-center gap-2">
        {CF_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cna('rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150',
              tab === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [route, setRoute] = React.useState(() => {
    try { return localStorage.getItem('pf_proto_route') || '/journey'; } catch { return '/journey'; }
  });
  const [dark, setDark] = React.useState(() => {
    try { return localStorage.getItem('pf_proto_dark') === '1'; } catch { return false; }
  });
  const [focused, setFocused] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(() => {
    try { return localStorage.getItem('pf_proto_chat') === '1'; } catch { return false; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('pf_proto_chat', chatOpen ? '1' : '0'); } catch {}
  }, [chatOpen]);

  // Ctrl/Cmd+I toggles the AI panel (Ctrl+. stays focus mode)
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setChatOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setFocused((f) => !f);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('pf_proto_dark', dark ? '1' : '0'); } catch {}
  }, [dark]);

  const nav = (path) => {
    // Only journey & cashflow are built; others fall back to cashflow demo
    const target = path.startsWith('/journey') ? '/journey' : '/cashflow';
    setRoute(target);
    try { localStorage.setItem('pf_proto_route', target); } catch {}
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const scrollRef = React.useRef(null);
  const isJourney = route.startsWith('/journey');
  const reward = useRewardState();
  const isZen = focused && !dark;

  return (
    <div className={cna('flex h-screen w-full overflow-hidden bg-sidebar', isZen && 'zen-canvas')}>
      <Sidebar route={route} onNav={nav} dark={dark} onToggleTheme={() => setDark(d => !d)} journey={reward.journey} />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
          <button onClick={() => setChatOpen((o) => !o)}
            title="Ask AI — Ctrl+I"
            className={cna('p-1.5 rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-foreground/5', chatOpen && 'text-success bg-success/10')}>
            <Icon name="Sparkles" size={14} />
          </button>
          <button onClick={() => setFocused((f) => !f)}
            title={focused ? 'Exit focus mode' : 'Focus mode'}
            className={cna('p-1.5 rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-foreground/5', focused && 'text-foreground bg-foreground/5')}>
            <Icon name={focused ? 'Minimize2' : 'Maximize2'} size={14} />
          </button>
        </div>
        <div className={cna('flex-1 overflow-hidden mt-2 mr-2 rounded-t-[24px] bg-card border border-foreground/[0.04] flex flex-col', !isZen && 'shadow-2xl', isZen && 'shadow-sm')}>
          {!isJourney && <CashflowHeader />}
          <div ref={scrollRef} className="flex-1 overflow-auto min-w-0">
            {isJourney ? <JourneyPage onNav={nav} reward={reward} /> : <CashflowOverview onNav={nav} reward={reward} />}
          </div>
        </div>
      </main>
      {chatOpen ? <AiChatPanel open={chatOpen} onClose={() => setChatOpen(false)} route={route} /> : <ActivityPanel route={route} />}
      <RewardToast toasts={reward.toasts} onDismiss={reward.dismissToast} onNav={nav} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);