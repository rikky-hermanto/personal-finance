import { Asset } from '@/types/Asset';
import { Holding } from '@/types/Holding';
import { Valuation } from '@/types/Valuation';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getAssets(): Promise<Asset[]> {
  const res = await fetch(`${BASE}/api/assets`);
  if (!res.ok) throw new Error('Failed to fetch assets');
  return res.json();
}

export async function addAsset(data: Partial<Asset>): Promise<Asset> {
  const res = await fetch(`${BASE}/api/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add asset');
  return res.json();
}

export async function addHolding(data: Partial<Holding>): Promise<Holding> {
  const res = await fetch(`${BASE}/api/assets/holdings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add holding');
  return res.json();
}

export async function getHoldings(): Promise<Holding[]> {
  const res = await fetch(`${BASE}/api/assets/holdings`);
  if (!res.ok) throw new Error('Failed to fetch holdings');
  return res.json();
}

export async function addValuation(data: Partial<Valuation>): Promise<Valuation> {
  const res = await fetch(`${BASE}/api/assets/valuations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add valuation');
  return res.json();
}

export interface BulkValuationResult {
  succeeded: number;
  failed: { name: string; error: string }[];
}

export async function bulkAddValuations(
  rows: Partial<Valuation>[]
): Promise<BulkValuationResult> {
  const result: BulkValuationResult = { succeeded: 0, failed: [] };
  await Promise.all(
    rows.map(async (row) => {
      try {
        await addValuation(row);
        result.succeeded++;
      } catch (e) {
        result.failed.push({
          name: (row as { name?: string }).name ?? row.subjectId ?? '?',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );
  return result;
}
