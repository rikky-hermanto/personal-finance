import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndicatorScoreBar } from './IndicatorScoreBar';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';
import { getJourneyLabel } from '@/utils/journeyLabels';

interface Props {
  level: string;
  state: JourneyState;
}

export const TierCard = ({ level, state }: Props) => {
  const meta = TIER_META[level];
  const levelScore = state.levelScores[level] ?? 0;
  const liveIndicators = state.indicators.filter((i) => i.level === level && i.status !== 'no_data');
  const isGraduated = liveIndicators.length > 0 && liveIndicators.every((i) => i.score >= 70);
  const isActive = level === `L${state.currentLevel}`;
  const isLocked = !isGraduated && !isActive && parseInt(level[1]) > state.currentLevel;

  const statusLabel = isGraduated ? 'Achieved' : isActive ? 'In Progress' : 'Not Started';

  // Non-active levels: compact single-line row, visually receded
  if (!isActive) {
    return (
      <div
        id={`tier-card-${level}`}
        className={cn(
          'flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors',
          isGraduated
            ? 'bg-emerald-50/50 border-emerald-200/60'
            : 'bg-muted/30 border-border/50 opacity-50',
        )}
      >
        <div className="flex items-center gap-2.5">
          {isGraduated
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            : <Circle className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />}
          <span className={cn(
            'text-sm font-medium',
            isGraduated ? 'text-foreground/70' : 'text-muted-foreground/60',
          )}>
            {level} · {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground/60 tabular-nums">
            {levelScore.toFixed(0)}/100
          </span>
          {isGraduated && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-300 text-emerald-700">
              {statusLabel}
            </Badge>
          )}
          {isLocked && (
            <span className="text-[9px] text-muted-foreground/40">Locked</span>
          )}
        </div>
      </div>
    );
  }

  // Active level: full prominent card
  return (
    <Card
      id={`tier-card-${level}`}
      className="ring-1 ring-amber-300 bg-amber-50/30 transition-colors"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-semibold text-sm">{level} · {meta.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {levelScore.toFixed(0)} / 100
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {state.indicators
          .filter((i) => i.level === level)
          .map((indicator) => {
            const lbl = getJourneyLabel(indicator.code);
            return (
              <IndicatorScoreBar
                key={indicator.code}
                indicator={indicator}
                compact
                headline={lbl.headline}
                subtext={lbl.subtext(indicator)}
              />
            );
          })}

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
