import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { IndicatorScore } from '@/types/Journey';

interface Props {
  indicator: IndicatorScore;
  compact?: boolean;
  headline?: string;
  subtext?: string;
}

const STATUS_COLORS: Record<string, string> = {
  achieved:    'bg-emerald-500',
  in_progress: 'bg-amber-500',
  not_started: 'bg-slate-300',
  no_data:     'bg-slate-200',
};

export const IndicatorScoreBar = ({ indicator, compact, headline, subtext }: Props) => {
  if (indicator.status === 'no_data') {
    return (
      <div className={cn('flex items-center gap-2', compact ? 'py-0.5' : 'py-1')}>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {headline ?? indicator.displayName}
        </span>
        <span className="text-[10px] text-muted-foreground/60 italic">Coming soon</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0.5', compact ? 'py-0.5' : 'py-1')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80 truncate flex-1">
          {headline ?? indicator.displayName}
        </span>
        <span className="text-xs font-mono font-medium ml-2">{indicator.score.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', STATUS_COLORS[indicator.status])}
          initial={{ width: 0 }}
          animate={{ width: `${indicator.score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      {/* Threshold markers */}
      <div className="relative h-0">
        {[50, 70, 100].map((threshold) => (
          <div
            key={threshold}
            className="absolute w-px h-1.5 bg-border -top-1.5"
            style={{ left: `${threshold}%` }}
            title={`${threshold}`}
          />
        ))}
      </div>
      {subtext && (
        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{subtext}</p>
      )}
    </div>
  );
};
