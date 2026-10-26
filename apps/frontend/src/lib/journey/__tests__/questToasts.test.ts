import { describe, expect, it } from 'vitest';
import { planCompletionToasts } from '@/lib/journey/questToasts';
import type { UnseenCompletion } from '@/types/Journey';

const item = (id: number, title: string, extra: Partial<UnseenCompletion> = {}): UnseenCompletion => ({
  ids: [id],
  code: 'l1.meet_your_money',
  rung: 0,
  title,
  completedAt: '2026-10-26T00:00:00Z',
  isBackfill: false,
  count: 1,
  ...extra,
});

describe('planCompletionToasts', () => {
  it('plans nothing for an empty list', () => {
    expect(planCompletionToasts([], new Set())).toEqual({ messages: [], ids: [] });
  });

  it('plans one message and its id for one completion', () => {
    expect(planCompletionToasts([item(7, 'Meet your money')], new Set())).toEqual({
      messages: ['Meet your money'],
      ids: [7],
    });
  });

  it('shows two titles and "+1 more" for three completions, and marks all three seen', () => {
    const plan = planCompletionToasts([item(1, 'A'), item(2, 'B'), item(3, 'C')], new Set());
    expect(plan.messages).toEqual(['A', 'B', '+1 more']);
    expect(plan.ids).toEqual([1, 2, 3]);
  });

  it('skips ids that were already announced (StrictMode runs effects twice)', () => {
    const plan = planCompletionToasts([item(1, 'A'), item(2, 'B')], new Set([1]));
    expect(plan.messages).toEqual(['B']);
    expect(plan.ids).toEqual([2]);
  });

  it('counts a folded backfill as one message with all of its ids', () => {
    const backfill = item(10, "You'd already completed 3 quests", {
      ids: [10, 11, 12],
      code: null,
      isBackfill: true,
      count: 3,
    });
    const plan = planCompletionToasts([backfill], new Set());
    expect(plan.messages).toEqual(["You'd already completed 3 quests"]);
    expect(plan.ids).toEqual([10, 11, 12]);
  });
});
