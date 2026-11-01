import { Check, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type ZenSegment = 'overview' | 'owned' | 'owed' | 'horizon';

interface Props {
  active: ZenSegment;
  onSelect: (segment: ZenSegment) => void;
  onExport: () => void;
  onImport: () => void;
}

const segmentClass = (on: boolean) =>
  cn(
    'flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors md:flex-none',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
  );

/** Bottom action pill: three views up front, the rest behind ⋯. Esc closes the menu. */
export function ZenPill({ active, onSelect, onExport, onImport }: Props) {
  return (
    <nav
      aria-label="Net worth views"
      className="sticky bottom-6 z-20 mx-2 mb-6 flex gap-0.5 rounded-xl border border-border bg-card p-1 shadow-[0_4px_16px_rgba(0,0,0,0.05)] md:mx-auto md:w-fit"
    >
      <button type="button" className={segmentClass(active === 'overview')} aria-pressed={active === 'overview'} onClick={() => onSelect('overview')}>
        Overview
      </button>
      <button type="button" className={segmentClass(active === 'owned')} aria-pressed={active === 'owned'} onClick={() => onSelect('owned')}>
        Owned
      </button>
      <button type="button" className={segmentClass(active === 'owed')} aria-pressed={active === 'owed'} onClick={() => onSelect('owed')}>
        Owed
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className={segmentClass(active === 'horizon')} aria-label="More">
          <MoreHorizontal className="mx-auto h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-52 rounded-xl">
          <DropdownMenuItem onSelect={() => onSelect('horizon')} className="justify-between">
            Over time
            {active === 'horizon' && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuGroup className="mt-1">
            <DropdownMenuItem onSelect={onExport}>Export template</DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>Import CSV</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
