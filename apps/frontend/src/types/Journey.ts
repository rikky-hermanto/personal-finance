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
  stars: 0 | 1 | 2 | 3;
}

export interface Achievement {
  code: string;
  name: string;
  unlockedAt: string;
}

export interface NoDebtsConfirmation {
  confirmedAt: string | null;
}

export interface QuestProgress {
  done: number;
  total: number;
  label: string;
}

export interface QuestCard {
  code: string;
  kind: 'discovery' | 'ladder';
  title: string;
  why: string;
  progress: QuestProgress | null;
  deeplink: string | null;
}

export interface LevelGoalGap {
  indicatorCode: string;
  label: string;
  stars: number;
}

export interface LevelGoal {
  level: string;
  title: string;
  notEvaluated: boolean;
  gaps: LevelGoalGap[];
}

export interface HarvestItem {
  code: string;
  glyph: string;
  title: string;
  line: string | null;
  count: number;
  completionIds: number[];
  isBackfill: boolean;
}

export interface Harvest {
  month: string | null; // "2026-09"
  title: string;
  basis: string | null;
  accountsCovered: number | null;
  accountsTotal: number | null;
  result: 'green' | 'red' | 'neutral' | null;
  resultLine: string | null;
  closing: string | null;
  gardenBefore: number;
  gardenAfter: number;
  items: HarvestItem[];
}

export interface Rhythm {
  current: number;
  longest: number;
}

export interface QuestBoard {
  catalogVersion: number;
  workingLevel: string;
  focus: QuestCard | null;
  offers: QuestCard[];
  levelGoal: LevelGoal | null;
  harvest: Harvest | null;
  rhythm: Rhythm;
}

export const TIER_META: Record<string, { label: string; color: string; deeplink: string; module: string }> = {
  L1: { label: 'Foundations', color: 'rgb(100 116 139)', deeplink: '/cashflow/overview',  module: 'Cashflow' },
  L2: { label: 'Defense',    color: 'rgb(76 175 80)',   deeplink: '/assets/accounts',    module: 'Assets' },
  L3: { label: 'Growth',     color: 'rgb(56 142 60)',   deeplink: '/investment/overview', module: 'Investment' },
  L4: { label: 'Freedom',    color: 'rgb(46 125 50)',   deeplink: '/investment/holdings', module: 'Investment' },
  L5: { label: 'Legacy',     color: 'rgb(27 94 32)',    deeplink: '/assets/overview',    module: 'Assets' },
};
