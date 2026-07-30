import { Check, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GateState } from '@/types/desk';

const STATE_META: Record<GateState, { Icon: typeof Check; word: string; text: string; bg: string }> = {
  pass: { Icon: Check, word: 'PASS', text: 'text-success', bg: 'bg-success/10' },
  warning: { Icon: TriangleAlert, word: 'WARNING', text: 'text-warning', bg: 'bg-warning/10' },
  blocked: { Icon: OctagonX, word: 'BLOCKED', text: 'text-destructive', bg: 'bg-destructive/10' },
  unresolved: { Icon: CircleDashed, word: 'UNRESOLVED', text: 'text-muted-foreground', bg: 'bg-muted-foreground/10' },
};

interface StateChipProps {
  state: GateState;
  label?: string;
  notImplemented?: boolean;
  className?: string;
}

const StateChip = ({ state, label, notImplemented, className }: StateChipProps) => {
  const meta = STATE_META[state] ?? STATE_META.unresolved;
  const Icon = meta.Icon;
  const displayLabel = notImplemented ? 'not evaluated' : (label ?? meta.word);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        notImplemented ? 'text-muted-foreground bg-muted-foreground/10' : cn(meta.text, meta.bg),
        className
      )}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {displayLabel}
    </span>
  );
};

export default StateChip;
