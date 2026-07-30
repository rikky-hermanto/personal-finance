/* Desk shell: matches base app chrome (collapsed icon rail, card canvas, right context panel). */
const cnaDesk = (...a) => a.filter(Boolean).join(' ');

const DESK_TABS = [['command','Command'],['portfolio','Portfolio'],['mandate','Mandate'],['pretrade','Pre-Trade'],['journal','Journal'],['reconcile','Reconcile']];
const LS_KEY = 'pf-desk-v1';

function todayStr(){ return new Date().toISOString().slice(0,10); }

function makeInitialState(){
  return {
    activeTab: 'command',
    positions: DESK.POSITIONS.map(p=>({ ...p })),
    reconIssues: DESK.RECON_ISSUES.map(i=>({ ...i })),
    mandateVersions: [{ version:1, status:'draft', params:{ ...DESK.MANDATE_DEFAULT, activeTradingNavApproved:false }, effectiveDate:null, changeReason:null, approvedAt:null }],
    journal: DESK.JOURNAL_SEED.map(j=>({ ...j })),
    todaysRealizedPnl: 0,
    triageOverlayDismissed: false,
    fx: { usdIdr: DESK.FX.usdIdr, sgdUsd: DESK.FX.sgdUsd, stale:false },
  };
}

function getEffectiveMandate(versions, mode){
  const approved = versions.filter(v=>v.status==='approved');
  const base = approved.length ? approved[approved.length-1].params : { ...DESK.MANDATE_DEFAULT, activeTradingNavApproved:false };
  return { ...base, activeTradingNavMode: mode };
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="rw-toast" style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'hsl(var(--foreground))', color:'hsl(var(--background))', padding:'8px 16px', borderRadius:6, fontSize:12, zIndex:80 }}>{message}</div>;
}

