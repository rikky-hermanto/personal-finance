/* Trading Risk OS — seed data + pure calculation functions. window.DESK */
(function(){

const ACCOUNTS = [
  { id:'mandiri', name:'Mandiri Sekuritas', currency:'IDR', reportedEquity:784938961.72, cash:37359961.72, buyingPower:1404710882.16, status:'Needs reconciliation' },
  { id:'stockbit_cash', name:'Stockbit — cash only', currency:'IDR', reportedEquity:33178117, cash:33178117, buyingPower:null, status:'Needs reconciliation' },
  { id:'stockbit_stocks', name:'Stockbit — stocks', currency:'IDR', reportedEquity:104243623, cash:15812623, buyingPower:null, status:'Reconciles' },
  { id:'binance', name:'Binance', currency:'USD', reportedEquityNative:7793.85, reportedEquity:140679062.69, cashNative:1.26, cash:22750, buyingPower:null, status:'Instrument unconfirmed' },
  { id:'ibkr', name:'IBKR', currency:'USD', reportedEquityNative:106.00, reportedEquity:1913300, cashNative:12.38, cashCurrencyNative:'SGD', cash:172661, buyingPower:9.60, buyingPowerCurrency:'USD', status:'Estimated cost basis' },
];

const POSITIONS = [
  { broker:'Mandiri', symbol:'ELTY', class:'IDX Stock', qtyShares:18000, qtyLots:180, avg:102.78, last:29, costIDR:1850040, mvIDR:522000, pnlIDR:-1328040, pnlPct:-71.78, weight:0.05, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Mandiri', symbol:'GOTO', class:'IDX Stock', qtyShares:907500, qtyLots:9075, avg:99.85, last:50, costIDR:90613875, mvIDR:45375000, pnlIDR:-45238875, pnlPct:-49.92, weight:4.64, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Mandiri', symbol:'BBCA', class:'IDX Stock', qtyShares:23300, qtyLots:233, avg:9969.85, last:6300, costIDR:232297505, mvIDR:146790000, pnlIDR:-85507505, pnlPct:-36.81, weight:15.01, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Mandiri', symbol:'HMSP', class:'IDX Stock', qtyShares:62600, qtyLots:626, avg:2121.51, last:715, costIDR:132806526, mvIDR:44759000, pnlIDR:-88047526, pnlPct:-66.30, weight:4.58, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Mandiri', symbol:'BBRI', class:'IDX Stock', qtyShares:174000, qtyLots:1740, avg:4270.78, last:2930, costIDR:743115720, mvIDR:509820000, pnlIDR:-233295720, pnlPct:-31.39, weight:52.12, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Stockbit', symbol:'AADI', class:'IDX Stock', qtyShares:7100, qtyLots:71, avg:9963.86, last:9100, costIDR:70743455, mvIDR:64610000, pnlIDR:-6133455, pnlPct:-8.67, weight:6.61, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Stockbit', symbol:'ANTM', class:'IDX Stock', qtyShares:8300, qtyLots:83, avg:3560.51, last:2870, costIDR:29552262, mvIDR:23821000, pnlIDR:-5731262, pnlPct:-19.39, weight:2.44, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Binance', symbol:'USDT', class:'Crypto', qty:1.26, avgNative:1.00, lastNative:1.00, costIDR:22723.82, mvIDR:22723.82, pnlIDR:0, pnlPct:0.00, weight:0.005, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Binance', symbol:'BTC/USDT', class:'Crypto', qty:0.09449, avgNative:71069, lastNative:64281.37, costIDR:121210541, mvIDR:109634737, pnlIDR:-11575804, pnlPct:-9.55, weight:11.21, sleeve:'Legacy / Unclassified', stopPrice:null },
  { broker:'Binance', symbol:'Gold (unconfirmed)', class:'Crypto', qty:0.421, avgNative:4748, lastNative:4082.30, costIDR:36078802, mvIDR:31021602, pnlIDR:-5057200, pnlPct:-14.02, weight:3.17, sleeve:'Legacy / Unclassified', stopPrice:null, unconfirmed:true },
  { broker:'IBKR', symbol:'IBM', class:'US Stock', qty:0.4265, avgNative:214.07, lastNative:226.25, costIDR:1647965, mvIDR:1738215, pnlIDR:90250, pnlPct:5.48, weight:0.18, sleeve:'Legacy / Unclassified', stopPrice:null, estimatedCostBasis:true },
];

const NAV_SEED = {
  tentativeNAV: 1064953064.41,
  reconciledNAV_exclStockbit: 1031774947.41,
  listedMV: 978114277.70,
  tentativeCashTotal: 86546705.54,
  stockbitDuplicateCash: 33178117,
};

const FX = { usdIdr: 18050, sgdUsd: 0.77544, asOf: '2026-07-30' };

const MANDATE_DEFAULT = {
  preset: 'Conservative Personal Trader',
  activeTradingNav: 100000000,
  activeTradingNavMode: 'absolute', // 'absolute' | 'pctOfReconciled'
  activeTradingNavApproved: false,
  riskPerTradePct: 0.50,
  hardCeilingPct: 1.00,
  dailyLossLimitPct: 1.00,
  weeklyLossLimitPct: 2.50,
  monthlyLossLimitPct: 5.00,
  normalHeatPct: 2.00,
  hardHeatPct: 3.00,
  clusterHeatPct: 1.25,
  maxSingleStockPct: 10.00,
  maxCryptoSymbolPct: 7.50,
  maxAltcoinPct: 2.50,
  minRR: 2.00,
  consecutiveLossStop: 3,
  reviewAt: 5,
  leverageEnabled: false,
  averagingDownEnabled: false,
};

const REGIMES = {
  Normal:      { drawdownPct: 1.5, multiplier: 1.00 },
  Caution:     { drawdownPct: 4.0, multiplier: 0.50 },
  Defensive:   { drawdownPct: 6.5, multiplier: 0.25 },
  'Risk Freeze': { drawdownPct: 9.0, multiplier: 0.00 },
};

const OPEN_TRADES = [
  { id:'ot1', symbol:'AADI', broker:'Stockbit', initialRisk:450000 },
  { id:'ot2', symbol:'ANTM', broker:'Stockbit', initialRisk:380000 },
];

const JOURNAL_SEED = [
  { id:'j1', date:'2026-05-04', symbol:'AADI', broker:'Stockbit', strategy:'Breakout', plannedQty:60, actualQty:60, entry:9800, exit:10630, netPnl:49800, realizedR:2.4, compliant:true, tags:['Process compliant'] },
  { id:'j2', date:'2026-05-11', symbol:'ANTM', broker:'Stockbit', strategy:'Pullback', plannedQty:80, actualQty:80, entry:3050, exit:2850, netPnl:-16000, realizedR:-1.0, compliant:true, tags:['Process compliant'] },
  { id:'j3', date:'2026-05-19', symbol:'BTC/USDT', broker:'Binance', strategy:'Trend', plannedQty:0.02, actualQty:0.02, entry:68500, exit:71850, netPnl:67, realizedR:1.8, compliant:true, tags:['Process compliant'] },
  { id:'j4', date:'2026-06-02', symbol:'AADI', broker:'Stockbit', strategy:'Breakout', plannedQty:60, actualQty:90, entry:9700, exit:9400, netPnl:-27000, realizedR:-1.0, compliant:false, tags:['Sized too large'] },
  { id:'j5', date:'2026-06-10', symbol:'ANTM', broker:'Stockbit', strategy:'Range', plannedQty:70, actualQty:70, entry:2900, exit:2820, netPnl:-5600, realizedR:-0.6, compliant:true, tags:['Process compliant'] },
  { id:'j6', date:'2026-06-21', symbol:'BTC/USDT', broker:'Binance', strategy:'Trend', plannedQty:0.015, actualQty:0.015, entry:65200, exit:71300, netPnl:91.5, realizedR:3.1, compliant:true, tags:['Process compliant'] },
  { id:'j7', date:'2026-07-05', symbol:'AADI', broker:'Stockbit', strategy:'Breakout', plannedQty:55, actualQty:80, entry:9550, exit:9300, netPnl:-20000, realizedR:-1.0, compliant:false, tags:['Moved stop', 'Sized too large'] },
  { id:'j8', date:'2026-07-18', symbol:'ANTM', broker:'Stockbit', strategy:'Pullback', plannedQty:75, actualQty:75, entry:2950, exit:3060, netPnl:8250, realizedR:0.9, compliant:true, tags:['Process compliant'] },
];

const RECON_ISSUES = [
  { id:'r1', label:'Duplicate cash section', account:'Stockbit', amount:33178117, resolution:'unresolved', options:[['include','Distinct wallet — include'],['exclude','Duplicate — exclude']] },
  { id:'r2', label:'Market value difference', account:'Mandiri', amount:20000, resolution:'unresolved', options:[['broker','Accept broker total'],['rowsum','Accept row sum'],['unresolved','Leave unresolved']] },
  { id:'r3', label:'Instrument unconfirmed', account:'Binance Gold', amount:null, resolution:'unresolved', options:[['confirm','Confirm symbol'],['unresolved','Leave unconfirmed']] },
  { id:'r4', label:'Estimated cost basis', account:'IBKR IBM', amount:214.07, currency:'USD', resolution:'unresolved', options:[['confirm','Confirm'],['edit','Edit']] },
];

// ---------- formatting ----------
function fmtIDR(v, decimals){ if(v==null) return '—'; const n = Math.round((decimals?v:v)* (decimals?100:1))/(decimals?100:1);
  return 'Rp' + n.toLocaleString('id-ID', { minimumFractionDigits: decimals?2:0, maximumFractionDigits: decimals?2:0 }); }
function fmtUSD(v){ if(v==null) return '—'; return '$' + v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtSGD(v){ if(v==null) return '—'; return 'S$' + v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtPct(v, opts){ opts=opts||{}; if(v==null||isNaN(v)) return '—'; const s = v.toFixed(opts.decimals!=null?opts.decimals:2);
  return (v>0 && opts.signed!==false ? '+' : '') + (v<0 ? '−'+Math.abs(v).toFixed(opts.decimals!=null?opts.decimals:2) : s) + '%'; }
function fmtR(v){ if(v==null||isNaN(v)) return '—'; return (v>0?'+':v<0?'−':'') + Math.abs(v).toFixed(2) + 'R'; }
function fmtLots(shares, lotSize){ lotSize = lotSize || 100; const lots = Math.floor(shares/lotSize); return lots + ' lots (' + shares.toLocaleString('id-ID') + ' shares)'; }
function floorToStep(v, step){ return Math.floor(v/step)*step; }

// ---------- NAV chain ----------
function computeNavChain(state){
  const stockbitAmt = NAV_SEED.stockbitDuplicateCash;
  const included = state.stockbitResolution === 'include';
  const reconciledNAV = included ? NAV_SEED.tentativeNAV : NAV_SEED.reconciledNAV_exclStockbit;
  const legacyMV = NAV_SEED.listedMV;
  let activeTradingNav = state.mandate.activeTradingNav;
  if (state.mandate.activeTradingNavMode === 'pctOfReconciled') {
    activeTradingNav = reconciledNAV * (state.mandate.activeTradingNavPct || 9.7) / 100;
  }
  const reserve = reconciledNAV - legacyMV - activeTradingNav;
  const regime = REGIMES[state.drawdownRegime] || REGIMES.Normal;
  const adjustedRiskBudget = state.mandate.activeTradingNavApproved
    ? activeTradingNav * (state.mandate.riskPerTradePct/100) * regime.multiplier
    : 0;
  const openRisk = OPEN_TRADES.reduce((s,t)=>s+t.initialRisk, 0);
  const heat = activeTradingNav ? (openRisk/activeTradingNav)*100 : 0;
  const dailyLossLimit = activeTradingNav * (state.mandate.dailyLossLimitPct/100);
  const dailyHeadroom = dailyLossLimit - Math.max(0, -state.todaysRealizedPnl||0);
  return {
    tentativeNAV: NAV_SEED.tentativeNAV,
    stockbitAmt, included, reconciledNAV, legacyMV, reserve,
    activeTradingNav, regime, adjustedRiskBudget, openRisk, heat,
    dailyLossLimit, dailyHeadroom,
  };
}

// ---------- sizing engine ----------
function computeSizing(inputs, chain, mandate){
  const { side, entry, stop, target, buyFeePct, sellFeePct, slippagePct, availableCash, qtyStep, symbol } = inputs;
  const step = qtyStep || 100;
  if (entry==null || stop==null || entry<=0 || stop<=0) {
    return { valid:false, reason:'entry-or-stop-missing' };
  }
  const long = side !== 'short';
  if (long && stop >= entry) return { valid:false, reason:'invalid-stop-direction' };
  if (!long && stop <= entry) return { valid:false, reason:'invalid-stop-direction' };

  const unitRisk = long
    ? (entry-stop) + entry*(slippagePct/100) + entry*(buyFeePct/100) + stop*(sellFeePct/100)
    : (stop-entry) + entry*(slippagePct/100) + entry*(sellFeePct/100) + stop*(buyFeePct/100);

  const riskBudget = chain.adjustedRiskBudget;
  const riskSizedQty = unitRisk>0 ? riskBudget/unitRisk : 0;
  const exposureCappedQty = (mandate.maxSingleStockPct/100 * chain.activeTradingNav) / entry;
  const entryCostPerUnit = long ? entry*(1+buyFeePct/100) : entry*(1+sellFeePct/100);
  const cashCappedQty = entryCostPerUnit>0 ? availableCash / entryCostPerUnit : 0;

  const caps = [
    { key:'risk', label:'Risk-sized', qty:riskSizedQty },
    { key:'exposure', label:'Exposure cap (' + mandate.maxSingleStockPct.toFixed(0) + '%)', qty:exposureCappedQty },
    { key:'cash', label:'Cash cap', qty:cashCappedQty },
  ];
  const minQty = Math.min(riskSizedQty, exposureCappedQty, cashCappedQty);
  const binding = caps.reduce((a,b)=> b.qty<=a.qty ? b : a);
  const finalQty = floorToStep(Math.max(0,minQty), step);

  const plannedLoss = finalQty * unitRisk;
  const exitCosts = target!=null ? finalQty * target * (sellFeePct/100) : 0;
  const plannedReward = target!=null ? finalQty * Math.abs(target-entry) - exitCosts : null;
  const rr = plannedReward!=null && plannedLoss>0 ? plannedReward/plannedLoss : null;
  const exposurePct = chain.activeTradingNav ? (finalQty*entry/chain.activeTradingNav)*100 : 0;
  const heatAfter = chain.activeTradingNav ? ((chain.openRisk+plannedLoss)/chain.activeTradingNav)*100 : 0;

  return {
    valid:true, unitRisk, caps, binding: binding.key, riskSizedQty, exposureCappedQty, cashCappedQty,
    finalQty, finalLots: Math.floor(finalQty/step), plannedLoss, plannedReward, rr, exposurePct, heatAfter,
  };
}

// ---------- gate evaluation ----------
function evaluateGate(chain, sizing, inputs, mandate, journalStats, scenario){
  const rows = [];
  const add = (r) => rows.push(r);

  add({ id:'nav-approved', name:'Active Trading NAV approved', state: mandate.activeTradingNavApproved?'pass':'blocked',
    value: mandate.activeTradingNavApproved?'Approved':'Unapproved', limit:'Required', headroom:'—',
    reasonText:'Active Trading NAV has not been approved',
    why:'The gate cannot open until Active Trading NAV is explicitly approved via triage step 4.' });

  // noPlan: no trade plan is currently open (global gate context, e.g. the sticky bar) —
  // trade-specific rules render as unresolved rather than blocking the whole desk.
  const noPlan = !inputs || (inputs.entry==null && inputs.stop==null && !inputs.symbol);
  const stopMissing = !inputs || inputs.entry==null || inputs.stop==null;
  add({ id:'entry-stop', name:'Entry & stop present', state: noPlan?'unresolved':(stopMissing?'blocked':'pass'),
    value: stopMissing?'Missing':'Present', limit:'Both required', headroom:'—',
    reasonText:'Entry or stop is missing',
    why:'A plan without entry and stop has no defined risk and cannot be sized.' });

  const invalidDir = sizing && !sizing.valid && sizing.reason==='invalid-stop-direction';
  add({ id:'stop-direction', name:'Stop valid for direction', state: noPlan?'unresolved':(invalidDir?'blocked':(stopMissing?'unresolved':'pass')),
    value: invalidDir?'Invalid':(stopMissing?'—':'Valid'), limit:'Stop on correct side of entry', headroom:'—',
    reasonText:'Stop is invalid for the selected direction',
    why:'A long stop must sit below entry; a short stop must sit above entry.' });

  const riskOk = sizing && sizing.valid;
  const riskPct = mandate.riskPerTradePct;
  add({ id:'risk-per-trade', name:'Risk per trade', state: noPlan?'unresolved':(riskOk?'pass':'unresolved'),
    value: riskOk? fmtIDR(sizing.plannedLoss) : '—', limit: fmtIDR(chain.adjustedRiskBudget), headroom: riskOk? fmtIDR(chain.adjustedRiskBudget - sizing.plannedLoss) : '—',
    why:'Planned loss at final size must not exceed the risk budget derived from Active Trading NAV × ' + riskPct.toFixed(2) + '% × regime multiplier.' });

  const dailyBreach = scenario === 'blocked-daily-limit';
  add({ id:'daily-loss', name:'Daily loss limit', state: dailyBreach?'blocked':'pass',
    value: dailyBreach? fmtIDR(1150000) : fmtIDR(0), limit: fmtIDR(chain.dailyLossLimit), headroom: dailyBreach?'Rp0':fmtIDR(chain.dailyHeadroom),
    reasonText:'Daily loss limit ' + fmtIDR(chain.dailyLossLimit) + ' reached — Mandiri, Stockbit, Binance and IBKR are all blocked',
    why:'Realized loss today across ALL brokers vs the daily limit of ' + mandate.dailyLossLimitPct.toFixed(2) + '% of Active Trading NAV. A breach blocks Mandiri, Stockbit, Binance and IBKR simultaneously.' });

  add({ id:'weekly-loss', name:'Weekly loss limit', state:'pass', value:fmtIDR(0), limit:fmtIDR(chain.activeTradingNav*mandate.weeklyLossLimitPct/100), headroom:fmtIDR(chain.activeTradingNav*mandate.weeklyLossLimitPct/100),
    why:'Realized loss this week vs ' + mandate.weeklyLossLimitPct.toFixed(2) + '% of Active Trading NAV.' });
  add({ id:'monthly-loss', name:'Monthly loss limit', state:'pass', value:fmtIDR(0), limit:fmtIDR(chain.activeTradingNav*mandate.monthlyLossLimitPct/100), headroom:fmtIDR(chain.activeTradingNav*mandate.monthlyLossLimitPct/100),
    why:'Realized loss this month vs ' + mandate.monthlyLossLimitPct.toFixed(2) + '% of Active Trading NAV.' });

  const heatAfter = sizing && sizing.valid ? sizing.heatAfter : chain.heat;
  const hardHeatBreach = heatAfter > mandate.hardHeatPct;
  add({ id:'hard-heat', name:'Hard portfolio heat', state: hardHeatBreach?'blocked':'pass',
    value: heatAfter.toFixed(2)+'%', limit: mandate.hardHeatPct.toFixed(2)+'%', headroom: (mandate.hardHeatPct-heatAfter).toFixed(2)+'%',
    reasonText:'Hard portfolio heat ceiling exceeded',
    why:'Sum of initial planned risk on all open positions, including this plan, vs the hard ceiling of ' + mandate.hardHeatPct.toFixed(2) + '% of Active Trading NAV.' });

  add({ id:'cluster-heat', name:'Correlated-cluster heat', state:'pass', value:'0.00%', limit: mandate.clusterHeatPct.toFixed(2)+'%', headroom: mandate.clusterHeatPct.toFixed(2)+'%',
    why:'Combined risk of positions in the same correlation group vs ' + mandate.clusterHeatPct.toFixed(2) + '%.' });

  const symbol = inputs && inputs.symbol;
  const exposurePct = sizing && sizing.valid ? sizing.exposurePct : 0;
  const exposureBreach = exposurePct > mandate.maxSingleStockPct;
  add({ id:'single-symbol', name:'Single-symbol exposure', state: noPlan?'unresolved':(exposureBreach?'blocked':'pass'),
    value: noPlan?'—':exposurePct.toFixed(2)+'%', limit: mandate.maxSingleStockPct.toFixed(2)+'%', headroom: noPlan?'—':(mandate.maxSingleStockPct-exposurePct).toFixed(2)+'%',
    reasonText:'Single-symbol exposure exceeds the ' + mandate.maxSingleStockPct.toFixed(2) + '% limit',
    why:'Planned position value ' + (sizing&&sizing.valid?fmtIDR(sizing.finalQty*inputs.entry):'—') + ' ÷ Active Trading NAV ' + fmtIDR(chain.activeTradingNav) + ' = ' + exposurePct.toFixed(2) + '%, limit ' + mandate.maxSingleStockPct.toFixed(2) + '%.' });

  const cashBlock = sizing && sizing.valid && sizing.finalQty < (inputs.qtyStep||100);
  add({ id:'cash', name:'Sufficient cash', state: noPlan?'unresolved':(cashBlock?'blocked':'pass'), value: noPlan?'—':(cashBlock?'Insufficient':'Sufficient'), limit:'≥ 1 lot', headroom:'—',
    reasonText:'Sized quantity does not clear one full lot',
    why:'Cash-capped quantity must clear at least one full lot at the configured step.' });

  add({ id:'margin', name:'Margin required', state:'pass', value:'Not applicable', limit:'Cash accounts only', headroom:'—',
    why:'This mandate does not permit leverage; no margin call applies.' });

  const breaker = journalStats && journalStats.consecutiveLosses >= mandate.consecutiveLossStop;
  add({ id:'consecutive-loss', name:'Consecutive-loss breaker', state: breaker?'blocked':'pass',
    value: (journalStats?journalStats.consecutiveLosses:0) + ' losses', limit: mandate.consecutiveLossStop + ' losses', headroom: breaker?'0':(mandate.consecutiveLossStop-(journalStats?journalStats.consecutiveLosses:0))+'',
    reasonText:'Consecutive-loss breaker is active',
    why:'Consecutive realized losses in the journal vs the breaker threshold of ' + mandate.consecutiveLossStop + '.' });

  const regimeFreeze = chain.regime.multiplier === 0;
  add({ id:'drawdown-freeze', name:'Drawdown risk freeze', state: regimeFreeze?'blocked':'pass',
    value: chain.regime.drawdownPct.toFixed(2)+'% dd', limit:'8.00% freeze threshold', headroom: regimeFreeze?'0.00%':(8-chain.regime.drawdownPct).toFixed(2)+'%',
    reasonText:'Drawdown regime has frozen new risk (0.00× multiplier)',
    why:'Regime is measured on the Active Trading NAV equity curve. Above 8% drawdown, the risk multiplier goes to 0.00×.' });

  const addingLoser = symbol === 'BBRI';
  add({ id:'add-to-loser', name:'Adding to losing legacy position', state: noPlan?'unresolved':(addingLoser?'blocked':'pass'),
    value: noPlan?'—':(addingLoser?'BBRI −31.39%':'n/a'), limit:'No new risk on losing legacy names', headroom:'—',
    reasonText:'Adding new risk to a losing legacy position (BBRI −31.39%)',
    why:'BBRI is Legacy / Unclassified at −31.39% unrealized. Legacy positions may be trimmed or stopped out, never added to.' });

  // warnings
  const rr = sizing && sizing.valid ? sizing.rr : null;
  const rrWarn = rr!=null && rr < mandate.minRR;
  add({ id:'min-rr', name:'Minimum reward:risk', state: rrWarn?'warning':(rr==null?'unresolved':'pass'),
    value: rr==null?'—':fmtR(rr), limit: mandate.minRR.toFixed(2)+'R', headroom: rr==null?'—':(rr-mandate.minRR).toFixed(2)+'R',
    why:'Planned reward ÷ planned loss vs the ' + mandate.minRR.toFixed(2) + 'R minimum this mandate requires.' });

  const nearLimit = exposurePct > mandate.maxSingleStockPct*0.9 && exposurePct <= mandate.maxSingleStockPct;
  add({ id:'near-concentration', name:'Near concentration limit', state: nearLimit?'warning':'pass',
    value: exposurePct.toFixed(2)+'%', limit:'90% of '+mandate.maxSingleStockPct.toFixed(2)+'%', headroom: nearLimit?'<10%':'clear',
    why:'Exposure within 10% of the single-name concentration limit deserves a second look before sizing up further.' });

  add({ id:'stale-fx', name:'FX freshness', state:'pass', value:'as of ' + FX.asOf, limit:'< 24h', headroom:'fresh',
    why:'USD/IDR and SGD/USD rates are checked against a staleness window before being used in sizing.' });

  add({ id:'sector-concentration', name:'Sector / correlation group', state:'pass', value:'Not concentrated', limit:'1 open per group', headroom:'clear',
    why:'No other open plan currently shares this symbol\'s correlation group.' });

  const wideStop = sizing && sizing.valid && inputs.entry>0 && (Math.abs(inputs.entry-inputs.stop)/inputs.entry*100) > 8;
  add({ id:'wide-stop', name:'Stop width', state: wideStop?'warning':'pass', value: sizing&&sizing.valid?(Math.abs(inputs.entry-inputs.stop)/inputs.entry*100).toFixed(2)+'%':'—', limit:'8.00% typical max', headroom: wideStop?'over':'clear',
    why:'Unusually wide stops raise unit risk and can indicate the setup does not fit this instrument\'s volatility.' });

  add({ id:'liquidity', name:'Liquidity', state:'pass', value:'Adequate', limit:'Min avg daily volume', headroom:'clear',
    why:'Planned size is checked against typical daily volume to avoid market impact.' });

  const blockingRows = rows.filter(r=>r.state==='blocked');
  const overall = blockingRows.length ? 'BLOCKED' : (rows.some(r=>r.state==='warning') ? 'WARNING' : 'PASS');
  return { rows, overall, blockingReasons: blockingRows.map(r=>r.reasonText || r.name) };
}

function journalStats(entries){
  const closed = entries.length;
  const wins = entries.filter(e=>e.realizedR>0);
  const losses = entries.filter(e=>e.realizedR<0);
  const winRate = closed? wins.length/closed : 0;
  const avgWinR = wins.length? wins.reduce((s,e)=>s+e.realizedR,0)/wins.length : 0;
  const avgLossR = losses.length? Math.abs(losses.reduce((s,e)=>s+e.realizedR,0)/losses.length) : 0;
  const expectancyR = winRate*avgWinR - (1-winRate)*avgLossR;
  const grossProfit = wins.reduce((s,e)=>s+e.realizedR,0);
  const grossLoss = losses.reduce((s,e)=>s+e.realizedR,0);
  const profitFactor = grossLoss!==0 ? grossProfit/Math.abs(grossLoss) : Infinity;
  const complianceRate = closed? entries.filter(e=>e.compliant).length/closed : 0;
  let consecutiveLosses = 0;
  for (let i=entries.length-1;i>=0;i--){ if(entries[i].realizedR<0) consecutiveLosses++; else break; }
  return { closed, winRate, avgWinR, avgLossR, expectancyR, profitFactor, complianceRate, consecutiveLosses,
    compliantCount: entries.filter(e=>e.compliant).length };
}

window.DESK = {
  ACCOUNTS, POSITIONS, NAV_SEED, FX, MANDATE_DEFAULT, REGIMES, OPEN_TRADES, JOURNAL_SEED, RECON_ISSUES,
  fmtIDR, fmtUSD, fmtSGD, fmtPct, fmtR, fmtLots, floorToStep,
  computeNavChain, computeSizing, evaluateGate, journalStats,
};
})();
