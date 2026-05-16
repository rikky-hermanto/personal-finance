import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { formatCurrency } from '@/lib/format';

export function NetWorthTrendChart({ data }: { data: { date: string; valueIdr: number }[] }) {
  const formatYAxis = (tickItem: number) => {
    return `${(tickItem / 1000000000).toFixed(1)}B`;
  };

  return (
    <div className="flex flex-col border border-border rounded-lg bg-card h-[400px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex justify-between items-center">
        <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Net Worth Trend</h3>
        <span className="text-xs text-muted-foreground font-mono">Past 8 Months</span>
      </div>
      <div className="flex-1 p-5 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis 
              dataKey="date" 
              tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              tickFormatter={formatYAxis} 
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={['dataMin - 50000000', 'dataMax + 50000000']}
            />
            <Tooltip 
              formatter={(value: number) => [<span className="font-mono">{formatCurrency(value, 'IDR')}</span>, 'Net Worth']}
              labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                padding: '8px 12px'
              }}
              itemStyle={{ fontSize: '13px' }}
              labelStyle={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
            />
            <Area 
              type="monotone" 
              dataKey="valueIdr"
              stroke="hsl(var(--chart-1))" 
              fillOpacity={1} 
              fill="url(#colorNetWorth)" 
              strokeWidth={2.5} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
