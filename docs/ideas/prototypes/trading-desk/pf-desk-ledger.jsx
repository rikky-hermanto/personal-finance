/* Rule ledger, state chips, gate bar, gate drawer. Shared across screens. */
const deskLedgerStyles = {
  chip: (bg,fg) => ({ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:4, fontSize:11, fontWeight:700, letterSpacing:'0.02em', textTransform:'uppercase', background:bg, color:fg }),
  row: { display:'grid', gridTemplateColumns:'20px 1.6fr 1fr 1fr 1fr 28px', gap:8, alignItems:'center', padding:'7px 4px', fontSize:12 },
  meter: { width:64, height:4, borderRadius:2, background:'hsl(var(--border))', overflow:'hidden', position:'relative' },
};

const STATE_META = {
  pass: { glyph:'Check', word:'PASS', color:'hsl(var(--success))', bg:'hsl(var(--success) / 0.12)' },
  warning: { glyph:'TriangleAlert', word:'WARNING', color:'hsl(var(--warning))', bg:'hsl(var(--warning) / 0.14)' },
  blocked: { glyph:'OctagonX', word:'BLOCKED', color:'hsl(var(--destructive))', bg:'hsl(var(--destructive) / 0.14)' },
  unresolved: { glyph:'CircleDashed', word:'UNRESOLVED', color:'hsl(var(--muted-foreground))', bg:'hsl(var(--muted-foreground) / 0.12)' },
  notcapital: { glyph:'Slash', word:'NOT CAPITAL', color:'hsl(var(--muted-foreground))', bg:'hsl(var(--muted-foreground) / 0.12)' },
};

function StateChip({ state, label }) {
  const meta = STATE_META[state] || STATE_META.unresolved;
  return (
    <span style={deskLedgerStyles.chip(meta.bg, meta.color)}>
      <Icon name={meta.glyph} size={12} strokeWidth={2.5} />
      {label || meta.word}
    </span>
  );
}

function OverallGateChip({ overall, reasonCount, onClick }) {
  const state = overall==='PASS'?'pass':overall==='WARNING'?'warning':'blocked';
  const meta = STATE_META[state];
  return (
    <button onClick={onClick} style={{ ...deskLedgerStyles.chip(meta.bg, meta.color), border:'none', cursor:'pointer', fontSize:12, padding:'4px 10px' }}>
      <Icon name={meta.glyph} size={13} strokeWidth={2.5} />
      {overall}{overall==='BLOCKED' && reasonCount ? ' · ' + reasonCount + ' reason' + (reasonCount>1?'s':'') : ''}
    </button>
  );
}

function InlineMeter({ pct, color }) {
  return (
    <span style={deskLedgerStyles.meter}>
      <span style={{ position:'absolute', inset:0, width: Math.min(100,Math.max(0,pct))+'%', background: color || 'hsl(var(--foreground) / 0.5)' }}></span>
    </span>
  );
}

function GateBar({ chain, gate, onOpenDrawer, onEditMandate }) {
  const blocked = gate.overall === 'BLOCKED';
  return (
    <div className="desk-scope" style={{ position:'sticky', top:0, zIndex:20, minHeight:44, display:'flex', flexWrap:'wrap', alignItems:'center', gap:'8px 12px', padding:'8px 16px', background:'hsl(var(--card))', borderBottom:'1px solid hsl(var(--border))', fontSize:12 }}>
      <OverallGateChip overall={gate.overall} reasonCount={gate.blockingReasons.length} onClick={onOpenDrawer} />
      <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11 }}>Regime: <b style={{ color:'hsl(var(--foreground))', fontSize:13 }}>{Object.keys(DESK.REGIMES).find(k=>DESK.REGIMES[k]===chain.regime) || 'Normal'} {chain.regime.multiplier.toFixed(2)}×</b></span>
      <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11, display:'flex', alignItems:'center', gap:6 }}>Heat <InlineMeter pct={chain.heat/3*100} color={chain.heat>3?'hsl(var(--destructive))':'hsl(var(--success))'} /> <b className="num" style={{ color:'hsl(var(--foreground))', fontSize:13 }}>{chain.heat.toFixed(2)}% / 3.00%</b></span>
      <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11 }}>Daily headroom <b className="num" style={{ color:'hsl(var(--foreground))', fontSize:13 }}>{DESK.fmtIDR(chain.dailyHeadroom)}</b></span>
      <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11 }}>Risk budget <b className="num" style={{ color:'hsl(var(--foreground))', fontSize:13 }}>{DESK.fmtIDR(chain.adjustedRiskBudget)}</b></span>
      <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11 }}>Active NAV <b className="num" style={{ color:'hsl(var(--foreground))', fontSize:13 }}>{DESK.fmtIDR(chain.activeTradingNav)}</b></span>
      <button onClick={onEditMandate} title="Edit mandate" style={{ marginLeft:'auto', border:'none', background:'none', cursor:'pointer', color:'hsl(var(--muted-foreground))', display:'flex' }}>
        <Icon name="Pencil" size={14} />
      </button>
    </div>
  );
}

