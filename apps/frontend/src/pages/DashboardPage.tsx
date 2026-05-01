import { mockTransactions } from '@/data/mockTransactions';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';

const DashboardPage = () => {
  const transactions = mockTransactions;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Cashflow section */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Cashflow
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_280px] gap-4">
              <NetCashflowCard transactions={transactions} />
              <TopCategoriesCard transactions={transactions} />
            </div>
            <MonthlyFlowChart transactions={transactions} />
          </div>
        </section>

        {/* TODO: Portfolio section — add holdings summary widget when Portfolio module is built */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Portfolio
          </h2>
          <div className="bg-card border border-dashed border-border rounded-lg p-8 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Portfolio module coming soon</p>
          </div>
        </section>

        {/* TODO: Debts section — add debt tracker widget when Debts module is built */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Debts
          </h2>
          <div className="bg-card border border-dashed border-border rounded-lg p-8 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Debts module coming soon</p>
          </div>
        </section>

      </div>
    </div>
  );
};

export default DashboardPage;
