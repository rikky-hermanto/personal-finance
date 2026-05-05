import { useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Transaction } from '@/types/Transaction';
import { formatCurrency, formatMonth } from '@/lib/format';

interface SpendingTreemapProps {
  transactions: Transaction[];
  currentMonth: string;
  onCategoryClick?: (category: string, month: string) => void;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  amount?: number;
  colorIndex?: number;
  onClick?: () => void;
}

interface RechartsTreemapContentProps extends Record<string, unknown> {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  amount?: number;
  colorIndex?: number;
}

const TreemapContent = ({ x = 0, y = 0, width = 0, height = 0, name, amount, colorIndex = 0, onClick }: TreemapContentProps) => {
  if (width < 30 || height < 20) return null;
  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];

  return (
    <g onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <rect
        x={x + 1}
        y={y + 1}
        width={width - 2}
        height={height - 2}
        style={{ fill: color, fillOpacity: 0.85, stroke: 'hsl(220 13% 7%)', strokeWidth: 1 }}
        rx={4}
      />
      {height > 36 && (
        <>
          <text
            x={x + 10}
            y={y + 18}
            fill="rgba(255,255,255,0.9)"
            fontSize={11}
            fontWeight={500}
            fontFamily="Inter, sans-serif"
          >
            {(name || '').length > 14 ? (name || '').slice(0, 14) + '…' : name}
          </text>
          {height > 52 && amount !== undefined && (
            <text
              x={x + 10}
              y={y + 32}
              fill="rgba(255,255,255,0.6)"
              fontSize={10}
              fontFamily="'JetBrains Mono', monospace"
            >
              {`Rp ${(amount / 1_000_000).toFixed(1)}M`}
            </text>
          )}
        </>
      )}
    </g>
  );
};

const SpendingTreemap = ({ transactions, currentMonth, onCategoryClick }: SpendingTreemapProps) => {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (tx.type === 'expense' && month === currentMonth) {
        map.set(tx.category, (map.get(tx.category) ?? 0) + Math.abs(tx.amount));
      }
    });
    return Array.from(map.entries())
      .map(([name, amount], i) => ({ name, size: amount, amount, colorIndex: i }))
      .sort((a, b) => b.size - a.size);
  }, [transactions, currentMonth]);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Spending Treemap</h3>
          <span className="text-xs text-muted-foreground">{formatMonth(currentMonth)}</span>
        </div>
        <p className="text-xs text-muted-foreground py-12 text-center">No expense data for this month</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Spending Breakdown</h3>
        <span className="text-xs text-muted-foreground">{formatMonth(currentMonth)}</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <Treemap
          data={data}
          dataKey="size"
          content={(props: RechartsTreemapContentProps) => (
            <TreemapContent
              {...props}
              onClick={
                onCategoryClick
                  ? () => onCategoryClick(props.name ?? '', currentMonth)
                  : undefined
              }
            />
          )}
          isAnimationActive={false}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-card border border-border rounded px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium text-foreground">{d.name}</div>
                  <div className="font-mono text-muted-foreground tabular-nums">
                    {formatCurrency(d.amount)}
                  </div>
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendingTreemap;
