
import { useState } from 'react';
import { Transaction } from '@/types/Transaction';
import { ArrowLeft, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DrillDownViewProps {
  category: string;
  transactions: Transaction[];
  monthTotal: number;
  previousMonthTotal: number;
  onBack: () => void;
}

const DrillDownView = ({ 
  category, 
  transactions, 
  monthTotal, 
  previousMonthTotal, 
  onBack 
}: DrillDownViewProps) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const monthChange = monthTotal - previousMonthTotal;
  const monthChangePercentage = previousMonthTotal > 0 
    ? ((monthChange / previousMonthTotal) * 100) 
    : 0;

  const currentMonth = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button onClick={onBack} variant="outline" size="sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{category}</h2>
          <p className="text-gray-600">Detailed breakdown for {currentMonth}</p>
        </div>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">This Month</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(monthTotal)}</p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Previous Month</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(previousMonthTotal)}</p>
            </div>
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Change</p>
              <p className={`text-2xl font-bold ${monthChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {monthChange >= 0 ? '+' : ''}{formatCurrency(monthChange)}
              </p>
              <p className={`text-sm ${monthChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {monthChangePercentage >= 0 ? '+' : ''}{monthChangePercentage.toFixed(1)}%
              </p>
            </div>
            {monthChange >= 0 ? (
              <TrendingUp className="w-8 h-8 text-red-500" />
            ) : (
              <TrendingDown className="w-8 h-8 text-green-500" />
            )}
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            All {category} Transactions ({transactions.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(transaction.date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                    {transaction.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                    -{formatCurrency(transaction.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {transaction.bank}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DrillDownView;
