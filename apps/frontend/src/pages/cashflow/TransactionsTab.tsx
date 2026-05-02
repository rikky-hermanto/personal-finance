import { useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import TransactionTable from '@/components/TransactionTable';
import { Button } from '@/components/ui/button';
import { mockTransactions } from '@/data/mockTransactions';
import { Transaction } from '@/types/Transaction';
import { exportTransactionsCsv } from '@/api/transactionsApi';

const TransactionsTab = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);

  const handleTransactionUpdate = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
    );
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
