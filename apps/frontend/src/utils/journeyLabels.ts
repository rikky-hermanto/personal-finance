import type { IndicatorScore } from '@/types/Journey';

type LabelEntry = {
  headline: string;
  subtext: (i: IndicatorScore) => string;
};

export const JOURNEY_LABELS: Record<string, LabelEntry> = {
  spend_lt_income: {
    headline: 'Spending under income',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'On track' : 'Needs attention'}`,
  },
  bills_on_time: {
    headline: 'Bills paid on time',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'All on schedule' : 'Check pending bills'}`,
  },
  liquid_savings: {
    headline: '3-month emergency fund',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: 3.0 months of expenses`,
  },
  manageable_debt: {
    headline: 'Manageable debt level',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · DTI target < 36%`,
  },
  long_term_savings: {
    headline: 'Monthly investment habit',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: regular monthly investment`,
  },
  appropriate_insurance: {
    headline: 'Health insurance coverage',
    subtext: (i) => i.status === 'achieved' ? 'Coverage active' : 'Not yet tracked',
  },
  prime_credit: {
    headline: 'Good credit score',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: 850`,
  },
  passive_income: {
    headline: 'Passive income coverage',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · covers monthly expenses`,
  },
  plan_ahead: {
    headline: 'Long-term plan in place',
    subtext: (i) => i.status === 'achieved' ? 'Plan documented' : 'Not yet tracked',
  },
  wealth_target: {
    headline: 'Net worth target hit',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · progress toward target`,
  },
  estate_plan: {
    headline: 'Estate plan documented',
    subtext: (i) => i.status === 'achieved' ? 'Documented' : 'Not yet tracked',
  },
};

export function getJourneyLabel(code: string): LabelEntry {
  return JOURNEY_LABELS[code] ?? {
    headline: code.replace(/_/g, ' '),
    subtext: (i) => `Score ${i.score.toFixed(0)}/100`,
  };
}
