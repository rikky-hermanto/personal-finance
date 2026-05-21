import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Insight, InsightSeverity } from '@/types/Insight';

const DOT: Record<InsightSeverity, string> = {
  alert:        'bg-red-500',
  warning:      'bg-amber-400',
  streak_break: 'bg-orange-400',
  win:          'bg-emerald-500',
  info:         'bg-blue-400',
};

const META: Record<InsightSeverity, string> = {
  alert:        'text-red-600 dark:text-red-400',
  warning:      'text-amber-600 dark:text-amber-400',
  streak_break: 'text-orange-500 dark:text-orange-400',
  win:          'text-emerald-600 dark:text-emerald-400',
  info:         'text-blue-600 dark:text-blue-400',
};

interface Props {
  insight: Insight;
  onDismiss: (id: string) => void;
}

export const InsightCard = ({ insight, onDismiss }: Props) => {
  const navigate = useNavigate();
  const { severity, title, body, metricLabel, metricValue, actionType, actionTarget } = insight;

  return (
    <div className="flex items-start gap-3">
      <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', DOT[severity])} />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{body}</p>

        {(metricLabel || actionType === 'navigate') && (
          <div className="mt-1 flex items-center gap-3">
            {metricLabel && metricValue !== undefined && (
              <span className={cn('text-[11px] font-medium', META[severity])}>
                {metricLabel} · {metricValue.toLocaleString('id-ID')}
              </span>
            )}
            {actionType === 'navigate' && actionTarget && (
              <button
                onClick={() => navigate(actionTarget)}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                View →
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => onDismiss(insight.id)}
        className="mt-0.5 shrink-0 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
