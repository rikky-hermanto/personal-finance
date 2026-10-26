import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOT_EVALUATED_ACTIONS } from '@/utils/journeyLabels';
import type { IndicatorScore } from '@/types/Journey';

interface Props {
  indicator: IndicatorScore;
  compact?: boolean;
  headline?: string;
  subtext?: string;
}

// The four indicators that earn stars (StarRungs on the backend); other live indicators show none.
const STAR_CODES = new Set(['spend_lt_income', 'liquid_savings_ratio', 'manageable_dti', 'savings_rate']);

const STATUS_COLORS:Record<string, string> = {
  achieved:    'bg-emerald-500',
  in_progress: 'bg-amber-500',
  not_started: 'bg-slate-300',
  no_data:     'bg-slate-200',
};

export const IndicatorScoreBar = ({ indicator, compact, headline, subtext }: Props) => {
  if (indicator.status === 'no_data') {
    const needsInput = NOT_EVALUATED_ACTIONS[indicator.code];
    return (
      <div className={cn('flex items-center gap-2', compact ? 'py-0.5' : 'py-1')}>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {headline ?? indicator.displayName}
        </span>
        {needsInput ? (
          <Link
            to={needsInput.href}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Not evaluated · {needsInput.action}
          </Link>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">Coming soon</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0.5', compact ? 'py-0.5' : 'py-1')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80 truncate flex-1">
          {headline ?? indicator.displayName}
        </span>
        <span className="flex items-center gap-1.5 ml-2">
          {indicator.stars !== undefined && STAR_CODES.has(indicator.code) && (
            <span className="flex items-center gap-0.5" aria-label={`${indicator.stars} of 3 stars`}>
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    'w-3 h-3',
                    n <= indicator.stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
                  )}
                />
              ))}
            </span>
          )}
          <span className="text-xs font-mono font-medium">{indicator.score.toFixed(0)}</span>
        </span>
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
