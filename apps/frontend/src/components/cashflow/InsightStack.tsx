import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InsightCard } from './InsightCard';
import type { Insight } from '@/types/Insight';

interface Props {
  insights: Insight[];
  isLoading?: boolean;
}

const Skeleton = () => (
  <div className="space-y-5">
    {[80, 60, 72].map((w, i) => (
      <div key={i} className="flex items-start gap-3">
        <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${w}%` }} />
          <div className="h-3 bg-muted rounded animate-pulse w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const InsightStack = ({ insights, isLoading }: Props) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = insights.filter(i => !dismissed.has(i.id));

  if (isLoading) return <Skeleton />;

  if (!visible.length) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        All clear ✦ —{' '}
        <Link to="/cashflow/analysis" className="underline underline-offset-2 hover:text-foreground">
          View Spend Pulse
        </Link>{' '}
        for deeper analysis.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {visible.map(insight => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onDismiss={id => setDismissed(prev => new Set([...prev, id]))}
        />
      ))}
    </div>
  );
};
