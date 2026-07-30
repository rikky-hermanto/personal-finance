/* Capital waterfall, trade-limit rail, tiles row. Command Center hero. */
const deskWaterfallStyles = {
  node: { display:'flex', flexDirection:'column', gap:2, minWidth:150, padding:'8px 12px', borderRight:'1px solid hsl(var(--border))' },
  label: { fontSize:11, textTransform:'uppercase', letterSpacing:'0.04em', color:'hsl(var(--muted-foreground))' },
  value: { fontSize:20, fontWeight:600 },
  deduction: { fontSize:11, color:'hsl(var(--destructive))', display:'flex', alignItems:'center', gap:4 },
  tile: { padding:'10px 12px', borderRight:'1px solid hsl(var(--border))' },
};

function WaterfallNode({ label, value, big, onClick, chip, sub }) {
  return (
    <div style={deskWaterfallStyles.node}>
      <span style={deskWaterfallStyles.label}>{label}</span>
      <span className="num" style={{ ...deskWaterfallStyles.value, fontSize: big?28:20, textAlign:'left', cursor: onClick?'pointer':'default', textDecoration: onClick?'underline dotted':'none' }} onClick={onClick}>{value}</span>
      {sub && <span style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>{sub}</span>}
      {chip}
    </div>
  );
}

function CapitalWaterfall({ chain, mandate, onResolveStockbit, onApproveNav }) {
  const stockbitState = chain.included ? 'pass' : 'unresolved';
  return (
    <div className="desk-scope pf-card" style={{ padding:0 }}>
      <div style={{ display:'flex', flexWrap:'wrap', overflowX:'auto' }}>
        <WaterfallNode label="Tentative NAV" value={DESK.fmtIDR(chain.tentativeNAV)} />
        <div style={deskWaterfallStyles.node}>
          <span style={deskWaterfallStyles.label}>Stockbit cash</span>
          <span className="num" style={{ ...deskWaterfallStyles.deduction, cursor:'pointer', textAlign:'left' }} onClick={onResolveStockbit}>
            −{DESK.fmtIDR(chain.stockbitAmt)}
          </span>
          <StateChip state={stockbitState} />
        </div>
        <WaterfallNode label="Reconciled NAV" value={DESK.fmtIDR(chain.reconciledNAV)} sub="→ Core · Active Trading · Reserve · Legacy" />
        <WaterfallNode label="Active Trading NAV" big value={DESK.fmtIDR(chain.activeTradingNav)} onClick={!mandate.activeTradingNavApproved ? onApproveNav : undefined}
          chip={<StateChip state={mandate.activeTradingNavApproved?'pass':'unresolved'} label={mandate.activeTradingNavApproved?'APPROVED':'UNAPPROVED'} />} />
        <div style={deskWaterfallStyles.node}>
          <span style={deskWaterfallStyles.label}>× risk/trade · × drawdown</span>
          <span className="num" style={{ fontSize:15 }}>{mandate.riskPerTradePct.toFixed(2)}% × {chain.regime.multiplier.toFixed(2)}×</span>
        </div>
        <WaterfallNode label="Risk budget / trade" value={DESK.fmtIDR(chain.adjustedRiskBudget)} />
        <div style={deskWaterfallStyles.node}>
          <span style={deskWaterfallStyles.label}>Open risk (heat {chain.heat.toFixed(2)}%)</span>
          <span className="num" style={{ ...deskWaterfallStyles.deduction, textAlign:'left' }}>−{DESK.fmtIDR(chain.openRisk)}</span>
        </div>
        <WaterfallNode label="Daily headroom left" value={DESK.fmtIDR(chain.dailyHeadroom)} />
      </div>
    </div>
  );
}

function TradeLimitRail({ account }) {
  return (
    <div className="desk-scope" style={{ border:'1px dashed hsl(var(--border))', borderRadius:6, padding:12, background:'hsl(var(--muted) / 0.4)', maxWidth:260 }}>
      <div style={{ fontSize:11, textTransform:'uppercase', color:'hsl(var(--muted-foreground))', marginBottom:4 }}>Broker trade limit</div>
      <div className="num" style={{ fontSize:18, textDecoration:'line-through', color:'hsl(var(--muted-foreground))' }}>{DESK.fmtIDR(account.buyingPower)}</div>
      <div style={{ margin:'6px 0' }}><StateChip state="notcapital" /></div>
      <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>Buying power is not your money. Risk limits derive from Active Trading NAV.</div>
    </div>
  );
}

function Tile({ label, value, delta, deltaGood }) {
  return (
    <div style={deskWaterfallStyles.tile}>
      <div style={deskWaterfallStyles.label}>{label}</div>
      <div className="num" style={{ fontSize:20, fontWeight:600, textAlign:'left' }}>{value}</div>
      {delta && <div style={{ fontSize:12, color: deltaGood ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>{delta}</div>}
    </div>
  );
}

function TilesRow({ chain, positions, todaysPnl }) {
  const totalCash = DESK.ACCOUNTS.reduce((s,a)=>s+a.cash,0);
  return (
    <div className="desk-scope pf-card" style={{ display:'flex', flexWrap:'wrap' }}>
      <Tile label="Tentative NAV" value={DESK.fmtIDR(chain.tentativeNAV)} />
      <Tile label="Reconciled NAV" value={DESK.fmtIDR(chain.reconciledNAV)} />
      <Tile label="Active Trading NAV" value={DESK.fmtIDR(chain.activeTradingNav)} />
      <Tile label="Total cash" value={DESK.fmtIDR(totalCash)} />
      <Tile label="Open risk" value={DESK.fmtIDR(chain.openRisk)} />
      <Tile label="Portfolio heat" value={chain.heat.toFixed(2)+'%'} />
      <Tile label="Today's global P&L" value={DESK.fmtIDR(todaysPnl||0)} delta={todaysPnl<0?'realized':undefined} deltaGood={false} />
    </div>
  );
}

Object.assign(window, { CapitalWaterfall, TradeLimitRail, TilesRow, Tile, deskWaterfallStyles });
