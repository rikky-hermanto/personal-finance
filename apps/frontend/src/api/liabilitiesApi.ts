import { Liability } from '@/types/Liability';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getLiabilities(): Promise<Liability[]> {
  const res = await fetch(`${BASE}/api/liabilities`);
  if (!res.ok) throw new Error('Failed to fetch liabilities');
  return res.json();
}

export async function addLiability(data: Partial<Liability>): Promise<Liability> {
  const res = await fetch(`${BASE}/api/liabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add liability');
  return res.json();
}
