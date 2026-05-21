import { DashboardTopCategory } from '@/types/Dashboard';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const CATEGORY_EMOJI: Record<string, string> = {
  bill: '📄',
  utilities: '📄',
  electricity: '📄',
  food: '🍽️',
  dining: '🍽️',
  restaurant: '🍽️',
  grocery: '🛒',
  groceries: '🛒',
  vet: '🐾',
  pet: '🐾',
  dog: '🐾',
  withdraw: '💸',
  withdrawal: '💸',
  atm: '💸',
  family: '👨‍👩‍👧',
  transport: '🚗',
  travel: '✈️',
  shopping: '🛍️',
  health: '💊',
  medical: '💊',
  entertainment: '🎬',
  education: '📚',
  investment: '📈',
  salary: '💰',
  income: '💰',
  rent: '🏠',
  house: '🏠',
  subscription: '📱',
  insurance: '🛡️',
};

function getCategoryEmoji(category: string): string {
  const lower = category.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return '📂';
}

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
  const RowEl = onCategoryDrillDown ? 'button' : 'div';

  if (!topCategories.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No expense data</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Top Categories</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">{month ? formatMonth(month) : '—'}</p>
      </div>
      <div className="space-y-0.5">
        {topCategories.map((cat) => {
          const pct = cat.percentage;
          return (
            <RowEl
              key={cat.category}
              onClick={onCategoryDrillDown ? () => onCategoryDrillDown(cat.category, month) : undefined}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors',
                onCategoryDrillDown ? 'hover:bg-accent cursor-pointer' : 'cursor-default'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-sm leading-none flex-shrink-0">{getCategoryEmoji(cat.category)}</span>
                <span className="text-xs text-foreground truncate" title={cat.category}>{cat.category}</span>
              </div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="font-mono text-xs text-foreground tabular-nums flex-shrink-0 ml-4 cursor-default">
                      {formatCurrency(cat.amount)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {pct.toFixed(1)}% of total spend this period
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </RowEl>
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
