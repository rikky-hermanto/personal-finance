// Macro Scenario Lab — personalization mapping layer (Fase 2).
// Framework-free: only `import type` from the app's data-shape modules, no React/DOM, no fetch calls.
// This is what makes the Lab answer "what does this mean for ME" instead of just running the generic
// model. Every mapping here has an explicit, labeled fallback for when real data is missing or thin —
// silently guessing would be exactly the "wrong number that looks plausible" governance forbids.

import type { Asset } from '@/types/Asset';
import type { Holding } from '@/types/Holding';
import type { Liability } from '@/types/Liability';
import type { VarianceDriver } from '@/api/spendingAnalysisApi';
import type { SpendingWeights } from './solver';
import { DEFAULT_PORTFOLIO_WEIGHTS } from './instruments';
import { CPI_BOTTOM_CORE_WEIGHT, CPI_BOTTOM_FOOD_WEIGHT, CPI_BOTTOM_FUEL_WEIGHT, CPI_BOTTOM_RENT_WEIGHT } from './constants';

// ── Portfolio → macro instrument weights ────────────────────────────────────

export interface PortfolioContribution {
  sourceLabel: string; // e.g. the holding's ticker or the asset's name
  instrument: string | null; // null when unmapped
  valueIdr: number;
}

export interface PersonalPortfolioMapping {
  weights: Record<string, number>;
  source: 'personal' | 'default';
  totalMappedValueIdr: number;
  unmappedValueIdr: number;
  unmappedAssetClasses: string[];
  contributions: PortfolioContribution[];
}

const ASSET_CLASS_TO_INSTRUMENT: Partial<Record<Asset['assetClass'], string>> = {
  cash: 'IDR deposits',
  fixed_income: 'Government bonds (SBN)',
  real_estate: 'Property',
  crypto: 'Crypto (BTC)',
  investments: 'Indonesian equities (IHSG)',
};

/** Minimum mapped value, as a fraction of total net worth examined, before we trust a real-portfolio weighting. */
const MIN_MAPPED_COVERAGE = 0.05;

function instrumentForHolding(h: Holding): string {
  const ccy = h.latestValuation?.currency ?? h.currency;
  return ccy && ccy.toUpperCase() !== 'IDR' ? 'Global equities (DM)' : 'Indonesian equities (IHSG)';
}

function instrumentForAsset(a: Asset): string | null {
  const override = typeof a.metadata?.macroClass === 'string' ? (a.metadata.macroClass as string) : null;
  if (override && Object.prototype.hasOwnProperty.call(DEFAULT_PORTFOLIO_WEIGHTS, override)) return override;
  if (a.assetClass === 'cash' && a.currency && a.currency.toUpperCase() !== 'IDR') return 'USD cash';
  return ASSET_CLASS_TO_INSTRUMENT[a.assetClass] ?? null;
}

/**
 * Maps a user's real holdings + assets onto the model's 10 macro instrument classes.
 * Compressed mapping (see PF-140 plan Notes): the app's `AssetClass` taxonomy is coarser than the
 * reference model's 10 classes, so this maps to what the data actually supports rather than
 * guessing at a finer split. Anything outside the taxonomy (vehicles, tangibles, receivables,
 * retirement) is excluded and reported, not silently folded into an arbitrary bucket.
 */
export function mapPortfolioToWeights(holdings: Holding[], assets: Asset[]): PersonalPortfolioMapping {
  const contributions: PortfolioContribution[] = [];
  const weights: Record<string, number> = {};
  let totalMappedValueIdr = 0;
  let unmappedValueIdr = 0;
  const unmappedAssetClasses = new Set<string>();

  for (const h of holdings) {
    const valueIdr = h.latestValuation?.valueIdr ?? 0;
    const instrument = instrumentForHolding(h);
    contributions.push({ sourceLabel: h.ticker, instrument, valueIdr });
    weights[instrument] = (weights[instrument] ?? 0) + valueIdr;
    totalMappedValueIdr += valueIdr;
  }

  for (const a of assets) {
    const valueIdr = a.latestValuation?.valueIdr ?? 0;
    const instrument = instrumentForAsset(a);
    contributions.push({ sourceLabel: a.name, instrument, valueIdr });
    if (instrument) {
      weights[instrument] = (weights[instrument] ?? 0) + valueIdr;
      totalMappedValueIdr += valueIdr;
    } else {
      unmappedValueIdr += valueIdr;
      unmappedAssetClasses.add(a.assetClass);
    }
  }

  const totalExamined = totalMappedValueIdr + unmappedValueIdr;
  const coverage = totalExamined > 0 ? totalMappedValueIdr / totalExamined : 0;

  if (totalMappedValueIdr <= 0 || coverage < MIN_MAPPED_COVERAGE) {
    return {
      weights: DEFAULT_PORTFOLIO_WEIGHTS,
      source: 'default',
      totalMappedValueIdr,
      unmappedValueIdr,
      unmappedAssetClasses: Array.from(unmappedAssetClasses),
      contributions,
    };
  }

  return { weights, source: 'personal', totalMappedValueIdr, unmappedValueIdr, unmappedAssetClasses: Array.from(unmappedAssetClasses), contributions };
}

// ── Spending categories → felt-inflation weights ────────────────────────────

export interface PersonalSpendingMapping {
  weights: SpendingWeights;
  source: 'personal' | 'default';
  windowLabel: string;
}

