import { useCallback } from 'react';
import { Download } from 'lucide-react';
import TransactionTable from '@/components/TransactionTable';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types/Transaction';
import { exportTransactionsCsv } from '@/api/transactionsApi';

const TransactionsTab = () => {
  const handleTransactionUpdate = useCallback((_id: string, _updates: Partial<Transaction>) => {
    // category edits — TransactionTable manages its own rows server-side
  }, []);

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage all your transactions</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportTransactionsCsv()}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <TransactionTable onTransactionUpdate={handleTransactionUpdate} />
      </div>
    </div>
  );
};

export default TransactionsTab;
