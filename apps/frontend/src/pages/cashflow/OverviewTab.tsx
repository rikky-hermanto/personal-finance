import { useState, useEffect } from 'react';
import { getDashboardData } from '@/api/transactionsApi';
import { DashboardData } from '@/types/Dashboard';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';

const OverviewTab = () => {
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
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top row: net cashflow + top categories */}
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <NetCashflowCard data={data?.currentMonth || null} isLoading={isLoading} />
          <TopCategoriesCard 
            data={data?.topCategories || null} 
            month={data?.currentMonth?.month || ''} 
            isLoading={isLoading} 
          />
        </div>

        {/* 6-month trend chart */}
        <MonthlyFlowChart data={data?.cashFlow || null} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default OverviewTab;
