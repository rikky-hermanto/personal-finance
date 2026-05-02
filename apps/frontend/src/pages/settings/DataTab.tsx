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
import { getTransactions, resetAllTransactions } from '@/api/transactionsApi';

const CONFIRM_PHRASE = 'delete all';

const DataTab = () => {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: getTransactions,
  });

  const { mutate: doReset, isPending } = useMutation({
    mutationFn: resetAllTransactions,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
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

  const count = transactions.length;

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-foreground">Data Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your stored data. Destructive actions cannot be undone.
          </p>
        </div>

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
