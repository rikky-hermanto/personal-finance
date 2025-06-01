
import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { TrendingUp, TrendingDown, DollarSign, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import FinancialChart from './FinancialChart';

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
      .slice(0, 4);
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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Your financial overview</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Updated {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowUpRight className="w-4 h-4 text-success" />
                  <span className="text-sm text-muted-foreground">Total Income</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(totalData.totalIncome)}</p>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-muted-foreground">Total Expenses</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(totalData.totalExpenses)}</p>
              </div>
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Net Worth</span>
                </div>
                <p className={`text-2xl font-semibold ${netWorth >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(netWorth)}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                netWorth >= 0 ? 'bg-primary/10' : 'bg-destructive/10'
              }`}>
                <DollarSign className={`w-6 h-6 ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`} />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Activity className="w-4 h-4 text-info" />
                  <span className="text-sm text-muted-foreground">Transactions</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">{transactions.length}</p>
              </div>
              <div className="w-12 h-12 bg-info/10 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-info" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cash Flow Chart */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-foreground">Cash Flow</h3>
              <span className="text-xs text-muted-foreground">Last 6 months</span>
            </div>
            <FinancialChart transactions={transactions} type="area" height={240} />
          </div>

          {/* Current Month Spending */}
          {currentMonthData && currentMonthCategoryData.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-foreground">Top Categories</h3>
                <span className="text-xs text-muted-foreground">{formatMonth(currentMonthData.month)}</span>
              </div>
              
              <div className="space-y-4">
                {currentMonthCategoryData.map((category, index) => {
                  const percentage = (category.amount / currentMonthData.expenses) * 100;
                  const colors = ['bg-primary', 'bg-info', 'bg-warning', 'bg-destructive'];
                  return (
                    <div 
                      key={category.category} 
                      className={`group flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
                        onCategoryDrillDown 
                          ? 'hover:bg-accent cursor-pointer' 
                          : ''
                      }`}
                      onClick={() => onCategoryDrillDown?.(category.category, currentMonthData.month)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`}></div>
                        <span className="font-medium text-foreground">{category.category}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{formatCurrency(category.amount)}</div>
                        <div className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {onCategoryDrillDown && (
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  Tap any category to view transactions
                </p>
              )}
            </div>
          )}
        </div>

        {/* Current Month Summary */}
        {currentMonthData && (
          <div className="bg-card border border-border rounded-2xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-medium text-foreground">
                {formatMonth(currentMonthData.month)}
              </h2>
              <div className="text-xs text-muted-foreground">Current month</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-3xl font-semibold text-success mb-2">
                  {formatCurrency(currentMonthData.income)}
                </div>
                <div className="text-sm text-muted-foreground mb-2">Income</div>
                {previousMonthData && (
                  <div className={`text-xs flex items-center justify-center space-x-1 ${
                    calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 
                      ? 'text-success' : 'text-destructive'
                  }`}>
                    <span>
                      {calculatePercentageChange(currentMonthData.income, previousMonthData.income) >= 0 ? '+' : ''}
                      {calculatePercentageChange(currentMonthData.income, previousMonthData.income).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">vs last month</span>
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-semibold text-destructive mb-2">
                  {formatCurrency(currentMonthData.expenses)}
                </div>
                <div className="text-sm text-muted-foreground mb-2">Expenses</div>
                {previousMonthData && (
                  <div className={`text-xs flex items-center justify-center space-x-1 ${
                    calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) <= 0 
                      ? 'text-success' : 'text-destructive'
                  }`}>
                    <span>
                      {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses) >= 0 ? '+' : ''}
                      {calculatePercentageChange(currentMonthData.expenses, previousMonthData.expenses).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">vs last month</span>
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <div className={`text-3xl font-semibold mb-2 ${currentMonthData.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(currentMonthData.balance)}
                </div>
                <div className="text-sm text-muted-foreground mb-2">Net</div>
                {previousMonthData && (
                  <div className={`text-xs flex items-center justify-center space-x-1 ${
                    calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 
                      ? 'text-success' : 'text-destructive'
                  }`}>
                    <span>
                      {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance) >= 0 ? '+' : ''}
                      {calculatePercentageChange(currentMonthData.balance, previousMonthData.balance).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">vs last month</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashFlowDashboard;
