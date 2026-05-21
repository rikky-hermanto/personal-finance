import { useQuery } from '@tanstack/react-query';
import { getTransactionPage, type TransactionDto } from '@/api/transactionsApi';
import { formatCurrency } from '@/lib/format';

const EMOJI: Record<string, string> = {
  bill: '📄', utilities: '📄', electricity: '📄',
  food: '🍽️', dining: '🍽️', restaurant: '🍽️',
  grocery: '🛒', groceries: '🛒',
  vet: '🐾', pet: '🐾', dog: '🐾',
  withdraw: '💸', withdrawal: '💸', atm: '💸',
  family: '👨‍👩‍👧', transport: '🚗', travel: '✈️',
  shopping: '🛍️', health: '💊', medical: '💊',
  entertainment: '🎬', education: '📚', investment: '📈',
  salary: '💰', income: '💰', rent: '🏠', house: '🏠',
  subscription: '📱', insurance: '🛡️',
};

function emoji(category: string): string {
  const lower = (category ?? '').toLowerCase();
  for (const [k, v] of Object.entries(EMOJI)) {
    if (lower.includes(k)) return v;
  }
  return '📂';
}

function fmt(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

async function fetchTopExpenses(): Promise<TransactionDto[]> {
  const result = await getTransactionPage({ type: 'Expense', pageSize: 100 });
  return [...result.items]
    .sort((a, b) => b.amountIdr - a.amountIdr)
    .slice(0, 5);
}

const TopSpendingCard = () => {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['top-expenses'],
    queryFn: fetchTopExpenses,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="pf-card p-5">
      <h3 className="text-sm font-medium text-foreground mb-0.5">Top Spending</h3>
      <p className="text-[10px] text-muted-foreground mb-3">Largest individual transactions</p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="h-4 w-4 rounded bg-muted shrink-0" />
              <div className="flex-1 h-3 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <p className="text-xs text-muted-foreground">No expense data</p>
      ) : (
        <div className="space-y-3">
          {items.map(tx => (
            <div key={tx.id} className="flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5 shrink-0">{emoji(tx.category)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground truncate leading-snug" title={tx.description}>
                  {tx.description}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {tx.category} · {fmt(tx.date)}
                </p>
              </div>
              <p className="font-mono text-xs tabular-nums text-destructive shrink-0 mt-0.5">
                {formatCurrency(tx.amountIdr)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopSpendingCard;
