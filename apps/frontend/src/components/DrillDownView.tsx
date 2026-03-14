
import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { ArrowLeft, Calendar, CreditCard } from 'lucide-react';

interface DrillDownViewProps {
  transactions: Transaction[];
  category: string;
  month: string;
  onBack: () => void;
}

const DrillDownView = ({ transactions, category, month, onBack }: DrillDownViewProps) => {
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      const transactionMonth = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
      return transaction.category === category && 
             transactionMonth === month && 
             transaction.type === 'expense';
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, category, month]);

  const totalAmount = useMemo(() => {
    return filteredTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  }, [filteredTransactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-md hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
        </div>

        {/* Category Summary */}
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900">{category}</h1>
              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatMonth(month)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4" />
                  <span>{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1">Total spent</div>
              <div className="text-2xl font-semibold text-red-600">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-medium text-gray-900">Transactions</h3>
          </div>
          
          {filteredTransactions.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 truncate max-w-md">
                          {transaction.description}
                        </h4>
                        <div className="text-lg font-semibold text-red-600">
                          {formatCurrency(transaction.amount)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>{formatDate(transaction.date)}</span>
                        <span>{transaction.bank}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <CreditCard className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
              <p className="text-gray-600">No transactions found for this category and month.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrillDownView;
