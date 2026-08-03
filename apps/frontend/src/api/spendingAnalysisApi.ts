const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

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

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const getVarianceExplainer = (accountId?: string): Promise<VarianceExplainer> =>
  fetch(`${BASE}/api/spending-analysis/variance${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`).then(toJson<VarianceExplainer>);
