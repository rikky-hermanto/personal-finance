
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
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Overview</span>
        </button>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">{category}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Calendar className="w-4 h-4" />
                <span>{formatMonth(month)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <CreditCard className="w-4 h-4" />
                <span>{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1">Total spent</div>
            <div className="text-2xl font-semibold text-red-600">{formatCurrency(totalAmount)}</div>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-medium text-gray-900">Transactions</h3>
        </div>
        
        {filteredTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-25">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-25 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs">
                        {transaction.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-red-600">
                        {formatCurrency(transaction.amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {transaction.bank}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-12 h-12 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No transactions found</h3>
            <p className="text-sm text-gray-500">No transactions found for this category and month.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DrillDownView;
