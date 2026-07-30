/* Reconcile & Settings: accounts table, issue resolution, FX settings. */
const deskReconStyles = {
  th: { fontSize:11, textTransform:'uppercase', color:'hsl(var(--muted-foreground))', textAlign:'left', padding:'6px 8px', borderBottom:'1px solid hsl(var(--border))' },
  td: { padding:'6px 8px', fontSize:12, borderBottom:'1px solid hsl(var(--border))' },
};

function AccountsTable({ accounts }) {
  return (
    <div className="pf-card" style={{ padding:16 }}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Accounts</div>
      <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', minWidth:700, borderCollapse:'collapse' }}>
        <thead><tr>{['Account','Reported equity','Cash','Buying power','Status'].map(h=><th key={h} style={deskReconStyles.th}>{h}</th>)}</tr></thead>
        <tbody>
          {accounts.map(a=>(
            <tr key={a.id}>
              <td style={deskReconStyles.td}>{a.name}</td>
              <td className="num" style={deskReconStyles.td}>{DESK.fmtIDR(a.reportedEquity)}{a.reportedEquityNative!=null && <div style={{ fontSize:10, color:'hsl(var(--muted-foreground))' }}>${a.reportedEquityNative}</div>}</td>
              <td className="num" style={deskReconStyles.td}>{DESK.fmtIDR(a.cash)}</td>
              <td className="num" style={deskReconStyles.td}>{a.buyingPower ? (a.buyingPowerCurrency==='USD' ? DESK.fmtUSD(a.buyingPower) : DESK.fmtIDR(a.buyingPower)) : '—'}</td>
              <td style={deskReconStyles.td}>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function IssueCard({ issue, onResolve }) {
  const resolved = issue.resolution !== 'unresolved';
  return (
    <div style={{ padding:12, borderBottom:'1px solid hsl(var(--border))' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600 }}>{issue.label} — {issue.account}</div>
          {issue.amount!=null && <div className="num" style={{ fontSize:12, color:'hsl(var(--muted-foreground))', textAlign:'left' }}>{issue.currency==='USD'?DESK.fmtUSD(issue.amount):DESK.fmtIDR(issue.amount)}</div>}
        </div>
        <StateChip state={resolved?'pass':'unresolved'} label={resolved?'RESOLVED':'UNRESOLVED'} />
      </div>
      <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
        {issue.options.map(([key,label])=>(
          <button key={key} onClick={()=>onResolve(issue.id,key)} style={{ fontSize:11, padding:'5px 10px', borderRadius:5, cursor:'pointer', border: issue.resolution===key?'1px solid hsl(var(--foreground))':'1px solid hsl(var(--border))', background: issue.resolution===key?'hsl(var(--foreground))':'none', color: issue.resolution===key?'hsl(var(--background))':'hsl(var(--foreground))' }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function FxSettings({ fx, onChange }) {
  return (
    <div className="pf-card" style={{ padding:16 }}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>FX rates</div>
      {[['usdIdr','USD/IDR'],['sgdUsd','SGD/USD']].map(([k,label])=>(
        <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid hsl(var(--border))', fontSize:12 }}>
          <span>{label}</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input className="num" type="number" step="0.00001" value={fx[k]} onChange={e=>onChange(k, Number(e.target.value))} style={{ width:100, padding:'4px 6px', border:'1px solid hsl(var(--border))', borderRadius:4, background:'hsl(var(--background))', color:'hsl(var(--foreground))', textAlign:'right' }} />
            <StateChip state={fx.stale?'warning':'pass'} label={fx.stale?'STALE':'FRESH'} />
          </div>
        </div>
      ))}
      <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginTop:6 }}>As of {DESK.FX.asOf}</div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        {['Export JSON','Export CSV','Reset to demo data'].map(l=>(
          <button key={l} onClick={()=>window.__deskToast && window.__deskToast(l+' — stubbed in prototype')} style={{ fontSize:11, padding:'6px 10px', borderRadius:5, border:'1px solid hsl(var(--border))', background:'none', cursor:'pointer' }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function Reconcile({ accounts, issues, onResolve, fx, onFxChange }) {
  return (
    <div className="desk-scope" style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <AccountsTable accounts={accounts} />
      <div style={{ display:'grid', gridTemplateColumns:'minmax(420px, 1fr) minmax(320px, 1fr)', gap:16, width:'100%' }}>
        <div className="pf-card" style={{ padding:16 }}>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Reconciliation issues</div>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {issues.map(i=><IssueCard key={i.id} issue={i} onResolve={onResolve} />)}
          </div>
        </div>
        <div><FxSettings fx={fx} onChange={onFxChange} /></div>
      </div>
    </div>
  );
}

Object.assign(window, { Reconcile, AccountsTable, IssueCard, FxSettings });
