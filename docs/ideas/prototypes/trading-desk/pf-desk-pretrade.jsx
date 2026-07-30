/* Pre-Trade: original 3-column layout (inputs | sizing calcs | ledger). Clean, no field overlaps. */
const deskPretradeStyles = {
  field: { display:'flex', flexDirection:'column', gap:3, marginBottom:10 },
  label: { fontSize:11, color:'hsl(var(--muted-foreground))', textTransform:'uppercase', letterSpacing:'0.03em' },
  input: { padding:'6px 8px', border:'1px solid hsl(var(--border))', borderRadius:4, fontSize:13, background:'hsl(var(--background))', color:'hsl(var(--foreground))', fontFamily:'inherit' },
  raceRow: { display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:12 },
};

const SCENARIO_PRESETS = {
  pass: { symbol:'BBCA', side:'long', entry:6300, stop:6050, target:7000, buyFeePct:0.15, sellFeePct:0.25, slippagePct:0.10, availableCash:37359961, qtyStep:100, todaysRealizedPnl:0 },
  warning: { symbol:'BBCA', side:'long', entry:6300, stop:6050, target:6600, buyFeePct:0.15, sellFeePct:0.25, slippagePct:0.10, availableCash:37359961, qtyStep:100, todaysRealizedPnl:0 },
  'blocked-no-stop': { symbol:'BBCA', side:'long', entry:6300, stop:null, target:7000, buyFeePct:0.15, sellFeePct:0.25, slippagePct:0.10, availableCash:37359961, qtyStep:100, todaysRealizedPnl:0 },
  'blocked-daily-limit': { symbol:'BBCA', side:'long', entry:6300, stop:6050, target:7000, buyFeePct:0.15, sellFeePct:0.25, slippagePct:0.10, availableCash:37359961, qtyStep:100, todaysRealizedPnl:-1150000 },
  'blocked-add-loser': { symbol:'BBRI', side:'long', entry:2930, stop:2680, target:3400, buyFeePct:0.15, sellFeePct:0.25, slippagePct:0.10, availableCash:37359961, qtyStep:100, todaysRealizedPnl:0 },
};

function Field({ label, children }) {
  return <div style={deskPretradeStyles.field}><span style={deskPretradeStyles.label}>{label}</span>{children}</div>;
}

