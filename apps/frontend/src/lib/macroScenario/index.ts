// Macro Scenario Lab — public entry point for the pure domain module.
// Composes solver -> instruments -> stakeholders into one scenario result. Framework-free.

import type { MacroDrivers, MacroScenarioResult } from './types';
import { solveMacro, type SpendingWeights } from './solver';
import { blendPortfolio, DEFAULT_PORTFOLIO_WEIGHTS, priceInstruments } from './instruments';
import { classifyRegime, flowNarrative, scoreStakeholders } from './stakeholders';

export interface ComputeScenarioOptions {
  spendingWeights?: SpendingWeights;
  /** Real portfolio weights keyed by instrument name (see instruments.ts DEFAULT_PORTFOLIO_WEIGHTS for valid keys). */
  portfolioWeights?: Record<string, number>;
}

export function computeScenario(drivers: MacroDrivers, options: ComputeScenarioOptions = {}): MacroScenarioResult {
  const state = solveMacro(drivers, options.spendingWeights);
  const instruments = priceInstruments(state, drivers);
  const portfolio = blendPortfolio(instruments, options.portfolioWeights ?? DEFAULT_PORTFOLIO_WEIGHTS);
  const stakeholders = scoreStakeholders(state, drivers, instruments, portfolio);
  const regime = classifyRegime(state);

  return {
    drivers,
    state,
    instruments,
    portfolio,
    stakeholders,
    regime,
    flowNarrative: flowNarrative(state),
  };
}

export * from './types';
export { clamp, solveMacro, type SpendingWeights } from './solver';
export { blendPortfolio, DEFAULT_PORTFOLIO_WEIGHTS, priceInstruments } from './instruments';
export { classifyRegime, flowNarrative, scoreStakeholders, verdictLabel } from './stakeholders';
export { BASE, DRIVER_GROUPS, PRESETS } from './presets';
export * as MacroConstants from './constants';
