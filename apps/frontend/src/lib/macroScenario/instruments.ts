// Macro Scenario Lab — instrument pricing. Framework-free, deterministic.
// Ported from docs/reference/simulator-makro-v3.jsx computeModel() (instrument block, lines 92-134).

import type { MacroDrivers, MacroState, InstrumentView, PortfolioAggregate } from './types';
import { clamp } from './solver';
import {
  CROWDED_RETURN_THRESHOLD, CROWDED_SENTIMENT_THRESHOLD, DEFAULT_PORTFOLIO_WEIGHT_CASH_IDR,
  DEFAULT_PORTFOLIO_WEIGHT_CRYPTO, DEFAULT_PORTFOLIO_WEIGHT_DM_EQUITY, DEFAULT_PORTFOLIO_WEIGHT_GOLD,
  DEFAULT_PORTFOLIO_WEIGHT_IHSG, DEFAULT_PORTFOLIO_WEIGHT_PROPERTY, DEFAULT_PORTFOLIO_WEIGHT_SBN,
  GLOBAL_INFLATION_COMFORT_THRESHOLD, HATED_RETURN_THRESHOLD, HATED_SENTIMENT_THRESHOLD,
  INSTR_CASH_IDR_SPREAD, INSTR_CASH_USD_SPREAD, INSTR_COMMODITY_EXPORT_WEIGHT,
  INSTR_COMMODITY_GLOBAL_GROWTH_WEIGHT, INSTR_COMMODITY_OIL_WEIGHT, INSTR_CRYPTO_BASE_PREMIUM,
  INSTR_CRYPTO_GLOBAL_RECESSION_WEIGHT, INSTR_CRYPTO_HIGH_INFLATION_THRESHOLD,
  INSTR_CRYPTO_HIGH_INFLATION_WEIGHT, INSTR_CRYPTO_REAL_RATE_DRAG, INSTR_CRYPTO_RISK_APPETITE_WEIGHT,
  INSTR_DM_EQUITY_BASE_PREMIUM, INSTR_DM_EQUITY_NOMINAL_WEIGHT, INSTR_DM_EQUITY_REAL_RATE_DRAG,
  INSTR_DM_EQUITY_RISK_APPETITE_WEIGHT, INSTR_DM_EQUITY_VALUATION_GAP_DRAG, INSTR_GOLD_BASE_PREMIUM,
  INSTR_GOLD_INFLATION_HEDGE_WEIGHT, INSTR_GOLD_REAL_RATE_DRAG, INSTR_GOLD_SAFE_HAVEN_WEIGHT,
  INSTR_IHSG_BASE_PREMIUM, INSTR_IHSG_COMMODITY_WEIGHT, INSTR_IHSG_DEFLATION_PENALTY,
  INSTR_IHSG_FLOW_WEIGHT, INSTR_IHSG_NOMINAL_GROWTH_WEIGHT, INSTR_IHSG_OIL_WEIGHT,
  INSTR_IHSG_REAL_RATE_DRAG, INSTR_IHSG_VALUATION_GAP_DRAG, INSTR_PROPERTY_BASE_PREMIUM,
  INSTR_PROPERTY_GROWTH_WEIGHT, INSTR_PROPERTY_REAL_RATE_DRAG, INSTR_PROPERTY_RENT_WEIGHT,
  INSTR_SBN_OUTFLOW_DRAG, INSTR_SBN_REAL_INFLATION_DRAG, INSTR_UST_INFLATION_DRAG,
  INSTR_UST_TERM_PREMIUM, INVESTOR_SCORE_SCALING, REAL_RATE_COMFORT_THRESHOLD, RISK_APPETITE_NEUTRAL,
  SENTIMENT_BETA_WEIGHT, SENTIMENT_NEUTRAL, SENTIMENT_RETURN_WEIGHT, SENTIMENT_RISK_APPETITE_DIVISOR,
} from './constants';

interface RawInstrument {
  name: string;
  category: 'Domestic' | 'Global';
  driver: string;
  nominal: number; // nominal return before deflation/FX adjustment
  beta: number;
  isGlobal: boolean;
}

