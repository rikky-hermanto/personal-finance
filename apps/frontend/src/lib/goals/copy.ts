// Every user-facing Big Purchases string (PF-154 STEP 13), so compliance reviews one file.
// The 2.1-month and 29.6% figures are the scoring rubric's Cleared bars (scoring-rubric.md), not
// regulation. No tax or fee rate appears here (FIN-06): the cost helper names taxes without rates.
import type { FoundationCheck, Goal, GoalCategory, GateState, GoalPlanSummary, CostItemType } from '@/types/Goal';
import { formatDecimal, formatIdr, formatIdrShort, formatRatioPercent, isPositiveMoney } from './money';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-04" or "2027-04-30" → "Apr 2027". */
export function monthYear(value: string): string {
  const [y, m] = value.split('-');
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${y}` : '';
}

/** "2028-11-30" → "30 Nov 2028". A timestamp (achievedAt) is shown on the viewer's local calendar day. */
export function dayMonthYear(value: string): string {
  if (value.length > 10) {
    const t = new Date(value);
    if (!Number.isNaN(t.getTime())) return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  }
  const [y, m, d] = value.slice(0, 10).split('-');
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${Number(d)} ${MONTHS[idx]} ${y}` : '';
}

export const DISCLOSURE = 'A personal planning tool, not financial advice. Numbers come from what you entered.';

export const CATEGORIES: Record<GoalCategory, { label: string; hint: string; placeholder: string; breakdown: boolean }> = {
  house_land: { label: 'House or land', hint: 'A plot, a house or an apartment', placeholder: 'e.g. Land in Sleman', breakdown: true },
  vehicle: { label: 'Vehicle', hint: 'A car or a motorbike', placeholder: 'e.g. Family car', breakdown: true },
  education: { label: 'Education', hint: 'A degree, a course or school fees', placeholder: 'e.g. Master’s degree', breakdown: false },
  wedding: { label: 'Wedding', hint: 'The ceremony and the reception', placeholder: 'e.g. Our wedding', breakdown: false },
  other: { label: 'Other', hint: 'Travel, a pilgrimage, anything big', placeholder: 'Name this goal', breakdown: false },
};

export const CATEGORY_ORDER: GoalCategory[] = ['house_land', 'vehicle', 'education', 'wedding', 'other'];

export const COST_TYPES: Record<CostItemType, string> = {
  purchase_price: 'Purchase price',
  down_payment: 'Down payment',
  loan_principal: 'Loan principal',
  tax: 'Tax',
  fee: 'Fee',
  other: 'Other',
};

export const PRIORITY: Record<number, string> = { 1: 'Must happen', 2: 'Important', 3: 'Nice to have', 4: 'Someday' };

export const COPY = {
  pageIntro: 'Save for land, a car, a degree or a wedding without touching your cushion.',
  planTitle: 'Monthly plan',
  planMeta: 'Today’s prices · no returns assumed',
  checkTitle: 'Foundation check',
  goalsSorted: 'Sorted by priority, then date',
  newGoal: 'New goal',
  newBigPurchase: 'New big purchase',
  recordContribution: 'Record contribution',
  achievedEmpty: 'Goals you mark achieved or cancel land here.',
  guideTitle: 'How Big Purchases works',
  guideMeta: 'Your monthly plan shows here once you add a goal',
  guide: [
    { title: 'Name it and price it', body: 'Enter the cash you need. For a house or a car you can break the cost down; a loan is borrowed, so it is not cash you save.' },
    { title: 'Pick a month', body: 'You’ll see what to set aside each month to get there, at today’s prices.' },
    { title: 'Record what you set aside', body: 'Add money as you save. The Foundation check tells you whether your cushion is ready before you commit.' },
  ],
  guideCta: 'Plan your first big purchase',
  emptyGoalsTitle: 'Start with a goal',
  emptyGoalsMeta: 'The example shows what a goal looks like; it isn’t saved',
  // Fixed copy: 200.000.000 ÷ 24 rounded up, per formulas.md §9. Never computed at runtime.
  example: {
    name: 'Family car',
    meta: 'Vehicle · in 24 months',
    allocated: 'Rp 0',
    target: 'of Rp 200 jt',
    next: 'Rp 8.333.334 a month for 24 months',
    chip: 'Example',
    note: 'Each goal shows what you’ve set aside, the target, and the monthly amount that gets you there. This example isn’t saved.',
  },
  starterTitle: 'Start a goal',
  starterSub: 'What are you saving for?',
  checkSpend: 'Spending',
  checkCover: 'Cushion after goal money',
  checkDti: 'Debt payments',
  checkSpendBar: 'at most 89%',
  checkCoverBar: 'at least 2.1 months',
  checkDtiBar: 'at most 29.6%',
  checkCoverStale: 'Balance out of date',
  checkCoverMissing: 'Not recorded',
  checkDtiMissing: 'Debts not recorded',
  checkSpendMissing: 'Not recorded',
  checkLinkSavings: 'Update your savings balance',
  checkLinkDebts: 'Record your debts',
  contributionSavingsHint: 'Money in a savings account set aside for goals won’t count toward your emergency cushion.',
  assumptionPrices: 'Today’s prices; no investment returns assumed.',
  assumptionLongNoGrowth: 'This is more than 5 years away. Prices usually rise; you can add a price-growth assumption.',
  paceBeyond: 'At your recent pace this would take more than 50 years.',
  postDtiLabel: 'Estimate at your current take-home income, not a loan eligibility check.',
  costHelper:
    'Taxes and fees such as BPHTB, notary/PPAT, PPN on new property, BBNKB, PKB and opsen are set by regulation and your region. Enter the amounts from your quote or invoice; we don’t fill in rates.',
  costOtr: 'Check whether your OTR price already includes BBNKB and the first year’s PKB, so they aren’t counted twice.',
  costBorrowed: '· borrowed, not saved',
  costCashNeeded: 'Cash you need',
  costFullCost: 'Full cost including loan',
  achievedCta: 'Bought it? Record the property or vehicle, and any loan, in Assets.',
  formPreviewEmpty: 'Add an amount to see the monthly figure',
  formPastMonth: 'Pick this month or later.',
  nextPaused: 'Paused',
  nextOverdueHint: 'Set a new date to see a monthly amount.',
  nextNoDate: 'Set a target date',
} as const;

