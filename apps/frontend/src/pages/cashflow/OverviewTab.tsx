import { useNavigate } from 'react-router-dom';
import { Upload, List } from 'lucide-react';
import { mockTransactions } from '@/data/mockTransactions';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';

const OverviewTab = () => {
  const navigate = useNavigate();
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

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/cashflow/upload')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            Upload statement
          </button>
          <button
            onClick={() => navigate('/cashflow/transactions')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
          >
            <List className="w-3.5 h-3.5" strokeWidth={1.5} />
            View all transactions
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
