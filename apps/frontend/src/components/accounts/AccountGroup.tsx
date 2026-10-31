import { formatCurrency } from '@/lib/format';

interface AccountGroupProps {
  label: string;
  subtotal: number | null;
  children: React.ReactNode;
}

export const AccountGroup = ({ label, subtotal, children }: AccountGroupProps) => (
  <section aria-label={label}>
    <div className="flex items-baseline justify-between px-1 pb-2 pt-[22px] text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      <span>{label}</span>
      <span className="font-data whitespace-nowrap text-xs normal-case tracking-normal">
        {subtotal === null ? '—' : formatCurrency(subtotal, 'IDR')}
      </span>
    </div>
    <div className="flex flex-col">{children}</div>
  </section>
);
