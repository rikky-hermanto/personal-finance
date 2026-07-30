/* Mandate: parameter form, version history, approval, diff view. */
const deskMandateStyles = {
  field: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid hsl(var(--border))', fontSize:12 },
  input: { width:110, padding:'4px 6px', border:'1px solid hsl(var(--border))', borderRadius:4, fontSize:12, background:'hsl(var(--background))', color:'hsl(var(--foreground))', textAlign:'right' },
};

const PARAM_META = [
  ['activeTradingNav','Active Trading NAV (Rp)'],['riskPerTradePct','Risk per trade %'],['hardCeilingPct','Hard ceiling %'],
  ['dailyLossLimitPct','Daily loss limit %'],['weeklyLossLimitPct','Weekly loss limit %'],['monthlyLossLimitPct','Monthly loss limit %'],
  ['normalHeatPct','Normal heat %'],['hardHeatPct','Hard heat %'],['clusterHeatPct','Cluster heat %'],
  ['maxSingleStockPct','Max single stock %'],['maxCryptoSymbolPct','Max crypto/symbol %'],['maxAltcoinPct','Max altcoin %'],
  ['minRR','Min R:R'],['consecutiveLossStop','Consecutive-loss stop'],['reviewAt','Review at'],
  ['leverageEnabled','Leverage'],['averagingDownEnabled','Averaging down'],
];
const LOWER_IS_TIGHTER = new Set(['riskPerTradePct','hardCeilingPct','dailyLossLimitPct','weeklyLossLimitPct','monthlyLossLimitPct','normalHeatPct','hardHeatPct','clusterHeatPct','maxSingleStockPct','maxCryptoSymbolPct','maxAltcoinPct','consecutiveLossStop']);

function ParamRow({ k, label, value, onChange, editable }) {
  const isBool = typeof value === 'boolean';
  return (
    <div style={deskMandateStyles.field}>
      <span>{label}</span>
      {editable ? (
        isBool ? (
          <input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)} />
        ) : (
          <input className="num" type="number" style={deskMandateStyles.input} value={value} onChange={e=>onChange(Number(e.target.value))} />
        )
      ) : (
        <span className="num">{isBool ? (value?'On':'Off') : value.toLocaleString('id-ID')}</span>
      )}
    </div>
  );
}

function VersionCard({ v, selected, onSelect }) {
  return (
    <button onClick={()=>onSelect(v.version)} style={{ display:'block', width:'100%', textAlign:'left', padding:10, marginBottom:8, borderRadius:6, border: selected?'1px solid hsl(var(--foreground))':'1px solid hsl(var(--border))', background:'none', cursor:'pointer' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontWeight:600, fontSize:13 }}>v{v.version}</span>
        <StateChip state={v.status==='approved'?'pass':'unresolved'} label={v.status==='approved'?'APPROVED':'DRAFT'} />
      </div>
      <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginTop:4 }}>
        {v.effectiveDate ? 'Effective '+v.effectiveDate : 'Not yet effective'}{v.changeReason ? ' · '+v.changeReason : ''}
      </div>
    </button>
  );
}

function DiffView({ versions, aNum, bNum }) {
  const a = versions.find(v=>v.version===aNum), b = versions.find(v=>v.version===bNum);
  if (!a || !b) return null;
  const changed = PARAM_META.filter(([k])=> a.params[k] !== b.params[k]);
  if (!changed.length) return <div style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>No differences between v{aNum} and v{bNum}.</div>;
  return (
    <div>
      {changed.map(([k,label])=>{
        const av = a.params[k], bv = b.params[k];
        const tighter = typeof av === 'number' ? (LOWER_IS_TIGHTER.has(k) ? bv < av : bv > av) : (bv===false);
        return (
          <div key={k} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, padding:'5px 0', borderBottom:'1px solid hsl(var(--border))' }}>
            <span style={{ flex:1 }}>{label}</span>
            <span className="num">{String(av)}</span>
            <Icon name="ArrowRight" size={12} style={{ color:'hsl(var(--muted-foreground))' }} />
            <span className="num" style={{ color: tighter?'hsl(var(--success))':'hsl(var(--destructive))', fontWeight:600 }}>{String(bv)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Mandate({ versions, onUpdateDraft, onApprove }) {
  const draft = versions.find(v=>v.status==='draft');
  const approvedList = versions.filter(v=>v.status==='approved');
  const latestApproved = approvedList[approvedList.length-1];
  const [selected, setSelected] = React.useState(draft ? draft.version : (latestApproved ? latestApproved.version : versions[0].version));
  const [diffA, setDiffA] = React.useState(versions[0].version);
  const [diffB, setDiffB] = React.useState(versions[versions.length-1].version);
  const [reason, setReason] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  const editing = versions.find(v=>v.version===selected);
  const isEditable = editing && editing.status==='draft';

  return (
    <div className="desk-scope" style={{ padding:16, display:'grid', gridTemplateColumns:'minmax(420px, 1fr) minmax(320px, 1fr)', gap:16, width:'100%', alignItems:'start' }}>
      <div className="pf-card" style={{ padding:16 }}>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:2 }}>Risk mandate — {DESK.MANDATE_DEFAULT.preset}</div>
        <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginBottom:10 }}>Viewing v{selected} {isEditable?'(editable draft)':'(read-only)'}</div>
        {editing && PARAM_META.map(([k,label])=>(
          <ParamRow key={k} k={k} label={label} value={editing.params[k]} editable={isEditable} onChange={(v)=>onUpdateDraft(k,v)} />
        ))}
        {isEditable && (
          <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid hsl(var(--border))' }}>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, marginBottom:8 }}>
              <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} style={{ marginTop:2 }} />
              I have reviewed these parameters and confirm this mandate.
            </label>
            <textarea placeholder="Change reason (required)" value={reason} onChange={e=>setReason(e.target.value)} style={{ width:'100%', minHeight:44, padding:8, border:'1px solid hsl(var(--border))', borderRadius:4, fontSize:12, background:'hsl(var(--background))', color:'hsl(var(--foreground))' }}></textarea>
            <button disabled={!confirmed || !reason.trim()} onClick={()=>onApprove(reason)} style={{ marginTop:8, padding:'8px 16px', borderRadius:6, border:'none', cursor: (!confirmed||!reason.trim())?'not-allowed':'pointer', background: (!confirmed||!reason.trim())?'hsl(var(--muted))':'hsl(var(--foreground))', color: (!confirmed||!reason.trim())?'hsl(var(--muted-foreground))':'hsl(var(--background))', fontSize:13 }}>
              Approve mandate
            </button>
          </div>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="pf-card" style={{ padding:16 }}>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Version history</div>
          {[...versions].reverse().map(v=><VersionCard key={v.version} v={v} selected={v.version===selected} onSelect={setSelected} />)}
        </div>
        <div className="pf-card" style={{ padding:16 }}>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Diff</div>
          <div style={{ display:'flex', gap:8, marginBottom:10, fontSize:12 }}>
            <select value={diffA} onChange={e=>setDiffA(Number(e.target.value))} style={deskMandateStyles.input}>{versions.map(v=><option key={v.version} value={v.version}>v{v.version}</option>)}</select>
            <Icon name="ArrowRight" size={12} style={{ alignSelf:'center', color:'hsl(var(--muted-foreground))' }} />
            <select value={diffB} onChange={e=>setDiffB(Number(e.target.value))} style={deskMandateStyles.input}>{versions.map(v=><option key={v.version} value={v.version}>v{v.version}</option>)}</select>
          </div>
          <DiffView versions={versions} aNum={diffA} bNum={diffB} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Mandate, PARAM_META });
