import { Transaction } from '@/types/Transaction';
import FinancialChart from '@/components/FinancialChart';

interface MonthlyFlowChartProps {
  transactions: Transaction[];
}

const MonthlyFlowChart = ({ transactions }: MonthlyFlowChartProps) => (
  <div className="bg-card border border-border rounded-lg p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-foreground">Cash Flow</h3>
      <span className="text-xs text-muted-foreground">Last 6 months</span>
    </div>
    <FinancialChart transactions={transactions} type="composed" height={200} />
  </div>
);

export default MonthlyFlowChart;
