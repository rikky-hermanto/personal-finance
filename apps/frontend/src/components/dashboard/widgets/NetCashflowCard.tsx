import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, Cell, ReferenceLine, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { DashboardCurrentMonth, DashboardCashFlow } from '@/types/Dashboard';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import MiniSparkline from '@/components/dashboard/MiniSparkline';
import FinancialChart from '@/components/FinancialChart';

interface NetCashflowCardProps {
  data: DashboardCurrentMonth | null;
  isLoading?: boolean;
  sparklineData?: number[];
  chartData?: DashboardCashFlow[] | null;
  chartExpanded?: boolean;
  onToggleChart?: () => void;
}

const Delta = ({ pct, inverse = false }: { pct: number; inverse?: boolean }) => {
  if (!pct) return null;
  const isGood = inverse ? pct < 0 : pct > 0;
  return (
    <span className={cn(
      'ml-1 text-[10px] font-medium tabular-nums',
      isGood ? 'text-success' : 'text-destructive'
    )}>
      {pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
};

const fmtShortMonth = (m: string) => {
  const parts = m.split('-');
  if (parts.length !== 2) return m;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// Maps value to opacity 0.2→1.0, matching theme HSL vars
const incColor = (v: number, min: number, max: number) =>
  `hsla(170,90%,32%,${max > min ? 0.2 + 0.8 * (v - min) / (max - min) : 0.7})`;
const expColor = (v: number, min: number, max: number) =>
  `hsla(354,91%,65%,${max > min ? 0.2 + 0.8 * (v - min) / (max - min) : 0.7})`;

const NetCashflowCard = ({ data, isLoading, sparklineData, chartData, chartExpanded, onToggleChart }: NetCashflowCardProps) => {
  const [avgView, setAvgView] = useState<'income' | 'expense' | null>(null);

  const handleToggleChart = () => {
    if (avgView) setAvgView(null);
    onToggleChart?.();
  };

  const handleToggleIncome = () => {
    if (chartExpanded && onToggleChart) onToggleChart();
    setAvgView(v => v === 'income' ? null : 'income');
  };

  const handleToggleExpense = () => {
    if (chartExpanded && onToggleChart) onToggleChart();
    setAvgView(v => v === 'expense' ? null : 'expense');
  };

  const avgBarData = useMemo(() => {
    if (!avgView || !chartData?.length) return null;
    return chartData.map(m => ({ month: m.month, expenses: m.expenses, income: m.income }));
  }, [avgView, chartData]);

  const colorScales = useMemo(() => {
    if (!avgBarData) return null;
    const expMin = Math.min(...avgBarData.map(d => d.expenses));
    const expMax = Math.max(...avgBarData.map(d => d.expenses));
    const incMin = Math.min(...avgBarData.map(d => d.income));
    const incMax = Math.max(...avgBarData.map(d => d.income));
    return { expMin, expMax, incMin, incMax };
  }, [avgBarData]);

  if (isLoading || !data) {
    return (
      <div className="pf-card p-5 animate-pulse">
        <div className="flex justify-between mb-5">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-3">
          <div className="pr-4 space-y-2">
            <div className="h-3 w-8 bg-muted rounded" />
            <div className="h-7 w-36 bg-muted rounded" />
          </div>
          <div className="px-4 space-y-2">
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-5 w-28 bg-muted rounded" />
          </div>
          <div className="pl-4 space-y-2">
            <div className="h-3 w-14 bg-muted rounded" />
            <div className="h-5 w-28 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  const { income, expenses, net, month, incomeChangePercent, expenseChangePercent, netChangePercent } = data;
  const isPositive = net >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const savingsRate = income > 0 ? (net / income) * 100 : null;

  const avgMonthlyExpense = chartData && chartData.length > 1
    ? chartData.reduce((sum, m) => sum + m.expenses, 0) / chartData.length
    : null;

  const avgMonthlyIncome = chartData && chartData.length > 1
    ? chartData.reduce((sum, m) => sum + m.income, 0) / chartData.length
    : null;

  return (
    <div className="pf-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-foreground">Net Cashflow</h3>
        <button
          onClick={handleToggleChart}
          disabled={!onToggleChart}
          className={cn(
            'flex items-center gap-2',
            onToggleChart ? 'cursor-pointer hover:opacity-70 transition-opacity' : 'cursor-default'
          )}
        >
          {sparklineData && sparklineData.length > 2 && (
            <MiniSparkline data={sparklineData} positive={isPositive} />
          )}
          {month && <p className="text-[11px] text-muted-foreground">{formatMonth(month)}</p>}
          {onToggleChart && (
            chartExpanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-3">
        <div className="pr-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">
            <Icon className={cn('w-3 h-3 mr-1', isPositive ? 'text-success' : 'text-destructive')} />
            Net
            <Delta pct={netChangePercent} />
          </p>
          <p className={cn('font-mono text-xl font-semibold tabular-nums', isPositive ? 'text-success' : 'text-destructive')}>
            {isPositive ? '+' : ''}{formatCurrency(net)}
          </p>
        </div>
        <div className="px-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">
            Income
            <Delta pct={incomeChangePercent} />
          </p>
          <p className="font-mono text-sm tabular-nums text-success">+{formatCurrency(income)}</p>
        </div>
        <div className="pl-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">
            Expenses
            <Delta pct={expenseChangePercent} inverse />
          </p>
          <p className="font-mono text-sm tabular-nums text-destructive">-{formatCurrency(expenses)}</p>
        </div>
      </div>

      {chartExpanded && (
        <>
          <div className="mt-4 border-t border-dashed border-border/50" />
          <div className="pt-4">
            <FinancialChart data={chartData ?? null} type="composed" height={160} isLoading={isLoading} />
          </div>
        </>
      )}

      {savingsRate !== null && (
        <div className="mt-4 pt-3.5 border-t border-border flex items-center justify-between">
          {/* Col 1: Savings rate (static) */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Savings rate</span>
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              savingsRate >= 20 ? 'text-success' : savingsRate >= 10 ? 'text-foreground' : 'text-destructive'
            )}>
              {savingsRate.toFixed(1)}%
            </span>
          </div>
          {/* Col 2: Avg income (clickable) */}
          {avgMonthlyIncome !== null && (
            <>
              <button onClick={handleToggleIncome} className="flex items-center gap-2 cursor-pointer">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                Avg income
                {avgView === 'income' ? <ChevronUp className="h-3 w-3 text-muted-foreground/50" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
              </span>
              <span className="text-xs font-mono tabular-nums text-success">{formatCurrency(avgMonthlyIncome)}</span>
            </button>
            </>
          )}
          {/* Col 3: Avg spend (clickable) */}
          {avgMonthlyExpense !== null && (
            <>
              <button onClick={handleToggleExpense} className="flex items-center gap-2 cursor-pointer">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                Avg spend
                {avgView === 'expense' ? <ChevronUp className="h-3 w-3 text-muted-foreground/50" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
              </span>
              <span className="text-xs font-mono tabular-nums text-destructive">{formatCurrency(avgMonthlyExpense)}</span>
            </button>
            </>
          )}
        </div>
      )}

      {avgView && avgBarData && colorScales && (
        <div className="mt-3 border-t border-dashed border-border/50 pt-3">
          {avgView === 'income' && avgMonthlyIncome !== null && (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={avgBarData} barCategoryGap="20%">
                <XAxis dataKey="month" tickFormatter={fmtShortMonth} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Income']} labelFormatter={fmtShortMonth} contentStyle={{ fontSize: 11 }} />
                <ReferenceLine y={avgMonthlyIncome} stroke="hsla(170,90%,32%,0.5)" strokeDasharray="3 3" strokeWidth={1} />
                <Bar dataKey="income" radius={[2, 2, 0, 0]}>
                  {avgBarData.map(e => <Cell key={e.month} fill={incColor(e.income, colorScales.incMin, colorScales.incMax)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {avgView === 'expense' && avgMonthlyExpense !== null && (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={avgBarData} barCategoryGap="20%">
                <XAxis dataKey="month" tickFormatter={fmtShortMonth} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Expenses']} labelFormatter={fmtShortMonth} contentStyle={{ fontSize: 11 }} />
                <ReferenceLine y={avgMonthlyExpense} stroke="hsla(354,91%,65%,0.5)" strokeDasharray="3 3" strokeWidth={1} />
                <Bar dataKey="expenses" radius={[2, 2, 0, 0]}>
                  {avgBarData.map(e => <Cell key={e.month} fill={expColor(e.expenses, colorScales.expMin, colorScales.expMax)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
};

export default NetCashflowCard;
