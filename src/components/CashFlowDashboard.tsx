import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';

interface CashFlowDashboardProps {
  transactions: Transaction[];
  onCategoryDrillDown?: (category: string, month: string) => void;
}

const CashFlowDashboard = ({ transactions, onCategoryDrillDown }: CashFlowDashboardProps) => {
  const monthlyData = useMemo(() => {
    const monthlyMap = new Map<string, { income: number; expenses: number; balance: number }>();
    
    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { income: 0, expenses: 0, balance: 0 });
      }
      
      const monthData = monthlyMap.get(monthKey)!;
      if (transaction.type === 'income') {
        monthData.income += Math.abs(transaction.amount);
      } else {
        monthData.expenses += Math.abs(transaction.amount);
      }
      monthData.balance = monthData.income - monthData.expenses;
    });
    
    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [transactions]);

  const currentMonthData = useMemo(() => {
    if (monthlyData.length === 0) return null;
    return monthlyData[0]; // Most recent month
  }, [monthlyData]);

  const previousMonthData = useMemo(() => {
    if (monthlyData.length < 2) return null;
    return monthlyData[1]; // Previous month
  }, [monthlyData]);

  const currentMonthCategoryData = useMemo(() => {
    if (!currentMonthData) return [];
    
    const categoryMap = new Map<string, number>();
    
    transactions.forEach(transaction => {
      const transactionDate = new Date(transaction.date);
      const transactionMonth = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (transaction.type === 'expense' && transactionMonth === currentMonthData.month) {
        const current = categoryMap.get(transaction.category) || 0;
        categoryMap.set(transaction.category, current + Math.abs(transaction.amount));
      }
    });
    
    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions, currentMonthData]);

  const totalData = useMemo(() => {
    return transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === 'income') {
          acc.totalIncome += Math.abs(transaction.amount);
        } else {
          acc.totalExpenses += Math.abs(transaction.amount);
        }
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0 }
    );
  }, [transactions]);

  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    
    transactions.forEach(transaction => {
      if (transaction.type === 'expense') {
        const current = categoryMap.get(transaction.category) || 0;
        categoryMap.set(transaction.category, current + Math.abs(transaction.amount));
      }
    });
    
    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const calculatePercentageChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const netWorth = totalData.totalIncome - totalData.totalExpenses;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">Cash Flow Dashboard</h2>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Current Month Highlight */}
      {currentMonthData && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            {formatMonth(currentMonthData.month)} Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Income</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(currentMonthData.income)}</p>
              {previousMonthData && (
                <p className={`text-sm ${
                  calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  {calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 ? '+' : ''}
                  {calculatePercentageChange(currentMonthData.income, previousMonthData.income).toFixed(1)}% vs last month
                </p>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Expenses</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(currentMonthData.expenses)}</p>
              {previousMonthData && (
                <p className={`text-sm ${
                  calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) <= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) >= 0 ? '+' : ''}
                  {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses).toFixed(1)}% vs last month
                </p>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Net</p>
              <p className={`text-2xl font-bold ${currentMonthData.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(currentMonthData.balance)}
              </p>
              {previousMonthData && (
                <p className={`text-sm ${
                  calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 ? '+' : ''}
                  {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance).toFixed(1)}% vs last month
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Income</p>
              <p className="text-2xl font-bold">{formatCurrency(totalData.totalIncome)}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Total Expenses</p>
              <p className="text-2xl font-bold">{formatCurrency(totalData.totalExpenses)}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-200" />
          </div>
        </div>

        <div className={`bg-gradient-to-r ${netWorth >= 0 ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600'} rounded-lg p-6 text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Net Worth</p>
              <p className="text-2xl font-bold">{formatCurrency(netWorth)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Transactions</p>
              <p className="text-2xl font-bold">{transactions.length}</p>
            </div>
            <PieChart className="w-8 h-8 text-purple-200" />
          </div>
        </div>
      </div>

      {/* Current Month Top Categories - Clickable for Drill-down */}
      {currentMonthData && currentMonthCategoryData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            {formatMonth(currentMonthData.month)} - Top Expense Categories
          </h3>
          <div className="space-y-3">
            {currentMonthCategoryData.map((category, index) => {
              const percentage = (category.amount / currentMonthData.expenses) * 100;
              return (
                <div 
                  key={category.category} 
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    onCategoryDrillDown 
                      ? 'hover:bg-blue-50 cursor-pointer border border-transparent hover:border-blue-200' 
                      : ''
                  }`}
                  onClick={() => onCategoryDrillDown?.(category.category, currentMonthData.month)}
                >
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-3 bg-blue-${(index + 1) * 100}`}></div>
                    <span className="font-medium text-gray-700">{category.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(category.amount)}</div>
                    <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          {onCategoryDrillDown && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              Click on any category to see detailed transactions
            </p>
          )}
        </div>
      )}

      {/* Monthly Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Monthly Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Month</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Income</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Expenses</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Net</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((month) => (
                <tr key={month.month} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{formatMonth(month.month)}</td>
                  <td className="py-3 px-4 text-right text-green-600 font-medium">
                    {formatCurrency(month.income)}
                  </td>
                  <td className="py-3 px-4 text-right text-red-600 font-medium">
                    {formatCurrency(month.expenses)}
                  </td>
                  <td className={`py-3 px-4 text-right font-bold ${
                    month.balance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(month.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Expense Categories (All Time) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Top Expense Categories (All Time)</h3>
        <div className="space-y-3">
          {categoryData.map((category, index) => {
            const percentage = (category.amount / totalData.totalExpenses) * 100;
            return (
              <div key={category.category} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-3 bg-blue-${(index + 1) * 100}`}></div>
                  <span className="font-medium text-gray-700">{category.category}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{formatCurrency(category.amount)}</div>
                  <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
