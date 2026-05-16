import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndicatorScoreBar } from './IndicatorScoreBar';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';

interface Props {
  level: string;
  state: JourneyState;
}

function LevelStatus({ level, state }: Props) {
  const liveIndicators = state.indicators.filter((i) => i.level === level && i.status !== 'no_data');
  const isGraduated = liveIndicators.length > 0 && liveIndicators.every((i) => i.score >= 70);
  const isActive = level === `L${state.currentLevel}`;

  if (isGraduated) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (isActive)    return <CircleDot className="w-4 h-4 text-amber-500" />;
  return <Circle className="w-4 h-4 text-muted-foreground/40" />;
}

export const TierCard = ({ level, state }: Props) => {
  const meta = TIER_META[level];
  const levelScore = state.levelScores[level] ?? 0;
  const liveIndicators = state.indicators.filter((i) => i.level === level && i.status !== 'no_data');
  const isGraduated = liveIndicators.length > 0 && liveIndicators.every((i) => i.score >= 70);
  const isActive = level === `L${state.currentLevel}`;
  const isLocked = !isGraduated && !isActive && parseInt(level[1]) > state.currentLevel;

  const statusLabel = isGraduated ? 'Achieved' : isActive ? 'In Progress' : 'Not Started';
  const statusVariant = isGraduated ? 'default' : isActive ? 'secondary' : 'outline';

  return (
    <Card className={cn(
      'transition-colors',
      isActive && 'ring-1 ring-amber-300',
      isGraduated && 'ring-1 ring-emerald-300',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LevelStatus level={level} state={state} />
            <span className="font-semibold text-sm">{level} · {meta.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{levelScore.toFixed(0)} / 100</span>
            <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0">
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {state.indicators
          .filter((i) => i.level === level)
          .map((indicator) => (
            <IndicatorScoreBar key={indicator.code} indicator={indicator} compact />
          ))}

        {!isLocked && (
          <div className="pt-2">
            <Link
              to={meta.deeplink}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Open {meta.module} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
