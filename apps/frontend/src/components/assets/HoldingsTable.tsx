import { formatCurrency } from '@/lib/format';

const DUMMY_HOLDINGS = [
  {
    id: 'h1', institution: 'Stockbit', ticker: 'BBCA', name: 'Bank Central Asia',
    quantity: 500, avgCostIdr: 8_600, latestPriceIdr: 9_200,
  },
  {
    id: 'h2', institution: 'Stockbit', ticker: 'BBRI', name: 'Bank Rakyat Indonesia',
    quantity: 1_000, avgCostIdr: 4_200, latestPriceIdr: 4_450,
  },
  {
    id: 'h3', institution: 'Bibit', ticker: 'RD_SAHAM', name: 'Reksa Dana Saham Schroder',
    quantity: 1, avgCostIdr: 120_000_000, latestPriceIdr: 135_000_000,
  },
  {
    id: 'h4', institution: 'Binance', ticker: 'BTC', name: 'Bitcoin',
    quantity: 0.003, avgCostIdr: 650_000_000, latestPriceIdr: 700_000_000,
  },
  {
    id: 'h5', institution: 'Pluang', ticker: 'PAXG', name: 'PAX Gold',
    quantity: 0.05, avgCostIdr: 48_000_000, latestPriceIdr: 52_000_000,
  },
];

export function HoldingsTable() {
  const totalMarketValue = DUMMY_HOLDINGS.reduce(
    (s, h) => s + h.quantity * h.latestPriceIdr, 0
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Institution</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Ticker</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Qty</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Avg Cost</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Latest Price</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Market Value</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">P&L</th>
            <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Weight</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {DUMMY_HOLDINGS.map(h => {
            const marketValue = h.quantity * h.latestPriceIdr;
            const costBasis   = h.quantity * h.avgCostIdr;
            const pnl         = marketValue - costBasis;
            const pnlPct      = (pnl / costBasis) * 100;
            const weight      = (marketValue / totalMarketValue) * 100;

            return (
              <tr key={h.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{h.institution}</td>
                <td className="px-5 py-3.5">
                  <div className="font-mono font-semibold text-foreground text-xs">{h.ticker}</div>
                  <div className="text-[11px] text-muted-foreground">{h.name}</div>
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs">
                  {h.quantity < 1
                    ? h.quantity.toFixed(4)
                    : h.quantity.toLocaleString('id-ID')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">
                  {formatCurrency(h.avgCostIdr, 'IDR')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs">
                  {formatCurrency(h.latestPriceIdr, 'IDR')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground text-xs font-semibold">
                  {formatCurrency(marketValue, 'IDR')}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-xs">
                  <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, 'IDR')}
                  </div>
                  <div className={`text-[11px] ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground text-xs">
                  {weight.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-muted/30">
          <tr>
            <td colSpan={5} className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total</td>
            <td className="px-5 py-3 font-mono text-right text-foreground text-xs font-semibold">
              {formatCurrency(totalMarketValue, 'IDR')}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
