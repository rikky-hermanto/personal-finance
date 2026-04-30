
import { useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  ComposedChart, Bar, ReferenceLine,
  XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Transaction } from '@/types/Transaction';
import { formatCurrency, formatCompact } from '@/lib/format';

interface FinancialChartProps {
  transactions: Transaction[];
  type?: 'line' | 'area' | 'composed';
  height?: number;
}

interface TooltipEntry {
  color: string;
  name: string;
  value: number;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const net = payload.find((e) => e.dataKey === 'net');
  const income = payload.find((e) => e.dataKey === 'income');
  const expenses = payload.find((e) => e.dataKey === 'expenses');
  return (
    <div className="bg-card border border-border rounded px-3 py-2.5 text-xs shadow-lg min-w-[160px]">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {income && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'hsl(152 40% 42%)' }} />
            Income
          </span>
          <span className="font-mono tabular-nums text-foreground">{formatCurrency(income.value)}</span>
        </div>
      )}
      {expenses && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'hsl(4 52% 48%)' }} />
            Expenses
          </span>
          <span className="font-mono tabular-nums text-foreground">{formatCurrency(expenses.value)}</span>
        </div>
      )}
      {net && (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 mt-1.5">
          <span className="text-muted-foreground">Net</span>
          <span
            className="font-mono tabular-nums font-medium"
            style={{ color: net.value >= 0 ? 'hsl(152 40% 52%)' : 'hsl(4 52% 58%)' }}
          >
            {formatCurrency(net.value)}
          </span>
        </div>
      )}
      {!income && !expenses && payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-mono tabular-nums">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const LEGEND_ITEMS = [
  { key: 'income', label: 'Income', color: 'hsl(152 40% 42%)' },
  { key: 'expenses', label: 'Expenses', color: 'hsl(4 52% 48%)' },
  { key: 'net', label: 'Net', color: 'hsl(220 8% 60%)', dashed: true },
];

const buildChartData = (transactions: Transaction[]) => {
  const monthlyMap = new Map<string, { key: string; month: string; income: number; expenses: number; net: number }>();
  transactions.forEach((tx) => {
    const date = new Date(tx.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { key, month: label, income: 0, expenses: 0, net: 0 });
    }
    const d = monthlyMap.get(key)!;
    if (tx.type === 'income') d.income += Math.abs(tx.amount);
    else d.expenses += Math.abs(tx.amount);
    d.net = d.income - d.expenses;
  });
  return Array.from(monthlyMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
};

const FinancialChart = ({ transactions, type = 'composed', height = 200 }: FinancialChartProps) => {
  const chartData = useMemo(() => buildChartData(transactions), [transactions]);

  const tickStyle = { fontSize: 10, fill: 'hsl(220 8% 46%)', fontFamily: "'JetBrains Mono', monospace" };
  const yTickFormatter = (v: number) => formatCompact(v);

  if (type === 'composed') {
    return (
      <div>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3">
          {LEGEND_ITEMS.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {item.dashed ? (
                <svg width="16" height="8" viewBox="0 0 16 8">
                  <line x1="0" y1="4" x2="16" y2="4" stroke={item.color} strokeWidth="1.5" strokeDasharray="4 2" />
                </svg>
              ) : (
                <span className="w-3 h-2.5 rounded-[2px] inline-block flex-shrink-0" style={{ backgroundColor: item.color }} />
              )}
              {item.label}
            </span>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} barGap={2}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={tickStyle}
              tickFormatter={yTickFormatter}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(220 8% 15%)' }} />
            <ReferenceLine y={0} stroke="hsl(220 8% 25%)" strokeWidth={1} />
            <Bar dataKey="income" name="Income" fill="hsl(152 40% 42%)" fillOpacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expenses" name="Expenses" fill="hsl(4 52% 48%)" fillOpacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke="hsl(220 8% 65%)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 3, fill: 'hsl(220 8% 65%)', strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(152 40% 42%)" stopOpacity={0.12} />
              <stop offset="95%" stopColor="hsl(152 40% 42%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} />
          <YAxis axisLine={false} tickLine={false} tick={tickStyle} tickFormatter={yTickFormatter} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="hsl(152 40% 42%)"
            fillOpacity={1}
            fill="url(#netGradient)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: 'hsl(152 40% 42%)', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} />
        <YAxis axisLine={false} tickLine={false} tick={tickStyle} tickFormatter={yTickFormatter} width={40} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="income"
          name="Income"
          stroke="hsl(152 40% 42%)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke="hsl(4 52% 48%)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default FinancialChart;
