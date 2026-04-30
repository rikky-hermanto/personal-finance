
import { useMemo } from 'react';
import { Transaction } from '@/types/Transaction';
import { ArrowLeft, Calendar, CreditCard } from 'lucide-react';
import { formatCurrency, formatMonth } from '@/lib/format';

interface DrillDownViewProps {
  transactions: Transaction[];
  category: string;
  month: string;
  onBack: () => void;
}

const DrillDownView = ({ transactions, category, month, onBack }: DrillDownViewProps) => {
  const filtered = useMemo(() => {
    return transactions
      .filter((tx) => {
        const d = new Date(tx.date);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return tx.category === category && m === month && tx.type === 'expense';
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, category, month]);

  const total = useMemo(
    () => filtered.reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [filtered]
  );

  const formatDate = (ds: string) =>
    new Date(ds).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-full bg-background p-6 space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        Back to Dashboard
      </button>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{category}</h1>
            <div className="flex items-center gap-5 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
                {formatMonth(month)}
              </div>
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />
                {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1">Total spent</div>
            <div className="font-mono text-base font-medium text-destructive tabular-nums">
              {formatCurrency(total)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Transactions</h3>
        </div>

        {filtered.length > 0 ? (
          <div className="divide-y divide-border">
            {filtered.map((tx) => (
              <div key={tx.id} className="px-6 py-3 hover:bg-accent transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate max-w-md">{tx.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatDate(tx.date)}</span>
                      <span>{tx.bank}</span>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-destructive tabular-nums ml-4 flex-shrink-0">
                    {formatCurrency(Math.abs(tx.amount))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <CreditCard className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1} />
            <p className="text-sm text-muted-foreground">No transactions found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DrillDownView;