// ─── Gate ────────────────────────────────────────────────────────────────────

export const GATE_TITLE: Record<GateState, string> = {
  clear: 'Foundation checked',
  not_recommended_yet: 'Not recommended yet',
  not_evaluated: 'Not checked yet',
};

export const GATE_TONE: Record<GateState, 'success' | 'warning' | 'muted'> = {
  clear: 'success',
  not_recommended_yet: 'warning',
  not_evaluated: 'muted',
};

/** What each missing input asks the owner to record. Every code the API can send has text. */
export const MISSING_LABEL: Record<string, string> = {
  spend_lt_income: 'income and spending for the last 3 months',
  liquid_savings_ratio: 'a savings balance',
  savings_stale: 'an up-to-date savings balance',
  manageable_dti: 'your debts, or that you have none',
  post_purchase_dti: 'your debts, for the instalment estimate',
  computation_error: 'the check could not run just now; try again later',
};

export const FAILING_CODES = ['spend_lt_income', 'cover_after_earmarks', 'manageable_dti', 'post_purchase_dti'] as const;

export type GateVariant = 'page' | 'goal';

interface GateContext {
  foundation: FoundationCheck;
  state: GateState;
  failing: string[];
  missing: string[];
  variant: GateVariant;
  instalment?: string | null;
  postPurchaseDti?: string | null;
}

const thisPurchase = (v: GateVariant) => (v === 'page' ? 'a purchase' : 'this purchase');
const cover = (f: FoundationCheck) => (f.coverMonthsAfterEarmarks ? formatDecimal(f.coverMonthsAfterEarmarks, 1) : '0');
const dti = (f: FoundationCheck) => (f.currentDti ? formatRatioPercent(f.currentDti, 1) : '0');

/** One sentence per failing check, in a stable order. */
export function failingText(code: string, ctx: Omit<GateContext, 'state' | 'failing' | 'missing'>): string {
  const p = thisPurchase(ctx.variant);
  switch (code) {
    case 'cover_after_earmarks':
      return `By the Defense rule, your cushion covers ${cover(ctx.foundation)} months and the bar is 2.1. You can keep saving here; the rule asks you to finish your cushion before you commit to ${p}.`;
    case 'spend_lt_income':
      return `By the Foundations rule, your spending is above 89% of your income. Get it under the bar before you commit to ${p}.`;
    case 'manageable_dti':
      return `By the Defense rule, your debt payments are ${dti(ctx.foundation)}% of take-home income and the bar is 29.6%.`;
    case 'post_purchase_dti':
      return postDtiText(ctx.instalment ?? null, ctx.postPurchaseDti ?? null);
    default:
      return '';
  }
}

export function postDtiText(instalment: string | null, post: string | null): string {
  const amount = instalment ? formatIdr(instalment) : '';
  const pct = post ? formatRatioPercent(post, 1) : '';
  return `With an instalment of ${amount}, your debt payments would be about ${pct}% of your current take-home income. The Defense bar is 29.6%.`;
}

