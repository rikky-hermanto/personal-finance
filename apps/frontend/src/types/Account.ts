import { Valuation } from './Valuation';

export interface Account {
  id: string;
  institutionId?: string;
  name: string;
  accountType: string;
  currency: string;
  openingBalance: number;
  openingDate: string;
  isActive: boolean;
  includeInCashflow: boolean;
  color?: string;
  icon?: string;
  latestValuation?: Valuation;
}
