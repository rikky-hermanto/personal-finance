import { GATE_TITLE, GATE_TONE } from '@/lib/goals/copy';
import { cn } from '@/lib/utils';
import type { GateState } from '@/types/Goal';

const DOT = { success: 'bg-success', warning: 'bg-warning', muted: 'bg-muted-foreground/40' } as const;
const TEXT = { success: 'text-success', warning: 'text-warning', muted: 'text-muted-foreground' } as const;

/** FIN-04: green only for "clear"; anything unevaluated is the neutral muted tone. */
export const GateLabel = ({ state, size = 'xs' }: { state: GateState; size?: 'xs' | 'sm' }) => {
  const tone = GATE_TONE[state];
  return (
    <span
      data-gate-state={state}
      className={cn('inline-flex items-center gap-1.5', size === 'xs' ? 'text-[11px]' : 'text-sm font-medium', TEXT[tone])}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', DOT[tone])} />
      {GATE_TITLE[state]}
    </span>
  );
};
