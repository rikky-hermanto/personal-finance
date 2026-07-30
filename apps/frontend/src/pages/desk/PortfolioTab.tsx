import { useOutletContext } from 'react-router-dom';
import { DeskPosition, DeskState } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';
import { useSetPositionSleeve } from '@/hooks/useDeskState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const SLEEVE_OPTIONS = ['Legacy / Unclassified', 'Active Trading'];

const PortfolioTab = () => {
  const state = useOutletContext<DeskState>();
  const setSleeve = useSetPositionSleeve();

  // A position with no matching account renders as its own Unattributed group — never folded
  // silently into a broker total (FIN-04: an unplaced position must look unplaced).
  const unattributed: DeskPosition[] = [];
  const brokerGroups = new Map<string, Map<string, DeskPosition[]>>();

  for (const p of state.positions) {
    const account = state.accounts.find(a => a.externalKey === p.accountExternalKey);
    if (!account) {
      unattributed.push(p);
      continue;
    }
    const portfolioLabel = account.portfolioLabel ?? account.name;
    const portfolios = brokerGroups.get(p.broker) ?? new Map<string, DeskPosition[]>();
    (portfolios.get(portfolioLabel) ?? portfolios.set(portfolioLabel, []).get(portfolioLabel)!).push(p);
    brokerGroups.set(p.broker, portfolios);
  }

  return (
    <div className="p-6 space-y-6">
      {Array.from(brokerGroups.entries()).map(([broker, portfolios]) => (
        <div key={broker} className="space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{broker}</div>
          {Array.from(portfolios.entries()).map(([portfolioLabel, positions]) => (
            <PositionsTable
              key={`${broker}-${portfolioLabel}`}
              title={portfolioLabel}
              positions={positions}
              onSleeveChange={(id, sleeve) => setSleeve.mutate({ id, sleeve })}
            />
          ))}
        </div>
      ))}

      {unattributed.length > 0 && (
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Unattributed</div>
          <PositionsTable
            title="No matching broker account"
            positions={unattributed}
            neutral
            onSleeveChange={(id, sleeve) => setSleeve.mutate({ id, sleeve })}
          />
        </div>
      )}
    </div>
  );
};

interface PositionsTableProps {
  title: string;
  positions: DeskPosition[];
  neutral?: boolean;
  onSleeveChange: (id: string, sleeve: string) => void;
}

const PositionsTable = ({ title, positions, neutral, onSleeveChange }: PositionsTableProps) => (
  <div className={cn('rounded-lg border overflow-hidden', neutral ? 'border-muted-foreground/30' : 'border-border')}>
    <div className={cn('px-4 py-2.5 text-sm font-semibold', neutral ? 'bg-muted/20 text-muted-foreground' : 'bg-muted/40')}>{title}</div>
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
                onValueChange={(sleeve) => onSleeveChange(p.id, sleeve)}
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
);

export default PortfolioTab;