const FOOD_CATEGORIES = new Set(['groceries', 'food & dining']);
const FUEL_CATEGORIES = new Set(['transportation']);
const RENT_PATTERN = /rent|housing|mortgage|sewa|kontrak|kos\b/i;

/** Minimum number of non-zero trailing categories before we trust a personal spending mix over the default. */
const MIN_DRIVER_COUNT = 2;

/**
 * Maps the user's trailing spending-by-category mix onto the model's food/rent/fuel/core household
 * basket. Uses the existing 3-month trailing average from /api/spending-analysis/variance — the app
 * has no 12-month category aggregation endpoint today, so this is a deliberately shorter, honestly
 * labeled window rather than a new 12-month endpoint built just for this feature (see PF-140 Notes).
 */
export function mapSpendingToWeights(drivers: VarianceDriver[]): PersonalSpendingMapping {
  const nonZero = drivers.filter((d) => d.trailingAvg > 0);
  if (nonZero.length < MIN_DRIVER_COUNT) {
    return {
      weights: { food: CPI_BOTTOM_FOOD_WEIGHT, rent: CPI_BOTTOM_RENT_WEIGHT, fuel: CPI_BOTTOM_FUEL_WEIGHT, core: CPI_BOTTOM_CORE_WEIGHT },
      source: 'default',
      windowLabel: 'default household basket (not enough transaction history yet)',
    };
  }

  let food = 0, rent = 0, fuel = 0, core = 0;
  for (const d of nonZero) {
    const key = d.category.toLowerCase();
    if (FOOD_CATEGORIES.has(key)) food += d.trailingAvg;
    else if (FUEL_CATEGORIES.has(key)) fuel += d.trailingAvg;
    else if (RENT_PATTERN.test(d.category)) rent += d.trailingAvg;
    else core += d.trailingAvg;
  }
  const total = food + rent + fuel + core;
  if (total <= 0) {
    return {
      weights: { food: CPI_BOTTOM_FOOD_WEIGHT, rent: CPI_BOTTOM_RENT_WEIGHT, fuel: CPI_BOTTOM_FUEL_WEIGHT, core: CPI_BOTTOM_CORE_WEIGHT },
      source: 'default',
      windowLabel: 'default household basket (not enough transaction history yet)',
    };
  }
  return {
    weights: { food: food / total, rent: rent / total, fuel: fuel / total, core: core / total },
    source: 'personal',
    windowLabel: 'based on your last 3 months of spending',
  };
}

// ── Liabilities → monthly payment impact ────────────────────────────────────

export interface LiabilityImpact {
  id: string;
  name: string;
  currentMonthlyPaymentIdr: number | null;
  estimatedMonthlyDeltaIdr: number;
}

export interface LiabilityImpactSummary {
  totalMonthlyDeltaIdr: number;
  perLiability: LiabilityImpact[];
  assumptionNote: string;
}

/**
 * Approximates how a policy-rate move changes monthly payments on rate-sensitive liabilities.
 * The schema doesn't distinguish fixed vs. floating rate today (see PF-140 plan Notes, Gap #2), so
 * every liability with an interestRate is treated as floating and flagged with an explicit caveat —
 * this is deliberately NOT applied silently. Uses a simple-interest approximation on principal
 * (principal * rateDeltaPct / 100 / 12) rather than a full amortization recompute, since the model
 * doesn't have original loan term data to do that reliably.
 */
export function estimateLiabilityImpact(liabilities: Liability[], baselineRateI: number, scenarioRateI: number): LiabilityImpactSummary {
  const rateDeltaPct = scenarioRateI - baselineRateI;
  const perLiability: LiabilityImpact[] = liabilities
    .filter((l) => l.interestRate != null && l.principal > 0)
    .map((l) => ({
      id: l.id,
      name: l.name,
      currentMonthlyPaymentIdr: l.monthlyPayment ?? null,
      estimatedMonthlyDeltaIdr: (l.principal * rateDeltaPct) / 100 / 12,
    }));
  return {
    totalMonthlyDeltaIdr: perLiability.reduce((sum, l) => sum + l.estimatedMonthlyDeltaIdr, 0),
    perLiability,
    assumptionNote: 'Assumes floating-rate exposure on the full principal — this app does not yet distinguish fixed from floating-rate liabilities. Treat as directional, not exact.',
  };
}

// ── Emergency fund runway under a scenario ──────────────────────────────────

export interface EmergencyFundImpact {
  todayMonths: number;
  scenarioMonths: number;
  scenarioMonthlyCostIdr: number;
}

/**
 * Recomputes emergency-fund runway using the scenario's felt inflation applied to today's monthly
 * cost of living, instead of today's cost — a fund that covers 6 months today may cover fewer once
 * prices in the scenario are higher.
 */
export function estimateEmergencyFundRunway(
  emergencyFundNowIdr: number,
  todayMonthlyCostIdr: number,
  todayRunwayMonths: number,
  scenarioFeltInflationPct: number,
): EmergencyFundImpact {
  const scenarioMonthlyCostIdr = todayMonthlyCostIdr * (1 + scenarioFeltInflationPct / 100);
  const scenarioMonths = scenarioMonthlyCostIdr > 0 ? emergencyFundNowIdr / scenarioMonthlyCostIdr : todayRunwayMonths;
  return { todayMonths: todayRunwayMonths, scenarioMonths, scenarioMonthlyCostIdr };
}
