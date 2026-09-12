// Macro Scenario Lab — core solver. Framework-free, deterministic, no I/O.
// Ported from docs/reference/simulator-makro-v3.jsx computeModel() (lines 25-205), split so this
// file owns only the iterative FX/inflation solve and the derived "results, not choices" state.
// Instrument pricing lives in instruments.ts; stakeholder scoring + regime live in stakeholders.ts.
//
// The 4-round fixed-point loop is load-bearing: output gap -> GDP -> Phillips curve -> capital
// flow -> FX -> repeat. Collapsing it into one pass removes the depreciation -> imported-inflation
// feedback loop. Do not "simplify" this.

import type { CapitalFlowComponent, MacroDrivers, MacroState } from './types';
import {
  BANK_COST_OF_FUNDS_OUTFLOW_DIVISOR, BANK_COST_OF_FUNDS_OUTFLOW_WEIGHT, BANK_COST_OF_FUNDS_SPREAD,
  BANK_CREDIT_BASE, BANK_CREDIT_CLAMP_MAX, BANK_CREDIT_CLAMP_MIN, BANK_CREDIT_FLOW_WEIGHT,
  BANK_CREDIT_GROWTH_WEIGHT, BANK_CREDIT_HIGH_INFLATION_DRAG, BANK_CREDIT_HIGH_INFLATION_THRESHOLD,
  BANK_CREDIT_REAL_RATE_DRAG, BANK_NIM_BASE, BANK_NIM_CEILING, BANK_NIM_FLOOR,
  BANK_NIM_POLICY_RATE_WEIGHT, BANK_NIM_REAL_RATE_COMFORT, BANK_NIM_REAL_RATE_DRAG,
  CORP_CAPITAL_COST_BASE_SPREAD, CORP_CAPITAL_COST_WEIGHT, CORP_COST_INFLATION_WEIGHT,
  CORP_FX_DEBT_DIVISOR, CORP_FX_DEBT_HIT_WEIGHT, CORP_IMPORT_COST_WEIGHT, CORP_IMPORT_OIL_WEIGHT,
  CORP_LABOR_COST_WEIGHT, CORP_RENT_COST_WEIGHT,
  CPI_BOTTOM_CORE_WEIGHT, CPI_BOTTOM_FOOD_WEIGHT, CPI_BOTTOM_FUEL_WEIGHT, CPI_BOTTOM_RENT_WEIGHT,
  CREDIBILITY_BASE, CREDIBILITY_EXPECTATION_GAP_PENALTY, CREDIBILITY_FX_WEAKNESS_PENALTY,
  TAYLOR_INFLATION_GAP_WEIGHT, TAYLOR_OUTPUT_GAP_WEIGHT,
  DEBT_RATIO_SAFE_THRESHOLD_PCT_GDP, INSTR_SBN_DEBT_RISK_WEIGHT, INSTR_SBN_FLOW_WEIGHT,
  INSTR_SBN_INFLATION_RISK_WEIGHT, INSTR_SBN_TERM_PREMIUM,
  FLOW_DEFLATION_PENALTY, FLOW_DXY_WEIGHT, FLOW_FX_DEBT_WEIGHT, FLOW_GROWTH_DIFFERENTIAL_WEIGHT,
  FLOW_NOMINAL_STABILITY_WEIGHT, FLOW_REAL_CARRY_WEIGHT, FLOW_RESERVES_WEIGHT,
  FLOW_RISK_APPETITE_WEIGHT, FLOW_TERMS_OF_TRADE_WEIGHT, FOOD_INFLATION_BASE_PREMIUM,
  FOOD_INFLATION_COMMODITY_WEIGHT, FOOD_INFLATION_FX_PASSTHROUGH, FOOD_INFLATION_OUTPUT_GAP_WEIGHT,
  FOOD_INFLATION_SHOCK_PASSTHROUGH, FUEL_PRICE_FX_PASSTHROUGH, FUEL_PRICE_OIL_PASSTHROUGH,
  FX_BASE_DRIFT, FX_CAPITAL_FLOW_SENSITIVITY, FX_CLAMP_MAX, FX_CLAMP_MIN, FX_CRISIS_DRAG_DEBT_DIVISOR,
  FX_CRISIS_DRAG_IDR_THRESHOLD, FX_DEBT_SAFE_THRESHOLD_PCT_GDP, FX_DXY_SENSITIVITY,
  FX_INFLATION_DIFFERENTIAL_SENSITIVITY, FX_RESERVES_SENSITIVITY, FX_STRESS_IDR_THRESHOLD,
  FX_STRESS_IDR_WEIGHT, FX_STRESS_RESERVES_WEIGHT, GOV_DEFICIT_OUTPUT_GAP_WEIGHT,
  GOV_SUBSIDY_BASE_COST_PCT_GDP, GOV_SUBSIDY_FX_WEIGHT, GOV_SUBSIDY_OIL_WEIGHT,
  IMPORTED_INFLATION_FX_PASSTHROUGH, IMPORTED_INFLATION_OIL_PASSTHROUGH, INSTR_CASH_IDR_SPREAD,
  JOB_GROWTH_BASE, JOB_GROWTH_OUTPUT_SENSITIVITY, KAPPA, NOMINAL_STABILITY_TOLERANCE_PP,
  NPL_BASE, NPL_CEILING, NPL_DEFLATION_WEIGHT, NPL_FLOOR, NPL_FX_DEBT_DIVISOR, NPL_FX_DEBT_WEIGHT,
  NPL_HIGH_INFLATION_THRESHOLD, NPL_HIGH_INFLATION_WEIGHT, NPL_RECESSION_WEIGHT,
  NPL_REAL_RATE_COMFORT, NPL_REAL_RATE_WEIGHT, NPL_UNEMPLOYMENT_GAP_WEIGHT, NPL_WAGE_PRICE_GAP_WEIGHT,
  OKUN, OKUN_ASYMMETRIC_DOWNTURN_BONUS, OKUN_INFORMALITY_DAMPENING, OUTPUT_GAP_COMMODITY_SENSITIVITY,
  OUTPUT_GAP_DXY_SENSITIVITY, OUTPUT_GAP_EXTERNAL_DEMAND_NEUTRAL, OUTPUT_GAP_EXTERNAL_DEMAND_SENSITIVITY,
  OUTPUT_GAP_FISCAL_NEUTRAL_DEFICIT, OUTPUT_GAP_FISCAL_SENSITIVITY, OUTPUT_GAP_OIL_SENSITIVITY,
  OUTPUT_GAP_REAL_RATE_SENSITIVITY, OUTPUT_GAP_RISK_APPETITE_SENSITIVITY, PEOPLE_CONSUMER_LOAN_SPREAD,
  PHILLIPS_CURVE_OVERHEATING_STEEPENING, PHILLIPS_CURVE_ULC_PASSTHROUGH, POTENTIAL_GROWTH_BASE,
  RENT_GROWTH_BASE, RENT_GROWTH_INFLATION_WEIGHT, RENT_GROWTH_OUTPUT_GAP_WEIGHT,
  RENT_GROWTH_REAL_RATE_WEIGHT, RESERVES_ADEQUACY_MONTHS, RISK_APPETITE_NEUTRAL, R_NEUTRAL,
  TERMS_OF_TRADE_COMMODITY_WEIGHT, TERMS_OF_TRADE_OIL_WEIGHT,
  UNDEREMPLOYMENT_BASE, UNDEREMPLOYMENT_FLOOR, UNDEREMPLOYMENT_INFORMALITY_WEIGHT,
  UNDEREMPLOYMENT_OUTPUT_GAP_WEIGHT, UNEMPLOYMENT_FLOOR, U_NAT,
} from './constants';

