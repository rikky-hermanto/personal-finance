const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export interface CommittedItem {
  key: string;
  name: string;
  amount: number;
  due: string;
  source: string;
  certain: boolean;
  paid: boolean;
  note?: string | null;
}

export interface WaterfallTierResult {
  kind: string;
  name: string;
  want: number;
  got: number;
  short: number;
}

export interface WaterfallResult {
  tiers: WaterfallTierResult[];
  stoppedAtTier: string | null;
  shortBy: number;
}

export interface EmergencyFundProgress {
  now: number;
  target: number;
  targetMonths: number;
}

export interface BucketsResponse {
  monthsAvailable: number;
  needsSetup: boolean;
  income: number;
  committed: number;
  futurePlanned: number;
  medianFree: number;
  softFloor: number;
  freeBudget: number;
  freeSpent: number;
  last7DayFreeSpend: number;
  day: number;
  daysInMonth: number;
  incomeArrivedThisMonth: number;
  variableIncome: boolean;
  incomeVariancePct: number;
  items: CommittedItem[];
  emergencyFund: EmergencyFundProgress;
  shortfall: WaterfallResult | null;
  incomeArrivedDate: string | null;
  biggestDriverCategory: string | null;
  biggestDriverAmount: number;
  biggestDriverUsual: number;
  watchCategories: string[];
}

export interface TransferMatch {
  date: string;
  from: string;
  to: string;
  amount: number;
}

export interface MonthClose {
  monthLabel: string;
  committedStreakMonths: number;
  allCommittedPaid: boolean;
  futurePlanned: number;
  futureActual: number;
  transfers: TransferMatch[];
  freeBudget: number;
  freeSpent: number;
  freeOverBy: number;
  biggestDriverCategory: string | null;
  biggestDriverAmount: number;
  biggestDriverUsual: number;
  suggestedNextFuture: number;
}

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const getBuckets = (): Promise<BucketsResponse> =>
  fetch(`${BASE}/api/buckets`).then(toJson<BucketsResponse>);

export const getMonthClose = (): Promise<MonthClose> =>
  fetch(`${BASE}/api/buckets/month-close`).then(toJson<MonthClose>);

export const setFuturePlan = (futureMonthlyAmount: number): Promise<BucketsResponse> =>
  fetch(`${BASE}/api/buckets/future-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ futureMonthlyAmount }),
  }).then(toJson<BucketsResponse>);

export const demoteCommittedItem = (itemKey: string): Promise<BucketsResponse> =>
  fetch(`${BASE}/api/buckets/committed-items/demote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemKey }),
  }).then(toJson<BucketsResponse>);