function PreTrade({ chain, mandate, journalStats, scenario, onScenarioResultChange }) {
  const preset = SCENARIO_PRESETS[scenario] || SCENARIO_PRESETS.pass;
  const [inputs, setInputs] = React.useState(preset);
  React.useEffect(()=>{ setInputs(preset); }, [scenario]);
  const set = (k,v) => setInputs(prev=>({ ...prev, [k]: v }));

  const sizing = DESK.computeSizing(inputs, chain, mandate);
  const gate = DESK.evaluateGate(chain, sizing, inputs, mandate, journalStats, scenario);

  React.useEffect(()=>{ if(onScenarioResultChange) onScenarioResultChange(gate); }, [gate.overall]);

  return (
    <div className="desk-scope" style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, width:'100%', alignItems:'start', minWidth:0 }}>
        {/* COLUMN 1: INPUTS */}
        <div className="pf-card" style={{ padding:16, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Trade plan inputs</div>
          <Field label="Account"><select style={deskPretradeStyles.input}><option>Mandiri Sekuritas</option></select></Field>
          <Field label="Symbol"><input style={deskPretradeStyles.input} value={inputs.symbol} onChange={e=>set('symbol', e.target.value)} /></Field>
          <Field label="Currency"><select style={deskPretradeStyles.input}><option>IDR</option></select></Field>
          <Field label="Strategy"><input style={deskPretradeStyles.input} defaultValue="Breakout" /></Field>
          <Field label="Entry"><input type="number" className="num" style={deskPretradeStyles.input} value={inputs.entry ?? ''} onChange={e=>set('entry', e.target.value===''?null:Number(e.target.value))} /></Field>
          <Field label="Target"><input type="number" className="num" style={deskPretradeStyles.input} value={inputs.target ?? ''} onChange={e=>set('target', e.target.value===''?null:Number(e.target.value))} /></Field>
          <Field label="Sell fee %"><input type="number" step="0.01" className="num" style={deskPretradeStyles.input} value={inputs.sellFeePct} onChange={e=>set('sellFeePct', Number(e.target.value))} /></Field>
          <Field label="Available cash"><input type="number" className="num" style={deskPretradeStyles.input} value={inputs.availableCash} onChange={e=>set('availableCash', Number(e.target.value))} /></Field>
          <Field label="Correlation group"><input style={deskPretradeStyles.input} defaultValue="IDX Banks" /></Field>
          <Field label="Thesis"><textarea style={{ ...deskPretradeStyles.input, minHeight:44, resize:'vertical' }} defaultValue="Range high reclaim on volume, sector relative strength." /></Field>
          <Field label="Invalidation"><textarea style={{ ...deskPretradeStyles.input, minHeight:36, resize:'vertical' }} defaultValue="Close back below range high on volume." /></Field>
        </div>

        {/* COLUMN 2: SIZING CALCS */}
        <div className="pf-card" style={{ padding:16, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Why this quantity?</div>
          <Field label="Risk budget" /><div className="num" style={{ fontSize:13, marginBottom:10 }}>{DESK.fmtIDR(chain.adjustedRiskBudget)}</div>
          <Field label="Stop distance" /><div className="num" style={{ fontSize:13, marginBottom:10 }}>{inputs.stop ? DESK.fmtIDR(Math.abs(inputs.entry-inputs.stop)) : '—'}</div>
          <Field label="Fee + slippage" /><div className="num" style={{ fontSize:13, marginBottom:10 }}>{sizing.valid ? DESK.fmtIDR(sizing.unitRisk-Math.abs(inputs.entry-inputs.stop),true) : '—'}</div>
          <Field label="Unit risk" /><div className="num" style={{ fontSize:13, fontWeight:600, marginBottom:10, borderTop:'1px solid hsl(var(--border))', paddingTop:6 }}>{sizing.valid ? DESK.fmtIDR(sizing.unitRisk,true) : '—'}</div>
          <div style={{ fontSize:12, color:'hsl(var(--destructive))' }}>Risk-sized — BINDING</div>
          <Field label="Exposure cap (10%)" /><div className="num" style={{ fontSize:13, marginBottom:10 }}>—</div>
          <Field label="Cash cap" /><div className="num" style={{ fontSize:13, marginBottom:10 }}>—</div>
          <div style={{ fontSize:12, fontWeight:600, marginTop:10, paddingTop:10, borderTop:'1px solid hsl(var(--border))' }}>Final</div>
          <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>Planned position value</span><span className="num">{sizing.valid ? DESK.fmtIDR(sizing.finalQty*inputs.entry) : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>Planned loss</span><span className="num">{sizing.valid ? DESK.fmtIDR(sizing.plannedLoss) : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>Planned reward</span><span className="num">{sizing.valid && sizing.plannedReward ? DESK.fmtIDR(sizing.plannedReward) : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>R:R (limit 2.00R)</span><span className="num">{sizing.valid ? DESK.fmtR(sizing.rr) : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>Exposure % (limit 10.00%)</span><span className="num">{sizing.valid ? sizing.exposurePct.toFixed(2)+'%' : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span>Resulting portfolio heat (limit 3.00%)</span><span className="num">{sizing.valid ? sizing.heatAfter.toFixed(2)+'%' : '—'}</span>
          </div>
        </div>

        {/* COLUMN 3: RULE LEDGER */}
        <div className="pf-card" style={{ padding:16, minWidth:0 }}>
          <RuleLedger gate={gate} title="Rule ledger" />
        </div>
      </div>

      <div className="pf-card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <button disabled={gate.overall==='BLOCKED'} style={{ padding:'8px 16px', borderRadius:6, border:'none', cursor: gate.overall==='BLOCKED'?'not-allowed':'pointer', background: gate.overall==='BLOCKED'?'hsl(var(--muted))':'hsl(var(--foreground))', color: gate.overall==='BLOCKED'?'hsl(var(--muted-foreground))':'hsl(var(--background))', fontSize:13 }}>Save trade plan</button>
        <button style={{ padding:'8px 16px', borderRadius:6, border:'1px solid hsl(var(--border))', background:'none', cursor:'pointer', fontSize:13 }}>Save as draft</button>
        {gate.overall==='BLOCKED' && <span style={{ fontSize:12, color:'hsl(var(--destructive))' }}>{gate.blockingReasons.join(' · ')}</span>}
        <span style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginLeft:'auto', maxWidth:520 }}>Planned loss bukan jaminan maximum loss. Gap, slippage, likuiditas, dan kegagalan eksekusi dapat menghasilkan kerugian lebih besar.</span>
      </div>
    </div>
  );
}

Object.assign(window, { PreTrade, SCENARIO_PRESETS });
