import { useCallback, useState } from 'react';
import { Upload, MoreHorizontal, Trash2, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import TransactionTable from '@/components/TransactionTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Transaction } from '@/types/Transaction';
import { exportTransactionsCsv, getTransactionPage, resetAllTransactions } from '@/api/transactionsApi';

const CONFIRM_PHRASE = 'delete all';

const TransactionsTab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState('');

  const handleTransactionUpdate = useCallback((_id: string, _updates: Partial<Transaction>) => {
    // category edits — TransactionTable manages its own rows server-side
  }, []);

  const { data: countData } = useQuery({
    queryKey: ['transactions-count'],
    queryFn: () => getTransactionPage({ pageSize: 1 }),
    enabled: deleteOpen,
  });
  const count = countData?.total ?? 0;

  const { mutate: doReset, isPending } = useMutation({
    mutationFn: resetAllTransactions,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteOpen(false);
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
    setDeleteOpen(next);
  };

  return (
    <div className="p-8 bg-transparent min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage all your transactions</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button size="sm" onClick={() => navigate('/cashflow/upload')}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Statement
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="gap-2" onClick={() => exportTransactionsCsv()}>
                  <FileDown className="h-3.5 w-3.5" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete all transactions
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TransactionTable onTransactionUpdate={handleTransactionUpdate} />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all transactions?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete{' '}
                  <span className="font-semibold text-foreground">
                    {count > 0 ? `${count.toLocaleString()} transaction${count !== 1 ? 's' : ''}` : 'all transactions'}
                  </span>
                  . Your category rules will not be affected.{' '}
                  <span className="font-medium text-foreground">This cannot be undone.</span>
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-medium text-foreground">delete all</span> to confirm:
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

export default TransactionsTab;
