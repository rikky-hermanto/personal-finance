import { Account } from '@/types/Account';
import { Institution } from '@/types/Institution';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getInstitutions(): Promise<Institution[]> {
  const res = await fetch(`${BASE}/api/institutions`);
  if (!res.ok) throw new Error('Failed to fetch institutions');
  return res.json();
}

export async function addInstitution(data: Partial<Institution>): Promise<Institution> {
  const res = await fetch(`${BASE}/api/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add institution');
  return res.json();
}

export async function getAccounts(): Promise<Account[]> {
  const res = await fetch(`${BASE}/api/accounts`);
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

export async function addAccount(data: Partial<Account>): Promise<Account> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add account');
  return res.json();
}
