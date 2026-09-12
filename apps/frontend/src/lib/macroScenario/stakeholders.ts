// Macro Scenario Lab — stakeholder scoring, regime classification, narrative text.
// Ported from docs/reference/simulator-makro-v3.jsx: computeModel() stakeholder-score block
// (lines 136-192), mechanism() (lines 208-250), flowNarrative() (lines 252-258). Narrative text
// translated from Indonesian to English to match this app's UI language convention.

import type {
  InstrumentView, MacroDrivers, MacroState, PortfolioAggregate, Regime, RegimeClassification,
  StakeholderRow,
} from './types';
import { clamp } from './solver';
import {
  BANK_SCORE_CREDIT_WEIGHT, BANK_SCORE_INFLATION_GAP_PENALTY, BANK_SCORE_NIM_COMFORT,
  BANK_SCORE_NIM_WEIGHT, BANK_SCORE_NPL_COMFORT, BANK_SCORE_NPL_WEIGHT,
  CB_SCORE_BASE, CB_SCORE_DEFLATION_TRAP_PENALTY, CB_SCORE_INFLATION_GAP_PENALTY,
  CB_SCORE_OUTPUT_GAP_PENALTY, CB_SCORE_ZERO_LOWER_BOUND_RATE,
  CORP_SCORE_DEFLATION_WEIGHT, CORP_SCORE_GROWTH_WEIGHT, CORP_SCORE_INFLATION_GAP_PENALTY,
  CORP_SCORE_MARGIN_WEIGHT, CORP_SCORE_REAL_RATE_COMFORT, CORP_SCORE_REAL_RATE_DRAG,
  CORP_SCORE_UNEMPLOYMENT_GAP_PENALTY,
  DEBT_RATIO_SAFE_THRESHOLD_PCT_GDP, GOV_SCORE_BASE, GOV_SCORE_DEBT_RATIO_PENALTY,
  GOV_SCORE_DEFICIT_COMFORT_PCT_GDP, GOV_SCORE_DEFICIT_PENALTY, GOV_SCORE_FX_WEAKNESS_PENALTY,
  GOV_SCORE_GROWTH_WEIGHT, GOV_SCORE_INFLATION_BENEFIT_CEILING, GOV_SCORE_INFLATION_BENEFIT_WEIGHT,
  GOV_SCORE_INTEREST_BURDEN_COMFORT_PCT_GDP, GOV_SCORE_INTEREST_BURDEN_PENALTY,
  GOV_SCORE_RISING_DEBT_PENALTY,
  PEOPLE_SCORE_DEFLATION_WEIGHT, PEOPLE_SCORE_DEPRESSION_PENALTY, PEOPLE_SCORE_GROWTH_WEIGHT,
  PEOPLE_SCORE_HYPERINFLATION_THRESHOLD, PEOPLE_SCORE_HYPERINFLATION_WEIGHT,
  PEOPLE_SCORE_RENT_BURDEN_WEIGHT, PEOPLE_SCORE_REAL_RATE_WEIGHT,
  PEOPLE_SCORE_UNDEREMPLOYMENT_THRESHOLD, PEOPLE_SCORE_UNDEREMPLOYMENT_WEIGHT,
  PEOPLE_SCORE_UNEMPLOYMENT_WEIGHT, PEOPLE_SCORE_WAGE_WEIGHT,
  REGIME_EXTREME_INFLATION_THRESHOLD, REGIME_GOLDILOCKS_INFLATION_GAP_TOLERANCE,
  REGIME_GOLDILOCKS_OUTPUT_GAP_TOLERANCE, REGIME_LOW_GROWTH_THRESHOLD,
  REGIME_OVERHEATING_INFLATION_GAP_THRESHOLD, U_NAT,
} from './constants';

function tone(v: number, negThreshold = 0, posThreshold = 0): StakeholderRow['stats'][number]['tone'] {
  if (v > posThreshold) return 'positive';
  if (v < negThreshold) return 'negative';
  return 'neutral';
}

