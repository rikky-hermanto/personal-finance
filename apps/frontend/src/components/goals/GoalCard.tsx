import { Plus } from 'lucide-react';
import { CATEGORIES, COPY, PRIORITY, closedLine, goalMeta, nextStep } from '@/lib/goals/copy';
import { formatIdr, formatIdrShort } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { Goal } from '@/types/Goal';
import { CARD, GoalBar, IconTile } from './goalUi';
import { GateLabel } from './GateLabel';

interface GoalCardProps {
  goal: Goal;
  onOpen: () => void;
  onContribute: () => void;
}

export const GoalCard = ({ goal, onOpen, onContribute }: GoalCardProps) => {
  const paused = goal.status === 'paused';
  const closed = goal.status === 'achieved' || goal.status === 'cancelled';
  const open = () => onOpen();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${goal.name}, ${CATEGORIES[goal.category].label}`}
      data-testid="goal-card"
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        CARD,
        'group cursor-pointer flex flex-col text-left hover:border-foreground/15 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        paused && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <IconTile category={goal.category} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-foreground truncate">{goal.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{goalMeta(goal)}</div>
        </div>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.05] text-foreground/60 flex-shrink-0"
          title={PRIORITY[goal.priority]}
        >
          P{goal.priority}
        </span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-x-3 flex-wrap">
        <span className="text-2xl font-data text-foreground tracking-tight whitespace-nowrap" title={formatIdr(goal.allocated)} data-testid="goal-allocated">
          {formatIdrShort(goal.allocated)}
        </span>
        <span className="text-xs text-muted-foreground font-data whitespace-nowrap" title={formatIdr(goal.effectiveTarget)} data-testid="goal-target">
          of {formatIdrShort(goal.effectiveTarget)}
        </span>
      </div>
      <GoalBar colorIndex={goal.colorIndex} percent={goal.percentComplete} className="mt-2.5 h-2" />
      <div className="mt-4 flex-1">
        {closed ? (
          <div className="text-[13px] text-muted-foreground" data-testid="goal-closed-line">{closedLine(goal)}</div>
        ) : (
          <div
            className={cn('text-[13px] leading-snug', goal.timeline === 'overdue' && !paused ? 'text-warning' : 'text-foreground/80')}
            data-testid="goal-next-step"
          >
            {paused ? COPY.nextPaused : nextStep(goal)}
          </div>
        )}
      </div>
      {!closed && (
        <div className="mt-4 flex items-center justify-between gap-2">
          {goal.gateState ? <GateLabel state={goal.gateState} /> : <span />}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContribute();
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1 transition-colors"
          >
            <Plus size={12} />
            Add
          </button>
        </div>
      )}
    </div>
  );
};
