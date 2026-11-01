import { authenticatedFetch } from '@/api/authenticatedFetch';
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export interface NetWorthSummary {
  netWorthIdr: number;
  assetsIdr: number;
  liabilitiesIdr: number;
  liquidIdr: number;
}

/** Balance sheet at the end of one day that has a valuation; every subject's latest value carried forward. */
export interface NetWorthPoint {
  date: string;
  valueIdr: number;
  assetsIdr: number;
  liabilitiesIdr: number;
}

export async function getNetWorthCurrent(): Promise<NetWorthSummary> {
  const res = await authenticatedFetch(`${BASE}/api/networth/current`);
  if (!res.ok) throw new Error('Failed to fetch net worth');
  return res.json();
}

export async function getNetWorthHistory(from?: string, to?: string): Promise<NetWorthPoint[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await authenticatedFetch(`${BASE}/api/networth/history?${params}`);
  if (!res.ok) throw new Error('Failed to fetch net worth history');
  return res.json();
}

export async function getAllocationByClass(): Promise<Record<string, number>> {
  const res = await authenticatedFetch(`${BASE}/api/networth/allocation`);
  if (!res.ok) throw new Error('Failed to fetch allocation');
  return res.json();
}
