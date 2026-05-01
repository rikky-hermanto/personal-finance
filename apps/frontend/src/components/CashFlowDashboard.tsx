
import { useMemo, useState } from 'react';
import { Transaction } from '@/types/Transaction';
import { BankId } from '@/types/Transaction';
import { mockWalletBalances } from '@/data/mockTransactions';
import WalletTabs from './dashboard/WalletTabs';
import TopWalletsRow from './dashboard/TopWalletsRow';
import SpendingTreemap from './dashboard/SpendingTreemap';
import NetCashflowCard from './dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from './dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from './dashboard/widgets/MonthlyFlowChart';

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

  const netWorth = useMemo(
    () => transactions.reduce((s, tx) => (tx.type === 'income' ? s + tx.amount : s - Math.abs(tx.amount)), 0),
    [transactions]
  );

  const currentMonth = useMemo(() => {
    const months = filteredTransactions.map((tx) => {
      const d = new Date(tx.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    return months.sort((a, b) => b.localeCompare(a))[0] ?? null;
  }, [filteredTransactions]);

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
          {/* Cash Flow chart + Top Categories widgets */}
          <div className="grid grid-cols-[1fr_280px] gap-4">
            <MonthlyFlowChart transactions={filteredTransactions} />
            <TopCategoriesCard
              transactions={filteredTransactions}
              onCategoryDrillDown={onCategoryDrillDown}
            />
          </div>

          {/* Spending Treemap */}
          {currentMonth && (
            <SpendingTreemap
              transactions={filteredTransactions}
              currentMonth={currentMonth}
              onCategoryClick={onCategoryDrillDown}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
