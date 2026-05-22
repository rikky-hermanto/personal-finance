import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyPulse as DailyPulseType } from '@/types/Insight';

const TONE_STYLE = {
  positive: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200',
  neutral:  'bg-muted/50 border-border text-muted-foreground',
  caution:  'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200',
};

interface Props {
  pulse: DailyPulseType | null;
  isLoading?: boolean;
  onDismiss?: () => void;
}

export const DailyPulse = ({ pulse, isLoading, onDismiss }: Props) => {
  if (isLoading || !pulse) {
    return <div className="h-9 rounded-md bg-muted animate-pulse" />;
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 rounded-md border px-3.5 py-2 text-sm',
      TONE_STYLE[pulse.tone]
    )}>
      <span className="text-base">{pulse.tone === 'positive' ? '✦' : pulse.tone === 'caution' ? '⚠' : '·'}</span>
      <span className="font-medium flex-1">{pulse.headline}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-1 rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
