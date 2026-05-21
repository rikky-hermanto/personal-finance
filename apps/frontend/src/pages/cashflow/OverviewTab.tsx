import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useNavigate } from 'react-router-dom';
import { getDashboardData } from '@/api/transactionsApi';
import { DashboardData } from '@/types/Dashboard';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';
import CurrentBalanceStrip from '@/components/dashboard/CurrentBalanceStrip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Upload } from 'lucide-react';

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

const OverviewTab = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useLocalStorage<number>('pf_overview_range', 1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getDashboardData(undefined, undefined, undefined, range);
        setData(result);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Could not load dashboard data — check your connection and try again.');
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
          <CurrentBalanceStrip />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-medium gap-1.5"
              onClick={() => navigate('/cashflow/upload')}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Statement
            </Button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <Button
                  key={r.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium transition-all rounded-md",
                    range === r.value
                      ? "bg-secondary text-foreground hover:bg-secondary"
                      : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && !isLoading && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Staleness badge — only when data is from > 30 days ago */}
        {!error && data?.dataThrough && (() => {
          // dataThrough is "Month YYYY" e.g. "January 2026" — parse as first of that month
          const [monthName, yearStr] = data.dataThrough.split(' ');
          const dateThroughDate = new Date(`${monthName} 1, ${yearStr}`);
          const isStale = !isNaN(dateThroughDate.getTime()) &&
            new Date().getTime() - dateThroughDate.getTime() > 30 * 24 * 60 * 60 * 1000;
          return isStale ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span>Data through {data.dataThrough} —{' '}</span>
              <button
                onClick={() => navigate('/cashflow/upload')}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                upload a new statement to sync
              </button>
            </div>
          ) : null;
        })()}

        {/* YTD hint — when YTD range returns only one month */}
        {range === 0 && data && data.cashFlow.length === 1 && (
          <p className="text-xs text-muted-foreground -mt-3">
            Showing {data.dataThrough} only — upload data for subsequent months to see full YTD.
          </p>
        )}

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
          rangeLabel={data?.currentMonth?.month}
        />
      </div>
    </div>
  );
};

export default OverviewTab;
