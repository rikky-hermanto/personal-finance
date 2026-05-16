const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export interface SafeToSpend {
  amount: number;
  status: 'ok' | 'warning' | 'danger';
  daysRemaining: number;
  incomeBaseline: number;
  committedBillsRemaining: number;
  savingsGoal: number;
  alreadySpent: number;
}

export interface VarianceDriver {
  category: string;
  currentMonthSpend: number;
  trailingAvg: number;
  delta: number;
  isOneOff: boolean;
}

export interface VarianceExplainer {
  currentMonthTotal: number;
  trailingAvgTotal: number;
  delta: number;
  deltaPct: number;
  drivers: VarianceDriver[];
}

export const getSafeToSpend = (wallet?: string): Promise<SafeToSpend> =>
  fetch(`${BASE}/api/spending-analysis/safe-to-spend${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`).then(r => r.json());

export const getVarianceExplainer = (wallet?: string): Promise<VarianceExplainer> =>
  fetch(`${BASE}/api/spending-analysis/variance${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`).then(r => r.json());
