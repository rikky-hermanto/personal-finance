import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getTransactionPage, resetAllTransactions } from '@/api/transactionsApi';
import { getAccounts, setAccountOpeningBalance } from '@/api/accountsApi';
import { Account } from '@/types/Account';

const CONFIRM_PHRASE = 'delete all';

interface AccountBalanceRowProps {
  account: Account;
  onBlur: (account: Account, balance: string, date: string) => void;
}

const AccountBalanceRow = ({ account, onBlur }: AccountBalanceRowProps) => {
  const [balance, setBalance] = useState(String(account.openingBalance ?? 0));
  const [date, setDate] = useState(account.openingDate?.slice(0, 10) ?? '');

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="w-40 shrink-0">
        <p className="text-sm font-medium text-foreground">{account.name}</p>
        <p className="text-xs text-muted-foreground">{account.accountType}</p>
      </div>
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 max-w-[180px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {account.currency !== 'IDR' ? account.currency : 'Rp'}
          </span>
          <Input
            className="pl-8 text-sm h-8"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            onBlur={() => onBlur(account, balance, date)}
            inputMode="decimal"
          />
        </div>
        <Input
          type="date"
          className="text-sm h-8 w-36"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => onBlur(account, balance, date)}
        />
      </div>
    </div>
  );
};

const DataTab = () => {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch only 1 row just to get the server-side total count cheaply
  const { data: countData } = useQuery({
    queryKey: ['transactions-count'],
    queryFn: () => getTransactionPage({ pageSize: 1 }),
  });
  const count = countData?.total ?? 0;

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const { mutate: updateOpeningBalance } = useMutation({
    mutationFn: ({ id, openingBalance, openingDate }: { id: string; openingBalance: number; openingDate: string }) =>
      setAccountOpeningBalance(id, openingBalance, openingDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: () => {
      toast({ title: 'Failed to save', description: 'Opening balance could not be updated.', variant: 'destructive' });
    },
  });

  const { mutate: doReset, isPending } = useMutation({
    mutationFn: resetAllTransactions,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions-count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      setPhrase('');
      toast({
        title: 'Transactions deleted',
        description: `${deleted} transaction${deleted !== 1 ? 's' : ''} were permanently deleted.`,
      });
    },
    onError: () => {
      toast({
        title: 'Something went wrong',
        description: 'The reset could not be completed. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) setPhrase('');
    setOpen(next);
  };

  const handleBalanceBlur = (account: Account, newBalance: string, newDate: string) => {
    const parsed = parseFloat(newBalance.replace(/,/g, ''));
    if (isNaN(parsed) || !newDate) return;
    updateOpeningBalance({ id: account.id, openingBalance: parsed, openingDate: newDate });
  };



  return (
    <div className="p-8 bg-transparent min-h-full">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Data Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your stored data. Destructive actions cannot be undone.
          </p>
        </div>

        {/* Account Starting Balances */}
        {accounts && accounts.length > 0 && (
          <div className="mb-8">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">Account Starting Balances</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set the opening balance for each account. This is used to calculate the current balance shown on the Overview.
              </p>
            </div>
            <div className="border rounded-lg divide-y">
              {accounts.map((account) => (
                <AccountBalanceRow
                  key={account.id}
                  account={account}
                  onBlur={handleBalanceBlur}
                />
              ))}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="rounded-lg border border-destructive/50 bg-destructive/5">
          <div className="px-5 py-4 border-b border-destructive/20">
            <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Danger Zone
            </span>
          </div>
          <div className="px-5 py-5 flex items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-foreground">Reset all transactions</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete all {count > 0 ? `${count.toLocaleString()} ` : ''}stored
                transactions. Category rules are not affected.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setOpen(true)}
            >
              Reset transactions
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all transactions?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete{' '}
                  <span className="font-semibold text-foreground">
                    {count.toLocaleString()} transaction{count !== 1 ? 's' : ''}
                  </span>
                  . Your category rules will not be affected.{' '}
                  <span className="font-medium text-foreground">This cannot be undone.</span>
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-medium text-foreground">delete all</span> to
                    confirm:
                  </p>
                  <Input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder="delete all"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={phrase.trim().toLowerCase() !== CONFIRM_PHRASE || isPending}
              onClick={() => doReset()}
            >
              {isPending ? 'Deleting…' : 'I understand, delete everything'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DataTab;