// ── Collapsed icon rail — same chrome/tokens as the app sidebar, docked while inside Desk ──
function DeskIconRail() {
  const items = [['PiggyBank','Cashflow'],['TrendingUp','Investments'],['ShieldHalf','Trading Desk']];
  return (
    <div className="bg-sidebar h-full flex flex-col flex-shrink-0 w-12 border-r border-sidebar-border items-center">
      <div className="h-14 flex items-center justify-center flex-shrink-0">
        <div className="w-7 h-7 bg-foreground/5 rounded flex items-center justify-center border border-foreground/5">
          <Icon name="PiggyBank" size={16} className="text-foreground" />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center gap-1 pt-2">
        {items.map(([icon,label])=>(
          <button key={label} title={label} className={cnaDesk('w-8 h-8 rounded-lg flex items-center justify-center transition-colors', label==='Trading Desk' ? 'bg-secondary text-foreground' : 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground')}>
            <Icon name={icon} size={16} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <div className="pb-3 flex flex-col items-center gap-1">
        <button title="Leaving Desk restores the full sidebar" className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground">
          <Icon name="PanelLeftOpen" size={16} strokeWidth={1.5} />
        </button>
        <button title="Settings" className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground">
          <Icon name="Settings" size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ── Title + tab pills, matching CashflowHeader ──
function DeskHeader({ activeTab, onGoTo }) {
  return (
    <div className="flex items-center px-6 pt-6 pb-4 border-b border-border gap-6 flex-shrink-0 flex-wrap">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Trading Desk</h1>
      <div className="flex items-center gap-1 flex-wrap">
        {['Overview','Holdings','Snapshots','AI Review'].map(t=><span key={t} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground/40 cursor-not-allowed">{t}</span>)}
        <span className="w-px h-4 bg-border mx-2 inline-block"></span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mr-1">Desk</span>
        {DESK_TABS.map(([key,label])=>(
          <button key={key} onClick={()=>onGoTo(key)} className={cnaDesk('rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150', activeTab===key?'bg-secondary text-foreground':'text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Right context panel — same slot/width/tokens as ActivityPanel, read-only gate explainer (D7) ──
function DeskActivityPanel({ chain, gate }) {
  const [explain, setExplain] = React.useState(false);
  const regimeName = Object.keys(DESK.REGIMES).find(k=>DESK.REGIMES[k]===chain.regime) || 'Normal';
  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full bg-sidebar border-l border-sidebar-border overflow-hidden">
      <div className="px-5 pt-6 pb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Desk</span>
        <p className="text-[10px] text-muted-foreground/50 mt-1">Read-only gate context — no sizing suggestions.</p>
      </div>
      <div className="px-5 space-y-2.5">
        {[['Regime', regimeName + ' ' + chain.regime.multiplier.toFixed(2) + '×'], ['Heat', chain.heat.toFixed(2)+'% / 3.00%'], ['Daily headroom', DESK.fmtIDR(chain.dailyHeadroom)], ['Active NAV', DESK.fmtIDR(chain.activeTradingNav)]].map(([l,v])=>(
          <div key={l} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{l}</span>
            <span className="font-mono text-foreground/80 tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <div className="px-5 pt-6">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Explain gate</span>
        <button onClick={()=>setExplain(e=>!e)} className="mt-2 w-full flex items-center gap-2 text-xs text-foreground border border-border rounded-lg px-3 py-2 hover:bg-foreground/5 transition-colors">
          <Icon name="Sparkles" size={13} className="text-success flex-shrink-0" /> {explain?'Hide explanation':'Explain this result'}
        </button>
        {explain && (
          <div className="mt-3 text-xs leading-relaxed text-foreground/80">
            {gate.overall==='BLOCKED' ? ('Gate is BLOCKED: ' + gate.blockingReasons.join('; ') + '.') : gate.overall==='WARNING' ? 'Gate is at WARNING — review the flagged rule before sizing further.' : 'Gate is at PASS — all hard-block rules currently clear.'}
          </div>
        )}
      </div>
      <div className="px-5 py-6 mt-4 opacity-80">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest opacity-50">Footer</span>
        <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">This feature does not participate in the Journey reward loop.</p>
      </div>
    </div>
  );
}

function DeskApp() {
  const [state, setState] = React.useState(()=>{
    try { const saved = JSON.parse(localStorage.getItem(LS_KEY)); if (saved) return { ...makeInitialState(), ...saved }; } catch(e){}
    return makeInitialState();
  });
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  window.__deskToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2200); };

  React.useEffect(()=>{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }, [state]);

  const [tweaks, setTweak] = window.useTweaks({
    scenario: 'pass',
    drawdownRegime: 'Normal',
    gateOverride: 'auto',
    activeNavMode: 'absolute',
    density: 'compact',
    hero: 'waterfall',
    triage: 'first-run',
    theme: 'light',
  });

  React.useEffect(()=>{
    document.documentElement.classList.toggle('dark', tweaks.theme==='dark');
  }, [tweaks.theme]);

  React.useEffect(()=>{
    if (tweaks.triage === 'completed') {
      setState(s=>{
        const issues = s.reconIssues.map(i=>({ ...i, resolution: i.options[0][0] }));
        const positions = s.positions.map(p=>({ ...p, sleeve:'Active Trading' }));
        const versions = s.mandateVersions.map(v=> v.version===1 ? { ...v, status:'approved', effectiveDate: todayStr(), changeReason:'Initial triage approval', approvedAt:new Date().toISOString(), params:{ ...v.params, activeTradingNavApproved:true } } : v);
        return { ...s, reconIssues: issues, positions, mandateVersions: versions };
      });
    } else if (tweaks.triage === 'first-run') {
      setState(s=>({ ...makeInitialState(), activeTab: s.activeTab }));
    }
  }, [tweaks.triage]);

  const mandate = getEffectiveMandate(state.mandateVersions, tweaks.activeNavMode);
  const stockbitIssue = state.reconIssues.find(i=>i.id==='r1');
  const chainState = { mandate, stockbitResolution: stockbitIssue ? stockbitIssue.resolution : 'unresolved', drawdownRegime: tweaks.drawdownRegime, todaysRealizedPnl: state.todaysRealizedPnl };
  const chain = DESK.computeNavChain(chainState);
  const jStats = DESK.journalStats(state.journal);
  const gate = DESK.evaluateGate(chain, null, {}, mandate, jStats, tweaks.scenario);
  const displayOverall = tweaks.gateOverride !== 'auto' ? tweaks.gateOverride : gate.overall;

  const triage = {
    reconcile: state.reconIssues.every(i=>i.resolution!=='unresolved'),
    classify: state.positions.every(p=>p.sleeve!=='Legacy / Unclassified'),
    unclassifiedCount: state.positions.filter(p=>p.sleeve==='Legacy / Unclassified').length,
    mandateSet: state.mandateVersions.some(v=>v.status==='approved'),
    approve: mandate.activeTradingNavApproved,
  };
  const showOverlay = !triage.approve && !state.triageOverlayDismissed;

  const goTo = (tab) => setState(s=>({ ...s, activeTab: tab }));
  const updateSleeve = (key, sleeve) => setState(s=>({ ...s, positions: s.positions.map(p => (p.broker+p.symbol)===key ? { ...p, sleeve } : p) }));
  const resolveIssue = (id, key) => { setState(s=>({ ...s, reconIssues: s.reconIssues.map(i=>i.id===id?{...i,resolution:key}:i) })); window.__deskToast('Reconciliation updated'); };
  const updateFx = (k,v) => setState(s=>({ ...s, fx: { ...s.fx, [k]: v } }));
  const dismissOverlay = () => setState(s=>({ ...s, triageOverlayDismissed:true }));

  const updateDraftParam = (key, val) => {
    setState(s=>{
      const versions = [...s.mandateVersions];
      let draft = versions.find(v=>v.status==='draft');
      if (!draft) {
        const base = getEffectiveMandate(versions, tweaks.activeNavMode);
        draft = { version: versions.length+1, status:'draft', params: { ...base }, effectiveDate:null, changeReason:null, approvedAt:null };
        versions.push(draft);
      }
      draft.params = { ...draft.params, [key]: val };
      return { ...s, mandateVersions: versions.map(v=>v.version===draft.version?draft:v) };
    });
  };
  const approveDraft = (reason) => {
    setState(s=>{
      const versions = s.mandateVersions.map(v=> v.status==='draft' ? { ...v, status:'approved', effectiveDate: todayStr(), changeReason: reason, approvedAt: new Date().toISOString(), params:{ ...v.params, activeTradingNavApproved:true } } : v);
      return { ...s, mandateVersions: versions };
    });
    window.__deskToast('Mandate approved');
  };
  const approveNavQuick = () => {
    if (mandate.activeTradingNavApproved) return;
    updateDraftParam('activeTradingNav', mandate.activeTradingNav);
    setTimeout(()=>approveDraft('Approved via Command Center waterfall node'), 0);
  };

  const density = tweaks.density === 'comfortable' ? { fontSize:'14px', lineHeight:1.5 } : {};

  const screen = state.activeTab === 'command' ? (
      <CommandCenter chain={chain} mandate={mandate} positions={state.positions} reconIssues={state.reconIssues} triage={triage}
        onGoTo={goTo} onResolveStockbit={()=>goTo('reconcile')} onApproveNav={approveNavQuick} hero={tweaks.hero}
        todaysPnl={state.todaysRealizedPnl} showOverlay={showOverlay} onDismissOverlay={dismissOverlay} />
    ) : state.activeTab === 'portfolio' ? (
      <Portfolio positions={state.positions} onUpdateSleeve={updateSleeve} />
    ) : state.activeTab === 'mandate' ? (
      <Mandate versions={state.mandateVersions} onUpdateDraft={updateDraftParam} onApprove={approveDraft} />
    ) : state.activeTab === 'pretrade' ? (
      <PreTrade chain={chain} mandate={mandate} journalStats={jStats} scenario={tweaks.scenario} />
    ) : state.activeTab === 'journal' ? (
      <Journal entries={state.journal} />
    ) : (
      <Reconcile accounts={DESK.ACCOUNTS} issues={state.reconIssues} onResolve={resolveIssue} fx={state.fx} onFxChange={updateFx} />
    );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-sidebar" style={density}>
      <DeskIconRail />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
        <div className="flex-1 overflow-hidden mt-2 mr-2 rounded-t-[24px] bg-card border border-foreground/[0.04] shadow-2xl flex flex-col">
          <DeskHeader activeTab={state.activeTab} onGoTo={goTo} />
          <GateBar chain={chain} gate={{ ...gate, overall: displayOverall }} onOpenDrawer={()=>setDrawerOpen(true)} onEditMandate={()=>goTo('mandate')} />
          <div className="flex-1 overflow-auto min-w-0">{screen}</div>
          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border flex-shrink-0">
            Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi.
          </div>
        </div>
      </main>
      <DeskActivityPanel chain={chain} gate={gate} />
      <GateDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} gate={gate} />
      <TweaksPanel>
        <TweakSection label="Scenario" />
        <TweakRadio label="Pre-Trade scenario" value={tweaks.scenario} options={['pass','warning','blocked-no-stop','blocked-daily-limit','blocked-add-loser']} onChange={v=>setTweak('scenario', v)} />
        <TweakSection label="Regime & gate" />
        <TweakSelect label="Drawdown regime" value={tweaks.drawdownRegime} options={Object.keys(DESK.REGIMES)} onChange={v=>setTweak('drawdownRegime', v)} />
        <TweakSelect label="Gate override" value={tweaks.gateOverride} options={['auto','PASS','WARNING','BLOCKED']} onChange={v=>setTweak('gateOverride', v)} />
        <TweakSection label="Capital" />
        <TweakRadio label="Active NAV mode" value={tweaks.activeNavMode} options={['absolute','pctOfReconciled']} onChange={v=>setTweak('activeNavMode', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={tweaks.density} options={['compact','comfortable']} onChange={v=>setTweak('density', v)} />
        <TweakRadio label="Hero" value={tweaks.hero} options={['waterfall','tiles-first']} onChange={v=>setTweak('hero', v)} />
        <TweakRadio label="Triage" value={tweaks.triage} options={['first-run','completed']} onChange={v=>setTweak('triage', v)} />
        <TweakRadio label="Theme" value={tweaks.theme} options={['light','dark']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
      <Toast message={toast} />
    </div>
  );
}

Object.assign(window, { DeskApp, getEffectiveMandate, makeInitialState });
