import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Transaction } from '@/types/Transaction';
import { formatCurrency, formatMonth } from '@/lib/format';

interface NetCashflowCardProps {
  transactions: Transaction[];
}

const NetCashflowCard = ({ transactions }: NetCashflowCardProps) => {
  const { income, expenses, net, month } = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { income: 0, expenses: 0 });
      const m = map.get(key)!;
      if (tx.type === 'income') m.income += Math.abs(tx.amount);
      else m.expenses += Math.abs(tx.amount);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    if (!sorted.length) return { income: 0, expenses: 0, net: 0, month: '' };
    const [monthKey, data] = sorted[0];
    return {
      income: data.income,
      expenses: data.expenses,
      net: data.income - data.expenses,
      month: monthKey,
    };
  }, [transactions]);

  const isPositive = net >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Net Cashflow</h3>
        <span className="text-xs text-muted-foreground">{month ? formatMonth(month) : '—'}</span>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          {isPositive ? (
            <TrendingUp className="w-5 h-5 flex-shrink-0" style={{ color: 'hsl(152 40% 52%)' }} />
          ) : (
            <TrendingDown className="w-5 h-5 flex-shrink-0" style={{ color: 'hsl(4 52% 58%)' }} />
          )}
          <span
            className="font-mono text-2xl font-semibold tabular-nums"
            style={{ color: isPositive ? 'hsl(152 40% 52%)' : 'hsl(4 52% 58%)' }}
          >
            {isPositive ? '+' : ''}{formatCurrency(net)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Income</p>
            <p className="font-mono text-sm tabular-nums" style={{ color: 'hsl(152 40% 52%)' }}>
              +{formatCurrency(income)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Expenses</p>
            <p className="font-mono text-sm tabular-nums" style={{ color: 'hsl(4 52% 58%)' }}>
              -{formatCurrency(expenses)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetCashflowCard;