function RuleRow({ row }) {
  const [open, setOpen] = React.useState(false);
  const meta = STATE_META[row.state] || STATE_META.unresolved;
  const muted = row.state === 'pass';
  return (
    <div className="rule" style={{ padding:'2px 0' }}>
      <div style={deskLedgerStyles.row}>
        <Icon name={meta.glyph} size={14} strokeWidth={2.5} style={{ color:meta.color }} />
        <span style={{ color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}>{row.name}</span>
        <span className="num" style={{ color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}>{row.value}</span>
        <span className="num" style={{ color:'hsl(var(--muted-foreground))' }}>{row.limit}</span>
        <span className="num" style={{ color:'hsl(var(--muted-foreground))' }}>{row.headroom}</span>
        <button onClick={()=>setOpen(!open)} style={{ border:'none', background:'none', cursor:'pointer', color:'hsl(var(--muted-foreground))', justifySelf:'end' }} title="Why">
          <Icon name={open?'ChevronUp':'ChevronDown'} size={13} />
        </button>
      </div>
      {open && <div style={{ padding:'0 0 8px 28px', fontSize:11, color:'hsl(var(--muted-foreground))', maxWidth:640 }}>{row.why}</div>}
    </div>
  );
}

function RuleLedger({ gate, title }) {
  const [showPassing, setShowPassing] = React.useState(true);
  const blocked = gate.rows.filter(r=>r.state==='blocked');
  const warning = gate.rows.filter(r=>r.state==='warning');
  const unresolved = gate.rows.filter(r=>r.state==='unresolved');
  const passing = gate.rows.filter(r=>r.state==='pass');
  return (
    <div className="desk-scope">
      {title && <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>{title}</div>}
      <div style={{ ...deskLedgerStyles.row, fontSize:11, color:'hsl(var(--muted-foreground))', textTransform:'uppercase', letterSpacing:'0.04em', fontWeight:600, borderBottom:'1px solid hsl(var(--border))', paddingBottom:6 }}>
        <span></span><span>Rule</span><span className="num">Your value</span><span className="num">Limit</span><span className="num">Headroom</span><span></span>
      </div>
      {blocked.map(r=><RuleRow key={r.id} row={r} />)}
      {warning.map(r=><RuleRow key={r.id} row={r} />)}
      {unresolved.map(r=><RuleRow key={r.id} row={r} />)}
      {passing.length>0 && (
        <button onClick={()=>setShowPassing(!showPassing)} style={{ margin:'6px 0', border:'none', background:'none', color:'hsl(var(--muted-foreground))', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
          <Icon name={showPassing?'ChevronUp':'ChevronDown'} size={12} /> {showPassing?'Hide':'Show'} passing ({passing.length})
        </button>
      )}
      {showPassing && passing.map(r=><RuleRow key={r.id} row={r} />)}
    </div>
  );
}

function GateDrawer({ open, onClose, gate }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.25)' }}></div>
      <div className="desk-scope" style={{ position:'absolute', top:0, right:0, height:'100%', width:460, background:'hsl(var(--card))', borderLeft:'1px solid hsl(var(--border))', padding:16, overflowY:'auto', boxShadow:'-8px 0 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:600 }}>Rule ledger</div>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', color:'hsl(var(--muted-foreground))' }}><Icon name="X" size={16} /></button>
        </div>
        <RuleLedger gate={gate} />
      </div>
    </div>
  );
}

Object.assign(window, { StateChip, OverallGateChip, InlineMeter, GateBar, RuleRow, RuleLedger, GateDrawer, STATE_META, deskLedgerStyles });
