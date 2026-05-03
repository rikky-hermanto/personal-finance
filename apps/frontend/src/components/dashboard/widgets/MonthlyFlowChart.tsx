import { DashboardCashFlow } from '@/types/Dashboard';
import FinancialChart from '@/components/FinancialChart';

interface MonthlyFlowChartProps {
  data: DashboardCashFlow[] | null;
  isLoading?: boolean;
  rangeLabel?: string;
}

const MonthlyFlowChart = ({ data, isLoading, rangeLabel }: MonthlyFlowChartProps) => (
  <div className="bg-card border border-border rounded-lg p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-foreground">Cash Flow</h3>
      <span className="text-xs text-muted-foreground">
        {rangeLabel === 'YTD' ? 'Year To Date' : (rangeLabel?.includes('Last') ? rangeLabel : `Last ${rangeLabel || '6 months'}`)}
      </span>
    </div>
    <FinancialChart data={data} type="composed" height={200} isLoading={isLoading} />
  </div>
);

export default MonthlyFlowChart;
