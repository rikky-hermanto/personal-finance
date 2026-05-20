import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { getCashflowStatement } from '@/api/transactionsApi';
import { CashflowStatement } from '@/types/CashflowStatement';
import CashflowStatementTable from '@/components/CashflowStatementTable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LayoutGrid, Calendar } from 'lucide-react';

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

const StatementTab = () => {
  const [data, setData] = useState<CashflowStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useLocalStorage<number>('pf_statement_range', 6);
  const [groupBy, setGroupBy] = useLocalStorage<'quarterly' | 'monthly'>('pf_statement_groupby', 'quarterly');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await getCashflowStatement(range, undefined, groupBy);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch cashflow statement:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [range, groupBy]);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Cash Flow Statement</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Broken down by operating, investing, and financing activities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Toggle */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs font-medium transition-all gap-1.5 rounded-md",
                  groupBy === 'quarterly'
                    ? "bg-secondary text-foreground shadow-none"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                )}
                onClick={() => setGroupBy('quarterly')}
              >
                <LayoutGrid size={13} />
                Quarterly
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs font-medium transition-all gap-1.5 rounded-md",
                  groupBy === 'monthly'
                    ? "bg-secondary text-foreground shadow-none"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                )}
                onClick={() => setGroupBy('monthly')}
              >
                <Calendar size={13} />
                Monthly
              </Button>
            </div>

            <div className="w-px h-5 bg-border" />

            {/* Range Selector */}
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

        <CashflowStatementTable data={data} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default StatementTab;
