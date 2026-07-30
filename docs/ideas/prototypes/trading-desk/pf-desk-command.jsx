/* Command Center screen: waterfall hero, tiles, concentration, unbounded risk, recon alerts, buckets, triage rail. */
const deskCommandStyles = {
  panel: { padding:16 },
  bar: { height:8, borderRadius:4, background:'hsl(var(--border))', overflow:'hidden', flex:1 },
  barFill: (pct,color) => ({ width: Math.min(100,pct)+'%', height:'100%', background:color }),
};

function ConcentrationPanel({ positions, mandate }) {
  const byWeight = [...positions].sort((a,b)=>b.weight-a.weight).slice(0,6);
  return (
    <div className="desk-scope pf-card" style={deskCommandStyles.panel}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Concentration</div>
      {byWeight.map(p=>{
        const over = p.weight > mandate.maxSingleStockPct;
        return (
          <div key={p.broker+p.symbol} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
              <span>{p.symbol}{over && <span style={{ marginLeft:6, fontSize:10, color:'hsl(var(--muted-foreground))' }}>LEGACY — exempt from new-trade limits, blocks additions</span>}</span>
              <span className="num" style={{ color: over?'hsl(var(--destructive))':'hsl(var(--foreground))' }}>{p.weight.toFixed(2)}%</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={deskCommandStyles.bar}><div style={deskCommandStyles.barFill(p.weight, over?'hsl(var(--destructive))':'hsl(var(--foreground) / 0.5)')}></div></div>
              <span style={{ fontSize:10, color:'hsl(var(--muted-foreground))' }}>limit {mandate.maxSingleStockPct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UnboundedRiskPanel({ positions }) {
  const unbounded = positions.filter(p=>p.stopPrice==null);
  return (
    <div className="desk-scope pf-card" style={deskCommandStyles.panel}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Unbounded risk</div>
      <div style={{ fontSize:12, color:'hsl(var(--destructive))', marginBottom:8 }}>{unbounded.length} of {positions.length} positions have no stop</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {unbounded.map(p=>(
          <span key={p.broker+p.symbol} style={{ fontSize:11, padding:'3px 7px', borderRadius:4, background:'hsl(var(--destructive) / 0.1)', color:'hsl(var(--destructive))' }}>{p.symbol}</span>
        ))}
      </div>
    </div>
  );
}

function ReconciliationAlerts({ issues, onGoTo }) {
  const open = issues.filter(i=>i.resolution==='unresolved');
  return (
    <div className="desk-scope pf-card" style={deskCommandStyles.panel}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Reconciliation alerts</div>
      {open.length===0 && <div style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>All issues resolved.</div>}
      {open.map(i=>(
        <button key={i.id} onClick={onGoTo} style={{ display:'flex', justifyContent:'space-between', width:'100%', textAlign:'left', border:'none', background:'none', cursor:'pointer', padding:'6px 0', borderBottom:'1px solid hsl(var(--border))', fontSize:12, color:'hsl(var(--foreground))' }}>
          <span>{i.label} — {i.account}</span>
          <Icon name="ChevronRight" size={14} style={{ color:'hsl(var(--muted-foreground))' }} />
        </button>
      ))}
    </div>
  );
}

function SplitBar({ title, items }) {
  const total = items.reduce((s,i)=>s+i.value,0) || 1;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, textTransform:'uppercase', color:'hsl(var(--muted-foreground))', marginBottom:5 }}>{title}</div>
      <div style={{ display:'flex', height:16, borderRadius:3, overflow:'hidden' }}>
        {items.map((it,i)=>(<div key={i} title={it.label+' '+((it.value/total)*100).toFixed(1)+'%'} style={{ width:(it.value/total*100)+'%', background: it.color }}></div>))}
      </div>
      <div style={{ display:'flex', gap:12, marginTop:5, flexWrap:'wrap' }}>
        {items.map((it,i)=>(<span key={i} style={{ fontSize:11, color:'hsl(var(--muted-foreground))', display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:it.color, display:'inline-block' }}></span>{it.label}</span>))}
      </div>
    </div>
  );
}

function CapitalBucketsPanel({ chain, positions }) {
  const brokers = ['Mandiri','Stockbit','Binance','IBKR'];
  const shades = ['hsl(var(--foreground) / 0.75)','hsl(var(--foreground) / 0.55)','hsl(var(--foreground) / 0.35)','hsl(var(--foreground) / 0.2)'];
  const byBroker = brokers.map((b,i)=>({ label:b, value: positions.filter(p=>p.broker===b).reduce((s,p)=>s+p.mvIDR,0), color: shades[i] }));
  const byClass = ['IDX Stock','Crypto','US Stock'].map((c,i)=>({ label:c, value: positions.filter(p=>p.class===c).reduce((s,p)=>s+p.mvIDR,0), color: shades[i] }));
  return (
    <div className="desk-scope pf-card" style={deskCommandStyles.panel}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Capital buckets &amp; splits</div>
      <SplitBar title={'Buckets — Core / Active Trading / Reserve / Legacy'} items={[
        { label:'Core', value: 1, color:'hsl(var(--foreground) / 0.15)' },
        { label:'Active Trading', value: Math.max(1,chain.activeTradingNav), color:'hsl(var(--success))' },
        { label:'Reserve', value: Math.max(1,chain.reserve), color:'hsl(var(--info))' },
        { label:'Legacy', value: chain.legacyMV, color:'hsl(var(--muted-foreground))' },
      ]} />
      <SplitBar title="By broker" items={byBroker} />
      <SplitBar title="By asset class" items={byClass} />
    </div>
  );
}

function TriageRail({ triage, onGoTo }) {
  const steps = [
    { key:'reconcile', label:'Reconcile', detail: triage.reconcile ? 'Resolved' : '4 open issues', tab:'reconcile' },
    { key:'classify', label:'Classify', detail: triage.classify ? 'Complete' : (triage.unclassifiedCount + ' positions in Legacy / Unclassified'), tab:'portfolio' },
    { key:'mandateSet', label:'Set mandate', detail: triage.mandateSet ? 'Confirmed' : 'Conservative Personal Trader preset, unapproved', tab:'mandate' },
    { key:'approve', label:'Approve Active Trading NAV', detail: triage.approve ? 'Approved' : 'Required to unblock the gate', tab:'mandate' },
  ];
  return (
    <div className="desk-scope pf-card" style={deskCommandStyles.panel}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>First-run triage</div>
      {steps.map((s,i)=>(
        <button key={s.key} onClick={()=>onGoTo(s.tab)} style={{ display:'flex', gap:10, width:'100%', textAlign:'left', border:'none', background:'none', cursor:'pointer', padding:'8px 0', borderBottom: i<3?'1px solid hsl(var(--border))':'none' }}>
          <Icon name={triage[s.key]?'CheckCircle2':'Circle'} size={16} style={{ color: triage[s.key]?'hsl(var(--success))':'hsl(var(--muted-foreground))', flexShrink:0, marginTop:1 }} />
          <span>
            <div style={{ fontSize:13, color:'hsl(var(--foreground))' }}>{s.label}</div>
            <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>{s.detail}</div>
          </span>
        </button>
      ))}
    </div>
  );
}

function TriageOverlay({ onDismiss, triage }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.35)' }}>
      <div className="desk-scope pf-card" style={{ width:440, padding:20 }}>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Before you trade</div>
        <div style={{ fontSize:12, color:'hsl(var(--muted-foreground))', marginBottom:14 }}>This portfolio is −33.00% unrealized, BBRI is 52.12% of listed value, and nothing has a stop. Complete triage to unlock a risk-managed trading desk. The gate stays BLOCKED until step 4.</div>
        <TriageRail triage={triage} onGoTo={()=>{}} />
        <button onClick={onDismiss} style={{ marginTop:14, width:'100%', padding:'8px 0', borderRadius:6, border:'1px solid hsl(var(--border))', background:'hsl(var(--foreground))', color:'hsl(var(--background))', cursor:'pointer', fontSize:13 }}>Start triage</button>
      </div>
    </div>
  );
}

function CommandCenter({ chain, mandate, positions, reconIssues, triage, onGoTo, onResolveStockbit, onApproveNav, hero, todaysPnl, showOverlay, onDismissOverlay }) {
  const mandiri = DESK.ACCOUNTS.find(a=>a.id==='mandiri');
  return (
    <div className="desk-scope" style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      {showOverlay && <TriageOverlay onDismiss={onDismissOverlay} triage={triage} />}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 700px' }}>
          {hero==='waterfall' ? <CapitalWaterfall chain={chain} mandate={mandate} onResolveStockbit={()=>onGoTo('reconcile')} onApproveNav={()=>onApproveNav()} /> : <TilesRow chain={chain} positions={positions} todaysPnl={todaysPnl} />}
        </div>
        <TradeLimitRail account={mandiri} />
      </div>
      {hero==='waterfall' && <TilesRow chain={chain} positions={positions} todaysPnl={todaysPnl} />}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16 }}>
        <ConcentrationPanel positions={positions} mandate={mandate} />
        <UnboundedRiskPanel positions={positions} />
        <ReconciliationAlerts issues={reconIssues} onGoTo={()=>onGoTo('reconcile')} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(340px,2fr) minmax(280px,1fr)', gap:16 }}>
        <CapitalBucketsPanel chain={chain} positions={positions} />
        <TriageRail triage={triage} onGoTo={onGoTo} />
      </div>
    </div>
  );
}

Object.assign(window, { CommandCenter, ConcentrationPanel, UnboundedRiskPanel, ReconciliationAlerts, CapitalBucketsPanel, TriageRail, TriageOverlay });
