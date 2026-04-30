
import { useMemo, useState } from 'react';
import { Transaction } from '@/types/Transaction';
import { BankId } from '@/types/Transaction';
import { mockWalletBalances } from '@/data/mockTransactions';
import FinancialChart from './FinancialChart';
import WalletTabs from './dashboard/WalletTabs';
import TopWalletsRow from './dashboard/TopWalletsRow';
import SpendingTreemap from './dashboard/SpendingTreemap';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

type WalletFilter = 'all' | BankId;

// Map bankId to the `bank` field values used in Transaction mock data
const BANK_ID_TO_NAME: Record<BankId, string[]> = {
  BCA: ['BCA'],
  Superbank: ['Superbank'],
  NeoBank: ['Neo Savings', 'NeoBank', 'Neo'],
  Wise: ['Wise'],
  Jago: ['Jago', 'Bank Jago'],
};

interface CashFlowDashboardProps {
  transactions: Transaction[];
  onCategoryDrillDown?: (category: string, month: string) => void;
  selectedWallet?: WalletFilter;
  onWalletChange?: (v: WalletFilter) => void;
}

const CATEGORY_COLORS = [
  'hsl(142 71% 45%)',
  'hsl(172 66% 44%)',
  'hsl(217 91% 60%)',
  'hsl(280 67% 60%)',
  'hsl(38 92% 50%)',
];

const CashFlowDashboard = ({
  transactions,
  onCategoryDrillDown,
  selectedWallet: externalWallet,
  onWalletChange,
}: CashFlowDashboardProps) => {
  const [internalWallet, setInternalWallet] = useState<WalletFilter>('all');

  const selectedWallet = externalWallet ?? internalWallet;
  const setWallet = (v: WalletFilter) => {
    setInternalWallet(v);
    onWalletChange?.(v);
  };

  const filteredTransactions = useMemo(() => {
    if (selectedWallet === 'all') return transactions;
    const names = BANK_ID_TO_NAME[selectedWallet] ?? [];
    return transactions.filter((tx) => names.includes(tx.bank));
  }, [transactions, selectedWallet]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number; balance: number }>();
    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { income: 0, expenses: 0, balance: 0 });
      const m = map.get(key)!;
      if (tx.type === 'income') m.income += Math.abs(tx.amount);
      else m.expenses += Math.abs(tx.amount);
      m.balance = m.income - m.expenses;
    });
    return Array.from(map.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredTransactions]);

  const currentMonthData = monthlyData[0] ?? null;

  const topCategories = useMemo(() => {
    if (!currentMonthData) return [];
    const map = new Map<string, number>();
    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (tx.type === 'expense' && key === currentMonthData.month) {
        map.set(tx.category, (map.get(tx.category) ?? 0) + Math.abs(tx.amount));
      }
    });
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [filteredTransactions, currentMonthData]);

  const netWorth = useMemo(
    () => transactions.reduce((s, tx) => (tx.type === 'income' ? s + tx.amount : s - Math.abs(tx.amount)), 0),
    [transactions]
  );

  const filteredWallets = useMemo(() => {
    if (selectedWallet === 'all') return mockWalletBalances;
    return mockWalletBalances.filter((w) => w.bankId === selectedWallet);
  }, [selectedWallet]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Wallet tabs + net worth strip */}
      <WalletTabs
        selected={selectedWallet}
        onChange={setWallet}
        netWorth={netWorth}
        lastUpdated={new Date()}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Top Wallets Row */}
        <TopWalletsRow wallets={mockWalletBalances} selected={selectedWallet} />

        <div className="p-5 space-y-4">
          {/* Cash Flow + Top Categories */}
          <div className="grid grid-cols-[1fr_280px] gap-4">
            {/* Cash Flow Chart */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">Cash Flow</h3>
                <span className="text-xs text-muted-foreground">Last 6 months</span>
              </div>
              <FinancialChart transactions={filteredTransactions} type="composed" height={200} />
            </div>

            {/* Top Categories */}
            {currentMonthData && topCategories.length > 0 ? (
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">Top Categories</h3>
                  <span className="text-xs text-muted-foreground">
                    {formatMonth(currentMonthData.month)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {topCategories.map((cat, i) => {
                    const pct = currentMonthData.expenses > 0
                      ? (cat.amount / currentMonthData.expenses) * 100
                      : 0;
                    return (
                      <button
                        key={cat.category}
                        onClick={() => onCategoryDrillDown?.(cat.category, currentMonthData.month)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors group',
                          onCategoryDrillDown
                            ? 'hover:bg-accent cursor-pointer'
                            : 'cursor-default'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                          />
                          <span className="text-xs text-foreground truncate">{cat.category}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="font-mono text-xs text-foreground tabular-nums">
                            {formatCurrency(cat.amount)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {onCategoryDrillDown && (
                  <p className="text-[10px] text-muted-foreground text-center mt-3">
                    Click category to view transactions
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No expense data</p>
              </div>
            )}
          </div>

          {/* Spending Treemap */}
          {currentMonthData && (
            <SpendingTreemap
              transactions={filteredTransactions}
              currentMonth={currentMonthData.month}
              onCategoryClick={onCategoryDrillDown}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
