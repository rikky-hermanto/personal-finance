// PF-154 Big Purchases on the shared Goal model. Mirrors apps/api GoalDtos.cs.
// FIN-01: every money and rate field is a decimal string from the API. Never parse it into a number
// for arithmetic; format it with src/lib/goals/money.ts.

export type GoalCategory = 'house_land' | 'vehicle' | 'education' | 'wedding' | 'other';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'cancelled';
export type GoalTimeline = 'funded' | 'no_date' | 'overdue' | 'due_soon' | 'scheduled';
export type GateState = 'clear' | 'not_recommended_yet' | 'not_evaluated';
export type CostItemType = 'purchase_price' | 'down_payment' | 'loan_principal' | 'tax' | 'fee' | 'other';

export interface GoalCostItem {
  id: string;
  itemType: CostItemType;
  label: string;
  amount: string;
  sortOrder: number;
}

export interface GoalCostItemInput {
  itemType: CostItemType;
  label: string;
  amount: string;
}

export interface Goal {
  id: string;
  kind: string;
  tier: string;
  category: GoalCategory;
  name: string;
  notes: string | null;
  priority: number;
  recurrence: string;
  status: GoalStatus;
  achievedAt: string | null;
  colorIndex: number;

  targetAmount: string;
  effectiveTarget: string;
  totalCost: string | null;
  allocated: string;
  remaining: string;
  surplus: string;
  percentComplete: string;
  monthlyNeeded: string | null;
  priceGrowthRate: string | null;
  plannedMonthlyInstalment: string | null;
  pacePerMonth: string | null;
  postPurchaseDti: string | null;

  targetDate: string | null; // yyyy-MM-dd
  monthsLeft: number | null;
  timeline: GoalTimeline;
  paceReachMonth: string | null; // yyyy-MM
  paceBeyondCap: boolean;
  gateState: GateState | null;
  gateFailing: string[];
  gateMissing: string[];
  costItems: GoalCostItem[];
}

export interface FoundationCheck {
  state: GateState;
  spendRatio: string | null;
  coverMonthsAfterEarmarks: string | null;
  earmarkedInSavings: string;
  currentDti: string | null;
  failing: string[];
  missing: string[];
}

export interface GoalPlanSegment {
  goalId: string;
  name: string;
  colorIndex: number;
  allocated: string;
  effectiveTarget: string;
  percentComplete: string;
  barShare: string;
}

export interface GoalPlanSummary {
  monthlyTotal: string;
  scheduledCount: number;
  overdueRemaining: string;
  overdueGoalNames: string[];
  segments: GoalPlanSegment[];
}

export interface GoalPage {
  items: Goal[];
  total: number;
  page: number;
  pageSize: number;
  foundation: FoundationCheck;
  summary: GoalPlanSummary | null;
}

export interface GoalContribution {
  id: string;
  amount: string;
  contributedOn: string; // yyyy-MM-dd
  heldInAccountId: string | null;
  note: string | null;
}

export interface GoalContributionPage {
  items: GoalContribution[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GoalPreview {
  cashNeeded: string | null;
  totalCost: string | null;
  effectiveTarget: string;
  allocated: string;
  allocatedAfter: string;
  percentAfter: string;
  remaining: string;
  surplus: string;
  monthlyNeeded: string | null;
  monthsLeft: number | null;
  timeline: GoalTimeline | 'no_target';
  overdrawn: boolean;
}

export interface GoalPreviewDraft {
  goalId?: string;
  category?: GoalCategory;
  targetAmount?: string;
  costItems?: GoalCostItemInput[];
  targetDate?: string | null;
  priceGrowthRate?: string | null;
  contributionAmount?: string;
}

export interface GoalWrite {
  category: GoalCategory;
  name: string;
  notes: string | null;
  priority: number;
  targetAmount: string;
  targetDate: string | null;
  priceGrowthRate: string | null;
  plannedMonthlyInstalment: string | null;
}

export interface GoalUpdate extends GoalWrite {
  status: GoalStatus;
}

export interface GoalContributionWrite {
  amount: string;
  contributedOn: string;
  heldInAccountId: string | null;
  note: string | null;
}
