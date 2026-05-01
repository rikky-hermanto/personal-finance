import { useState, useCallback } from 'react';
import CashFlowDashboard from '@/components/CashFlowDashboard';
import DrillDownView from '@/components/DrillDownView';
import { mockTransactions } from '@/data/mockTransactions';
import { Transaction } from '@/types/Transaction';

const DashboardPage = () => {
  const [transactions] = useState<Transaction[]>(mockTransactions);
  const [drillDownData, setDrillDownData] = useState<{ category: string; month: string } | null>(null);

  const handleCategoryDrillDown = useCallback((category: string, month: string) => {
    setDrillDownData({ category, month });
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setDrillDownData(null);
  }, []);

  if (drillDownData) {
    return (
      <DrillDownView
        transactions={transactions}
        category={drillDownData.category}
        month={drillDownData.month}
        onBack={handleBackToDashboard}
      />
    );
  }

  return (
    <CashFlowDashboard
      transactions={transactions}
      onCategoryDrillDown={handleCategoryDrillDown}
    />
  );
};

export default DashboardPage;
