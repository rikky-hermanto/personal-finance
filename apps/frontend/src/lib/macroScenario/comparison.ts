// Macro Scenario Lab — base vs. alternate scenario comparison (Fase 2.4).
// Framework-free. Takes two already-computed scenario results (+ optional personalization figures)
// and reduces them to the handful of deltas a user actually cares about: "what changes for me".

import type { MacroScenarioResult } from './types';

export interface ScenarioComparisonInputs {
  base: MacroScenarioResult;
  alt: MacroScenarioResult;
  basePortfolioValueIdr?: number;
  altPortfolioValueIdr?: number;
  baseLiabilityMonthlyIdr?: number;
  altLiabilityMonthlyIdr?: number;
  baseEmergencyFundMonths?: number;
  altEmergencyFundMonths?: number;
}

export interface ScenarioComparison {
  inflationDeltaPp: number;
  growthDeltaPp: number;
  unemploymentDeltaPp: number;
  idrDeltaPct: number;
  portfolioRealReturnDeltaPp: number;
  purchasingPowerDeltaPp: number; // realWageFelt delta
  portfolioValueDeltaIdr: number | null;
  liabilityMonthlyDeltaIdr: number | null;
  emergencyFundMonthsDelta: number | null;
}

export function compareScenarios(input: ScenarioComparisonInputs): ScenarioComparison {
  const { base, alt } = input;
  return {
    inflationDeltaPp: alt.state.pi - base.state.pi,
    growthDeltaPp: alt.state.g - base.state.g,
    unemploymentDeltaPp: alt.state.u - base.state.u,
    idrDeltaPct: alt.state.idr - base.state.idr,
    portfolioRealReturnDeltaPp: alt.portfolio.realReturnPct - base.portfolio.realReturnPct,
    purchasingPowerDeltaPp: alt.state.realWageFelt - base.state.realWageFelt,
    portfolioValueDeltaIdr:
      input.basePortfolioValueIdr != null && input.altPortfolioValueIdr != null
        ? input.altPortfolioValueIdr - input.basePortfolioValueIdr
        : null,
    liabilityMonthlyDeltaIdr:
      input.baseLiabilityMonthlyIdr != null && input.altLiabilityMonthlyIdr != null
        ? input.altLiabilityMonthlyIdr - input.baseLiabilityMonthlyIdr
        : null,
    emergencyFundMonthsDelta:
      input.baseEmergencyFundMonths != null && input.altEmergencyFundMonths != null
        ? input.altEmergencyFundMonths - input.baseEmergencyFundMonths
        : null,
  };
}
