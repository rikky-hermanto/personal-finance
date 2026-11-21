import { describe, expect, it } from 'vitest';
import type { FoundationCheck, GoalPlanSummary } from '@/types/Goal';
import {
  COPY,
  DISCLOSURE,
  FAILING_CODES,
  GATE_TITLE,
  MISSING_LABEL,
  closedLine,
  contributionAfter,
  contributionOverdrawn,
  dayMonthYear,
  earmarkNote,
  failingText,
  gateBody,
  monthYear,
  nextStep,
  paceLine,
  planOverdue,
  planSub,
} from './copy';
import * as copy from './copy';

const foundation: FoundationCheck = {
  state: 'clear',
  spendRatio: '0.68',
  coverMonthsAfterEarmarks: '1.63',
  earmarkedInSavings: '0',
  currentDti: '0.082',
  failing: [],
  missing: [],
};

describe('dates', () => {
  it('formats Mon YYYY and D Mon YYYY', () => {
    expect(monthYear('2027-04')).toBe('Apr 2027');
    expect(monthYear('2028-11-30')).toBe('Nov 2028');
    expect(dayMonthYear('2028-11-30')).toBe('30 Nov 2028');
    expect(dayMonthYear('2026-11-09T05:00:00Z')).toBe('9 Nov 2026');
  });
});

describe('gate', () => {
  it('maps each state to its title', () => {
    expect(GATE_TITLE.clear).toBe('Foundation checked');
    expect(GATE_TITLE.not_recommended_yet).toBe('Not recommended yet');
    expect(GATE_TITLE.not_evaluated).toBe('Not checked yet');
  });

  it('says the clear check is about the foundation, not the purchase', () => {
    const page = gateBody({ foundation, state: 'clear', failing: [], missing: [], variant: 'page' });
    const goal = gateBody({ foundation, state: 'clear', failing: [], missing: [], variant: 'goal' });
    expect(page[0]).toContain('not whether a purchase is right for you');
    expect(goal[0]).toContain('not whether this purchase is right for you');
    expect(page[0]).toContain('1.6 months');
    expect(page[0]).toContain('8.2%');
  });

  it('has text for every failing code', () => {
    for (const code of FAILING_CODES) {
      expect(failingText(code, { foundation, variant: 'goal', instalment: '5000000', postPurchaseDti: '0.34' })).not.toBe('');
    }
  });

  it('anchors not recommended to the app rule', () => {
    const body = gateBody({ foundation, state: 'not_recommended_yet', failing: ['cover_after_earmarks', 'manageable_dti'], missing: [], variant: 'page' });
    expect(body[0]).toMatch(/^By the Defense rule/);
    expect(body).toHaveLength(2);
  });

  it('has a label for every missing code', () => {
    for (const code of ['spend_lt_income', 'liquid_savings_ratio', 'savings_stale', 'manageable_dti', 'post_purchase_dti', 'computation_error']) {
      expect(MISSING_LABEL[code]).toBeTruthy();
    }
    const body = gateBody({ foundation, state: 'not_evaluated', failing: [], missing: ['savings_stale', 'manageable_dti'], variant: 'page' });
    expect(body[0]).toContain('older than last month');
    expect(body[1]).toContain('your debts, or that you have none');
  });

  it('never uses blocking language', () => {
    const all = JSON.stringify(copy);
    expect(all).not.toMatch(/you can't|you cannot|blocked|denied/i);
  });

  it('names taxes but quotes no rate', () => {
    expect(COPY.costHelper).toContain('BPHTB');
    expect(COPY.costHelper + COPY.costOtr).not.toMatch(/\d+(\.\d+)?\s?%/);
  });

  it('formats the earmark note', () => {
    expect(earmarkNote('12000000')).toBe('Rp 12.000.000 set aside for goals is not counted as your cushion here.');
  });
});

describe('next step', () => {
  const base = { monthlyNeeded: null, remaining: '0', surplus: '0', targetDate: null };

  it('covers every timeline', () => {
    expect(nextStep({ ...base, timeline: 'scheduled', monthlyNeeded: '8333334', targetDate: '2028-11-30' }))
      .toBe('Rp 8.333.334 a month until Nov 2028');
    expect(nextStep({ ...base, timeline: 'due_soon', remaining: '5000000', targetDate: '2026-11-30' }))
      .toBe('Rp 5.000.000 needed by 30 Nov 2026');
    expect(nextStep({ ...base, timeline: 'overdue', remaining: '750000' })).toBe('Target date passed, Rp 750.000 still to go');
    expect(nextStep({ ...base, timeline: 'no_date' })).toBe('Set a target date');
    expect(nextStep({ ...base, timeline: 'funded', surplus: '20000000' })).toBe('Fully funded (Rp 20.000.000 over)');
    expect(nextStep({ ...base, timeline: 'funded', surplus: '0.00' })).toBe('Fully funded');
    expect(nextStep({ ...base, timeline: 'no_target' })).toBe(COPY.formPreviewEmpty);
  });

  it('shows pace only when computable', () => {
    expect(paceLine({ pacePerMonth: null, paceReachMonth: null, paceBeyondCap: false })).toBeNull();
    expect(paceLine({ pacePerMonth: '1', paceReachMonth: null, paceBeyondCap: true })).toBe(COPY.paceBeyond);
    expect(paceLine({ pacePerMonth: '8000000', paceReachMonth: '2027-04', paceBeyondCap: false })).toContain('around Apr 2027');
  });
});

describe('plan and forms', () => {
  const summary: GoalPlanSummary = { monthlyTotal: '0', scheduledCount: 2, overdueRemaining: '0', overdueGoalNames: [], segments: [] };

  it('words the monthly plan', () => {
    expect(planSub(summary)).toBe('keeps 2 dated goals on time.');
    expect(planSub({ ...summary, scheduledCount: 1 })).toBe('keeps 1 dated goal on time.');
    expect(planOverdue(summary)).toBeNull();
    expect(planOverdue({ ...summary, overdueRemaining: '12300000', overdueGoalNames: ['Wedding'] })).toBe('Wedding is past due by Rp 12,3 jt.');
    expect(planOverdue({ ...summary, overdueRemaining: '1', overdueGoalNames: ['A', 'B'] })).toContain('are past due');
  });

  it('words the contribution form', () => {
    expect(contributionOverdrawn('50000000')).toBe('Only Rp 50.000.000 is set aside for this goal.');
    expect(contributionAfter('100000000', '50.0')).toBe('Becomes Rp 100.000.000 · 50%');
  });

  it('words closed goals and the disclosure', () => {
    expect(closedLine({ status: 'achieved', achievedAt: '2026-11-09T03:00:00Z' })).toBe('Achieved 9 Nov 2026');
    expect(closedLine({ status: 'cancelled', achievedAt: null })).toBe('Cancelled');
    expect(DISCLOSURE).toBe('A personal planning tool, not financial advice. Numbers come from what you entered.');
  });
});