/** Prices all 10 instruments in real IDR terms and attaches fear/greed sentiment. Sorted best-to-worst. */
export function priceInstruments(state: MacroState, drivers: MacroDrivers): InstrumentView[] {
  const { i, iFed, piG, riskOn, oil, commod, debtRatio } = drivers;
  const { pi, g, idr, flow, rEx, rG, piGap, rentGrowth, sbnYield } = state;

  const kasIDRn = i - INSTR_CASH_IDR_SPREAD;
  const sbnN = sbnYield - INSTR_SBN_REAL_INFLATION_DRAG * Math.max(0, piGap) - INSTR_SBN_OUTFLOW_DRAG * Math.max(0, -flow);
  const ihsgN = INSTR_IHSG_BASE_PREMIUM + (g + INSTR_IHSG_NOMINAL_GROWTH_WEIGHT * pi)
    - INSTR_IHSG_REAL_RATE_DRAG * Math.max(0, rEx - REAL_RATE_COMFORT_THRESHOLD) - INSTR_IHSG_VALUATION_GAP_DRAG * Math.abs(piGap)
    + INSTR_IHSG_FLOW_WEIGHT * flow + INSTR_IHSG_COMMODITY_WEIGHT * commod - INSTR_IHSG_OIL_WEIGHT * oil
    + (pi < 0 ? -INSTR_IHSG_DEFLATION_PENALTY : 0);
  const propN = INSTR_PROPERTY_BASE_PREMIUM + INSTR_PROPERTY_GROWTH_WEIGHT * g + INSTR_PROPERTY_RENT_WEIGHT * rentGrowth
    - INSTR_PROPERTY_REAL_RATE_DRAG * Math.max(0, rEx);
  const kasUSDn = iFed - INSTR_CASH_USD_SPREAD;
  const ustN = (iFed + INSTR_UST_TERM_PREMIUM) - INSTR_UST_INFLATION_DRAG * Math.max(0, piG - GLOBAL_INFLATION_COMFORT_THRESHOLD);
  const dmEqN = INSTR_DM_EQUITY_BASE_PREMIUM + (drivers.gG) + INSTR_DM_EQUITY_NOMINAL_WEIGHT * piG
    - INSTR_DM_EQUITY_REAL_RATE_DRAG * Math.max(0, rG - REAL_RATE_COMFORT_THRESHOLD) - INSTR_DM_EQUITY_VALUATION_GAP_DRAG * Math.abs(piG - GLOBAL_INFLATION_COMFORT_THRESHOLD)
    + INSTR_DM_EQUITY_RISK_APPETITE_WEIGHT * (riskOn - RISK_APPETITE_NEUTRAL);
  const goldN = INSTR_GOLD_BASE_PREMIUM - INSTR_GOLD_REAL_RATE_DRAG * rG + INSTR_GOLD_INFLATION_HEDGE_WEIGHT * Math.max(0, piG - GLOBAL_INFLATION_COMFORT_THRESHOLD)
    + INSTR_GOLD_SAFE_HAVEN_WEIGHT * (RISK_APPETITE_NEUTRAL - riskOn);
  const commN = INSTR_COMMODITY_EXPORT_WEIGHT * commod + INSTR_COMMODITY_OIL_WEIGHT * oil + INSTR_COMMODITY_GLOBAL_GROWTH_WEIGHT * drivers.gG;
  const btcN = INSTR_CRYPTO_BASE_PREMIUM + INSTR_CRYPTO_RISK_APPETITE_WEIGHT * (riskOn - RISK_APPETITE_NEUTRAL) - INSTR_CRYPTO_REAL_RATE_DRAG * rG
    + INSTR_CRYPTO_HIGH_INFLATION_WEIGHT * Math.max(0, piG - INSTR_CRYPTO_HIGH_INFLATION_THRESHOLD) - INSTR_CRYPTO_GLOBAL_RECESSION_WEIGHT * Math.max(0, -drivers.gG);

  const dom = (n: number) => n - pi;
  const glo = (n: number) => n - idr - pi;

  const raw: RawInstrument[] = [
    { name: 'Indonesian equities (IHSG)', category: 'Domestic', driver: 'Nominal earnings, foreign flow', nominal: dom(ihsgN), beta: 1.0, isGlobal: false },
    { name: 'Government bonds (SBN)', category: 'Domestic', driver: 'Yield curve, fiscal risk', nominal: dom(sbnN), beta: 0.2, isGlobal: false },
    { name: 'IDR deposits', category: 'Domestic', driver: 'Domestic real rate', nominal: dom(kasIDRn), beta: -0.1, isGlobal: false },
    { name: 'Property', category: 'Domestic', driver: 'Rent, mortgage rates', nominal: dom(propN), beta: 0.4, isGlobal: false },
    { name: 'Global equities (DM)', category: 'Global', driver: 'Global growth, FX', nominal: glo(dmEqN), beta: 0.9, isGlobal: true },
    { name: 'US Treasuries (UST)', category: 'Global', driver: 'Fed funds rate, safe haven', nominal: glo(ustN), beta: -0.5, isGlobal: true },
    { name: 'USD cash', category: 'Global', driver: 'Fed funds rate, FX', nominal: glo(kasUSDn), beta: -0.7, isGlobal: true },
    { name: 'Gold', category: 'Global', driver: 'Global real rate (inverse)', nominal: glo(goldN), beta: -0.4, isGlobal: true },
    { name: 'Commodities & energy', category: 'Global', driver: 'Terms of trade, global cycle', nominal: glo(commN), beta: 0.7, isGlobal: true },
    { name: 'Crypto (BTC)', category: 'Global', driver: 'Global liquidity, risk appetite', nominal: glo(btcN), beta: 1.6, isGlobal: true },
  ];

  return raw
    .map((x): InstrumentView => {
      const sentiment = clamp(SENTIMENT_NEUTRAL + SENTIMENT_RETURN_WEIGHT * x.nominal + SENTIMENT_BETA_WEIGHT * x.beta * ((riskOn - RISK_APPETITE_NEUTRAL) / SENTIMENT_RISK_APPETITE_DIVISOR), 0, 100);
      let flag: InstrumentView['flag'] = null;
      if (sentiment > CROWDED_SENTIMENT_THRESHOLD && x.nominal < CROWDED_RETURN_THRESHOLD) flag = 'crowded';
      else if (sentiment < HATED_SENTIMENT_THRESHOLD && x.nominal > HATED_RETURN_THRESHOLD) flag = 'hated-but-cheap';
      return { name: x.name, category: x.category, driver: x.driver, realReturnPct: x.nominal, beta: x.beta, sentiment, flag };
    })
    .sort((a, b) => b.realReturnPct - a.realReturnPct);
}

