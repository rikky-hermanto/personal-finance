
import { useState, useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Calendar, ChevronRight } from 'lucide-react';
import DrillDownView from './DrillDownView';

interface CashFlowDashboardProps {
  transactions: Transaction[];
}

const CashFlowDashboard = ({ transactions }: CashFlowDashboardProps) => {
  const [drillDownCategory, setDrillDownCategory] = useState<string | null>(null);

  const { currentMonthData, previousMonthData, categoryBreakdown } = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const previousMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    const currentMonthTransactions = transactions.filter(t => {
      const transactionMonth = `${new Date(t.date).getFullYear()}-${String(new Date(t.date).getMonth() + 1).padStart(2, '0')}`;
      return transactionMonth === currentMonth;
    });

    const previousMonthTransactions = transactions.filter(t => {
      const transactionMonth = `${new Date(t.date).getFullYear()}-${String(new Date(t.date).getMonth() + 1).padStart(2, '0')}`;
      return transactionMonth === previousMonth;
    });

    const currentMonthData = currentMonthTransactions.reduce(
      (acc, t) => {
        if (t.type === 'income') {
          acc.income += Math.abs(t.amount);
        } else {
          acc.expenses += Math.abs(t.amount);
        }
        return acc;
      },
      { income: 0, expenses: 0 }
    );

    const previousMonthData = previousMonthTransactions.reduce(
      (acc, t) => {
        if (t.type === 'income') {
          acc.income += Math.abs(t.amount);
        } else {
          acc.expenses += Math.abs(t.amount);
        }
        return acc;
      },
      { income: 0, expenses: 0 }
    );

    // Category breakdown for current month
    const categoryMap = new Map<string, { amount: number; transactions: Transaction[] }>();
    currentMonthTransactions.forEach(t => {
      if (t.type === 'expense') {
        if (!categoryMap.has(t.category)) {
          categoryMap.set(t.category, { amount: 0, transactions: [] });
        }
        const categoryData = categoryMap.get(t.category)!;
        categoryData.amount += Math.abs(t.amount);
        categoryData.transactions.push(t);
      }
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        transactions: data.transactions,
        previousAmount: previousMonthTransactions
          .filter(t => t.type === 'expense' && t.category === category)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)
      }))
      .sort((a, b) => b.amount - a.amount);

    return { currentMonthData, previousMonthData, categoryBreakdown };
  }, [transactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const currentMonth = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const previousMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const netWorth = currentMonthData.income - currentMonthData.expenses;
  const previousNetWorth = previousMonthData.income - previousMonthData.expenses;
  const netWorthChange = netWorth - previousNetWorth;

  const incomeChange = currentMonthData.income - previousMonthData.income;
  const expenseChange = currentMonthData.expenses - previousMonthData.expenses;

  if (drillDownCategory) {
    const categoryData = categoryBreakdown.find(c => c.category === drillDownCategory);
    if (categoryData) {
      return (
        <DrillDownView
          category={drillDownCategory}
          transactions={categoryData.transactions}
          monthTotal={categoryData.amount}
          previousMonthTotal={categoryData.previousAmount}
          onBack={() => setDrillDownCategory(null)}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Financial Dashboard</h2>
          <p className="text-gray-600">Overview for {currentMonth}</p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Current Month Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Income This Month</p>
              <p className="text-2xl font-bold">{formatCurrency(currentMonthData.income)}</p>
              <p className="text-green-200 text-sm">
                {incomeChange >= 0 ? '+' : ''}{formatCurrency(incomeChange)} vs {previousMonth}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Expenses This Month</p>
              <p className="text-2xl font-bold">{formatCurrency(currentMonthData.expenses)}</p>
              <p className="text-red-200 text-sm">
                {expenseChange >= 0 ? '+' : ''}{formatCurrency(expenseChange)} vs {previousMonth}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-200" />
          </div>
        </div>

        <div className={`bg-gradient-to-r ${netWorth >= 0 ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600'} rounded-lg p-6 text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Net This Month</p>
              <p className="text-2xl font-bold">{formatCurrency(netWorth)}</p>
              <p className="text-blue-200 text-sm">
                {netWorthChange >= 0 ? '+' : ''}{formatCurrency(netWorthChange)} vs {previousMonth}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-200" />
          </div>
        </div>
      </div>

      {/* Spending by Category - Drill Down */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          Spending by Category - {currentMonth}
        </h3>
        <div className="space-y-3">
          {categoryBreakdown.slice(0, 6).map((category) => {
            const percentage = currentMonthData.expenses > 0 
              ? (category.amount / currentMonthData.expenses) * 100 
              : 0;
            const change = category.amount - category.previousAmount;
            const changePercentage = category.previousAmount > 0 
              ? ((change / category.previousAmount) * 100) 
              : 0;

            return (
              <div 
                key={category.category} 
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setDrillDownCategory(category.category)}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <div>
                    <p className="font-medium text-gray-900">{category.category}</p>
                    <p className="text-sm text-gray-500">
                      {category.transactions.length} transactions
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(category.amount)}</p>
                    <p className="text-sm text-gray-500">{percentage.toFixed(1)}% of expenses</p>
                    <p className={`text-xs ${change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {change >= 0 ? '+' : ''}{changePercentage.toFixed(1)}% vs last month
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Comparison</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Current Month</span>
              <span className="font-semibold">{currentMonth}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Previous Month</span>
              <span className="font-semibold">{previousMonth}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Spending Change</span>
                <span className={`font-semibold ${expenseChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {expenseChange >= 0 ? '+' : ''}{formatCurrency(expenseChange)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Transactions</span>
              <span className="font-semibold">{transactions.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Categories</span>
              <span className="font-semibold">{categoryBreakdown.length}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Largest Category</span>
                <span className="font-semibold">
                  {categoryBreakdown[0]?.category || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
