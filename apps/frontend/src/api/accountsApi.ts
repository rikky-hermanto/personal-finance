import { Account } from '@/types/Account';
import { Institution } from '@/types/Institution';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';

export async function getInstitutions(): Promise<Institution[]> {
  const res = await fetch(`${BASE}/api/accounts/institutions`);
  if (!res.ok) throw new Error('Failed to fetch institutions');
  return res.json();
}

export async function addInstitution(data: Partial<Institution>): Promise<Institution> {
  const res = await fetch(`${BASE}/api/accounts/institutions`, {
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

export async function updateInstitution(id: string, data: Partial<Institution>): Promise<Institution> {
  const res = await fetch(`${BASE}/api/accounts/institutions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update institution');
  return res.json();
}

export async function deleteInstitution(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/accounts/institutions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete institution');
}

export async function updateAccount(id: string, data: Partial<Account>): Promise<Account> {
  const res = await fetch(`${BASE}/api/accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update account');
  return res.json();
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete account');
}