export function clamp(v: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface SpendingWeights {
  food: number;
  rent: number;
  fuel: number;
  core: number;
}

const DEFAULT_SPENDING_WEIGHTS: SpendingWeights = {
  food: CPI_BOTTOM_FOOD_WEIGHT,
  rent: CPI_BOTTOM_RENT_WEIGHT,
  fuel: CPI_BOTTOM_FUEL_WEIGHT,
  core: CPI_BOTTOM_CORE_WEIGHT,
};

/**
 * Solves the core macro state for a set of drivers.
 * @param spendingWeights Optional personal spending mix (food/rent/fuel/core, should sum to ~1) used
 *   to compute felt inflation. Falls back to the model's default household basket when omitted —
 *   this is the "insufficient transaction data" fallback required by the personalization spec.
 */
export function solveMacro(drivers: MacroDrivers, spendingWeights?: SpendingWeights): MacroState {
  const {
    i, target, pie, deficit, w, prod, shock, informal,
    iFed, piG, gG, dxy, riskOn,
    oil, commod, subsidy, fxDebt, reserves, debtRatio,
  } = drivers;

  const inf = informal / 100;
  const sub = subsidy / 100;
  const gPot = prod + POTENTIAL_GROWTH_BASE;
  const r = i - pie; // ex-ante real rate

  let idr = 0;
  let pi = pie;
  let g = gPot;
  let gap = 0;
  let flow = 0;
  let flowParts: CapitalFlowComponent[] = [];

  for (let k = 0; k < 4; k++) {
    const fxCrisisDrag = Math.max(0, -idr - FX_CRISIS_DRAG_IDR_THRESHOLD) * (fxDebt / FX_CRISIS_DRAG_DEBT_DIVISOR);
    gap = OUTPUT_GAP_REAL_RATE_SENSITIVITY * (r - R_NEUTRAL)
      + OUTPUT_GAP_FISCAL_SENSITIVITY * (deficit - OUTPUT_GAP_FISCAL_NEUTRAL_DEFICIT)
      + OUTPUT_GAP_EXTERNAL_DEMAND_SENSITIVITY * (gG - OUTPUT_GAP_EXTERNAL_DEMAND_NEUTRAL)
      + OUTPUT_GAP_COMMODITY_SENSITIVITY * commod - OUTPUT_GAP_OIL_SENSITIVITY * oil
      + OUTPUT_GAP_RISK_APPETITE_SENSITIVITY * (riskOn - RISK_APPETITE_NEUTRAL) - OUTPUT_GAP_DXY_SENSITIVITY * dxy
      - fxCrisisDrag;
    g = gPot + gap;

    const ulc = w - prod;
    const importedInfl = IMPORTED_INFLATION_FX_PASSTHROUGH * Math.max(0, -idr)
      + IMPORTED_INFLATION_OIL_PASSTHROUGH * Math.max(0, oil) * (1 - sub);
    const kEff = KAPPA + PHILLIPS_CURVE_OVERHEATING_STEEPENING * Math.max(0, gap);
    pi = pie + kEff * gap + PHILLIPS_CURVE_ULC_PASSTHROUGH * (ulc - pie) + shock + importedInfl;

    const realCarry = (i - pi) - (iFed - piG);
    const growthDiff = g - gG;
    const netToT = TERMS_OF_TRADE_COMMODITY_WEIGHT * commod - TERMS_OF_TRADE_OIL_WEIGHT * oil;
    flowParts = [
      { label: 'Real carry (domestic vs global real rate)', contribution: FLOW_REAL_CARRY_WEIGHT * realCarry, raw: `${fmt1(realCarry)} pp` },
      { label: 'Growth differential', contribution: FLOW_GROWTH_DIFFERENTIAL_WEIGHT * growthDiff, raw: `${fmt1(growthDiff)} pp` },
      { label: 'Global risk appetite', contribution: FLOW_RISK_APPETITE_WEIGHT * (riskOn - RISK_APPETITE_NEUTRAL), raw: `${riskOn.toFixed(0)}/100` },
      { label: 'Dollar strength (DXY)', contribution: FLOW_DXY_WEIGHT * dxy, raw: `${fmt1(dxy)}%` },
      { label: 'Net terms of trade', contribution: FLOW_TERMS_OF_TRADE_WEIGHT * netToT, raw: `${fmt1(netToT * 10)} idx` },
      { label: 'FX reserve adequacy', contribution: FLOW_RESERVES_WEIGHT * (reserves - RESERVES_ADEQUACY_MONTHS), raw: `${reserves.toFixed(1)} mo` },
      { label: 'Corporate FX debt', contribution: FLOW_FX_DEBT_WEIGHT * Math.max(0, fxDebt - FX_DEBT_SAFE_THRESHOLD_PCT_GDP), raw: `${fxDebt.toFixed(1)}% GDP` },
      { label: 'Domestic nominal stability', contribution: FLOW_NOMINAL_STABILITY_WEIGHT * Math.max(0, Math.abs(pi - target) - NOMINAL_STABILITY_TOLERANCE_PP) - (pi < 0 ? FLOW_DEFLATION_PENALTY : 0), raw: `gap ${fmt1(pi - target)} pp` },
    ];
    flow = clamp(flowParts.reduce((a, part) => a + part.contribution, 0));
    idr = clamp(
      FX_BASE_DRIFT + FX_CAPITAL_FLOW_SENSITIVITY * flow - FX_INFLATION_DIFFERENTIAL_SENSITIVITY * (pi - piG)
        - FX_DXY_SENSITIVITY * dxy + FX_RESERVES_SENSITIVITY * (reserves - RESERVES_ADEQUACY_MONTHS),
      FX_CLAMP_MIN, FX_CLAMP_MAX,
    );
  }

  const piGap = pi - target;
  const outputGap = gap;
  const realWage = w - pi;
  const ulc = w - prod;
  const rEx = i - pi; // ex-post real rate

  // ── labor market: a result, not an input ──
  const damp = 1 - OKUN_INFORMALITY_DAMPENING * inf;
  const u = Math.max(UNEMPLOYMENT_FLOOR, U_NAT - OKUN * outputGap * damp + Math.max(0, -outputGap) * OKUN_ASYMMETRIC_DOWNTURN_BONUS);
  const underemp = Math.max(UNDEREMPLOYMENT_FLOOR, UNDEREMPLOYMENT_BASE + UNDEREMPLOYMENT_INFORMALITY_WEIGHT * inf + UNDEREMPLOYMENT_OUTPUT_GAP_WEIGHT * Math.max(0, -outputGap));
  const jobGrowth = JOB_GROWTH_OUTPUT_SENSITIVITY * g + JOB_GROWTH_BASE;

  // ── prices households actually feel ──
  const foodInfl = pie + FOOD_INFLATION_BASE_PREMIUM + FOOD_INFLATION_SHOCK_PASSTHROUGH * shock
    + FOOD_INFLATION_FX_PASSTHROUGH * Math.max(0, -idr) + FOOD_INFLATION_OUTPUT_GAP_WEIGHT * KAPPA * outputGap
    + FOOD_INFLATION_COMMODITY_WEIGHT * commod;
  const fuelPrice = FUEL_PRICE_OIL_PASSTHROUGH * oil * (1 - sub) + FUEL_PRICE_FX_PASSTHROUGH * Math.max(0, -idr) * (1 - sub);
  const rentGrowth = RENT_GROWTH_BASE + RENT_GROWTH_INFLATION_WEIGHT * pi + RENT_GROWTH_OUTPUT_GAP_WEIGHT * outputGap
    + RENT_GROWTH_REAL_RATE_WEIGHT * Math.max(0, -rEx);
  const coreOther = pi - shock;
  const weights = spendingWeights ?? DEFAULT_SPENDING_WEIGHTS;
  const cpiBottom = weights.food * foodInfl + weights.rent * rentGrowth + weights.fuel * fuelPrice + weights.core * coreOther;
  const feltGap = cpiBottom - pi;

  // ── rates & yields ──
  const sbnYield = i + INSTR_SBN_TERM_PREMIUM + INSTR_SBN_INFLATION_RISK_WEIGHT * Math.max(0, piGap)
    - INSTR_SBN_FLOW_WEIGHT * flow + INSTR_SBN_DEBT_RISK_WEIGHT * Math.max(0, debtRatio - DEBT_RATIO_SAFE_THRESHOLD_PCT_GDP);
  const fxStress = Math.max(0, -idr - FX_STRESS_IDR_THRESHOLD) * FX_STRESS_IDR_WEIGHT
    + Math.max(0, RESERVES_ADEQUACY_MONTHS - reserves) * FX_STRESS_RESERVES_WEIGHT;
  const credibility = clamp(CREDIBILITY_BASE - CREDIBILITY_EXPECTATION_GAP_PENALTY * Math.abs(pie - target) - CREDIBILITY_FX_WEAKNESS_PENALTY * Math.max(0, -idr), 0, 100);
  const taylor = target + R_NEUTRAL + TAYLOR_INFLATION_GAP_WEIGHT * piGap + TAYLOR_OUTPUT_GAP_WEIGHT * outputGap;

  // ── commercial banks ──
  const costOfFunds = i + BANK_COST_OF_FUNDS_SPREAD + BANK_COST_OF_FUNDS_OUTFLOW_WEIGHT * Math.max(0, -flow) / BANK_COST_OF_FUNDS_OUTFLOW_DIVISOR;
  const nim = Math.max(BANK_NIM_FLOOR, Math.min(BANK_NIM_CEILING, BANK_NIM_BASE + BANK_NIM_POLICY_RATE_WEIGHT * i - BANK_NIM_REAL_RATE_DRAG * Math.max(0, rEx - BANK_NIM_REAL_RATE_COMFORT)));
  const realCredit = clamp(BANK_CREDIT_BASE + BANK_CREDIT_GROWTH_WEIGHT * g - BANK_CREDIT_REAL_RATE_DRAG * Math.max(0, rEx) - BANK_CREDIT_HIGH_INFLATION_DRAG * Math.max(0, pi - BANK_CREDIT_HIGH_INFLATION_THRESHOLD) + BANK_CREDIT_FLOW_WEIGHT * flow, BANK_CREDIT_CLAMP_MIN, BANK_CREDIT_CLAMP_MAX);
  const npl = Math.max(NPL_FLOOR, Math.min(NPL_CEILING,
    NPL_BASE + NPL_REAL_RATE_WEIGHT * Math.max(0, rEx - NPL_REAL_RATE_COMFORT) + NPL_RECESSION_WEIGHT * Math.max(0, -g) + NPL_UNEMPLOYMENT_GAP_WEIGHT * Math.max(0, u - U_NAT)
    + NPL_DEFLATION_WEIGHT * Math.max(0, -pi) + NPL_HIGH_INFLATION_WEIGHT * Math.max(0, pi - NPL_HIGH_INFLATION_THRESHOLD) + NPL_WAGE_PRICE_GAP_WEIGHT * Math.max(0, pi - w)
    + NPL_FX_DEBT_WEIGHT * Math.max(0, -idr) * (fxDebt / NPL_FX_DEBT_DIVISOR)));

  // ── corporates: cost breakdown ──
  const costLabor = CORP_LABOR_COST_WEIGHT * ulc;
  const costImport = CORP_IMPORT_COST_WEIGHT * (Math.max(0, -idr) + CORP_IMPORT_OIL_WEIGHT * oil);
  const costRent = CORP_RENT_COST_WEIGHT * rentGrowth;
  const costCapital = CORP_CAPITAL_COST_WEIGHT * (rEx + CORP_CAPITAL_COST_BASE_SPREAD);
  const fxDebtHit = CORP_FX_DEBT_HIT_WEIGHT * Math.max(0, -idr) * (fxDebt / CORP_FX_DEBT_DIVISOR);
  const costGrowth = costLabor + costImport + costRent + costCapital + CORP_COST_INFLATION_WEIGHT * pi;
  const nomRev = g + pi;
  const marginDelta = nomRev - costGrowth;

  // ── government ──
  const subsidyCost = GOV_SUBSIDY_BASE_COST_PCT_GDP + sub * (GOV_SUBSIDY_OIL_WEIGHT * Math.max(0, oil) + GOV_SUBSIDY_FX_WEIGHT * Math.max(0, -idr));
  const deficitActual = deficit + (subsidyCost - GOV_SUBSIDY_BASE_COST_PCT_GDP) - GOV_DEFICIT_OUTPUT_GAP_WEIGHT * outputGap;
  const interestBurden = (debtRatio * sbnYield) / 100;
  const debtNext = debtRatio + deficitActual - (debtRatio * (g + pi)) / 100;

  // ── people ──
  const kpr = i + PEOPLE_CONSUMER_LOAN_SPREAD;
  const savingsReal = i - INSTR_CASH_IDR_SPREAD - pi;
  const realWageFelt = w - cpiBottom;
  const rentBurden = rentGrowth - w;

  return {
    pi, g, gPot, gap: outputGap, piGap, ulc, r, rEx, rG: iFed - piG,
    u, underemp, jobGrowth,
    idr, flow, flowParts,
    foodInfl, fuelPrice, rentGrowth, cpiBottom, feltGap,
    spendingWeightSource: spendingWeights ? 'personal' : 'default',
    sbnYield, taylor, fxStress, credibility,
    costOfFunds, nim, realCredit, npl,
    nomRev, costGrowth, costLabor, costImport, costRent, costCapital, fxDebtHit, marginDelta,
    subsidyCost, deficitActual, interestBurden, debtNext,
    kpr, savingsReal, realWage, realWageFelt, rentBurden,
  };
}

export function fmt1(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}
