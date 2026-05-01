import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS = [
  'hsl(142 71% 45%)',
  'hsl(172 66% 44%)',
  'hsl(217 91% 60%)',
  'hsl(280 67% 60%)',
  'hsl(38 92% 50%)',
];

interface TopCategoriesCardProps {
  transactions: Transaction[];
  onCategoryDrillDown?: (category: string, month: string) => void;
}

const TopCategoriesCard = ({ transactions, onCategoryDrillDown }: TopCategoriesCardProps) => {
  const { topCategories, totalExpenses, month } = useMemo(() => {
    const monthMap = new Map<string, number>();
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    });
    const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));
    const currentMonth = sortedMonths[0] ?? '';

    const categoryMap = new Map<string, number>();
    let totalExpenses = 0;
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (tx.type === 'expense' && key === currentMonth) {
        categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + Math.abs(tx.amount));
        totalExpenses += Math.abs(tx.amount);
      }
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return { topCategories, totalExpenses, month: currentMonth };
  }, [transactions]);

  if (!topCategories.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No expense data</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Top Categories</h3>
        <span className="text-xs text-muted-foreground">{month ? formatMonth(month) : '—'}</span>
      </div>
      <div className="space-y-0.5">
        {topCategories.map((cat, i) => {
          const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
          return (
            <button
              key={cat.category}
              onClick={() => onCategoryDrillDown?.(cat.category, month)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors',
                onCategoryDrillDown ? 'hover:bg-accent cursor-pointer' : 'cursor-default'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                />
                <span className="text-xs text-foreground truncate">{cat.category}</span>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="font-mono text-xs text-foreground tabular-nums">
                  {formatCurrency(cat.amount)}
                </div>
                <div className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</div>
              </div>
            </button>
          );
        })}
      </div>
      {onCategoryDrillDown && (
        <p className="text-[10px] text-muted-foreground text-center mt-3">
          Click category to view transactions
        </p>
      )}
    </div>
  );
};

export default TopCategoriesCard;
