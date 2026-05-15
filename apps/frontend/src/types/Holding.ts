import { Valuation } from './Valuation';

export interface Holding {
  id: string;
  accountId: string;
  ticker: string;
  quantity: number;
  costBasis: number;
  currency: string;
  latestValuation?: Valuation;
}