/** Blends a weighted instrument basket into one real-return figure. Weights need not sum to 1 (renormalized). */
export function blendPortfolio(instruments: InstrumentView[], weights: Partial<Record<string, number>>): PortfolioAggregate {
  const byName = new Map(instruments.map((x) => [x.name, x.realReturnPct]));
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [name, weight] of Object.entries(weights)) {
    if (!weight) continue;
    const ret = byName.get(name);
    if (ret === undefined) continue;
    weightedSum += ret * weight;
    totalWeight += weight;
  }
  const realReturnPct = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { realReturnPct, investorScore: clamp(realReturnPct * INVESTOR_SCORE_SCALING) };
}

/** The model's default 7-asset weighting (Fase 1 baseline) — used only when a user has no mapped real holdings. */
export const DEFAULT_PORTFOLIO_WEIGHTS: Record<string, number> = {
  'Indonesian equities (IHSG)': DEFAULT_PORTFOLIO_WEIGHT_IHSG,
  'Government bonds (SBN)': DEFAULT_PORTFOLIO_WEIGHT_SBN,
  'Global equities (DM)': DEFAULT_PORTFOLIO_WEIGHT_DM_EQUITY,
  'IDR deposits': DEFAULT_PORTFOLIO_WEIGHT_CASH_IDR,
  'Gold': DEFAULT_PORTFOLIO_WEIGHT_GOLD,
  'Property': DEFAULT_PORTFOLIO_WEIGHT_PROPERTY,
  'Crypto (BTC)': DEFAULT_PORTFOLIO_WEIGHT_CRYPTO,
};