export function classifyRegime(state: MacroState): RegimeClassification {
  const { pi, g, gPot, piGap } = state;
  let regime: Regime;
  let regimeNote: string;
  if (pi > REGIME_EXTREME_INFLATION_THRESHOLD && g < REGIME_LOW_GROWTH_THRESHOLD) {
    regime = 'Extreme inflation + contraction';
    regimeNote = 'Money is losing its function as a store of value; the planning horizon collapses.';
  } else if (pi > REGIME_EXTREME_INFLATION_THRESHOLD) {
    regime = 'Extreme inflation';
    regimeNote = 'Expectations have de-anchored; wage-price indexation locks in the spiral.';
  } else if (pi < 0 && g < 0) {
    regime = 'Deflation-depression';
    regimeNote = 'The real debt burden rises even as nominal income falls.';
  } else if (pi < 0) {
    regime = 'Deflation';
    regimeNote = 'Real rates rise automatically even as nominal rates are pushed to zero.';
  } else if (piGap > REGIME_OVERHEATING_INFLATION_GAP_THRESHOLD && g < REGIME_LOW_GROWTH_THRESHOLD) {
    regime = 'Stagflation';
    regimeNote = 'A supply shock: the central bank cannot fix both sides of its mandate at once.';
  } else if (piGap > REGIME_OVERHEATING_INFLATION_GAP_THRESHOLD) {
    regime = 'Overheating';
    regimeNote = 'Demand is outrunning capacity; the output gap is positive.';
  } else if (g < 0) {
    regime = 'Disinflationary recession';
    regimeNote = 'Weak demand is pushing prices down; there is room to ease.';
  } else if (Math.abs(piGap) <= REGIME_GOLDILOCKS_INFLATION_GAP_TOLERANCE && g >= gPot - REGIME_GOLDILOCKS_OUTPUT_GAP_TOLERANCE) {
    regime = 'Goldilocks';
    regimeNote = 'Inflation is near target and output is near potential.';
  } else {
    regime = 'Neutral';
    regimeNote = 'No extreme pressure on either side of the mandate.';
  }
  return { regime, regimeNote };
}

export function flowNarrative(state: MacroState): string {
  const { flow } = state;
  if (flow > 45) return 'Classic EM risk-on: thick real carry, a weak dollar, strong terms of trade. Global capital chases yield into SBN and Indonesian equities, the rupiah strengthens, and that strength itself dampens imported inflation.';
  if (flow > 12) return 'Moderate inflows. Foreign investors add SBN first — liquid and easy to size — before rotating into equities.';
  if (flow > -12) return 'Neutral positioning. Allocation to Indonesia tracks index weight rather than active conviction. The next move depends on who moves first: the Fed or Bank Indonesia.';
  if (flow > -45) return 'Outflows. SBN is trimmed first because it is most liquid, pushing yields up and the rupiah down together — a correlation that compounds losses for foreign holders.';
  return 'Sudden stop. Capital leaves regardless of valuation; only dollar liquidity matters. The central bank loses control of domestic rates and must defend the currency instead.';
}

