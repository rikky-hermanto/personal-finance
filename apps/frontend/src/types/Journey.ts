export interface JourneyState {
  currentLevel: number;
  totalScore: number;
  levelScores: Record<string, number>;
  indicators: IndicatorScore[];
  achievements: Achievement[];
  lastComputedAt: string;
}

export interface IndicatorScore {
  code: string;
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  score: number;
  rawValue: number | null;
  status: 'achieved' | 'in_progress' | 'not_started' | 'no_data';
  displayName: string;
  description: string;
}

export interface Achievement {
  code: string;
  name: string;
  unlockedAt: string;
}

export interface Quest {
  title: string;
  description: string;
  targetIndicator: string;
  estimatedScoreGain: number;
  difficulty: 'easy' | 'medium' | 'hard';
  actionDeeplink: string | null;
}

export const TIER_META: Record<string, { label: string; color: string; deeplink: string; module: string }> = {
  L1: { label: 'Foundations', color: 'rgb(100 116 139)', deeplink: '/cashflow/overview',  module: 'Cashflow' },
  L2: { label: 'Defense',    color: 'rgb(76 175 80)',   deeplink: '/assets/accounts',    module: 'Assets' },
  L3: { label: 'Growth',     color: 'rgb(56 142 60)',   deeplink: '/investment/overview', module: 'Investment' },
  L4: { label: 'Freedom',    color: 'rgb(46 125 50)',   deeplink: '/investment/holdings', module: 'Investment' },
  L5: { label: 'Legacy',     color: 'rgb(27 94 32)',    deeplink: '/assets/overview',    module: 'Assets' },
};
