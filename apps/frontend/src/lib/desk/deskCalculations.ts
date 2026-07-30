// TS mirror of apps/api/src/PersonalFinance.Application/Services/Desk/DeskCalculator.cs (PF-133).
//
// This mirror is ADVISORY ONLY — it exists so Pre-Trade (PF-134) can update sizing math as the
// user types. The server re-runs EvaluateGate on every state-changing request and refuses to
// persist when the result is BLOCKED; this file never authorizes anything. It necessarily uses
// `number` (IEEE 754) instead of `decimal`, which is exactly why the server re-evaluates before
// persisting. Drift is caught by src/lib/desk/__tests__/parity.test.ts against the shared
// desk-golden.json fixture (also consumed by the C# xUnit suite).

import {
  DeskJournalEntry, DeskPosition, GateResult, GateRule, JournalStats,
  MandateParams, NavChain, NavChainInput, Regime, Sizing, SizingCap, TradePlanInput,
} from '@/types/desk';
import { floorToStep, fmtIDR, fmtR } from './deskFormat';

export const REGIMES: Record<string, Regime> = {
  Normal: { name: 'Normal', drawdownPct: 1.5, multiplier: 1.00 },
  Caution: { name: 'Caution', drawdownPct: 4.0, multiplier: 0.50 },
  Defensive: { name: 'Defensive', drawdownPct: 6.5, multiplier: 0.25 },
  'Risk Freeze': { name: 'Risk Freeze', drawdownPct: 9.0, multiplier: 0.00 },
};

const DEFAULT_REGIME = 'Normal';

function getIsoWeek(dateStr: string): { isoYear: number; isoWeek: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const isoWeek = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { isoYear: date.getUTCFullYear(), isoWeek };
}

function ymd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

export function computeNavChain(input: NavChainInput): NavChain {
  const included = input.stockbitResolution === 'include';
  const reconciledNav = included ? input.tentativeNav : input.reconciledNavExclStockbit;
  const legacyMv = input.legacyMv;
  const mandate = input.mandate;

  const activeTradingNav = mandate.activeTradingNavMode === 'pctOfReconciled'
    ? reconciledNav * (mandate.activeTradingNavPct ?? 9.7) / 100
    : mandate.activeTradingNav;

  const reserve = reconciledNav - legacyMv - activeTradingNav;
  const regime = REGIMES[input.drawdownRegime] || REGIMES[DEFAULT_REGIME];

  const adjustedRiskBudget = mandate.activeTradingNavApproved
    ? activeTradingNav * (mandate.riskPerTradePct / 100) * regime.multiplier
    : 0;

  const openRisk = input.openRisk;
  const heat = activeTradingNav !== 0 ? (openRisk / activeTradingNav) * 100 : 0;

  const dailyLossLimit = activeTradingNav * (mandate.dailyLossLimitPct / 100);
  const dailyHeadroom = dailyLossLimit - Math.max(0, -input.todaysRealizedPnl);

  return {
    tentativeNav: input.tentativeNav,
    stockbitAmt: input.stockbitDuplicateCash,
    included,
    reconciledNav,
    legacyMv,
    reserve,
    activeTradingNav,
    regime,
    adjustedRiskBudget,
    openRisk,
    heat,
    dailyLossLimit,
    dailyHeadroom,
  };
}

