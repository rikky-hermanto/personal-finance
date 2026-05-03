import { useState, useEffect } from 'react';
import { getDashboardData } from '@/api/transactionsApi';
import { DashboardData } from '@/types/Dashboard';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const RANGES = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

const OverviewTab = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState(6);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await getDashboardData(undefined, undefined, undefined, range);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [range]);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
          <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border">
            {RANGES.map((r) => (
              <Button
                key={r.label}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-xs font-medium transition-all",
                  range === r.value 
                    ? "bg-background text-foreground shadow-sm hover:bg-background" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Top row: net cashflow + top categories */}
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <NetCashflowCard data={data?.currentMonth || null} isLoading={isLoading} />
          <TopCategoriesCard 
            data={data?.topCategories || null} 
            month={data?.currentMonth?.month || ''} 
            isLoading={isLoading} 
          />
        </div>

        {/* Dynamic trend chart */}
        <MonthlyFlowChart 
          data={data?.cashFlow || null} 
          isLoading={isLoading} 
          rangeLabel={RANGES.find(r => r.value === range)?.label} 
        />
      </div>
    </div>
  );
};

export default OverviewTab;
