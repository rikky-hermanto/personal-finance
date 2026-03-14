
import { useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Transaction } from '@/types/Transaction';

interface FinancialChartProps {
  transactions: Transaction[];
  type?: 'line' | 'area';
  height?: number;
}

const FinancialChart = ({ transactions, type = 'area', height = 200 }: FinancialChartProps) => {
  const chartData = useMemo(() => {
    const monthlyMap = new Map<string, { month: string; income: number; expenses: number; net: number }>();
    
    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { month: monthLabel, income: 0, expenses: 0, net: 0 });
      }
      
      const monthData = monthlyMap.get(monthKey)!;
      if (transaction.type === 'income') {
        monthData.income += Math.abs(transaction.amount);
      } else {
        monthData.expenses += Math.abs(transaction.amount);
      }
      monthData.net = monthData.income - monthData.expenses;
    });
    
    return Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Last 6 months
  }, [transactions]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-md p-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
              }).format(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#334155" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#334155" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="month" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="net"
            stroke="#334155"
            fillOpacity={1}
            fill="url(#netGradient)"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <XAxis 
          dataKey="month" 
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#64748b' }}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="income"
          stroke="#22c55e"
          strokeWidth={1.5}
          dot={{ fill: '#22c55e', strokeWidth: 0, r: 2 }}
          activeDot={{ r: 3, fill: '#22c55e' }}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          stroke="#dc2626"
          strokeWidth={1.5}
          dot={{ fill: '#dc2626', strokeWidth: 0, r: 2 }}
          activeDot={{ r: 3, fill: '#dc2626' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default FinancialChart;