export function computeSizing(inputs: TradePlanInput, chain: NavChain, mandate: MandateParams): Sizing {
  const step = inputs.qtyStep > 0 ? inputs.qtyStep : 100;
  const invalid = (reason: string): Sizing => ({
    valid: false, reason, unitRisk: null, caps: null, binding: null,
    riskSizedQty: null, exposureCappedQty: null, cashCappedQty: null,
    finalQty: null, finalLots: null, plannedLoss: null, plannedReward: null,
    rr: null, exposurePct: null, heatAfter: null,
  });

  if (inputs.entry == null || inputs.stop == null || inputs.entry <= 0 || inputs.stop <= 0) {
    return invalid('entry-or-stop-missing');
  }

  const entry = inputs.entry;
  const stop = inputs.stop;
  const isLong = inputs.side !== 'short';

  if (isLong && stop >= entry) return invalid('invalid-stop-direction');
  if (!isLong && stop <= entry) return invalid('invalid-stop-direction');

  const unitRisk = isLong
    ? (entry - stop) + entry * (inputs.slippagePct / 100) + entry * (inputs.buyFeePct / 100) + stop * (inputs.sellFeePct / 100)
    : (stop - entry) + entry * (inputs.slippagePct / 100) + entry * (inputs.sellFeePct / 100) + stop * (inputs.buyFeePct / 100);

  const riskBudget = chain.adjustedRiskBudget;
  const riskSizedQty = unitRisk > 0 ? riskBudget / unitRisk : 0;
  const exposureCappedQty = entry > 0 ? (mandate.maxSingleStockPct / 100 * chain.activeTradingNav) / entry : 0;
  const entryCostPerUnit = isLong ? entry * (1 + inputs.buyFeePct / 100) : entry * (1 + inputs.sellFeePct / 100);
  const cashCappedQty = entryCostPerUnit > 0 ? inputs.availableCash / entryCostPerUnit : 0;

  const caps: SizingCap[] = [
    { key: 'risk', label: 'Risk-sized', qty: riskSizedQty },
    { key: 'exposure', label: `Exposure cap (${mandate.maxSingleStockPct.toFixed(0)}%)`, qty: exposureCappedQty },
    { key: 'cash', label: 'Cash cap', qty: cashCappedQty },
  ];

  const minQty = Math.min(riskSizedQty, exposureCappedQty, cashCappedQty);
  const binding = caps.reduce((a, b) => (b.qty <= a.qty ? b : a));
  const finalQty = floorToStep(Math.max(0, minQty), step);

  const plannedLoss = finalQty * unitRisk;
  const exitCosts = inputs.target != null ? finalQty * inputs.target * (inputs.sellFeePct / 100) : 0;
  const plannedReward = inputs.target != null ? finalQty * Math.abs(inputs.target - entry) - exitCosts : null;
  const rr = plannedReward != null && plannedLoss > 0 ? plannedReward / plannedLoss : null;
  const exposurePct = chain.activeTradingNav !== 0 ? (finalQty * entry / chain.activeTradingNav) * 100 : 0;
  const heatAfter = chain.activeTradingNav !== 0 ? ((chain.openRisk + plannedLoss) / chain.activeTradingNav) * 100 : 0;

  return {
    valid: true, reason: null, unitRisk, caps, binding: binding.key,
    riskSizedQty, exposureCappedQty, cashCappedQty,
    finalQty, finalLots: Math.floor(finalQty / step),
    plannedLoss, plannedReward, rr, exposurePct, heatAfter,
  };
}

export interface GateEvaluationInput {
  chain: NavChain;
  sizing: Sizing | null;
  inputs: TradePlanInput | null;
  mandate: MandateParams;
  journalStats: JournalStats;
  journalEntries: DeskJournalEntry[];
  positions: DeskPosition[];
  asOfDate: string; // "today" in Asia/Jakarta (WIB) — resolve wall-clock to WIB before calling
}

