// Macro Scenario Lab — personalization mapping test suite (Fase 4).

import { describe, expect, it } from 'vitest';
import { estimateEmergencyFundRunway, estimateLiabilityImpact, mapPortfolioToWeights, mapSpendingToWeights } from '../personalization';
import { DEFAULT_PORTFOLIO_WEIGHTS } from '../instruments';
import type { Asset } from '@/types/Asset';
import type { Holding } from '@/types/Holding';
import type { Liability } from '@/types/Liability';
import type { VarianceDriver } from '@/api/spendingAnalysisApi';

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a1', name: 'Test asset', assetClass: 'cash', currency: 'IDR',
    valuationStrategy: 'Manual', ...overrides,
  };
}

function makeHolding(overrides: Partial<Holding>): Holding {
  return { id: 'h1', accountId: 'acc1', ticker: 'BBCA', quantity: 100, costBasis: 9000, currency: 'IDR', ...overrides };
}

describe('mapPortfolioToWeights', () => {
  it('falls back to default weights for an empty portfolio', () => {
    const result = mapPortfolioToWeights([], []);
    expect(result.source).toBe('default');
    expect(result.weights).toEqual(DEFAULT_PORTFOLIO_WEIGHTS);
  });

  it('uses personal weights for a single mapped asset', () => {
    const asset = makeAsset({ assetClass: 'real_estate', latestValuation: { id: 'v1', subjectType: 'asset', subjectId: 'a1', valueNative: 1_000_000_000, currency: 'IDR', fxRateToIdr: 1, valueIdr: 1_000_000_000, source: 'manual', valuedAt: '2026-01-01' } });
    const result = mapPortfolioToWeights([], [asset]);
    expect(result.source).toBe('personal');
    expect(result.weights['Property']).toBe(1_000_000_000);
    expect(result.unmappedAssetClasses).toEqual([]);
  });

  it('excludes out-of-taxonomy asset classes instead of guessing a bucket', () => {
    const vehicle = makeAsset({ id: 'a2', assetClass: 'vehicles', latestValuation: { id: 'v2', subjectType: 'asset', subjectId: 'a2', valueNative: 300_000_000, currency: 'IDR', fxRateToIdr: 1, valueIdr: 300_000_000, source: 'manual', valuedAt: '2026-01-01' } });
    const property = makeAsset({ id: 'a3', assetClass: 'real_estate', latestValuation: { id: 'v3', subjectType: 'asset', subjectId: 'a3', valueNative: 900_000_000, currency: 'IDR', fxRateToIdr: 1, valueIdr: 900_000_000, source: 'manual', valuedAt: '2026-01-01' } });
    const result = mapPortfolioToWeights([], [vehicle, property]);
    expect(result.source).toBe('personal');
    expect(result.unmappedAssetClasses).toEqual(['vehicles']);
    expect(result.unmappedValueIdr).toBe(300_000_000);
    expect(result.weights['Property']).toBe(900_000_000);
    expect(Object.prototype.hasOwnProperty.call(result.weights, 'vehicles')).toBe(false);
  });

  it('routes a foreign-currency holding to global equities, not IHSG', () => {
    const holding = makeHolding({
      ticker: 'AAPL',
      latestValuation: { id: 'v4', subjectType: 'holding', subjectId: 'h1', valueNative: 5000, currency: 'USD', fxRateToIdr: 15800, valueIdr: 79_000_000, source: 'price_feed', valuedAt: '2026-01-01' },
    });
    const result = mapPortfolioToWeights([holding], []);
    expect(result.weights['Global equities (DM)']).toBe(79_000_000);
    expect(result.weights['Indonesian equities (IHSG)']).toBeUndefined();
  });
});

describe('mapSpendingToWeights', () => {
  it('falls back to the default household basket with too few categories', () => {
    const drivers: VarianceDriver[] = [{ category: 'Groceries', currentMonthSpend: 1_000_000, trailingAvg: 900_000, delta: 100_000, isOneOff: false }];
    const result = mapSpendingToWeights(drivers);
    expect(result.source).toBe('default');
  });

  it('derives personal weights from trailing category spend', () => {
    const drivers: VarianceDriver[] = [
      { category: 'Groceries', currentMonthSpend: 2_000_000, trailingAvg: 2_000_000, delta: 0, isOneOff: false },
      { category: 'Transportation', currentMonthSpend: 500_000, trailingAvg: 500_000, delta: 0, isOneOff: false },
      { category: 'Entertainment', currentMonthSpend: 500_000, trailingAvg: 500_000, delta: 0, isOneOff: false },
    ];
    const result = mapSpendingToWeights(drivers);
    expect(result.source).toBe('personal');
    expect(result.weights.food).toBeCloseTo(2_000_000 / 3_000_000, 6);
    expect(result.weights.fuel).toBeCloseTo(500_000 / 3_000_000, 6);
    expect(result.weights.core).toBeCloseTo(500_000 / 3_000_000, 6);
    expect(result.weights.rent).toBe(0);
    const sum = result.weights.food + result.weights.rent + result.weights.fuel + result.weights.core;
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('estimateLiabilityImpact', () => {
  function makeLiability(overrides: Partial<Liability>): Liability {
    return { id: 'l1', name: 'KPR', liabilityType: 'installment', principal: 500_000_000, startDate: '2024-01-01', ...overrides };
  }

  it('returns zero impact when there are no rate-bearing liabilities', () => {
    const result = estimateLiabilityImpact([], 4.75, 6.75);
    expect(result.totalMonthlyDeltaIdr).toBe(0);
    expect(result.perLiability).toEqual([]);
  });

  it('scales the payment delta with the rate change and flags the floating-rate assumption', () => {
    const liability = makeLiability({ interestRate: 8, monthlyPayment: 5_000_000 });
    const result = estimateLiabilityImpact([liability], 4.75, 6.75);
    expect(result.totalMonthlyDeltaIdr).toBeCloseTo((500_000_000 * 2) / 100 / 12, 6);
    expect(result.assumptionNote).toMatch(/floating/i);
  });
});

describe('estimateEmergencyFundRunway', () => {
  it('shortens runway when scenario inflation raises the cost of living', () => {
    const result = estimateEmergencyFundRunway(60_000_000, 10_000_000, 6, 20);
    expect(result.scenarioMonthlyCostIdr).toBeCloseTo(12_000_000, 6);
    expect(result.scenarioMonths).toBeLessThan(result.todayMonths);
  });
});
