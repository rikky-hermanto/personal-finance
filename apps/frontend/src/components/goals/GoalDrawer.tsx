import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getAccounts } from '@/api/accountsApi';
import { deleteContribution, deleteGoal, getContributions, toGoalUpdate, updateGoal } from '@/api/goalsApi';
import {
  CATEGORIES,
  COPY,
  PRIORITY,
  assumptionLine,
  dayMonthYear,
  gateBody,
  nextStep,
  paceLine,
  postDtiText,
} from '@/lib/goals/copy';
import { absMoney, formatDecimal, formatIdr, moneySign } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { FoundationCheck, Goal, GoalStatus } from '@/types/Goal';
import { GoalBar, PRIMARY_BUTTON } from './goalUi';
import { GateLabel } from './GateLabel';

// Source: formulas.md §8 (projections beyond ~5 years need a price/inflation assumption). Display nudge only.
const LONG_HORIZON_MONTHS = 60;

const STATUS_TOAST: Record<GoalStatus, string> = {
  active: 'Back in your plans',
  paused: 'Goal paused',
  achieved: 'Marked achieved',
  cancelled: 'Goal cancelled',
};

interface GoalDrawerProps {
  goal: Goal | null;
  foundation: FoundationCheck | undefined;
  onClose: () => void;
  onEdit: (goal: Goal) => void;
  onContribute: (goal: Goal) => void;
}

/** Right-side detail drawer on @radix-ui/react-dialog primitives (not SheetContent, whose overlay and
 * animation are fixed in components/ui). Esc and an overlay click close it; focus is trapped. */
