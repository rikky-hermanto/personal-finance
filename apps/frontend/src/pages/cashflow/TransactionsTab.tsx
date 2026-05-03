import { useCallback } from 'react';
import { Download, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TransactionTable from '@/components/TransactionTable';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types/Transaction';
import { exportTransactionsCsv } from '@/api/transactionsApi';

const TransactionsTab = () => {
  const navigate = useNavigate();
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/cashflow/upload')}>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportTransactionsCsv()}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        <TransactionTable onTransactionUpdate={handleTransactionUpdate} />
      </div>
    </div>
  );
};

export default TransactionsTab;
