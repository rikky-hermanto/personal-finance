import { Asset } from '@/types/Asset';
import { Holding } from '@/types/Holding';
import { Valuation } from '@/types/Valuation';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getAssets(): Promise<Asset[]> {
  const res = await fetch(`${BASE}/api/assets`);
  if (!res.ok) throw new Error('Failed to fetch assets');
  return res.json();
}

export async function getHoldings(): Promise<Holding[]> {
  const res = await fetch(`${BASE}/api/holdings`);
  if (!res.ok) throw new Error('Failed to fetch holdings');
  return res.json();
}

export async function addValuation(data: Partial<Valuation>): Promise<Valuation> {
  const res = await fetch(`${BASE}/api/valuations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add valuation');
  return res.json();
}
