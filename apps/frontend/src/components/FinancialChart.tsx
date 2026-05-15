
import {
  LineChart, Line, AreaChart, Area,
  ComposedChart, Bar, ReferenceLine,
  XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { formatCurrency, formatCompact } from '@/lib/format';
import { DashboardCashFlow } from '@/types/Dashboard';
import { cn } from '@/lib/utils';

interface FinancialChartProps {
  data: DashboardCashFlow[] | null;
  type?: 'line' | 'area' | 'composed';
  height?: number;
  isLoading?: boolean;
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
            <span className="w-2 h-2 rounded-sm inline-block bg-success" />
            Income
          </span>
          <span className="font-mono tabular-nums text-foreground">{formatCurrency(income.value)}</span>
        </div>
      )}
      {expenses && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-sm inline-block bg-destructive" />
            Expenses
          </span>
          <span className="font-mono tabular-nums text-foreground">{formatCurrency(expenses.value)}</span>
        </div>
      )}
      {net && (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 mt-1.5">
          <span className="text-muted-foreground">Net</span>
          <span
            className={cn(
              "font-mono tabular-nums font-medium",
              net.value >= 0 ? "text-success" : "text-destructive"
            )}
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
  { key: 'income', label: 'Income', color: 'hsl(var(--success))' },
  { key: 'expenses', label: 'Expenses', color: 'hsl(var(--destructive))' },
  { key: 'net', label: 'Net', color: 'hsl(var(--muted-foreground) / 0.5)', dashed: true },
];

const FinancialChart = ({ data, type = 'composed', height = 200, isLoading }: FinancialChartProps) => {
  const chartData = data || [];

  const tickStyle = { fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: "'JetBrains Mono', monospace" };
  const yTickFormatter = (v: number) => formatCompact(v);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-card/50 border border-border rounded-lg animate-pulse" style={{ height }}>
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

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
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={0} barCategoryGap="25%">
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={tickStyle}
              tickFormatter={yTickFormatter}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)', radius: 4 }} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
            <Bar dataKey="income" name="Income" fill="hsl(var(--success))" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke="hsl(var(--muted-foreground) / 0.6)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(var(--muted-foreground))', strokeWidth: 0 }}
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
              <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.12} />
              <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} />
          <YAxis axisLine={false} tickLine={false} tick={tickStyle} tickFormatter={yTickFormatter} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="hsl(var(--success))"
            fillOpacity={1}
            fill="url(#netGradient)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: 'hsl(var(--success))', strokeWidth: 0 }}
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
          stroke="hsl(var(--success))"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke="hsl(var(--destructive))"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default FinancialChart;
