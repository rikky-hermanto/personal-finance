export interface Liability {
  id: string;
  name: string;
  liabilityType: 'revolving' | 'installment' | 'personal';
  accountId?: string;
  assetId?: string;
  principal: number;
  interestRate?: number;
  startDate: string;
  endDate?: string;
  monthlyPayment?: number;
  ltv?: number; // computed server-side, null if no linked asset
}
