import { DeskMandateVersion, DeskPosition, DeskReconIssue, DeskState, MandateParams, MandatePreset } from '@/types/desk';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7209';
const BASE_URL = `${API_BASE_URL}/api/desk`;

export async function getDeskState(): Promise<DeskState> {
  const res = await fetch(`${BASE_URL}/state`);
  if (!res.ok) throw new Error('Failed to fetch desk state');
  return res.json();
}

export async function getMandateVersions(): Promise<DeskMandateVersion[]> {
  const res = await fetch(`${BASE_URL}/mandate/versions`);
  if (!res.ok) throw new Error('Failed to fetch mandate versions');
  return res.json();
}

export async function getMandatePresets(): Promise<MandatePreset[]> {
  const res = await fetch(`${BASE_URL}/mandate/presets`);
  if (!res.ok) throw new Error('Failed to fetch mandate presets');
  return res.json();
}

export interface SaveMandateDraftPayload {
  params: MandateParams;
  preset?: string | null;
  effectiveDate?: string | null;
  changeReason?: string | null;
}

export async function saveMandateDraft(payload: SaveMandateDraftPayload): Promise<DeskMandateVersion> {
  const res = await fetch(`${BASE_URL}/mandate/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save mandate draft');
  return res.json();
}

export interface ApproveMandatePayload {
  versionId: string;
  changeReason: string;
  reviewed: boolean;
}

export async function approveMandate(payload: ApproveMandatePayload): Promise<DeskMandateVersion> {
  const res = await fetch(`${BASE_URL}/mandate/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to approve mandate');
  return res.json();
}

export async function resolveReconIssue(id: string, resolution: string): Promise<DeskReconIssue> {
  const res = await fetch(`${BASE_URL}/recon/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution }),
  });
  if (!res.ok) throw new Error('Failed to resolve recon issue');
  return res.json();
}

export async function setPositionSleeve(id: string, sleeve: string): Promise<DeskPosition> {
  const res = await fetch(`${BASE_URL}/positions/${id}/sleeve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sleeve }),
  });
  if (!res.ok) throw new Error('Failed to set position sleeve');
  return res.json();
}
