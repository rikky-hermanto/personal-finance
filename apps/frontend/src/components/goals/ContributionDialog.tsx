import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getAccounts } from '@/api/accountsApi';
import { addContribution } from '@/api/goalsApi';
import { useGoalPreview } from '@/hooks/useGoalPreview';
import { COPY, contributionAfter, contributionOverdrawn } from '@/lib/goals/copy';
import { isPositiveMoney, negateMoney } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { Goal } from '@/types/Goal';
import { FIELD, Field, PRIMARY_BUTTON } from './goalUi';
import { MoneyInput } from './MoneyInput';

const SEGMENT_ITEM =
  'h-7 px-3 rounded-[10px] text-xs text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:bg-transparent';
const NONE = '__none__';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface ContributionDialogProps {
  open: boolean;
  /** The goal to record against, or null to pick one (opened from the page header). */
  goal: Goal | null;
  goals: Goal[];
  onClose: () => void;
}

export const ContributionDialog = ({ open, goal, goals, onClose }: ContributionDialogProps) => {
  const queryClient = useQueryClient();
  const [goalId, setGoalId] = useState('');
  const [kind, setKind] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(today());
  const [heldIn, setHeldIn] = useState(NONE);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setGoalId(goal?.id ?? goals.find((g) => g.status === 'active')?.id ?? goals[0]?.id ?? '');
    setKind('add');
    setAmount('');
    setOn(today());
    setHeldIn(NONE);
    setNote('');
    // Reset only when the dialog opens or targets another goal, never on a background refetch.
  }, [open, goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: getAccounts, enabled: open });
  const heldAccount = accounts.data?.find((a) => a.id === heldIn);

  const signed = kind === 'add' ? amount : negateMoney(amount);
  const preview = useGoalPreview(open && goalId && isPositiveMoney(amount) ? { goalId, contributionAmount: signed } : null);
  const overdrawn = preview.settled && preview.data?.overdrawn === true;
  const future = on > today();
  const canSave = !!goalId && isPositiveMoney(amount) && preview.settled && !overdrawn && !future;

  const picked = useMemo(() => goals.find((g) => g.id === goalId) ?? goal, [goals, goalId, goal]);

  const save = useMutation({
    mutationFn: () => addContribution(goalId, { amount: signed, contributedOn: on, heldInAccountId: heldIn === NONE ? null : heldIn, note: note.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success(kind === 'add' ? 'Contribution recorded' : 'Withdrawal recorded', { description: picked?.name });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px] p-0 gap-0 rounded-2xl border-border/60 bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && !save.isPending) save.mutate();
          }}
        >
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle className="text-base font-semibold text-foreground">
                {kind === 'add' ? COPY.recordContribution : 'Record withdrawal'}
              </DialogTitle>
              <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as 'add' | 'withdraw')} className="gap-0 p-0.5 rounded-xl bg-foreground/[0.04]">
                <ToggleGroupItem value="add" className={SEGMENT_ITEM}>Add</ToggleGroupItem>
                <ToggleGroupItem value="withdraw" className={SEGMENT_ITEM}>Withdraw</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <DialogDescription className="sr-only">Record money set aside for a goal, or taken back out.</DialogDescription>
            <div className="mt-5 flex flex-col gap-4">
              {!goal && (
                <Field label="Goal">
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger className={cn(FIELD, 'border-0 shadow-none focus:ring-0')} aria-label="Goal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Amount">
                <MoneyInput autoFocus value={amount} onChange={setAmount} ariaLabel="Amount" />
              </Field>
              {overdrawn && preview.data && <p className="text-xs text-warning -mt-2" role="alert">{contributionOverdrawn(preview.data.allocated)}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} aria-label="Date" className={FIELD} />
                </Field>
                <Field label="Held in" hint="optional">
                  <Select value={heldIn} onValueChange={setHeldIn}>
                    <SelectTrigger className={cn(FIELD, 'border-0 shadow-none focus:ring-0')} aria-label="Held in">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not specified</SelectItem>
                      {(accounts.data ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Note" hint="optional">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} className={FIELD} />
              </Field>
              {heldAccount?.accountType === 'savings' && <p className="text-[11px] text-muted-foreground -mt-1">{COPY.contributionSavingsHint}</p>}
            </div>
          </div>
          <div className="px-6 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate" data-testid="contribution-preview">
              {preview.data && isPositiveMoney(amount) && !overdrawn ? contributionAfter(preview.data.allocatedAfter, preview.data.percentAfter) : picked?.name}
            </div>
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={!canSave || save.isPending} className={PRIMARY_BUTTON}>
              Save
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