function mechanism(key: StakeholderRow['key'], state: MacroState, drivers: MacroDrivers): string {
  const deflation = state.pi < 0;
  const stagflation = classifyRegime(state).regime === 'Stagflation';
  const extreme = state.pi > REGIME_EXTREME_INFLATION_THRESHOLD;
  const weakIdr = state.idr < -8;
  switch (key) {
    case 'cb':
      if (extreme) return 'Expectations have already de-anchored, so gradual hikes will not bite. What is needed is nominal re-anchoring, not marginal tightening.';
      if (stagflation) return 'Maximum trade-off. Inflation is coming from the supply side, while central bank tools only work on demand — raising rates does not add food supply or lower oil prices.';
      if (deflation) return 'Real rates rise automatically even at a zero nominal rate. Remaining tools: quantitative easing, forward guidance, fiscal coordination.';
      if (weakIdr || state.fxStress > 10) return "The third mandate takes over: FX stability. Rates must rise to stem outflows even when domestic conditions don't call for it — this is what separates an emerging-market central bank from the Fed.";
      if (state.piGap > 2) return 'Demand-driven inflation is comparatively easy to handle. Raise rates above the Taylor rule, cool the output gap, credibility stays intact.';
      return 'Both sides of the mandate are satisfied. Focus shifts to financial-system stability and rebuilding policy space.';
    case 'bank':
      if (deflation) return 'The worst case. Collateral values fall, borrowers’ real debt burden rises, NPLs spike, and margins are squeezed against the deposit-rate floor.';
      if (state.npl > 6) return 'Asset quality becomes the dominant problem. Loan-loss provisioning eats capital faster than net interest margin can rebuild it, and banks start rationing credit.';
      if (stagflation) return 'Margins widen as assets reprice faster than liabilities, but credit quality deteriorates underneath. Profit now, losses later.';
      if (state.rEx > 4) return 'High real rates: margins look good, credit demand dries up, existing borrowers start defaulting.';
      return 'Healthy intermediation: credit demand grows, NPLs are contained, margins are stable.';
    case 'corp':
      if (deflation) return 'Selling prices fall faster than fixed costs and sticky nominal wages. Nominal debt becomes heavier in real terms.';
      if (state.fxDebtHit > 4) return 'FX debt is the main problem here, not operating margin. Depreciation hits the balance sheet faster than export revenue can offset it.';
      if (weakIdr) return 'Rupiah weakness raises the cost of imported inputs. Commodity exporters win, importers and dollar borrowers lose — the impact splits the corporate sector rather than hitting it evenly.';
      if (stagflation) return 'Input costs rise faster than pricing power allows because demand is weak. Margins are squeezed from both sides.';
      return 'Nominal growth outruns cost growth. Cost of capital is reasonable, the investment window is open.';
    case 'gov':
      if (state.deficitActual > 5) return 'The deficit has crossed the market’s comfort line. SBN issuance rises just as foreign demand falls, so yields rise and the interest bill grows with them.';
      if (state.subsidyCost > 2) return 'Energy subsidies are absorbing fiscal space. The oil shock hits the budget first, not inflation directly — the cost is real, it has just moved location.';
      if (state.debtNext > drivers.debtRatio + 1) return 'The debt ratio is rising: nominal growth isn’t enough to outrun the deficit. The snowball dynamic starts working against the government.';
      if (state.pi > state.piGap + 4) return 'Inflation is eroding the real value of old debt — the government is the largest nominal borrower, so it quietly benefits as long as yields haven’t caught up yet.';
      return 'A sustainable fiscal position. Nominal growth outruns the interest bill, and the debt ratio falls on its own.';
    case 'inv':
      if (deflation) return 'Cash and nominal bonds win; equities, property, and crypto lose. Real cash returns are positive without taking any risk at all.';
      if (stagflation) return 'Real assets lead. Bonds and equities fall together — diversification fails exactly when it is needed most.';
      if (state.rG > 2.5) return 'High global real rates weigh on every long-duration asset. Gold and crypto are hit hardest because they have no cash flow to defend themselves with.';
      return 'Risk premia are being paid fairly. Equities lead, bonds provide a positive real cushion.';
    case 'people':
      if (extreme) return 'The most regressive tax there is. Wages fall behind prices, cash savings are wiped out, and those without assets have no protection at all.';
      if (state.feltGap > 1) return `Felt inflation of ${state.cpiBottom.toFixed(1)}% is far above the official ${state.pi.toFixed(1)}%, because food and rent take up a much larger share of a lower-income household budget. This is the source of the gap between the data and how people experience it.`;
      if (state.rentBurden > 0) return 'Rent is rising faster than wages. Pay raises are absorbed before they reach any other spending — real purchasing power falls even as nominal wages rise.';
      if (state.underemp > 24) return 'Open unemployment stays low only because people shift into the informal sector, not because the labor market is healthy. What rises is underemployment and precarious work.';
      if (state.realWageFelt > 2 && state.u < U_NAT) return 'Purchasing power is rising and the labor market is tight. Worker bargaining power is at its peak.';
      return 'Purchasing power is stagnant. Nominal wage gains are absorbed entirely by prices.';
    default:
      return '';
  }
}