export function evaluateGate(input: GateEvaluationInput): GateResult {
  const { chain, sizing, inputs, mandate, journalStats } = input;
  const rows: GateRule[] = [];

  const noPlan = !inputs || (inputs.entry == null && inputs.stop == null && !inputs.symbol);
  const stopMissing = !inputs || inputs.entry == null || inputs.stop == null;

  // 1. nav-approved
  rows.push({
    id: 'nav-approved', name: 'Active Trading NAV approved',
    state: mandate.activeTradingNavApproved ? 'pass' : 'blocked',
    value: mandate.activeTradingNavApproved ? 'Approved' : 'Unapproved', limit: 'Required', headroom: '—',
    reasonText: mandate.activeTradingNavApproved ? null : 'Active Trading NAV has not been approved',
    why: 'The gate cannot open until Active Trading NAV is explicitly approved via triage step 4.',
    notImplemented: false,
  });

  // 2. entry-stop
  rows.push({
    id: 'entry-stop', name: 'Entry & stop present',
    state: noPlan ? 'unresolved' : (stopMissing ? 'blocked' : 'pass'),
    value: stopMissing ? 'Missing' : 'Present', limit: 'Both required', headroom: '—',
    reasonText: stopMissing && !noPlan ? 'Entry or stop is missing' : null,
    why: 'A plan without entry and stop has no defined risk and cannot be sized.',
    notImplemented: false,
  });

  // 3. stop-direction
  const invalidDir = !!sizing && sizing.valid === false && sizing.reason === 'invalid-stop-direction';
  rows.push({
    id: 'stop-direction', name: 'Stop valid for direction',
    state: noPlan ? 'unresolved' : (invalidDir ? 'blocked' : (stopMissing ? 'unresolved' : 'pass')),
    value: invalidDir ? 'Invalid' : (stopMissing ? '—' : 'Valid'), limit: 'Stop on correct side of entry', headroom: '—',
    reasonText: invalidDir ? 'Stop is invalid for the selected direction' : null,
    why: 'A long stop must sit below entry; a short stop must sit above entry.',
    notImplemented: false,
  });

  // 4. risk-per-trade
  const riskOk = !!sizing && sizing.valid === true;
  rows.push({
    id: 'risk-per-trade', name: 'Risk per trade',
    state: noPlan ? 'unresolved' : (riskOk ? 'pass' : 'unresolved'),
    value: riskOk ? fmtIDR(sizing!.plannedLoss) : '—', limit: fmtIDR(chain.adjustedRiskBudget),
    headroom: riskOk ? fmtIDR(chain.adjustedRiskBudget - sizing!.plannedLoss!) : '—',
    reasonText: null,
    why: `Planned loss at final size must not exceed the risk budget derived from Active Trading NAV × ${mandate.riskPerTradePct.toFixed(2)}% × regime multiplier.`,
    notImplemented: false,
  });

  // 5. daily-loss — REAL: sum of today's negative NetPnl from journal
  const dailyLossAmt = -input.journalEntries
    .filter(e => e.tradeDate === input.asOfDate && e.netPnl < 0)
    .reduce((s, e) => s + e.netPnl, 0);
  const dailyBreach = dailyLossAmt > chain.dailyLossLimit;
  rows.push({
    id: 'daily-loss', name: 'Daily loss limit',
    state: dailyBreach ? 'blocked' : 'pass',
    value: fmtIDR(dailyLossAmt), limit: fmtIDR(chain.dailyLossLimit), headroom: dailyBreach ? 'Rp0' : fmtIDR(chain.dailyHeadroom),
    reasonText: dailyBreach ? `Daily loss limit ${fmtIDR(chain.dailyLossLimit)} reached — all brokers are blocked` : null,
    why: `Realized loss today across ALL brokers vs the daily limit of ${mandate.dailyLossLimitPct.toFixed(2)}% of Active Trading NAV. A breach blocks every broker simultaneously.`,
    notImplemented: false,
  });

  // 6. weekly-loss — REAL: sum of this ISO week's negative NetPnl
  const asOfWeek = getIsoWeek(input.asOfDate);
  const weeklyLossAmt = -input.journalEntries
    .filter(e => e.netPnl < 0)
    .filter(e => {
      const w = getIsoWeek(e.tradeDate);
      return w.isoYear === asOfWeek.isoYear && w.isoWeek === asOfWeek.isoWeek;
    })
    .reduce((s, e) => s + e.netPnl, 0);
  const weeklyLimit = chain.activeTradingNav * mandate.weeklyLossLimitPct / 100;
  const weeklyBreach = weeklyLossAmt > weeklyLimit;
  rows.push({
    id: 'weekly-loss', name: 'Weekly loss limit',
    state: weeklyBreach ? 'blocked' : 'pass',
    value: fmtIDR(weeklyLossAmt), limit: fmtIDR(weeklyLimit), headroom: weeklyBreach ? 'Rp0' : fmtIDR(weeklyLimit - weeklyLossAmt),
    reasonText: weeklyBreach ? `Weekly loss limit ${fmtIDR(weeklyLimit)} reached` : null,
    why: `Realized loss this ISO week (Asia/Jakarta) vs ${mandate.weeklyLossLimitPct.toFixed(2)}% of Active Trading NAV.`,
    notImplemented: false,
  });

  // 7. monthly-loss — REAL: sum of this calendar month's negative NetPnl
  const asOfYmd = ymd(input.asOfDate);
  const monthlyLossAmt = -input.journalEntries
    .filter(e => {
      if (e.netPnl >= 0) return false;
      const em = ymd(e.tradeDate);
      return em.y === asOfYmd.y && em.m === asOfYmd.m;
    })
    .reduce((s, e) => s + e.netPnl, 0);
  const monthlyLimit = chain.activeTradingNav * mandate.monthlyLossLimitPct / 100;
  const monthlyBreach = monthlyLossAmt > monthlyLimit;
  rows.push({
    id: 'monthly-loss', name: 'Monthly loss limit',
    state: monthlyBreach ? 'blocked' : 'pass',
    value: fmtIDR(monthlyLossAmt), limit: fmtIDR(monthlyLimit), headroom: monthlyBreach ? 'Rp0' : fmtIDR(monthlyLimit - monthlyLossAmt),
    reasonText: monthlyBreach ? `Monthly loss limit ${fmtIDR(monthlyLimit)} reached` : null,
    why: `Realized loss this calendar month (Asia/Jakarta) vs ${mandate.monthlyLossLimitPct.toFixed(2)}% of Active Trading NAV.`,
    notImplemented: false,
  });

  // 8. hard-heat
  const heatAfter = (sizing && sizing.valid) ? sizing.heatAfter! : chain.heat;
  const hardHeatBreach = heatAfter > mandate.hardHeatPct;
  rows.push({
    id: 'hard-heat', name: 'Hard portfolio heat',
    state: hardHeatBreach ? 'blocked' : 'pass',
    value: `${heatAfter.toFixed(2)}%`, limit: `${mandate.hardHeatPct.toFixed(2)}%`, headroom: `${(mandate.hardHeatPct - heatAfter).toFixed(2)}%`,
    reasonText: hardHeatBreach ? 'Hard portfolio heat ceiling exceeded' : null,
    why: `Sum of initial planned risk on all open positions, including this plan, vs the hard ceiling of ${mandate.hardHeatPct.toFixed(2)}% of Active Trading NAV.`,
    notImplemented: false,
  });

  // 9. cluster-heat — NOT IMPLEMENTED (PF-135: needs a correlation-group model)
  rows.push({
    id: 'cluster-heat', name: 'Correlated-cluster heat', state: 'unresolved',
    value: '—', limit: `${mandate.clusterHeatPct.toFixed(2)}%`, headroom: '—', reasonText: null,
    why: 'Combined risk of positions in the same correlation group — requires a correlation-group model. Tracked in PF-135.',
    notImplemented: true,
  });

  // 10. single-symbol
  const exposurePct = (sizing && sizing.valid) ? sizing.exposurePct! : 0;
  const exposureBreach = exposurePct > mandate.maxSingleStockPct;
  rows.push({
    id: 'single-symbol', name: 'Single-symbol exposure',
    state: noPlan ? 'unresolved' : (exposureBreach ? 'blocked' : 'pass'),
    value: noPlan ? '—' : `${exposurePct.toFixed(2)}%`, limit: `${mandate.maxSingleStockPct.toFixed(2)}%`,
    headroom: noPlan ? '—' : `${(mandate.maxSingleStockPct - exposurePct).toFixed(2)}%`,
    reasonText: exposureBreach ? `Single-symbol exposure exceeds the ${mandate.maxSingleStockPct.toFixed(2)}% limit` : null,
    why: `Planned position value ÷ Active Trading NAV vs the ${mandate.maxSingleStockPct.toFixed(2)}% limit.`,
    notImplemented: false,
  });

  // 11. cash
  const cashBlock = !!sizing && sizing.valid === true && sizing.finalQty! < (inputs?.qtyStep ?? 100);
  rows.push({
    id: 'cash', name: 'Sufficient cash',
    state: noPlan ? 'unresolved' : (cashBlock ? 'blocked' : 'pass'),
    value: noPlan ? '—' : (cashBlock ? 'Insufficient' : 'Sufficient'), limit: '≥ 1 lot', headroom: '—',
    reasonText: cashBlock ? 'Sized quantity does not clear one full lot' : null,
    why: 'Cash-capped quantity must clear at least one full lot at the configured step.',
    notImplemented: false,
  });

  // 12. margin — REAL
  rows.push({
    id: 'margin', name: 'Margin required',
    state: mandate.leverageEnabled === false ? 'pass' : 'unresolved',
    value: mandate.leverageEnabled === false ? 'Not applicable' : 'Leverage enabled', limit: 'Cash accounts only', headroom: '—',
    reasonText: null,
    why: 'This mandate does not permit leverage; no margin call applies. If leverage is enabled, margin is not yet evaluated.',
    notImplemented: false,
  });

  // 13. consecutive-loss
  const breaker = journalStats.consecutiveLosses >= mandate.consecutiveLossStop;
  rows.push({
    id: 'consecutive-loss', name: 'Consecutive-loss breaker',
    state: breaker ? 'blocked' : 'pass',
    value: `${journalStats.consecutiveLosses} losses`, limit: `${mandate.consecutiveLossStop} losses`,
    headroom: breaker ? '0' : `${mandate.consecutiveLossStop - journalStats.consecutiveLosses}`,
    reasonText: breaker ? 'Consecutive-loss breaker is active' : null,
    why: `Consecutive realized losses in the journal vs the breaker threshold of ${mandate.consecutiveLossStop}.`,
    notImplemented: false,
  });

  // 14. drawdown-freeze
  const regimeFreeze = chain.regime.multiplier === 0;
  rows.push({
    id: 'drawdown-freeze', name: 'Drawdown risk freeze',
    state: regimeFreeze ? 'blocked' : 'pass',
    value: `${chain.regime.drawdownPct.toFixed(2)}% dd`, limit: '8.00% freeze threshold',
    headroom: regimeFreeze ? '0.00%' : `${(8 - chain.regime.drawdownPct).toFixed(2)}%`,
    reasonText: regimeFreeze ? 'Drawdown regime has frozen new risk (0.00x multiplier)' : null,
    why: 'Regime is measured on the Active Trading NAV equity curve. Above 8% drawdown, the risk multiplier goes to 0.00x.',
    notImplemented: false,
  });

  // 15. add-to-loser — REAL: position lookup, never a literal symbol
  const symbol = inputs?.symbol;
  const loserPosition = symbol
    ? input.positions.find(p => p.symbol === symbol && p.sleeve === 'Legacy / Unclassified' && p.pnlPct < 0)
    : undefined;
  const addingLoser = !!loserPosition;
  rows.push({
    id: 'add-to-loser', name: 'Adding to losing legacy position',
    state: noPlan ? 'unresolved' : (addingLoser ? 'blocked' : 'pass'),
    value: noPlan ? '—' : (addingLoser ? `${symbol} ${loserPosition!.pnlPct.toFixed(2)}%` : 'n/a'),
    limit: 'No new risk on losing legacy names', headroom: '—',
    reasonText: addingLoser ? `Adding new risk to a losing legacy position (${symbol} ${loserPosition!.pnlPct.toFixed(2)}%)` : null,
    why: 'A position that is Legacy / Unclassified and unrealized-negative may be trimmed or stopped out, never added to.',
    notImplemented: false,
  });

  // 16. min-rr (warning)
  const rr = (sizing && sizing.valid) ? sizing.rr : null;
  const rrWarn = rr != null && rr < mandate.minRR;
  rows.push({
    id: 'min-rr', name: 'Minimum reward:risk',
    state: rrWarn ? 'warning' : (rr == null ? 'unresolved' : 'pass'),
    value: rr == null ? '—' : fmtR(rr), limit: `${mandate.minRR.toFixed(2)}R`,
    headroom: rr == null ? '—' : `${(rr - mandate.minRR).toFixed(2)}R`, reasonText: null,
    why: `Planned reward ÷ planned loss vs the ${mandate.minRR.toFixed(2)}R minimum this mandate requires.`,
    notImplemented: false,
  });

  // 17. near-concentration (warning)
  const nearLimit = exposurePct > mandate.maxSingleStockPct * 0.9 && exposurePct <= mandate.maxSingleStockPct;
  rows.push({
    id: 'near-concentration', name: 'Near concentration limit',
    state: nearLimit ? 'warning' : 'pass',
    value: `${exposurePct.toFixed(2)}%`, limit: `90% of ${mandate.maxSingleStockPct.toFixed(2)}%`,
    headroom: nearLimit ? '<10%' : 'clear', reasonText: null,
    why: 'Exposure within 10% of the single-name concentration limit deserves a second look before sizing up further.',
    notImplemented: false,
  });

  // 18. wide-stop (warning)
  const wideStopPct = (sizing && sizing.valid && inputs && (inputs.entry ?? 0) > 0)
    ? Math.abs(inputs.entry! - inputs.stop!) / inputs.entry! * 100
    : null;
  const wideStop = wideStopPct != null && wideStopPct > 8;
  rows.push({
    id: 'wide-stop', name: 'Stop width',
    state: wideStop ? 'warning' : 'pass',
    value: wideStopPct == null ? '—' : `${wideStopPct.toFixed(2)}%`, limit: '8.00% typical max',
    headroom: wideStop ? 'over' : 'clear', reasonText: null,
    why: "Unusually wide stops raise unit risk and can indicate the setup does not fit this instrument's volatility.",
    notImplemented: false,
  });

  const blockingRows = rows.filter(r => r.state === 'blocked');
  const overall: 'PASS' | 'WARNING' | 'BLOCKED' = blockingRows.length
    ? 'BLOCKED'
    : (rows.some(r => r.state === 'warning') ? 'WARNING' : 'PASS');

  return { rows, overall, blockingReasons: blockingRows.map(r => r.reasonText || r.name) };
}

export function computeJournalStats(entries: DeskJournalEntry[]): JournalStats {
  const closed = entries.length;
  const wins = entries.filter(e => (e.realizedR ?? 0) > 0);
  const losses = entries.filter(e => (e.realizedR ?? 0) < 0);

  const winRate = closed ? wins.length / closed : 0;
  const avgWinR = wins.length ? wins.reduce((s, e) => s + (e.realizedR ?? 0), 0) / wins.length : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((s, e) => s + (e.realizedR ?? 0), 0) / losses.length) : 0;
  const expectancyR = winRate * avgWinR - (1 - winRate) * avgLossR;

  const grossProfit = wins.reduce((s, e) => s + (e.realizedR ?? 0), 0);
  const grossLoss = losses.reduce((s, e) => s + (e.realizedR ?? 0), 0);
  const profitFactor = grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : null;

  const complianceRate = closed ? entries.filter(e => e.compliant).length / closed : 0;

  let consecutiveLosses = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if ((entries[i].realizedR ?? 0) < 0) consecutiveLosses++;
    else break;
  }

  return {
    closed, winRate, avgWinR, avgLossR, expectancyR, profitFactor, complianceRate,
    consecutiveLosses, compliantCount: entries.filter(e => e.compliant).length,
  };
}
