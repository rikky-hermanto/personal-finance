import { Sprout, Triangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JourneyMode } from '@/hooks/use-journey-mode';

const OPTIONS = [
  { id: 'pyramid', label: 'Pyramid', Icon: Triangle },
  { id: 'plant', label: 'Growing plant', Icon: Sprout },
] as const;

interface Props {
  mode: JourneyMode;
  onChange: (mode: JourneyMode) => void;
}

/** Small pill toggle above the Journey hero. Both modes share one layout, so switching never moves the page. */
export const JourneyModeSwitch = ({ mode, onChange }: Props) => (
  <div className="flex justify-center gap-1 mb-4" role="radiogroup" aria-label="Journey view">
    {OPTIONS.map(({ id, label, Icon }) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={mode === id}
        onClick={() => onChange(id)}
        className={cn(
          'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          mode === id ? 'bg-secondary text-foreground' : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-foreground/5',
        )}
      >
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </button>
    ))}
  </div>
);
