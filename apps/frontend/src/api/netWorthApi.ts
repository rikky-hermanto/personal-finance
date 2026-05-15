const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getNetWorthCurrent(): Promise<{ totalIdr: number }> {
  const res = await fetch(`${BASE}/api/networth/current`);
  if (!res.ok) throw new Error('Failed to fetch net worth');
  return res.json();
}

export async function getNetWorthHistory(from?: string, to?: string): Promise<Array<{
  date: string;
  totalIdr: number;
}>> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${BASE}/api/networth/history?${params}`);
  if (!res.ok) throw new Error('Failed to fetch net worth history');
  return res.json();
}

export async function getAllocationByClass(): Promise<Record<string, number>> {
  const res = await fetch(`${BASE}/api/networth/allocation`);
  if (!res.ok) throw new Error('Failed to fetch allocation');
  return res.json();
}
