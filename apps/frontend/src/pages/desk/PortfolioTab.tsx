import { useOutletContext } from 'react-router-dom';
import { DeskState } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';
import { useSetPositionSleeve } from '@/hooks/useDeskState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const SLEEVE_OPTIONS = ['Legacy / Unclassified', 'Active Trading'];

const PortfolioTab = () => {
  const state = useOutletContext<DeskState>();
  const setSleeve = useSetPositionSleeve();

  const grouped = state.positions.reduce<Record<string, typeof state.positions>>((acc, p) => {
    (acc[p.broker] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {Object.entries(grouped).map(([broker, positions]) => (
        <div key={broker} className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 text-sm font-semibold">{broker}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground uppercase tracking-wide text-[10px] border-b border-border">
                <th className="text-left font-semibold px-4 py-2">Symbol</th>
                <th className="text-left font-semibold px-4 py-2">Class</th>
                <th className="text-right font-semibold px-4 py-2">Market value</th>
                <th className="text-right font-semibold px-4 py-2">P&amp;L</th>
                <th className="text-right font-semibold px-4 py-2">Weight</th>
                <th className="text-left font-semibold px-4 py-2">Sleeve</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{p.symbol}{p.unconfirmed && <span className="ml-1.5 text-[9px] text-warning uppercase">unconfirmed</span>}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.assetClass}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtIDR(p.mvIdr)}</td>
                  <td className={cn('px-4 py-2 text-right font-mono tabular-nums', p.pnlPct < 0 ? 'text-destructive' : 'text-success')}>
                    {fmtPct(p.pnlPct)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtPct(p.weight, { signed: false })}</td>
                  <td className="px-4 py-2">
                    <Select
                      value={p.sleeve}
                      onValueChange={(sleeve) => setSleeve.mutate({ id: p.id, sleeve })}
                    >
                      <SelectTrigger className="h-7 text-xs w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLEEVE_OPTIONS.map(s => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default PortfolioTab;
