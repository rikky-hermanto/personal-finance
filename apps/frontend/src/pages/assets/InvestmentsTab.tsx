import { formatCurrency } from '@/lib/format';
import { HoldingsTable } from '@/components/assets/HoldingsTable';

export default function InvestmentsTab() {
  return (
    <div className="px-6 py-6 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Portfolio Value</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(530_000_000, 'IDR')}</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors">
            Add Valuation
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors">
            Add Holding
          </button>
        </div>
      </div>

      <HoldingsTable />
    </div>
  );
}
