const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7208';
const BASE_URL = `${API_BASE_URL}/api/investments`;

export interface InvestmentSetupDto {
  id: string;
  name: string;
  archetypeId: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentHoldingDto {
  id: string;
  setupId: string;
  ticker?: string;
  name: string;
  assetClass: string;
  sector?: string;
  allocationPct?: number;
  quantity?: number;
  avgBuyPrice?: number;
}

export interface InvestmentSnapshotDto {
  id: string;
  setupId: string;
  label: string;
  snapshotDate: string;
  totalValue?: number;
  currency: string;
  aiProvider: string;
  aiModel: string;
  analysisJson?: string;
  createdAt: string;
}

export interface CreateSetupBody {
  name: string;
  archetypeId: string;
  baseCurrency?: string;
}

export interface UpsertHoldingsBody {
  holdings: Omit<InvestmentHoldingDto, 'id' | 'setupId'>[];
}

export interface RunReviewBody {
  label: string;
  totalValue?: number;
  currency?: string;
  provider?: string;
  model?: string;
}

const json = (r: Response) => {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

export const listArchetypes = (): Promise<object[]> =>
  fetch(`${BASE_URL}/archetypes`).then(json);

export const listSetups = (): Promise<InvestmentSetupDto[]> =>
  fetch(`${BASE_URL}/setups`).then(json);

export const getSetup = (id: string): Promise<{ setup: InvestmentSetupDto; holdings: InvestmentHoldingDto[] }> =>
  fetch(`${BASE_URL}/setups/${id}`).then(json);

export const createSetup = (body: CreateSetupBody): Promise<InvestmentSetupDto> =>
  fetch(`${BASE_URL}/setups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json);

export const updateSetup = (id: string, body: CreateSetupBody): Promise<InvestmentSetupDto> =>
  fetch(`${BASE_URL}/setups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json);

export const deleteSetup = (id: string): Promise<void> =>
  fetch(`${BASE_URL}/setups/${id}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const upsertHoldings = (id: string, body: UpsertHoldingsBody): Promise<InvestmentHoldingDto[]> =>
  fetch(`${BASE_URL}/setups/${id}/holdings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json);

export const runReview = (id: string, body: RunReviewBody): Promise<InvestmentSnapshotDto> =>
  fetch(`${BASE_URL}/setups/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json);

export const getSnapshot = (setupId: string, snapshotId: string): Promise<InvestmentSnapshotDto> =>
  fetch(`${BASE_URL}/setups/${setupId}/snapshots/${snapshotId}`).then(json);
