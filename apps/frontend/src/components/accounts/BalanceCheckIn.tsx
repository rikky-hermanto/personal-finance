import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AmountInput } from '@/components/accounts/AmountInput';
import { Monogram } from '@/components/accounts/Monogram';
import { AccountView, useSaveBalance } from '@/hooks/use-accounts';
import { accountTypeLabel, accountUpdatedAt, parseAmountInput, relativeAge } from '@/lib/accounts';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

const PILL =
  'inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

interface BalanceCheckInProps {
  /** Stale accounts, oldest update first. Captured when the check-in opens so saved accounts don't drop out mid-way. */
  queue: AccountView[];
  onClose: () => void;
}

export const BalanceCheckIn = ({ queue, onClose }: BalanceCheckInProps) => {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [skipped, setSkipped] = useState(0);
  const save = useSaveBalance();

  const done = index >= queue.length;
  const account = done ? null : queue[index];

  const advance = () => {
    setDraft('');
    save.reset();
    setIndex(i => i + 1);
  };

  const saveAndNext = async (value: number) => {
    if (!account) return;
    try {
      await save.mutateAsync({ account, value });
      advance();
    } catch {
      // The error renders under the input; stay on this account.
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseAmountInput(draft);
    if (value !== null) saveAndNext(value);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={open => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 overflow-y-auto bg-card px-4 py-20 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="absolute inset-x-4 top-7 flex justify-between text-[13px] text-muted-foreground sm:inset-x-8">
            <DialogPrimitive.Title className="font-normal">Balance check-in</DialogPrimitive.Title>
            <DialogPrimitive.Close className="flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
              Done for now
            </DialogPrimitive.Close>
          </div>

          {account ? (
            <CheckInStep
              key={account.id}
              account={account}
              index={index}
              total={queue.length}
              draft={draft}
              onDraft={v => { setDraft(v); save.reset(); }}
              onSubmit={onSubmit}
              onSame={() => saveAndNext(account.latestValuation?.valueNative ?? account.openingBalance)}
              onSkip={() => { setSkipped(s => s + 1); advance(); }}
              saving={save.isPending}
              failed={!!save.error}
            />
          ) : (
            <div className="flex flex-col items-center gap-6 text-center">
              <DialogPrimitive.Description asChild>
                <div>
                  <p className="font-[family-name:var(--font-title)] text-[30px] font-normal leading-[1.1]">
                    {skipped === 0 ? 'All balances are up to date' : 'That’s all for now'}
                  </p>
                  {skipped > 0 && (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      You skipped {skipped} {skipped === 1 ? 'account' : 'accounts'}. {skipped === 1 ? 'It' : 'They'}’ll be here next time.
                    </p>
                  )}
                </div>
              </DialogPrimitive.Description>
              <button type="button" onClick={onClose} autoFocus className={cn(PILL, 'bg-foreground text-background hover:opacity-90')}>
                Back to accounts
              </button>
            </div>
          )}

        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

interface CheckInStepProps {
  account: AccountView;
  index: number;
  total: number;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSame: () => void;
  onSkip: () => void;
  saving: boolean;
  failed: boolean;
}

const CheckInStep = ({ account, index, total, draft, onDraft, onSubmit, onSame, onSkip, saving, failed }: CheckInStepProps) => {
  const inst = account.institution;
  const previous = account.latestValuation?.valueNative ?? account.openingBalance;
  const type = accountTypeLabel(account.accountType, inst?.type).toLowerCase();
  const inputId = `check-in-${account.id}`;

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col items-center gap-7">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-[3px] w-6 rounded-sm', i <= index ? 'bg-foreground' : 'bg-border')} />
        ))}
      </div>

      <Monogram name={inst?.name ?? account.name} logoUrl={inst?.logoUrl} size="lg" />

      <div className="text-center">
        <label htmlFor={inputId} className="block font-[family-name:var(--font-title)] text-[30px] font-normal leading-[1.1]">
          What’s in your {account.name} {type} today?
        </label>
        <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
          Last recorded <span className="font-data">{formatCurrency(previous, account.currency)}</span> · {relativeAge(accountUpdatedAt(account))}
        </DialogPrimitive.Description>
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <AmountInput
          id={inputId}
          value={draft}
          onChange={onDraft}
          currency={account.currency}
          size="lg"
          autoFocus
          invalid={failed}
          className="w-full max-w-[360px]"
        />
        {failed && <p className="text-xs text-destructive">Couldn’t save this balance. Try again.</p>}
      </div>

      <div className="flex gap-2.5">
        <button type="button" onClick={onSame} disabled={saving} className={cn(PILL, 'border border-border bg-card hover:bg-secondary')}>
          Same as before
        </button>
        <button
          type="submit"
          disabled={saving || parseAmountInput(draft) === null}
          className={cn(PILL, 'bg-foreground text-background hover:opacity-90')}
        >
          {saving ? 'Saving…' : 'Save & next'}
        </button>
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        {index + 1} of {total} ·{' '}
        <button type="button" onClick={onSkip} disabled={saving} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Skip this one
        </button>
      </p>
    </form>
  );
};
