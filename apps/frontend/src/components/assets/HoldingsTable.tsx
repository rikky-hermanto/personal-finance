import { formatCurrency } from '@/lib/format';
import { Holding } from '@/types/Holding';

type Props = {
  holdings: Holding[];
  onAddValuation: (holding: Holding) => void;
};

export function HoldingsTable({ holdings, onAddValuation }: Props) {
  const totalMarketValue = holdings.reduce((s, h) => {
    return s + (h.latestValuation?.valueIdr ?? h.costBasis);
  }, 0);

  if (holdings.length === 0) {
    return (
      <div className="border border-border rounded-lg px-5 py-12 text-center">
        <p className="text-sm text-muted-foreground">No holdings yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Ticker</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Qty</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Avg Cost</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Latest Price</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Market Value</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">P&L</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Weight</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {holdings.map(h => {
            const marketValue = h.latestValuation?.valueIdr ?? h.costBasis;
            const avgCost = h.quantity > 0 ? h.costBasis / h.quantity : 0;
            const latestPrice = h.latestValuation && h.quantity > 0
              ? h.latestValuation.valueIdr / h.quantity
              : null;
            const pnl = h.latestValuation ? h.latestValuation.valueIdr - h.costBasis : null;
            const pnlPct = pnl != null && h.costBasis > 0 ? (pnl / h.costBasis) * 100 : null;
            const weight = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;

            return (
              <tr key={h.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-mono font-semibold text-foreground text-xs">{h.ticker}</div>
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs">
                  {h.quantity < 1 ? h.quantity.toFixed(4) : h.quantity.toLocaleString('id-ID')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">
                  {formatCurrency(avgCost, 'IDR')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs">
                  {latestPrice != null ? formatCurrency(latestPrice, 'IDR') : '—'}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs font-semibold">
                  {formatCurrency(marketValue, 'IDR')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-xs">
                  {pnl != null ? (
                    <>
                      <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, 'IDR')}
                      </div>
                      {pnlPct != null && (
                        <div className={`text-[11px] ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">
                  {weight.toFixed(1)}%
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => onAddValuation(h)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Add Valuation
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-muted/30">
          <tr>
            <td colSpan={4} className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total</td>
            <td className="px-5 py-3 font-mono text-right text-foreground text-xs font-semibold">
              {formatCurrency(totalMarketValue, 'IDR')}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
