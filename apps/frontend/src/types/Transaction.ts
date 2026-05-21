
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  flow?: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  bank: string;       // wallet text from AI service (transient)
  accountId?: string; // uuid of the linked account
  balance?: number;
  statementBalance?: number | null; // tie-breaker for dedup — must survive preview→submit round-trip
  isRecurring?: boolean;
  isDuplicate?: boolean;
}

export interface CategoryRule {
  id: number | string;
  keyword: string;
  category: string;
  type: 'income' | 'expense' | 'transfer';
  keywordLength?: number;
}

export interface MonthlySum {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

export type BankId = 'BCA' | 'Superbank' | 'NeoBank' | 'Wise' | 'Jago';

export interface WalletBalance {
  bankId: BankId;
  label: string;
  balance: number;
  currency: 'IDR' | 'USD';
  delta30d: number;
  sparkline: number[];
}
