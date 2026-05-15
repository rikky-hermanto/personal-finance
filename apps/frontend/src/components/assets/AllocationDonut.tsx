import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/format';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function AllocationDonut({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([name, value]) => ({ 
    name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), 
    value 
  })).sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col border border-border rounded-lg bg-card h-[400px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Asset Allocation</h3>
      </div>
      <div className="flex-1 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => [<span className="font-mono">{formatCurrency(value, 'IDR')}</span>, 'Value']}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                padding: '8px 12px'
              }}
              itemStyle={{ fontSize: '13px' }}
              labelStyle={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
