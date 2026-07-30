import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GateResult, NavChain } from '@/types/desk';
import { fmtIDR } from '@/lib/desk/deskFormat';
import StateChip from './StateChip';

interface GateBarProps {
  chain: NavChain;
  gate: GateResult;
  onOpenDrawer: () => void;
  onEditMandate?: () => void;
}

const overallState = (overall: GateResult['overall']) =>
  overall === 'PASS' ? 'pass' : overall === 'WARNING' ? 'warning' : 'blocked';

const GateBar = ({ chain, gate, onOpenDrawer, onEditMandate }: GateBarProps) => {
  const state = overallState(gate.overall);
  const reasonCount = gate.blockingReasons.length;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 bg-card border-b border-border text-xs">
      <button onClick={onOpenDrawer}>
        <StateChip
          state={state}
          label={`${gate.overall}${gate.overall === 'BLOCKED' && reasonCount ? ` · ${reasonCount} reason${reasonCount > 1 ? 's' : ''}` : ''}`}
        />
      </button>
      <span className="text-muted-foreground text-[11px]">
        Regime <b className="text-foreground text-[13px]">{chain.regime.name} {chain.regime.multiplier.toFixed(2)}x</b>
      </span>
      <span className="text-muted-foreground text-[11px] flex items-center gap-1.5">
        Heat
        <span className="w-16 h-1 rounded-full bg-border overflow-hidden relative">
          <span
            className={cn('absolute inset-y-0 left-0', chain.heat > 3 ? 'bg-destructive' : 'bg-success')}
            style={{ width: `${Math.min(100, Math.max(0, (chain.heat / 3) * 100))}%` }}
          />
        </span>
        <b className="font-mono tabular-nums text-foreground text-[13px]">{chain.heat.toFixed(2)}% / 3.00%</b>
      </span>
      <span className="text-muted-foreground text-[11px]">
        Daily headroom <b className="font-mono tabular-nums text-foreground text-[13px]">{fmtIDR(chain.dailyHeadroom)}</b>
      </span>
      <span className="text-muted-foreground text-[11px]">
        Risk budget <b className="font-mono tabular-nums text-foreground text-[13px]">{fmtIDR(chain.adjustedRiskBudget)}</b>
      </span>
      <span className="text-muted-foreground text-[11px]">
        Active NAV <b className="font-mono tabular-nums text-foreground text-[13px]">{fmtIDR(chain.activeTradingNav)}</b>
      </span>
      {onEditMandate && (
        <button onClick={onEditMandate} title="Edit mandate" className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default GateBar;
