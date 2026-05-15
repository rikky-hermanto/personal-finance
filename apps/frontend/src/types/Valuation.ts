export interface Valuation {
  id: string;
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  valueNative: number;
  currency: string;
  fxRateToIdr: number;
  valueIdr: number;
  source: 'manual' | 'price_feed' | 'computed';
  notes?: string;
  valuedAt: string; // ISO 8601
}
