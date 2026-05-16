import { Link } from 'react-router-dom';
import { ArrowRight, Zap, Shield, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Quest } from '@/types/Journey';

const DIFFICULTY_CONFIG = {
  easy:   { icon: Zap,    color: 'text-emerald-600', label: 'Easy' },
  medium: { icon: Shield, color: 'text-amber-600',   label: 'Medium' },
  hard:   { icon: Flame,  color: 'text-red-500',     label: 'Hard' },
};

interface Props {
  quest: Quest;
}

export const QuestCard = ({ quest }: Props) => {
  const cfg = DIFFICULTY_CONFIG[quest.difficulty] ?? DIFFICULTY_CONFIG.medium;
  const Icon = cfg.icon;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-snug">{quest.title}</p>
          <div className={`flex items-center gap-1 shrink-0 ${cfg.color}`}>
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium">{cfg.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex flex-col gap-3 flex-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{quest.description}</p>

        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5">
            +{quest.estimatedScoreGain.toFixed(0)} pts
          </Badge>
          <span className="text-[10px] text-muted-foreground">{quest.targetIndicator.replace(/_/g, ' ')}</span>
        </div>

        <div className="flex items-center gap-2 mt-auto">
          {quest.actionDeeplink ? (
            <Button asChild size="sm" variant="outline" className="text-xs h-7 px-2">
              <Link to={quest.actionDeeplink}>
                Start <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2 text-muted-foreground"
            onClick={() => {/* stub — Phase 4 push notifications */}}
          >
            Remind me
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
