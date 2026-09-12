import { cn } from '@/lib/utils';

export type StatTone = 'positive' | 'negative' | 'neutral' | 'warning';

const TONE_BORDER: Record<StatTone, string> = {
  positive: 'border-l-success',
  negative: 'border-l-destructive',
  warning: 'border-l-warning',
  neutral: 'border-l-border',
};

const TONE_TEXT: Record<StatTone, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  warning: 'text-warning',
  neutral: 'text-foreground',
};

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
}

const StatTile = ({ label, value, sub, tone = 'neutral' }: StatTileProps) => (
  <div className={cn('border-l-2 pl-2.5', TONE_BORDER[tone])}>
    <div className="text-[11px] text-muted-foreground mb-0.5">{label}</div>
    <div className={cn('font-data text-[15px] tabular-nums', TONE_TEXT[tone])}>{value}</div>
    {sub && <div className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

export default StatTile;
