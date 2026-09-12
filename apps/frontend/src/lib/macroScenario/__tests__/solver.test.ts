// Macro Scenario Lab — solver test suite (Fase 4).
// Run via `npm run test:macro` (vitest run src/lib/macroScenario), same scoped-config pattern as
// src/lib/desk/__tests__/parity.test.ts.

import { describe, expect, it } from 'vitest';
import { computeScenario } from '../index';
import { solveMacro } from '../solver';
import { priceInstruments } from '../instruments';
import { BASE, DRIVER_GROUPS, PRESETS } from '../presets';
import type { MacroDrivers, MacroState } from '../types';

function isFiniteState(state: MacroState): boolean {
  return Object.entries(state).every(([key, value]) => {
    if (key === 'flowParts' || key === 'spendingWeightSource') return true;
    return typeof value !== 'number' || Number.isFinite(value);
  });
}

describe('solveMacro — golden snapshots', () => {
  it('matches the BASE scenario snapshot', () => {
    expect(computeScenario(BASE)).toMatchSnapshot();
  });

  for (const preset of PRESETS) {
    it(`matches the "${preset.label}" preset snapshot`, () => {
      expect(computeScenario(preset.drivers)).toMatchSnapshot();
    });
  }
});

describe('solveMacro — convergence and stability', () => {
  it('produces only finite numbers at every slider extreme, one driver at a time', () => {
    for (const group of DRIVER_GROUPS) {
      for (const item of group.items) {
        for (const value of [item.min, item.max]) {
          const drivers: MacroDrivers = { ...BASE, [item.key]: value };
          const state = solveMacro(drivers);
          expect(isFiniteState(state), `${item.key}=${value} produced a non-finite state field`).toBe(true);
          const instruments = priceInstruments(state, drivers);
          for (const instrument of instruments) {
            expect(Number.isFinite(instrument.realReturnPct), `${item.key}=${value}: ${instrument.name} real return`).toBe(true);
            expect(Number.isFinite(instrument.sentiment), `${item.key}=${value}: ${instrument.name} sentiment`).toBe(true);
          }
        }
      }
    }
  });

  it('produces only finite numbers for every historical preset', () => {
    for (const preset of PRESETS) {
      const result = computeScenario(preset.drivers);
      expect(isFiniteState(result.state), preset.label).toBe(true);
      for (const s of result.stakeholders) {
        expect(Number.isFinite(s.score), `${preset.label}: ${s.key} score`).toBe(true);
      }
    }
  });
});

describe('solveMacro — sign tests (two causal paths, not one)', () => {
  it('oil price: hurts the government score when subsidy coverage is high', () => {
    const lowOil = solveMacro({ ...BASE, subsidy: 100, oil: 0 });
    const highOil = solveMacro({ ...BASE, subsidy: 100, oil: 80 });
    expect(highOil.subsidyCost).toBeGreaterThan(lowOil.subsidyCost);
    expect(highOil.deficitActual).toBeGreaterThan(lowOil.deficitActual);
  });

  it('oil price: raises headline inflation when subsidy coverage is low (fully passed through)', () => {
    const lowOil = solveMacro({ ...BASE, subsidy: 0, oil: 0 });
    const highOil = solveMacro({ ...BASE, subsidy: 0, oil: 80 });
    expect(highOil.pi).toBeGreaterThan(lowOil.pi);
  });

  it('oil price: barely moves headline inflation when subsidy coverage is full (the two paths differ)', () => {
    const lowOilSubsidized = solveMacro({ ...BASE, subsidy: 100, oil: 0 });
    const highOilSubsidized = solveMacro({ ...BASE, subsidy: 100, oil: 80 });
    const lowOilUnsubsidized = solveMacro({ ...BASE, subsidy: 0, oil: 0 });
    const highOilUnsubsidized = solveMacro({ ...BASE, subsidy: 0, oil: 80 });
    const subsidizedDelta = highOilSubsidized.pi - lowOilSubsidized.pi;
    const unsubsidizedDelta = highOilUnsubsidized.pi - lowOilUnsubsidized.pi;
    expect(subsidizedDelta).toBeLessThan(unsubsidizedDelta);
  });

  it('IDR weakness: raises the real IDR return of a foreign-currency instrument', () => {
    const strongIdrState = solveMacro(BASE);
    const weakState: MacroState = { ...strongIdrState, idr: strongIdrState.idr - 15 };
    const strongInstruments = priceInstruments(strongIdrState, BASE);
    const weakInstruments = priceInstruments(weakState, BASE);
    const usdCashStrong = strongInstruments.find((x) => x.name === 'USD cash')!;
    const usdCashWeak = weakInstruments.find((x) => x.name === 'USD cash')!;
    expect(usdCashWeak.realReturnPct).toBeGreaterThan(usdCashStrong.realReturnPct);
  });

  it('IDR weakness: raises NPL when corporate FX debt is high (driven end-to-end via dxy)', () => {
    const strongDollar = solveMacro({ ...BASE, fxDebt: 35, dxy: -15 });
    const weakDollar = solveMacro({ ...BASE, fxDebt: 35, dxy: 20 });
    expect(weakDollar.idr).toBeLessThan(strongDollar.idr); // higher dxy -> weaker IDR
    expect(weakDollar.npl).toBeGreaterThan(strongDollar.npl);
  });

  it('informal-sector share dampens unemployment sensitivity to the output gap', () => {
    // A tight policy rate creates a clearly negative output gap; informal share does not enter the
    // output-gap formula, so gap is identical across both runs — only the Okun damping differs.
    const tightPolicy = { ...BASE, i: 12 };
    const lowInformal = solveMacro({ ...tightPolicy, informal: 20 });
    const highInformal = solveMacro({ ...tightPolicy, informal: 78 });
    expect(lowInformal.gap).toBeCloseTo(highInformal.gap, 6);
    const lowInformalDeviation = Math.abs(lowInformal.u - 5.0);
    const highInformalDeviation = Math.abs(highInformal.u - 5.0);
    expect(highInformalDeviation).toBeLessThan(lowInformalDeviation);
  });

  it('a higher global real rate pushes gold and crypto down together', () => {
    const lowGlobalRate = solveMacro({ ...BASE, iFed: 1, piG: 2.6 });
    const highGlobalRate = solveMacro({ ...BASE, iFed: 8, piG: 2.6 });
    const lowInstruments = priceInstruments(lowGlobalRate, { ...BASE, iFed: 1, piG: 2.6 });
    const highInstruments = priceInstruments(highGlobalRate, { ...BASE, iFed: 8, piG: 2.6 });
    const goldLow = lowInstruments.find((x) => x.name === 'Gold')!.realReturnPct;
    const goldHigh = highInstruments.find((x) => x.name === 'Gold')!.realReturnPct;
    const btcLow = lowInstruments.find((x) => x.name === 'Crypto (BTC)')!.realReturnPct;
    const btcHigh = highInstruments.find((x) => x.name === 'Crypto (BTC)')!.realReturnPct;
    expect(goldHigh).toBeLessThan(goldLow);
    expect(btcHigh).toBeLessThan(btcLow);
  });
});
