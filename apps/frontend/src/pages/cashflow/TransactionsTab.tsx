import { useCallback, useState } from 'react';
import TransactionTable from '@/components/TransactionTable';
import PageHeader from '@/components/PageHeader';
import { mockTransactions } from '@/data/mockTransactions';
import { Transaction } from '@/types/Transaction';

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
        <PageHeader
          title="Transactions"
          subtitle="View and manage all your transactions"
        />
        <TransactionTable onTransactionUpdate={handleTransactionUpdate} />
      </div>
    </div>
  );
};

export default TransactionsTab;
