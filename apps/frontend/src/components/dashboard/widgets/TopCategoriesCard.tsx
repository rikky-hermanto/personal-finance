import { DashboardTopCategory } from '@/types/Dashboard';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface TopCategoriesCardProps {
  data: DashboardTopCategory[] | null;
  month: string;
  isLoading?: boolean;
  onCategoryDrillDown?: (category: string, month: string) => void;
}

const TopCategoriesCard = ({ data, month, isLoading, onCategoryDrillDown }: TopCategoriesCardProps) => {
  if (isLoading || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 animate-pulse">
        <div className="flex justify-between mb-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  const topCategories = data;

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
          const pct = cat.percentage;
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
