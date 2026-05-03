import { useState, useEffect } from 'react';
import { getDashboardData } from '@/api/transactionsApi';
import { DashboardData } from '@/types/Dashboard';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';

const DashboardPage = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await getDashboardData();
        setData(result);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

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
              <NetCashflowCard data={data?.currentMonth || null} isLoading={isLoading} />
              <TopCategoriesCard 
                data={data?.topCategories || null} 
                month={data?.currentMonth?.month || ''} 
                isLoading={isLoading} 
              />
            </div>
            <MonthlyFlowChart data={data?.cashFlow || null} isLoading={isLoading} />
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
