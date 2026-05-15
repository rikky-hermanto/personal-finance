import { formatCurrency, formatDelta } from '@/lib/format';

interface Props {
  totalIdr?: number;
  deltaPct?: number;
}

export function NetWorthHeadline({ totalIdr, deltaPct }: Props) {
  // Using some estimated figures based on dummy data for the extra columns
  const liquidAssets = totalIdr ? totalIdr * 0.6 : 0;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 border border-border rounded-lg bg-card overflow-hidden" data-testid="net-worth-headline">
      <div className="p-5 md:border-r border-border flex flex-col justify-center hover:bg-accent/30 transition-colors">
        <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground mb-1.5">Current Net Worth</h2>
        <div className="text-2xl md:text-3xl font-mono tracking-tight font-semibold text-foreground">
          {totalIdr !== undefined ? formatCurrency(totalIdr, 'IDR') : 'Rp 0'}
        </div>
        {deltaPct !== undefined && (
          <div className={`text-xs font-mono mt-2 ${deltaPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {deltaPct >= 0 ? '▲' : '▼'} {formatDelta(Math.abs(deltaPct))} vs last month
          </div>
        )}
      </div>
      <div className="p-5 md:border-r border-border flex flex-col justify-center hover:bg-accent/30 transition-colors">
        <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground mb-1.5">Liquid Assets</h2>
        <div className="text-xl md:text-2xl font-mono tracking-tight font-semibold text-foreground">
          {liquidAssets !== 0 ? formatCurrency(liquidAssets, 'IDR') : 'Rp 0'}
        </div>
        <div className="text-xs font-mono mt-2 text-muted-foreground">
          Cash & Investments
        </div>
      </div>
      <div className="p-5 md:border-r border-border flex flex-col justify-center hover:bg-accent/30 transition-colors">
        <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground mb-1.5">Total Liabilities</h2>
        <div className="text-xl md:text-2xl font-mono tracking-tight font-semibold text-foreground">
          Rp 0
        </div>
        <div className="text-xs font-mono mt-2 text-muted-foreground">
          0 active loans
        </div>
      </div>
      <div className="p-5 flex flex-col justify-center hover:bg-accent/30 transition-colors">
        <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground mb-1.5">Debt to Asset Ratio</h2>
        <div className="text-xl md:text-2xl font-mono tracking-tight font-semibold text-foreground">
          0.00%
        </div>
        <div className="text-xs font-mono mt-2 text-green-600">
          Very Healthy
        </div>
      </div>
    </div>
  );
}
