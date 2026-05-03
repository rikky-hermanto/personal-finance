import { mockTransactions } from '@/data/mockTransactions';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';

const OverviewTab = () => {
  const transactions = mockTransactions;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top row: net cashflow + top categories */}
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <NetCashflowCard transactions={transactions} />
          <TopCategoriesCard transactions={transactions} />
        </div>

        {/* 6-month trend chart */}
        <MonthlyFlowChart transactions={transactions} />


      </div>
    </div>
  );
};

export default OverviewTab;