/** The gate body paragraphs for a state. Never "you can't", "blocked" or "denied" (compliance). */
export function gateBody(ctx: GateContext): string[] {
  const { state, failing, missing, variant, foundation } = ctx;
  if (state === 'clear') {
    return [
      `Your cushion (${cover(foundation)} months) and debt payments (${dti(foundation)}% of take-home income) are within the Defense bars. This checks your foundation, not whether ${thisPurchase(variant)} is right for you.`,
    ];
  }

  const out: string[] = [];
  if (state === 'not_recommended_yet') {
    for (const code of FAILING_CODES) if (failing.includes(code)) out.push(failingText(code, ctx));
  }
  if (missing.includes('savings_stale')) {
    out.push('Your savings balance is older than last month. Update it so the check uses today’s cushion.');
  }
  const rest = missing.filter((m) => m !== 'savings_stale');
  if (rest.length > 0) {
    out.push(
      `Record your savings balance and your debts, or confirm you have none, so we can check your foundation. (Missing: ${rest
        .map((m) => MISSING_LABEL[m] ?? m)
        .join('; ')})`,
    );
  }
  return out;
}

export function earmarkNote(amount: string): string {
  return `${formatIdr(amount)} set aside for goals is not counted as your cushion here.`;
}

// ─── Next step (formulas.md §9 timelines) ────────────────────────────────────

interface NextStepInput {
  timeline: Goal['timeline'] | 'no_target';
  monthlyNeeded: string | null;
  remaining: string;
  surplus: string;
  targetDate: string | null;
}

/** The short next-step line on cards, the drawer headline and the form preview. */
export function nextStep(g: NextStepInput): string {
  switch (g.timeline) {
    case 'scheduled':
      return `${formatIdr(g.monthlyNeeded ?? '0')} a month until ${g.targetDate ? monthYear(g.targetDate) : ''}`;
    case 'due_soon':
      return `${formatIdr(g.remaining)} needed by ${g.targetDate ? dayMonthYear(g.targetDate) : ''}`;
    case 'overdue':
      return `Target date passed, ${formatIdr(g.remaining)} still to go`;
    case 'no_date':
      return COPY.nextNoDate;
    case 'funded':
      return isPositiveMoney(g.surplus) ? `Fully funded (${formatIdr(g.surplus)} over)` : 'Fully funded';
    default:
      return COPY.formPreviewEmpty;
  }
}

export function assumptionLine(priceGrowthRate: string | null): string {
  return priceGrowthRate && isPositiveMoney(priceGrowthRate)
    ? `Includes your price-growth assumption of ${formatRatioPercent(priceGrowthRate, 1)}% a year.`
    : COPY.assumptionPrices;
}

export function paceLine(g: Pick<Goal, 'pacePerMonth' | 'paceReachMonth' | 'paceBeyondCap'>): string | null {
  if (g.paceBeyondCap) return COPY.paceBeyond;
  if (!g.pacePerMonth || !g.paceReachMonth) return null;
  return `At your average of ${formatIdr(g.pacePerMonth)} a month over the last 3 months, you’d reach this around ${monthYear(g.paceReachMonth)}. Arithmetic on your own entries, not a forecast.`;
}

// ─── Monthly plan ────────────────────────────────────────────────────────────

export function planSub(s: GoalPlanSummary): string {
  return `keeps ${s.scheduledCount} dated ${s.scheduledCount === 1 ? 'goal' : 'goals'} on time.`;
}

export function planOverdue(s: GoalPlanSummary): string | null {
  if (!isPositiveMoney(s.overdueRemaining) || s.overdueGoalNames.length === 0) return null;
  const verb = s.overdueGoalNames.length > 1 ? 'are' : 'is';
  return `${s.overdueGoalNames.join(', ')} ${verb} past due by ${formatIdrShort(s.overdueRemaining)}.`;
}

// ─── Contribution form ───────────────────────────────────────────────────────

export const contributionOverdrawn = (allocated: string) => `Only ${formatIdr(allocated)} is set aside for this goal.`;

export const contributionAfter = (allocatedAfter: string, percentAfter: string) =>
  `Becomes ${formatIdr(allocatedAfter)} · ${formatDecimal(percentAfter, 1)}%`;

export const goalMeta = (g: Pick<Goal, 'category' | 'targetDate'>) =>
  `${CATEGORIES[g.category].label}${g.targetDate ? ` · by ${monthYear(g.targetDate)}` : ' · no date'}`;

export const closedLine = (g: Pick<Goal, 'status' | 'achievedAt'>) =>
  g.status === 'achieved' ? `Achieved${g.achievedAt ? ` ${dayMonthYear(g.achievedAt)}` : ''}` : 'Cancelled';