/** Computes all 6 stakeholder scores + narrative mechanism. `portfolio` drives the Investor row only. */
export function scoreStakeholders(
  state: MacroState,
  drivers: MacroDrivers,
  instruments: InstrumentView[],
  portfolio: PortfolioAggregate,
): StakeholderRow[] {
  const { i, target, debtRatio } = drivers;
  const { piGap, gap: outputGap, pi, npl, nim, realCredit, g, marginDelta, rEx, u, fxDebtHit,
    deficitActual, subsidyCost, interestBurden, debtNext, realWageFelt, underemp, rentBurden, rG } = state;

  const cbScore = clamp(CB_SCORE_BASE - CB_SCORE_INFLATION_GAP_PENALTY * piGap ** 2 - CB_SCORE_OUTPUT_GAP_PENALTY * outputGap ** 2
    - (pi < 0 && i < CB_SCORE_ZERO_LOWER_BOUND_RATE ? CB_SCORE_DEFLATION_TRAP_PENALTY : 0) - state.fxStress);
  const bankScore = clamp(BANK_SCORE_NIM_WEIGHT * (nim - BANK_SCORE_NIM_COMFORT) + BANK_SCORE_CREDIT_WEIGHT * realCredit
    - BANK_SCORE_NPL_WEIGHT * (npl - BANK_SCORE_NPL_COMFORT) - BANK_SCORE_INFLATION_GAP_PENALTY * Math.max(0, piGap - 2));
  const corpScore = clamp(CORP_SCORE_GROWTH_WEIGHT * g + CORP_SCORE_MARGIN_WEIGHT * marginDelta - CORP_SCORE_REAL_RATE_DRAG * Math.max(0, rEx - CORP_SCORE_REAL_RATE_COMFORT)
    - CORP_SCORE_INFLATION_GAP_PENALTY * Math.abs(piGap) - CORP_SCORE_UNEMPLOYMENT_GAP_PENALTY * Math.max(0, u - U_NAT)
    + (pi < 0 ? -CORP_SCORE_DEFLATION_WEIGHT * (1 - pi) : 0) - fxDebtHit);
  const govScore = clamp(GOV_SCORE_BASE - GOV_SCORE_DEFICIT_PENALTY * Math.max(0, deficitActual - GOV_SCORE_DEFICIT_COMFORT_PCT_GDP)
    - GOV_SCORE_DEBT_RATIO_PENALTY * Math.max(0, debtRatio - DEBT_RATIO_SAFE_THRESHOLD_PCT_GDP)
    - GOV_SCORE_INTEREST_BURDEN_PENALTY * Math.max(0, interestBurden - GOV_SCORE_INTEREST_BURDEN_COMFORT_PCT_GDP)
    + GOV_SCORE_GROWTH_WEIGHT * g - GOV_SCORE_FX_WEAKNESS_PENALTY * Math.max(0, -state.idr)
    + GOV_SCORE_INFLATION_BENEFIT_WEIGHT * Math.min(Math.max(pi, 0), GOV_SCORE_INFLATION_BENEFIT_CEILING)
    - GOV_SCORE_RISING_DEBT_PENALTY * Math.max(0, debtNext - debtRatio));
  const peopleScore = clamp(PEOPLE_SCORE_WAGE_WEIGHT * realWageFelt - PEOPLE_SCORE_UNEMPLOYMENT_WEIGHT * (u - U_NAT)
    - PEOPLE_SCORE_UNDEREMPLOYMENT_WEIGHT * Math.max(0, underemp - PEOPLE_SCORE_UNDEREMPLOYMENT_THRESHOLD)
    - PEOPLE_SCORE_REAL_RATE_WEIGHT * Math.max(0, rEx) + PEOPLE_SCORE_GROWTH_WEIGHT * g - PEOPLE_SCORE_RENT_BURDEN_WEIGHT * Math.max(0, rentBurden)
    - (pi > PEOPLE_SCORE_HYPERINFLATION_THRESHOLD ? PEOPLE_SCORE_HYPERINFLATION_WEIGHT * (pi - PEOPLE_SCORE_HYPERINFLATION_THRESHOLD) : 0)
    - PEOPLE_SCORE_DEFLATION_WEIGHT * Math.max(0, -pi) + (pi < 0 && g < 0 ? -PEOPLE_SCORE_DEPRESSION_PENALTY : 0));

  const best = instruments[0];
  const worst = instruments[instruments.length - 1];

  const rows: StakeholderRow[] = [
    {
      key: 'cb', name: 'Central bank', subtitle: 'Prices, output, and FX stability', score: cbScore,
      stats: [
        { label: 'Deviation from target', value: `${piGap >= 0 ? '+' : ''}${piGap.toFixed(1)} pp`, tone: tone(2 - Math.abs(piGap)) },
        { label: 'Credibility', value: `${state.credibility.toFixed(0)}/100`, sub: 'from expectation anchoring' },
        { label: 'Taylor rule', value: `${state.taylor.toFixed(1)}%`, tone: tone(i + 1 - state.taylor, -0.001, 0), sub: `actual ${i.toFixed(1)}%` },
        { label: 'FX stress', value: state.fxStress.toFixed(1), tone: tone(10 - state.fxStress) },
      ],
      mechanism: mechanism('cb', state, drivers),
    },
    {
      key: 'bank', name: 'Commercial banks', subtitle: 'Margin, volume, asset quality', score: bankScore,
      stats: [
        { label: 'Net interest margin', value: `${nim.toFixed(1)}%` },
        { label: 'Cost of funds', value: `${state.costOfFunds.toFixed(1)}%` },
        { label: 'Real credit growth', value: `${realCredit >= 0 ? '+' : ''}${realCredit.toFixed(1)}%` },
        { label: 'NPL ratio', value: `${npl.toFixed(1)}%`, tone: tone(5 - npl) },
      ],
      mechanism: mechanism('bank', state, drivers),
    },
    {
      key: 'corp', name: 'Corporates', subtitle: 'Margin, input costs, FX debt burden', score: corpScore,
      stats: [
        { label: 'Nominal revenue growth', value: `${state.nomRev >= 0 ? '+' : ''}${state.nomRev.toFixed(1)}%` },
        { label: 'Labor cost', value: `${state.costLabor >= 0 ? '+' : ''}${state.costLabor.toFixed(1)} pp`, sub: `ULC ${state.ulc >= 0 ? '+' : ''}${state.ulc.toFixed(1)}%` },
        { label: 'Import + energy cost', value: `${state.costImport >= 0 ? '+' : ''}${state.costImport.toFixed(1)} pp`, tone: tone(2 - state.costImport) },
        { label: 'Rent & land cost', value: `${state.costRent >= 0 ? '+' : ''}${state.costRent.toFixed(1)} pp` },
        { label: 'FX debt hit', value: `${fxDebtHit >= 0 ? '+' : ''}${fxDebtHit.toFixed(1)} pp`, tone: tone(2 - fxDebtHit) },
        { label: 'Margin change', value: `${marginDelta >= 0 ? '+' : ''}${marginDelta.toFixed(1)} pp`, tone: tone(marginDelta) },
      ],
      mechanism: mechanism('corp', state, drivers),
    },
    {
      key: 'gov', name: 'Government', subtitle: 'Budget, debt, subsidies', score: govScore,
      stats: [
        { label: 'Actual deficit', value: `${deficitActual.toFixed(1)}%`, tone: tone(3 - deficitActual) },
        { label: 'Energy subsidy cost', value: `${subsidyCost.toFixed(1)}% GDP`, tone: tone(2 - subsidyCost) },
        { label: 'Interest burden', value: `${interestBurden.toFixed(1)}% GDP`, tone: tone(2.5 - interestBurden) },
        { label: "Next year's debt ratio", value: `${debtNext.toFixed(1)}%`, tone: tone(debtRatio - debtNext), sub: `now ${debtRatio.toFixed(1)}%` },
      ],
      mechanism: mechanism('gov', state, drivers),
    },
    {
      key: 'inv', name: 'Investors', subtitle: 'Real IDR return and sentiment', score: portfolio.investorScore,
      stats: [
        { label: 'Best instrument', value: best.name.split(' (')[0], tone: 'positive' },
        { label: 'Worst instrument', value: worst.name.split(' (')[0], tone: 'negative' },
        { label: 'Blended portfolio', value: `${portfolio.realReturnPct >= 0 ? '+' : ''}${portfolio.realReturnPct.toFixed(1)}%`, tone: tone(portfolio.realReturnPct) },
        { label: 'Global real rate', value: `${rG >= 0 ? '+' : ''}${rG.toFixed(1)}%` },
      ],
      mechanism: mechanism('inv', state, drivers),
    },
    {
      key: 'people', name: 'Households', subtitle: 'Purchasing power, jobs, cost of living', score: peopleScore,
      stats: [
        { label: 'Felt inflation', value: `${state.cpiBottom.toFixed(1)}%`, tone: tone(0.8 - state.feltGap), sub: `official ${pi.toFixed(1)}%` },
        { label: 'Effective real wage', value: `${realWageFelt >= 0 ? '+' : ''}${realWageFelt.toFixed(1)}%`, tone: tone(realWageFelt) },
        { label: 'Rent vs wages', value: `${rentBurden >= 0 ? '+' : ''}${rentBurden.toFixed(1)} pp`, tone: tone(-rentBurden) },
        { label: 'Unemployment', value: `${u.toFixed(1)}%`, sub: `underemployment ${underemp.toFixed(1)}%` },
        { label: 'Consumer loan rate', value: `${state.kpr.toFixed(1)}%` },
        { label: 'Real savings return', value: `${state.savingsReal >= 0 ? '+' : ''}${state.savingsReal.toFixed(1)}%`, tone: tone(state.savingsReal) },
      ],
      mechanism: mechanism('people', state, drivers),
    },
  ];

  return rows;
}

export function verdictLabel(score: number): string {
  if (score >= 55) return 'strongly benefits';
  if (score >= 15) return 'benefits';
  if (score > -15) return 'neutral';
  if (score > -55) return 'hurt';
  return 'strongly hurt';
}
