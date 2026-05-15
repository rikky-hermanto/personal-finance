import { Valuation } from './Valuation';

export type ValuationStrategy = 'RealTime' | 'Algorithmic' | 'Amortized' | 'Manual';
export type AssetClass =
  | 'cash' | 'investments' | 'fixed_income' | 'crypto'
  | 'real_estate' | 'tangibles' | 'vehicles' | 'receivables' | 'retirement';

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  accountId?: string;
  acquiredDate?: string;
  acquisitionCost?: number;
  currency: string;
  valuationStrategy: ValuationStrategy;
  metadata?: Record<string, unknown>;
  latestValuation?: Valuation; // joined server-side on GET
}
