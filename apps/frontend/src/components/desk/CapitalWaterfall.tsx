import { NavChain } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';

interface CapitalWaterfallProps {
  chain: NavChain;
}

const CapitalWaterfall = ({ chain }: CapitalWaterfallProps) => {
  const buckets = [
    { label: 'Reconciled NAV', value: chain.reconciledNav, tone: 'text-foreground' },
    { label: 'Legacy holdings', value: -chain.legacyMv, tone: 'text-muted-foreground' },
    { label: 'Active Trading NAV', value: -chain.activeTradingNav, tone: 'text-muted-foreground' },
    { label: 'Reserve', value: chain.reserve, tone: chain.reserve < 0 ? 'text-destructive' : 'text-foreground' },
  ];
  const maxAbs = Math.max(...buckets.map(b => Math.abs(b.value)), 1);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-semibold mb-3">Capital waterfall</div>
      <div className="space-y-2.5">
        {buckets.map(b => (
          <div key={b.label} className="grid grid-cols-[140px_1fr_140px] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{b.label}</span>
            <span className="h-2 rounded-full bg-muted overflow-hidden">
              <span
                className="block h-full bg-foreground/40"
                style={{ width: `${(Math.abs(b.value) / maxAbs) * 100}%` }}
              />
            </span>
            <span className={`font-mono tabular-nums text-right ${b.tone}`}>{fmtIDR(b.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-muted-foreground">Active NAV / Reconciled</div>
          <div className="font-mono tabular-nums text-sm mt-0.5">
            {fmtPct(chain.reconciledNav ? (chain.activeTradingNav / chain.reconciledNav) * 100 : 0, { signed: false })}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Portfolio heat</div>
          <div className="font-mono tabular-nums text-sm mt-0.5">{chain.heat.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-muted-foreground">Risk budget / trade</div>
          <div className="font-mono tabular-nums text-sm mt-0.5">{fmtIDR(chain.adjustedRiskBudget)}</div>
        </div>
      </div>
    </div>
  );
};

export default CapitalWaterfall;
