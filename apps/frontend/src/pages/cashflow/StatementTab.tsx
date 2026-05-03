import { useState, useEffect } from 'react';
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
  const [range, setRange] = useState(6); // Default to 6M for statement
  const [groupBy, setGroupBy] = useState<'quarterly' | 'monthly'>('quarterly');

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
            <h2 className="text-2xl font-semibold tracking-tight">Cash Flow Statement</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Broken down by operating, investing, and financing activities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period Toggle */}
            <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-xs font-medium transition-all gap-1.5",
                  groupBy === 'quarterly' 
                    ? "bg-background text-foreground shadow-sm hover:bg-background" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setGroupBy('quarterly')}
              >
                <LayoutGrid size={14} />
                Quarterly
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-xs font-medium transition-all gap-1.5",
                  groupBy === 'monthly' 
                    ? "bg-background text-foreground shadow-sm hover:bg-background" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setGroupBy('monthly')}
              >
                <Calendar size={14} />
                Monthly
              </Button>
            </div>

            {/* Range Selector */}
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
        </div>

        <CashflowStatementTable data={data} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default StatementTab;
