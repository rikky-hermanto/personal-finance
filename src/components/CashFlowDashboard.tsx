import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { TrendingUp, TrendingDown, DollarSign, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

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
    return monthlyData[0];
  }, [monthlyData]);

  const previousMonthData = useMemo(() => {
    if (monthlyData.length < 2) return null;
    return monthlyData[1];
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
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Your financial summary and insights</p>
        </div>
        <div className="text-xs text-gray-400">
          Updated {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Current Month Highlight */}
      {currentMonthData && (
        <div className="bg-white rounded-xl border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">
              {formatMonth(currentMonthData.month)}
            </h2>
            <div className="text-xs text-gray-400">This month</div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <ArrowUpRight className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-500">Income</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatCurrency(currentMonthData.income)}
              </div>
              {previousMonthData && (
                <div className={`text-xs flex items-center space-x-1 ${
                  calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>
                    {calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 ? '+' : ''}
                    {calculatePercentageChange(currentMonthData.income, previousMonthData.income).toFixed(1)}%
                  </span>
                  <span className="text-gray-400">vs last month</span>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <ArrowDownRight className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-500">Expenses</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatCurrency(currentMonthData.expenses)}
              </div>
              {previousMonthData && (
                <div className={`text-xs flex items-center space-x-1 ${
                  calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) <= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>
                    {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) >= 0 ? '+' : ''}
                    {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses).toFixed(1)}%
                  </span>
                  <span className="text-gray-400">vs last month</span>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-500">Net</span>
              </div>
              <div className={`text-2xl font-semibold ${currentMonthData.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(currentMonthData.balance)}
              </div>
              {previousMonthData && (
                <div className={`text-xs flex items-center space-x-1 ${
                  calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 
                    ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>
                    {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 ? '+' : ''}
                    {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance).toFixed(1)}%
                  </span>
                  <span className="text-gray-400">vs last month</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(totalData.totalIncome)}</p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(totalData.totalExpenses)}</p>
            </div>
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Net Worth</p>
              <p className={`text-xl font-semibold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(netWorth)}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              netWorth >= 0 ? 'bg-blue-50' : 'bg-orange-50'
            }`}>
              <DollarSign className={`w-5 h-5 ${netWorth >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Transactions</p>
              <p className="text-xl font-semibold text-gray-900">{transactions.length}</p>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Current Month Top Categories */}
      {currentMonthData && currentMonthCategoryData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Top Spending Categories
            </h3>
            <span className="text-xs text-gray-400">{formatMonth(currentMonthData.month)}</span>
          </div>
          
          <div className="space-y-3">
            {currentMonthCategoryData.map((category, index) => {
              const percentage = (category.amount / currentMonthData.expenses) * 100;
              return (
                <div 
                  key={category.category} 
                  className={`group flex items-center justify-between p-4 rounded-lg transition-all ${
                    onCategoryDrillDown 
                      ? 'hover:bg-gray-50 cursor-pointer' 
                      : ''
                  }`}
                  onClick={() => onCategoryDrillDown?.(category.category, currentMonthData.month)}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-2 h-2 rounded-full bg-gray-${200 + (index * 100)}`}></div>
                    <span className="font-medium text-gray-700">{category.category}</span>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-semibold text-gray-900">{formatCurrency(category.amount)}</div>
                    <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {onCategoryDrillDown && (
            <p className="text-xs text-gray-400 mt-6 text-center">
              Click any category to view detailed transactions
            </p>
          )}
        </div>
      )}

      {/* Monthly Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-8">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Monthly Summary</h3>
        <div className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-4 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="text-right py-4 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Income</th>
                <th className="text-right py-4 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                <th className="text-right py-4 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthlyData.map((month) => (
                <tr key={month.month} className="hover:bg-gray-25 transition-colors">
                  <td className="py-4 px-2 font-medium text-gray-900">{formatMonth(month.month)}</td>
                  <td className="py-4 px-2 text-right text-green-600 font-medium">
                    {formatCurrency(month.income)}
                  </td>
                  <td className="py-4 px-2 text-right text-red-600 font-medium">
                    {formatCurrency(month.expenses)}
                  </td>
                  <td className={`py-4 px-2 text-right font-semibold ${
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
    </div>
  );
};

export default CashFlowDashboard;
