export interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
  transactionCount: number;
}

export interface DashboardCurrentMonth {
  month: string;
  income: number;
  expenses: number;
  net: number;
  incomeChangePercent: number;
  expenseChangePercent: number;
  netChangePercent: number;
}

export interface DashboardTopCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface DashboardCashFlow {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  currentMonth: DashboardCurrentMonth;
  topCategories: DashboardTopCategory[];
  cashFlow: DashboardCashFlow[];
  lastUpdated: string;
}
