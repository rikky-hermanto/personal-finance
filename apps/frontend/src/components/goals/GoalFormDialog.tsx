import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { createGoal, replaceCostItems, toGoalUpdate, updateGoal } from '@/api/goalsApi';
import { useGoalPreview } from '@/hooks/useGoalPreview';
import { CATEGORIES, CATEGORY_ORDER, COPY, COST_TYPES, PRIORITY, nextStep } from '@/lib/goals/copy';
import { isPositiveMoney, parseIdrInput, percentToRate, rateToPercent } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { Goal, GoalCategory, GoalCostItemInput, GoalPreviewDraft, GoalWrite } from '@/types/Goal';
import { CategoryIcon, FIELD, Field, PRIMARY_BUTTON } from './goalUi';
import { CostItemsEditor } from './CostItemsEditor';
import { newCostRow, type CostRow } from '@/lib/goals/costRows';
import { MoneyInput } from './MoneyInput';

const SEGMENT_ITEM =
  'h-8 px-3 rounded-[10px] text-xs text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:bg-transparent';

const schema = z.object({
  category: z.enum(['house_land', 'vehicle', 'education', 'wedding', 'other']),
  name: z.string().trim().min(1).max(120),
  priority: z.number().int().min(1).max(4),
  amount: z.string(),
  month: z.string().regex(/^(\d{4}-\d{2})?$/),
  growth: z.string().refine((v) => v.trim() === '' || percentToRate(v) !== null, 'Enter a percentage from 0 to 100.'),
  instalment: z.string(),
  notes: z.string().max(2000),
});
type FormValues = z.infer<typeof schema>;

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** "2028-11" → "2028-11-30": a target month is saved as its last day. Calendar arithmetic, not money. */
const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

const defaults = (goal: Goal | null, preset: GoalCategory | null): FormValues =>
  goal
    ? {
        category: goal.category,
        name: goal.name,
        priority: goal.priority,
        amount: parseIdrInput(goal.targetAmount.replace('.', ',')) ?? '',
        month: goal.targetDate ? goal.targetDate.slice(0, 7) : '',
        growth: goal.priceGrowthRate ? rateToPercent(goal.priceGrowthRate) : '',
        instalment: goal.plannedMonthlyInstalment ? (parseIdrInput(goal.plannedMonthlyInstalment.replace('.', ',')) ?? '') : '',
        notes: goal.notes ?? '',
      }
    : { category: preset ?? 'house_land', name: '', priority: 2, amount: '', month: '', growth: '', instalment: '', notes: '' };

interface GoalFormDialogProps {
  open: boolean;
  goal: Goal | null; // null = create
  presetCategory?: GoalCategory | null;
  onClose: () => void;
  onSaved?: (goal: Goal) => void;
}