export const GoalDrawer = ({ goal, foundation, onClose, onEdit, onContribute }: GoalDrawerProps) => (
  <DialogPrimitive.Root open={!!goal} onOpenChange={(o) => !o && onClose()}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-30 bg-foreground/[0.06]" />
      <DialogPrimitive.Content
        className="fixed inset-y-0 right-0 z-30 h-full w-full max-w-[520px] bg-card flex flex-col shadow-2xl outline-none animate-goal-drawer-in"
        aria-describedby={undefined}
      >
        {goal && <DrawerBody goal={goal} foundation={foundation} onClose={onClose} onEdit={onEdit} onContribute={onContribute} />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

const DrawerBody = ({ goal, foundation, onClose, onEdit, onContribute }: GoalDrawerProps & { goal: Goal }) => {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closed = goal.status === 'achieved' || goal.status === 'cancelled';
  const category = CATEGORIES[goal.category];

  const contributions = useInfiniteQuery({
    queryKey: ['goals', goal.id, 'contributions'],
    queryFn: ({ pageParam }) => getContributions(goal.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, p) => n + p.items.length, 0) < last.total ? last.page + 1 : undefined),
  });
  const rows = contributions.data?.pages.flatMap((p) => p.items) ?? [];
  const total = contributions.data?.pages[0]?.total ?? 0;
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const accountName = (id: string | null) => (id ? accounts.data?.find((a) => a.id === id)?.name : undefined);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['goals'] });

  const setStatus = useMutation({
    mutationFn: (status: GoalStatus) => updateGoal(goal.id, toGoalUpdate(goal, { status })),
    onSuccess: (saved, status) => {
      invalidate();
      toast.success(STATUS_TOAST[status], { description: saved.name });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteGoal(goal.id),
    onSuccess: () => {
      invalidate();
      toast.success('Goal deleted', { description: goal.name });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeContribution = useMutation({
    mutationFn: (id: string) => deleteContribution(goal.id, id),
    onSuccess: () => {
      invalidate();
      toast.success('Contribution deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const failing = goal.gateFailing.filter((c) => c !== 'post_purchase_dti');
  const gate =
    foundation && goal.gateState
      ? gateBody({ foundation, state: goal.gateState, failing, missing: goal.gateMissing, variant: 'goal' })
      : [];
  const pace = paceLine(goal);
  const longNoGrowth = (goal.monthsLeft ?? 0) >= LONG_HORIZON_MONTHS && !goal.priceGrowthRate;
  const loan = goal.costItems.filter((c) => c.itemType === 'loan_principal');

  return (
    <>
      <div className="flex items-center justify-between px-6 pt-5">
        <DialogPrimitive.Close className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5" aria-label="Close">
          <ArrowLeft size={16} />
        </DialogPrimitive.Close>
        <span className="text-[11px] text-muted-foreground truncate ml-3">
          {category.label} · P{goal.priority} {PRIORITY[goal.priority]?.toLowerCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <DialogPrimitive.Title className="text-xl font-semibold text-foreground tracking-tight mt-4">{goal.name}</DialogPrimitive.Title>
        {goal.status !== 'active' && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {goal.status}
            {goal.achievedAt ? ` · ${dayMonthYear(goal.achievedAt)}` : ''}
          </p>
        )}

        <div className="mt-6 flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-data text-foreground tracking-tight whitespace-nowrap">{formatIdr(goal.allocated)}</span>
          <span className="text-sm text-muted-foreground font-data whitespace-nowrap">of {formatIdr(goal.effectiveTarget)}</span>
        </div>
        <GoalBar colorIndex={goal.colorIndex} percent={goal.percentComplete} className="mt-3 h-1.5" />
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>{formatDecimal(goal.percentComplete, 1)}% set aside</span>
          {goal.targetDate && <span>Target {dayMonthYear(goal.targetDate)}</span>}
        </div>

        {!closed && (
          <div className="mt-6 rounded-2xl bg-foreground/[0.035] px-4 py-3.5">
            <div className={cn('text-[15px] font-medium', goal.timeline === 'overdue' ? 'text-warning' : 'text-foreground')} data-testid="drawer-next-step">
              {nextStep(goal)}
            </div>
            {goal.timeline === 'overdue' && <div className="text-[11px] text-muted-foreground mt-1">{COPY.nextOverdueHint}</div>}
            <div className="text-[11px] text-muted-foreground mt-1">{assumptionLine(goal.priceGrowthRate)}</div>
            {pace && <div className="text-xs text-foreground/70 mt-2.5">{pace}</div>}
            {longNoGrowth && <div className="text-xs text-muted-foreground mt-2.5">{COPY.assumptionLongNoGrowth}</div>}
          </div>
        )}

        {!closed && goal.gateState && (
          <div className="mt-7">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Foundation for this goal</span>
              <GateLabel state={goal.gateState} size="sm" />
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-[13px] text-foreground/80 leading-relaxed">
              {gate.map((b, i) => (
                <p key={i}>{b}</p>
              ))}
              {goal.postPurchaseDti && (
                <>
                  <p>{postDtiText(goal.plannedMonthlyInstalment, goal.postPurchaseDti)}</p>
                  <p className="text-[11px] text-muted-foreground">{COPY.postDtiLabel}</p>
                </>
              )}
            </div>
          </div>
        )}

        {goal.costItems.length > 0 && (
          <div className="mt-7">
            <span className="text-xs text-muted-foreground">Cost breakdown</span>
            <div className="mt-2 flex flex-col gap-1">
              {goal.costItems.map((c) => (
                <div
                  key={c.id}
                  className={cn('flex justify-between gap-3 text-[13px]', c.itemType === 'loan_principal' ? 'text-muted-foreground' : 'text-foreground/80')}
                >
                  <span className="min-w-0 truncate">
                    {c.label}
                    {c.itemType === 'loan_principal' && <span className="text-[11px]"> {COPY.costBorrowed}</span>}
                  </span>
                  <span className="font-data whitespace-nowrap">{formatIdr(c.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[13px] font-medium text-foreground mt-2">
                <span>{COPY.costCashNeeded}</span>
                <span className="font-data">{formatIdr(goal.targetAmount)}</span>
              </div>
              {loan.length > 0 && goal.totalCost && (
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{COPY.costFullCost}</span>
                  <span className="font-data">{formatIdr(goal.totalCost)}</span>
                </div>
              )}
            </div>
            {goal.category === 'vehicle' && <p className="text-[11px] text-muted-foreground mt-2">{COPY.costOtr}</p>}
          </div>
        )}

        <div className="mt-7">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Contributions · {total}</span>
            {!closed && (
              <button type="button" onClick={() => onContribute(goal)} className="text-xs text-foreground hover:opacity-70 inline-flex items-center gap-1">
                <Plus size={12} />
                Record
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-col" data-testid="drawer-contributions">
            {rows.map((c) => {
              const negative = moneySign(c.amount) === -1;
              return (
                <div key={c.id} className="group flex items-center gap-3 py-1.5 -mx-2 px-2 rounded-lg hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]">
                  <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">{dayMonthYear(c.contributedOn)}</span>
                  <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                    {[accountName(c.heldInAccountId), c.note].filter(Boolean).join(' · ')}
                  </span>
                  <span className={cn('text-[13px] font-data whitespace-nowrap', negative ? 'text-expense' : 'text-foreground')}>
                    {negative ? '−' : '+'}
                    {formatIdr(absMoney(c.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeContribution.mutate(c.id)}
                    disabled={removeContribution.isPending}
                    aria-label="Delete contribution"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            {contributions.hasNextPage && (
              <button
                type="button"
                onClick={() => contributions.fetchNextPage()}
                disabled={contributions.isFetchingNextPage}
                className="self-start mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Load more
              </button>
            )}
          </div>
        </div>

        {goal.status === 'achieved' && (
          <p className="mt-6 text-xs text-foreground/80">
            <Link to="/assets/properties" className="underline-offset-2 hover:underline">
              {COPY.achievedCta}
            </Link>
          </p>
        )}
        {goal.notes && <p className="mt-6 text-xs text-muted-foreground">{goal.notes}</p>}
      </div>

      <div className="px-6 py-4 flex items-center gap-2">
        {!closed && (
          <button type="button" onClick={() => onContribute(goal)} className={PRIMARY_BUTTON}>
            {COPY.recordContribution}
          </button>
        )}
        <button type="button" onClick={() => onEdit(goal)} className="h-9 px-3 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/5">
          Edit
        </button>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-foreground/5" aria-label="More actions">
            <MoreHorizontal size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            {goal.status === 'active' && <DropdownMenuItem onSelect={() => setStatus.mutate('paused')}>Pause</DropdownMenuItem>}
            {goal.status === 'paused' && <DropdownMenuItem onSelect={() => setStatus.mutate('active')}>Resume</DropdownMenuItem>}
            {goal.status !== 'achieved' && <DropdownMenuItem onSelect={() => setStatus.mutate('achieved')}>Mark achieved</DropdownMenuItem>}
            {closed && <DropdownMenuItem onSelect={() => setStatus.mutate('active')}>Back to plans</DropdownMenuItem>}
            {goal.status !== 'cancelled' && <DropdownMenuItem onSelect={() => setStatus.mutate('cancelled')}>Cancel goal</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {goal.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the goal, its contributions and its cost breakdown. It can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
