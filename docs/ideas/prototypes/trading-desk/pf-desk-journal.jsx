/* Journal: entries table, stats strip, mistake tags, filters. */
const deskJournalStyles = {
  th: { fontSize:11, textTransform:'uppercase', color:'hsl(var(--muted-foreground))', textAlign:'left', padding:'6px 8px', borderBottom:'1px solid hsl(var(--border))' },
  td: { padding:'6px 8px', fontSize:12, borderBottom:'1px solid hsl(var(--border))' },
  stat: { padding:'10px 14px', borderRight:'1px solid hsl(var(--border))' },
};

function TagChip({ tag }) {
  const good = tag === 'Process compliant';
  return <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background: good?'hsl(var(--success) / 0.14)':'hsl(var(--warning) / 0.16)', color: good?'hsl(var(--success))':'hsl(var(--warning))' }}>{tag}</span>;
}

function StatsStrip({ stats, sufficient }) {
  return (
    <div>
      {!sufficient && (
        <div style={{ padding:'8px 12px', marginBottom:8, borderRadius:6, background:'hsl(var(--warning) / 0.12)', color:'hsl(var(--warning))', fontSize:12 }}>
          Sample size not yet sufficient ({stats.closed} of 30 closed trades).
        </div>
      )}
      <div className="pf-card" style={{ display:'flex', flexWrap:'wrap', opacity: sufficient?1:0.5 }}>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Closed trades</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{stats.closed}</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Win rate</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{(stats.winRate*100).toFixed(0)}%</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Avg win R</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{DESK.fmtR(stats.avgWinR)}</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Avg loss R</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{DESK.fmtR(-stats.avgLossR)}</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Expectancy R</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{DESK.fmtR(stats.expectancyR)}</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Profit factor</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{isFinite(stats.profitFactor)?stats.profitFactor.toFixed(2):'∞'}</div></div>
        <div style={deskJournalStyles.stat}><div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Compliance rate</div><div className="num" style={{ fontSize:18, fontWeight:600, textAlign:'left' }}>{(stats.complianceRate*100).toFixed(0)}%</div></div>
      </div>
    </div>
  );
}

function Journal({ entries }) {
  const [strategy, setStrategy] = React.useState('All');
  const [broker, setBroker] = React.useState('All');
  const strategies = ['All', ...new Set(entries.map(e=>e.strategy))];
  const brokers = ['All', ...new Set(entries.map(e=>e.broker))];
  const filtered = entries.filter(e=> (strategy==='All'||e.strategy===strategy) && (broker==='All'||e.broker===broker));
  const stats = DESK.journalStats(entries);
  return (
    <div className="desk-scope" style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <StatsStrip stats={stats} sufficient={stats.closed>=30} />
      <div className="pf-card" style={{ padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:15, fontWeight:600 }}>Journal</div>
          <div style={{ display:'flex', gap:8, fontSize:12 }}>
            <select value={strategy} onChange={e=>setStrategy(e.target.value)} style={{ padding:'4px 6px', border:'1px solid hsl(var(--border))', borderRadius:4, background:'hsl(var(--background))', color:'hsl(var(--foreground))' }}>{strategies.map(s=><option key={s}>{s}</option>)}</select>
            <select value={broker} onChange={e=>setBroker(e.target.value)} style={{ padding:'4px 6px', border:'1px solid hsl(var(--border))', borderRadius:4, background:'hsl(var(--background))', color:'hsl(var(--foreground))' }}>{brokers.map(b=><option key={b}>{b}</option>)}</select>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', minWidth:1000, borderCollapse:'collapse' }}>
          <thead><tr>{['Date','Symbol','Broker','Strategy','Planned qty','Actual qty','Entry','Exit','Net P&L','Realized R','Compliance','Tags'].map(h=><th key={h} style={deskJournalStyles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(e=>(
              <tr key={e.id}>
                <td style={deskJournalStyles.td}>{e.date}</td>
                <td style={deskJournalStyles.td}>{e.symbol}</td>
                <td style={deskJournalStyles.td}>{e.broker}</td>
                <td style={deskJournalStyles.td}>{e.strategy}</td>
                <td className="num" style={deskJournalStyles.td}>{e.plannedQty}</td>
                <td className="num" style={deskJournalStyles.td}>{e.actualQty}</td>
                <td className="num" style={deskJournalStyles.td}>{e.entry.toLocaleString('id-ID')}</td>
                <td className="num" style={deskJournalStyles.td}>{e.exit.toLocaleString('id-ID')}</td>
                <td className="num" style={{ ...deskJournalStyles.td, color: e.netPnl<0?'hsl(var(--destructive))':'hsl(var(--success))' }}>{e.netPnl.toLocaleString('id-ID')}</td>
                <td className="num" style={{ ...deskJournalStyles.td, color: e.realizedR<0?'hsl(var(--destructive))':'hsl(var(--success))' }}>{DESK.fmtR(e.realizedR)}</td>
                <td style={deskJournalStyles.td}><StateChip state={e.compliant?'pass':'warning'} label={e.compliant?'COMPLIANT':'DEVIATION'} /></td>
                <td style={deskJournalStyles.td}><div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>{e.tags.map(t=><TagChip key={t} tag={t} />)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Journal, StatsStrip, TagChip });