export const GoalFormDialog = ({ open, goal, presetCategory = null, onClose, onSaved }: GoalFormDialogProps) => {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(goal, presetCategory), mode: 'onChange' });
  const [breakdown, setBreakdown] = useState(false);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.reset(defaults(goal, presetCategory));
    const items = goal?.costItems ?? [];
    setBreakdown(items.length > 0);
    setCosts(
      items.map((c) => ({ ...newCostRow(c.itemType, c.label), amount: parseIdrInput(c.amount.replace('.', ',')) ?? '' })),
    );
    setMore(!!(goal?.priceGrowthRate || goal?.plannedMonthlyInstalment || goal?.notes));
    // Reset only when the dialog opens or targets another goal, never on a background refetch.
  }, [open, goal?.id, presetCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = form.watch();
  const category = CATEGORIES[v.category];
  const useCosts = category.breakdown && breakdown;
  const targetDate = v.month ? lastDayOf(v.month) : null;
  const pastMonth = !goal && !!v.month && v.month < thisMonth();
  const growthRate = v.growth.trim() ? percentToRate(v.growth) : null;

  const costInputs: GoalCostItemInput[] = useMemo(
    () => costs.filter((c) => c.amount !== '').map((c) => ({ itemType: c.itemType, label: c.label.trim() || COST_TYPES[c.itemType], amount: c.amount })),
    [costs],
  );

  const draft: GoalPreviewDraft | null = useMemo(() => {
    if (useCosts) {
      if (costInputs.length === 0) return null;
      return { goalId: goal?.id, category: v.category, costItems: costInputs, targetDate, priceGrowthRate: growthRate };
    }
    if (!isPositiveMoney(v.amount)) return null;
    return { goalId: goal?.id, category: v.category, targetAmount: v.amount, targetDate, priceGrowthRate: growthRate };
  }, [useCosts, costInputs, v.amount, v.category, targetDate, growthRate, goal?.id]);

  const preview = useGoalPreview(open ? draft : null);
  const cashNeeded = useCosts ? preview.data?.cashNeeded ?? null : v.amount;
  const valid =
    form.formState.isValid &&
    !pastMonth &&
    (useCosts ? preview.settled && isPositiveMoney(cashNeeded) : isPositiveMoney(v.amount));

  const save = useMutation({
    mutationFn: async () => {
      const body: GoalWrite = {
        category: v.category,
        name: v.name.trim(),
        notes: v.notes.trim() || null,
        priority: v.priority,
        targetAmount: cashNeeded as string,
        targetDate,
        priceGrowthRate: growthRate,
        plannedMonthlyInstalment: isPositiveMoney(v.instalment) ? v.instalment : null,
      };
      if (!goal) {
        const created = await createGoal(body);
        return useCosts ? replaceCostItems(created.id, costInputs) : created;
      }
      if (useCosts) {
        await updateGoal(goal.id, toGoalUpdate(goal, body));
        return replaceCostItems(goal.id, costInputs);
      }
      if (goal.costItems.length > 0) await replaceCostItems(goal.id, []);
      return updateGoal(goal.id, toGoalUpdate(goal, body));
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success(goal ? 'Goal saved' : 'Goal created', { description: saved.name });
      onSaved?.(saved);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const previewLine =
    draft && preview.data
      ? nextStep({ ...preview.data, targetDate })
      : COPY.formPreviewEmpty;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-0 gap-0 rounded-2xl border-border/60 bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !save.isPending) save.mutate();
          }}
        >
          <div className="px-6 pt-6 pb-2 max-h-[80vh] overflow-y-auto">
            <DialogTitle className="text-base font-semibold text-foreground">{goal ? 'Edit goal' : COPY.newBigPurchase}</DialogTitle>
            <DialogDescription className="sr-only">Name the purchase, set the amount and the month.</DialogDescription>
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <div className="mt-5 flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Category">
                  {CATEGORY_ORDER.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={field.value === k}
                      onClick={() => field.onChange(k)}
                      className={cn(
                        'h-9 px-3 rounded-xl text-xs inline-flex items-center gap-1.5 transition-colors',
                        field.value === k ? 'bg-foreground text-background' : 'bg-foreground/[0.04] text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <CategoryIcon category={k} size={13} strokeWidth={1.75} />
                      {CATEGORIES[k].label}
                    </button>
                  ))}
                </div>
              )}
            />
            <div className="mt-5 flex flex-col gap-4">
              <Field label="Name">
                <input autoFocus {...form.register('name')} maxLength={120} placeholder={category.placeholder} className={FIELD} />
              </Field>
              {category.breakdown && (
                <ToggleGroup
                  type="single"
                  value={breakdown ? 'breakdown' : 'one'}
                  onValueChange={(val) => {
                    if (!val) return;
                    const on = val === 'breakdown';
                    setBreakdown(on);
                    if (on && costs.length === 0) setCosts([newCostRow('down_payment', 'Down payment'), newCostRow('loan_principal', 'Loan')]);
                  }}
                  className="gap-1 p-0.5 rounded-xl bg-foreground/[0.04] self-start"
                >
                  <ToggleGroupItem value="one" className={SEGMENT_ITEM}>One amount</ToggleGroupItem>
                  <ToggleGroupItem value="breakdown" className={SEGMENT_ITEM}>Break down the cost</ToggleGroupItem>
                </ToggleGroup>
              )}
              {useCosts ? (
                <CostItemsEditor rows={costs} onChange={setCosts} category={v.category} preview={preview.data} />
              ) : (
                <Field label="Target amount">
                  <Controller
                    control={form.control}
                    name="amount"
                    render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} ariaLabel="Target amount" />}
                  />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target date" hint="optional">
                  <input type="month" {...form.register('month')} min={goal ? undefined : thisMonth()} aria-label="Target month" className={FIELD} />
                </Field>
                <Field label="Priority" hint={PRIORITY[v.priority]?.toLowerCase()}>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <ToggleGroup
                        type="single"
                        value={String(field.value)}
                        onValueChange={(val) => val && field.onChange(Number(val))}
                        className="gap-1 h-10 p-0.5 rounded-xl bg-foreground/[0.04]"
                      >
                        {[1, 2, 3, 4].map((p) => (
                          <ToggleGroupItem key={p} value={String(p)} title={PRIORITY[p]} className={cn(SEGMENT_ITEM, 'flex-1 h-full')}>
                            P{p}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    )}
                  />
                </Field>
              </div>
              {pastMonth && <p className="text-xs text-warning -mt-2">{COPY.formPastMonth}</p>}
              <Collapsible open={more} onOpenChange={setMore}>
                <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  More options
                  <ChevronDown size={12} className={cn('transition-transform', more && 'rotate-180')} />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price growth" hint="your assumption, % a year">
                      <input {...form.register('growth')} inputMode="decimal" placeholder="None" className={FIELD} />
                    </Field>
                    <Field label="Planned instalment" hint="per month">
                      <Controller
                        control={form.control}
                        name="instalment"
                        render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} placeholder="None" ariaLabel="Planned instalment" />}
                      />
                    </Field>
                  </div>
                  {form.formState.errors.growth && <p className="text-xs text-warning -mt-2">{form.formState.errors.growth.message}</p>}
                  <Field label="Notes">
                    <input {...form.register('notes')} maxLength={2000} className={FIELD} />
                  </Field>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
          <div className="px-6 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate" data-testid="goal-form-preview">
              <span className={cn(draft && preview.data && 'text-foreground font-medium')}>{previewLine}</span>
            </div>
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={!valid || save.isPending} className={PRIMARY_BUTTON}>
              {goal ? 'Save' : 'Create goal'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

