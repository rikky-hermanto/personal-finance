/* ── App: routing across every module wired in App.tsx ── */
const SECTIONS = {
  cashflow: { title: 'Cashflow', def: 'overview', tabs: [['overview', 'Overview'], ['transactions', 'Transactions'], ['accounts', 'Bank Accounts'], ['statement', 'Statements'], ['analysis', 'Spend Pulse']] },
  assets: { title: 'Assets', def: 'overview', tabs: [['overview', 'Overview'], ['accounts', 'Accounts'], ['investments', 'Investments'], ['properties', 'Properties'], ['liabilities', 'Liabilities']] },
  investment: { title: 'Investments', def: 'overview', tabs: [['overview', 'Overview'], ['holdings', 'Holdings'], ['snapshots', 'Snapshots'], ['ai-review', 'AI Review'], ['trading-desk', 'Trading Desk'], ['lab', 'Lab']] },
  'big-purchases': { title: 'Big Purchases', def: 'plans', tabs: [['plans', 'Plans'], ['achieved', 'Achieved']] },
  settings: { title: 'Settings', def: 'appearance', tabs: [['appearance', 'Appearance'], ['categories', 'Categories'], ['regional', 'Regional'], ['data', 'Data'], ['rules', 'Rules', true], ['profile', 'Profile', true]] },
};
function normalize(path) {
  if (!path || path === '/') return '/journey';
  if (path === '/settings/banks') return '/assets/accounts';
  const [, sec, tab] = path.split('/');
  if (sec === 'journey') return tab === 'achievements' ? '/journey/achievements' : '/journey';
  const S = SECTIONS[sec]; if (!S) return '/journey';
  if (sec === 'investment' && tab === 'trading-desk') return path;
  return `/${sec}/${S.tabs.some((t) => t[0] === tab) ? tab : S.def}`;
}

function PageBody({ route, onNav, reward, app }) {
  const [, sec, tab] = route.split('/');
  const p = { onNav, reward, app };
  if (sec === 'journey') return tab === 'achievements' ? <AchievementsPage {...p} /> : <JourneyPage {...p} />;
  const map = {
    cashflow: { overview: <CashflowOverview {...p} />, transactions: <TransactionsTab {...p} />, upload: <UploadTab {...p} />, accounts: <BankAccountsTab {...p} />, statement: <StatementTab {...p} />, analysis: <SpendPulseTab {...p} /> },
    assets: { overview: <AssetsOverviewTab {...p} />, accounts: <AssetsAccountsTab {...p} />, investments: <AssetsInvestmentsTab {...p} />, properties: <PropertiesTab {...p} />, liabilities: <LiabilitiesTab {...p} /> },
    investment: { overview: <InvestmentHome {...p} />, holdings: <HoldingsTab {...p} />, snapshots: <SnapshotsTab {...p} />, 'ai-review': <AIReviewTab {...p} />, lab: <div className="p-8 text-sm text-muted-foreground">Macro Scenario Lab isn't part of this prototype yet.</div> },
    'big-purchases': window.BigPurchasesPage ? { plans: <BigPurchasesPage tab="plans" {...p} />, achieved: <BigPurchasesPage tab="achieved" {...p} /> } : {},
    settings: { appearance: <AppearanceTab {...p} />, categories: <CategoriesTab {...p} />, regional: <RegionalTab {...p} />, data: <DataTab {...p} /> },
  };
  return map[sec][tab] || null;
}

function App() {
  useStore();
  const [route, setRoute] = React.useState(() => { try { return normalize(localStorage.getItem('pf_app_route') || '/journey'); } catch { return '/journey'; } });
  const [dark, setDark] = useLS('pf_proto_dark_v', false);
  const [focused, setFocused] = React.useState(false);
  const [chatOpen, setChatOpen] = useLS('pf_chat_open', false);
  const scrollRef = React.useRef(null);
  const reward = useRewardState();

  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); setChatOpen((o) => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); setFocused((f) => !f); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const nav = (path) => {
    if (path === '/investment/trading-desk' || path === '/desk') { window.location.href = 'Trading Desk.html'; return; }
    if (path === '/cashflow/upload') { setRoute(path); try { localStorage.setItem('pf_app_route', path); } catch {} return; }
    const r = normalize(path); setRoute(r);
    try { localStorage.setItem('pf_app_route', r); } catch {}
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const [, sec, tab] = route.split('/');
  const S = SECTIONS[sec];
  const activeTab = sec === 'cashflow' && tab === 'upload' ? 'transactions' : tab;
  const isZen = focused && !dark;
  const fullBleed = route === '/cashflow/accounts';
  const app = { dark, setDark, focused, setFocused };

  return (
    <ToastHost>
      <div className={cx('flex h-screen w-full overflow-hidden bg-sidebar', isZen && 'zen-canvas')} data-screen-label={route}>
        <AppSidebar route={route} onNav={nav} dark={dark} onToggleTheme={() => setDark((d) => !d)} journey={reward.journey} focused={focused} />
        <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
          <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
            <button onClick={() => setChatOpen((o) => !o)} title="Ask AI — ⌘I" className={cx('p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-foreground/5', chatOpen && 'text-success bg-success/10')}><Icon name="Sparkles" size={14} /></button>
            <button onClick={() => setFocused((f) => !f)} title={focused ? 'Exit focus mode — ⌘.' : 'Focus mode — ⌘.'} className={cx('p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-foreground/5', focused && 'text-foreground bg-foreground/5')}><Icon name={focused ? 'Minimize2' : 'Maximize2'} size={14} /></button>
          </div>
          <div className={cx('flex-1 overflow-hidden mt-2 mr-2 rounded-t-[24px] bg-card border border-foreground/[0.04] flex flex-col', isZen ? 'shadow-sm' : 'shadow-2xl')}>
            {S && <TabHeader title={S.title} active={activeTab} onNav={nav} tabs={S.tabs.map(([id, label, disabled]) => ({ id, label, disabled, path: `/${sec}/${id}` }))} />}
            <div ref={scrollRef} className={cx('flex-1 min-w-0', fullBleed ? 'overflow-hidden' : 'overflow-auto')}>
              <PageBody key={route} route={route} onNav={nav} reward={reward} app={app} />
            </div>
          </div>
        </main>
        {chatOpen ? <AiChatPanel open={chatOpen} onClose={() => setChatOpen(false)} route={route} /> : <AppActivityPanel route={route} focused={focused} />}
        <RewardToast toasts={reward.toasts} onDismiss={reward.dismissToast} onNav={nav} />
      </div>
    </ToastHost>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
