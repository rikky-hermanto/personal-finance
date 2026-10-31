import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface AccountsHeaderProps {
  /** null while balances are still loading; the total shows "—" instead of a spinner. */
  total: number | null;
  count: number;
  onAdd: () => void;
}

export const AccountsHeader = ({ total, count, onAdd }: AccountsHeaderProps) => (
  <div className="flex items-end justify-between gap-4">
    <div className="min-w-0">
      <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Accounts</p>
      <p className="font-data whitespace-nowrap text-[28px] font-medium leading-[1.1] sm:text-[34px]">
        {total === null ? '—' : formatCurrency(total, 'IDR')}
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Across {count} {count === 1 ? 'account' : 'accounts'}
      </p>
    </div>
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Plus className="h-3.5 w-3.5" />
      Add account
    </button>
  </div>
);
