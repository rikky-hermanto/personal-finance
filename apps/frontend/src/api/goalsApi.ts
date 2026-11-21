import { authenticatedFetch } from '@/api/authenticatedFetch';
import type {
  Goal,
  GoalContribution,
  GoalContributionPage,
  GoalContributionWrite,
  GoalCostItemInput,
  GoalPage,
  GoalPreview,
  GoalPreviewDraft,
  GoalUpdate,
  GoalWrite,
} from '@/types/Goal';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7209';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** A 400 from the API carries the validator's fixed sentence; surface it, never a stack trace (ERR-01). */
export class GoalApiError extends Error {}

async function read<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    let message = fallback;
    if (res.status === 400) {
      try {
        const body = await res.json();
        // The exception middleware writes ApiError with default (PascalCase) names.
        const text = body?.message ?? body?.Message;
        if (typeof text === 'string' && text) message = text;
      } catch {
        // keep the fallback
      }
    }
    throw new GoalApiError(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const send = (url: string, method: string, body?: unknown) =>
  authenticatedFetch(url, { method, headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });

export async function getGoals(params: { kind?: string; status: 'open' | 'closed'; page: number; pageSize?: number }): Promise<GoalPage> {
  const q = new URLSearchParams({ status: params.status, page: String(params.page), pageSize: String(params.pageSize ?? 50) });
  if (params.kind) q.set('kind', params.kind);
  return read(await authenticatedFetch(`${BASE}/api/goals?${q}`), 'Failed to fetch goals');
}

export async function getGoal(id: string): Promise<Goal> {
  return read(await authenticatedFetch(`${BASE}/api/goals/${id}`), 'Failed to fetch goal');
}

export async function previewGoal(draft: GoalPreviewDraft): Promise<GoalPreview> {
  return read(await send(`${BASE}/api/goals/preview`, 'POST', draft), 'Failed to preview goal');
}

export async function createGoal(data: GoalWrite): Promise<Goal> {
  return read(await send(`${BASE}/api/goals`, 'POST', data), 'Failed to create goal');
}

export async function updateGoal(id: string, data: GoalUpdate): Promise<Goal> {
  return read(await send(`${BASE}/api/goals/${id}`, 'PUT', data), 'Failed to save goal');
}

export async function deleteGoal(id: string): Promise<void> {
  return read(await send(`${BASE}/api/goals/${id}`, 'DELETE'), 'Failed to delete goal');
}

export async function replaceCostItems(id: string, items: GoalCostItemInput[]): Promise<Goal> {
  return read(await send(`${BASE}/api/goals/${id}/cost-items`, 'PUT', { items }), 'Failed to save the cost breakdown');
}

export async function getContributions(id: string, page: number, pageSize = 50): Promise<GoalContributionPage> {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return read(await authenticatedFetch(`${BASE}/api/goals/${id}/contributions?${q}`), 'Failed to fetch contributions');
}

export async function addContribution(id: string, data: GoalContributionWrite): Promise<GoalContribution> {
  return read(await send(`${BASE}/api/goals/${id}/contributions`, 'POST', data), 'Failed to record contribution');
}

export async function deleteContribution(id: string, contributionId: string): Promise<void> {
  return read(await send(`${BASE}/api/goals/${id}/contributions/${contributionId}`, 'DELETE'), 'Failed to delete contribution');
}

/** The full update body for a goal with one or more fields changed (status changes resend every field). */
export function toGoalUpdate(goal: Goal, overrides: Partial<GoalUpdate> = {}): GoalUpdate {
  return {
    category: goal.category,
    name: goal.name,
    notes: goal.notes,
    priority: goal.priority,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    priceGrowthRate: goal.priceGrowthRate,
    plannedMonthlyInstalment: goal.plannedMonthlyInstalment,
    status: goal.status,
    ...overrides,
  };
}
