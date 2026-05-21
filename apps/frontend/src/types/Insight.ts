export type InsightSeverity = 'info' | 'win' | 'warning' | 'alert' | 'streak_break';

export interface Insight {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  metricLabel?: string;
  metricValue?: number;
  category?: string;
  actionType?: 'navigate' | null;
  actionTarget?: string | null;
  validUntil: string;
}

export interface DailyPulse {
  headline: string;
  tone: 'positive' | 'neutral' | 'caution';
  monthProgress: number;
  paceVsBaseline?: number | null;
}
