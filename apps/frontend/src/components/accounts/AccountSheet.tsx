import { useEffect, useState } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Sheet, SheetDescription, SheetOverlay, SheetPortal, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
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
import { AmountInput } from '@/components/accounts/AmountInput';
import { Monogram } from '@/components/accounts/Monogram';
import { AccountInUseError, deleteAccount } from '@/api/accountsApi';
import { AccountView, invalidateAccountQueries, useCashflowFlag, useSaveBalance } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';
import {
  accountTypeLabel,
  accountUpdatedAt,
  formatAmountInput,
  isStale,
  parseAmountInput,
  relativeAge,
} from '@/lib/accounts';
import { cn } from '@/lib/utils';

const SMALL_SCREEN = '(max-width: 639px)';

function useSmallScreen() {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL_SCREEN).matches);
  useEffect(() => {
    const mql = window.matchMedia(SMALL_SCREEN);
    const onChange = () => setSmall(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return small;
}

/** The balance the user last recorded, in the account's own currency. */
function nativeBalance(account: AccountView): number {
  return account.latestValuation?.valueNative ?? account.openingBalance;
}

interface AccountSheetProps {
  account: AccountView | null;
  onClose: () => void;
  onEdit: (account: AccountView) => void;
}

export const AccountSheet = ({ account, onClose, onEdit }: AccountSheetProps) => {
  const small = useSmallScreen();

  return (
    <Sheet open={!!account} onOpenChange={open => !open && onClose()}>
      <SheetPortal>
        <SheetOverlay className="bg-[rgb(40_36_30/0.18)]" />
        <SheetPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col gap-6 overflow-y-auto border-border bg-card p-7 shadow-[-12px_0_40px_rgb(0_0_0/0.06)] outline-none',
            'transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-200',
            small
              ? 'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
              : 'inset-y-0 right-0 h-full w-[400px] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          )}
        >
          {account && <SheetBody key={account.id} account={account} onClose={onClose} onEdit={onEdit} />}
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
};

const SheetBody = ({ account, onClose, onEdit }: { account: AccountView; onClose: () => void; onEdit: (a: AccountView) => void }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inst = account.institution;
  const typeLabel = accountTypeLabel(account.accountType, inst?.type);
  const stale = account.isActive && isStale(account);
  const current = nativeBalance(account);

  const [draft, setDraft] = useState(() => formatAmountInput(current));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saveBalance = useSaveBalance();
  const cashflow = useCashflowFlag();

  // When a save lands, the refetched balance becomes the new starting point.
  useEffect(() => setDraft(formatAmountInput(current)), [current]);

  const parsed = parseAmountInput(draft);
  const changed = parsed !== null && parsed !== current;

  const remove = useMutation({
    mutationFn: () => deleteAccount(account.id),
    onSuccess: () => {
      setConfirmOpen(false);
      onClose();
      invalidateAccountQueries(queryClient);
    },
    onError: err => {
      setConfirmOpen(false);
      toast({
        variant: 'destructive',
        title: 'Couldn’t remove this account',
        description: err instanceof AccountInUseError
          ? 'It still has transactions or holdings linked to it. Archive it from Edit details instead.'
          : 'Something went wrong. Try again in a moment.',
      });
    },
  });

  const submitBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || parsed === null) return;
    saveBalance.mutate({ account, value: parsed });
  };

  const balanceId = `balance-${account.id}`;
  const helperId = `balance-help-${account.id}`;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram name={inst?.name ?? account.name} logoUrl={inst?.logoUrl} />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base font-medium">{account.name}</SheetTitle>
            <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
              {typeLabel} · {account.currency}{!account.isActive && ' · Archived'}
            </SheetDescription>
          </div>
        </div>
        <SheetPrimitive.Close className="rounded-sm text-muted-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-[18px] w-[18px]" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </div>

      <form onSubmit={submitBalance} className="flex flex-col gap-2.5">
        <label htmlFor={balanceId} className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Balance today
        </label>
        <AmountInput
          id={balanceId}
          value={draft}
          onChange={v => { setDraft(v); saveBalance.reset(); }}
          currency={account.currency}
          invalid={!!saveBalance.error}
          aria-describedby={helperId}
        />
        <p id={helperId} className={cn('text-xs', stale ? 'text-warning' : 'text-muted-foreground')}>
          {stale
            ? `Last updated ${relativeAge(accountUpdatedAt(account))}. Enter today’s balance to keep net worth accurate.`
            : `Last updated ${relativeAge(accountUpdatedAt(account))}`}
        </p>
        {saveBalance.error && <p className="text-xs text-destructive">Couldn’t save the balance. Try again.</p>}
        <button
          type="submit"
          disabled={!changed || saveBalance.isPending}
          className="inline-flex h-9 items-center self-start rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {saveBalance.isPending ? 'Saving…' : 'Save balance'}
        </button>
      </form>

      <div className="flex items-start gap-3.5 border-y border-border py-4">
        <div className="flex-1">
          <label htmlFor={`cashflow-${account.id}`} className="text-[13.5px] font-medium">Include in Cashflow</label>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
            Transactions from this account count toward your monthly income and spending.
          </p>
          {cashflow.error && <p className="mt-1 text-xs text-destructive">Couldn’t change this setting. Try again.</p>}
        </div>
        <Switch
          id={`cashflow-${account.id}`}
          checked={account.includeInCashflow}
          onCheckedChange={include => cashflow.mutate({ id: account.id, include })}
        />
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-[13px]">
        <dt className="text-muted-foreground">Bank / app</dt>
        <dd className="text-right">{inst?.name ?? '—'}</dd>
        <dt className="text-muted-foreground">Type</dt>
        <dd className="text-right">{typeLabel}</dd>
        <dt className="text-muted-foreground">Currency</dt>
        <dd className="text-right">{account.currency}</dd>
      </dl>

      <div className="mt-auto flex justify-between text-[13px]">
        <button
          type="button"
          onClick={() => onEdit(account)}
          className="rounded-sm hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Edit details
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded-sm text-destructive hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Remove account
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer count toward your net worth. An account with transactions or holdings
              can’t be removed; archive it from Edit details instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); remove.mutate(); }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? 'Removing…' : 'Remove account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
