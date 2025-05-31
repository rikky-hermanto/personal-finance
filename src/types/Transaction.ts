
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  bank: string;
  balance?: number;
  isRecurring?: boolean;
}

export interface CategoryRule {
  id: string;
  keyword: string;
  category: string;
  type: 'income' | 'expense';
}

export interface MonthlySum {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}
