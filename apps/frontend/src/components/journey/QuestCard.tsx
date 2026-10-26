import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { QuestCard as QuestCardData } from '@/types/Journey';

interface Props {
  quest: QuestCardData;
  isFocus: boolean;
  onFocus: () => void;
  onSnooze: () => void;
  busy: boolean;
}

export const QuestCard = ({ quest, isFocus, onFocus, onSnooze, busy }: Props) => {
  const fraction = quest.progress && quest.progress.total > 0
    ? Math.min(100, Math.round((quest.progress.done / quest.progress.total) * 100))
    : 0;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <p className="font-semibold text-sm leading-snug">{quest.title}</p>
      </CardHeader>
      <CardContent className="pt-0 flex flex-col gap-3 flex-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{quest.why}</p>

        {quest.progress && (
          <div className="flex flex-col gap-1">
            <Progress value={fraction} className="h-1.5 bg-muted" />
            <span className="text-[10px] text-muted-foreground">{quest.progress.label}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto">
          {quest.deeplink ? (
            <Button asChild size="sm" variant="outline" className="text-xs h-7 px-2">
              <Link to={quest.deeplink}>
                Start <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2 text-muted-foreground"
            onClick={onFocus}
            disabled={isFocus || busy}
          >
            {isFocus ? 'Focused' : 'Focus'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2 text-muted-foreground"
            onClick={onSnooze}
            disabled={busy}
          >
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
