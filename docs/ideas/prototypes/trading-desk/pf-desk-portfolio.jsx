/* Portfolio: consolidated positions table with grouping and inline sleeve editing. */
const deskPortfolioStyles = {
  th: { fontSize:11, textTransform:'uppercase', color:'hsl(var(--muted-foreground))', letterSpacing:'0.03em', textAlign:'left', padding:'6px 8px', borderBottom:'1px solid hsl(var(--border))' },
  td: { padding:'6px 8px', fontSize:12, borderBottom:'1px solid hsl(var(--border))' },
};

const SLEEVES = ['Legacy / Unclassified','Core','Active Trading','Reserve'];

function nativeCurrency(broker){ return broker==='Binance' ? 'USD' : broker==='IBKR' ? 'USD' : null; }

function PortfolioRow({ p, onUpdateSleeve }) {
  const native = nativeCurrency(p.broker);
  const unbounded = p.stopPrice == null;
  return (
    <tr>
      <td style={deskPortfolioStyles.td}>{p.broker}</td>
      <td style={deskPortfolioStyles.td}>{p.symbol}{p.unconfirmed && <span style={{ marginLeft:5, fontSize:10, color:'hsl(var(--muted-foreground))' }}>(unconfirmed)</span>}</td>
      <td style={deskPortfolioStyles.td}>{p.class}</td>
      <td className="num" style={deskPortfolioStyles.td}>{p.qtyLots!=null ? p.qtyLots.toLocaleString('id-ID')+' lots' : p.qty}</td>
      <td className="num" style={deskPortfolioStyles.td}>{p.avg!=null?p.avg.toLocaleString('id-ID'):(native+' '+p.avgNative)}</td>
      <td className="num" style={deskPortfolioStyles.td}>{p.last!=null?p.last.toLocaleString('id-ID'):(native+' '+p.lastNative)}</td>
      <td className="num" style={deskPortfolioStyles.td}>
        {native && <div style={{ fontSize:10, color:'hsl(var(--muted-foreground))' }}>{native} {p.avgNative*p.qty|0}</div>}
        {DESK.fmtIDR(p.costIDR)}
      </td>
      <td className="num" style={deskPortfolioStyles.td}>{DESK.fmtIDR(p.mvIDR)}</td>
      <td className="num" style={{ ...deskPortfolioStyles.td, color: p.pnlIDR<0?'hsl(var(--destructive))':'hsl(var(--success))' }}>{DESK.fmtIDR(p.pnlIDR)}</td>
      <td className="num" style={{ ...deskPortfolioStyles.td, color: p.pnlPct<0?'hsl(var(--destructive))':'hsl(var(--success))' }}>{DESK.fmtPct(p.pnlPct)}</td>
      <td className="num" style={{ ...deskPortfolioStyles.td, fontWeight: p.weight>10?700:400, color: p.weight>10?'hsl(var(--destructive))':'hsl(var(--foreground))' }}>{p.weight.toFixed(2)}%</td>
      <td style={deskPortfolioStyles.td}>
        <select value={p.sleeve} onChange={e=>onUpdateSleeve(p.broker+p.symbol, e.target.value)} style={{ fontSize:11, padding:'3px 4px', border:'1px solid hsl(var(--border))', borderRadius:4, background:'hsl(var(--background))', color:'hsl(var(--foreground))' }}>
          {SLEEVES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={deskPortfolioStyles.td}>{p.stopPrice ?? '—'}</td>
      <td style={deskPortfolioStyles.td}><StateChip state={unbounded?'blocked':'pass'} label={unbounded?'UNBOUNDED':'BOUNDED'} /></td>
      <td style={deskPortfolioStyles.td}>{p.pnlPct<-30 ? <StateChip state="warning" label="DEEP LOSS" /> : '—'}</td>
    </tr>
  );
}

function Portfolio({ positions, onUpdateSleeve }) {
  const [groupBy, setGroupBy] = React.useState('Broker');
  const groups = {};
  positions.forEach(p=>{
    const key = groupBy==='Broker'?p.broker : groupBy==='Sleeve'?p.sleeve : groupBy==='Asset class'?p.class : groupBy==='Currency'?(nativeCurrency(p.broker)||'IDR') : p.class;
    (groups[key] = groups[key]||[]).push(p);
  });
  return (
    <div className="desk-scope" style={{ padding:16 }}>
      <div className="pf-card" style={{ padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:600 }}>Accounts &amp; Portfolio</div>
          <label style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>Group by{' '}
            <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ marginLeft:6, fontSize:12, padding:'4px 6px', border:'1px solid hsl(var(--border))', borderRadius:4, background:'hsl(var(--background))', color:'hsl(var(--foreground))' }}>
              {['Broker','Sleeve','Asset class','Currency'].map(g=><option key={g}>{g}</option>)}
            </select>
          </label>
        </div>
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', minWidth:1100, borderCollapse:'collapse' }}>
          <thead><tr>
            {['Broker','Symbol','Class','Qty','Avg','Last','Cost IDR','MV IDR','P&L IDR','P&L %','Weight','Sleeve','Stop','Risk status','Flags'].map(h=>(
              <th key={h} className={['Qty','Avg','Last','Cost IDR','MV IDR','P&L IDR','P&L %','Weight'].includes(h)?'num':''} style={deskPortfolioStyles.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {Object.keys(groups).map(key=>(
              <React.Fragment key={key}>
                <tr><td colSpan={15} style={{ padding:'10px 8px 4px', fontSize:11, fontWeight:700, textTransform:'uppercase', color:'hsl(var(--muted-foreground))' }}>{key} ({groups[key].length})</td></tr>
                {groups[key].map(p=><PortfolioRow key={p.broker+p.symbol} p={p} onUpdateSleeve={onUpdateSleeve} />)}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Portfolio, SLEEVES });
