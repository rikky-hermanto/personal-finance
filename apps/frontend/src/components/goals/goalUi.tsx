import { Car, Gem, GraduationCap, House, Package, type LucideProps } from 'lucide-react';
import { goalColor, goalTrack } from '@/lib/goals/colors';
import { percentForBar } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { GoalCategory } from '@/types/Goal';

// Shared Big Purchases primitives from the PF-154 design handoff. No divider lines anywhere:
// separation is whitespace, soft fills and the card frame.

export const CARD =
  'rounded-2xl bg-card border border-border/60 p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.06)]';

export const FIELD =
  'w-full px-3 h-10 rounded-xl bg-foreground/[0.04] focus:bg-foreground/[0.06] outline-none text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors';

export const PRIMARY_BUTTON =
  'h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none';

export const SECONDARY_BUTTON =
  'h-9 px-4 rounded-xl text-xs font-medium text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.07] disabled:opacity-40 disabled:pointer-events-none';

const ICONS: Record<GoalCategory, React.ComponentType<LucideProps>> = {
  house_land: House,
  vehicle: Car,
  education: GraduationCap,
  wedding: Gem,
  other: Package,
};

export const CategoryIcon = ({ category, ...props }: { category: GoalCategory } & LucideProps) => {
  const Icon = ICONS[category];
  return <Icon {...props} />;
};

export const IconTile = ({ category }: { category: GoalCategory }) => (
  <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center flex-shrink-0">
    <CategoryIcon category={category} size={18} strokeWidth={1.5} className="text-foreground/70" />
  </div>
);

export const CardTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap min-h-[28px]">
    <h3 className="text-[15px] font-medium text-foreground whitespace-nowrap">{children}</h3>
    {right}
  </div>
);

/** A progress bar in the goal's stable colour. Colours and widths are runtime values, so they are inline. */
export const GoalBar = ({ colorIndex, percent, className }: { colorIndex: number; percent: string; className?: string }) => (
  <div className={cn('w-full rounded-full overflow-hidden', className)} style={{ background: goalTrack(colorIndex) }}>
    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percentForBar(percent)}%`, background: goalColor(colorIndex) }} />
  </div>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs text-muted-foreground">
      {label}
      {hint && <span className="text-muted-foreground/60"> · {hint}</span>}
    </span>
    {children}
  </label>
);
