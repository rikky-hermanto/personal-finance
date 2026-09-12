import { cn } from '@/lib/utils';
import type { MacroScenarioResult } from '@/lib/macroScenario';

interface CapitalFlowPanelProps {
  result: MacroScenarioResult;
}

const flowTone = (v: number) => (v > 12 ? 'text-success' : v < -12 ? 'text-destructive' : 'text-warning');
const flowBg = (v: number) => (v > 12 ? 'bg-success' : v < -12 ? 'bg-destructive' : 'bg-warning');

const CapitalFlowPanel = ({ result }: CapitalFlowPanelProps) => {
  const { state, flowNarrative } = result;
  const pct = Math.abs(state.flow) / 2;

  return (
    <div className="pf-card p-4 mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3.5">
        <span className="text-sm text-foreground font-medium">Global capital flow into Indonesia</span>
        <span className={cn('font-data text-xl tabular-nums', flowTone(state.flow))}>{state.flow >= 0 ? '+' : ''}{state.flow.toFixed(1)}</span>
      </div>

      <div className="relative h-3.5 bg-secondary rounded-sm mb-1.5">
        <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-border" />
        <div
          className={cn('absolute top-0 bottom-0 rounded-sm', flowBg(state.flow))}
          style={{ left: state.flow >= 0 ? '50%' : `${50 - pct}%`, width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-4">
        <span>Out to dollar assets</span><span>Into Indonesian assets</span>
      </div>

      <div className="grid gap-x-6 gap-y-2 mb-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))' }}>
        {state.flowParts.map((p) => {
          const w = Math.min(50, Math.abs(p.contribution) / 1.4);
          return (
            <div key={p.label} className="flex items-center gap-2.5">
              <div className="flex-1 text-xs text-muted-foreground">{p.label}</div>
              <div className="font-data text-[11px] text-muted-foreground w-16 text-right tabular-nums">{p.raw}</div>
              <div className="relative w-[70px] h-[5px] bg-secondary shrink-0">
                <div className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px bg-border" />
                <div
                  className={cn('absolute top-0 bottom-0', p.contribution >= 0 ? 'bg-success' : 'bg-destructive')}
                  style={{ left: p.contribution >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[74ch]">{flowNarrative}</p>
      {state.idr < -4 && (
        <div className="mt-3 pt-3 border-t border-border text-[12.5px] text-warning leading-relaxed">
          FX feedback active: a {Math.abs(state.idr).toFixed(1)}% depreciation adds roughly {(0.22 * Math.abs(state.idr)).toFixed(1)} pp
          of imported inflation, pushes NPLs up through FX debt, and forces rates higher again.
        </div>
      )}
    </div>
  );
};

export default CapitalFlowPanel;
