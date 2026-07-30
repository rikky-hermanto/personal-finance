import { useNavigate } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { DeskState } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';
import CapitalWaterfall from '@/components/desk/CapitalWaterfall';
import TriageOverlay from '@/components/desk/TriageOverlay';
import RuleLedger from '@/components/desk/RuleLedger';

const CommandTab = () => {
  const state = useOutletContext<DeskState>();
  const navigate = useNavigate();

  const unresolvedRecon = state.reconIssues.filter(r => r.resolution === 'unresolved');
  const topPositions = [...state.positions].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const legacyRisk = state.positions.filter(p => p.sleeve === 'Legacy / Unclassified');

  return (
    <div className="relative min-h-full p-6 space-y-6">
      <TriageOverlay
        state={state}
        onNavigate={(tab) => navigate(`/desk/${tab}`)}
      />

      <CapitalWaterfall chain={state.navChain} />

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold mb-3">Concentration</div>
          <div className="space-y-2">
            {topPositions.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{p.symbol}</span>
                <span className="text-muted-foreground">{p.broker}</span>
                <span className="font-mono tabular-nums">{fmtPct(p.weight, { signed: false })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold mb-3">Unclassified legacy risk</div>
          <p className="text-xs text-muted-foreground mb-2">
            {legacyRisk.length} position{legacyRisk.length === 1 ? '' : 's'} still in{' '}
            <span className="font-medium text-foreground">Legacy / Unclassified</span>. Classify in Portfolio before trading.
          </p>
          <div className="space-y-1.5">
            {legacyRisk.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span>{p.symbol}</span>
                <span className={`font-mono tabular-nums ${p.pnlPct < 0 ? 'text-destructive' : 'text-success'}`}>
                  {fmtPct(p.pnlPct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {unresolvedRecon.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning mb-2">
            <AlertTriangle className="w-4 h-4" />
            {unresolvedRecon.length} reconciliation issue{unresolvedRecon.length === 1 ? '' : 's'} need attention
          </div>
          <div className="space-y-1 text-xs">
            {unresolvedRecon.map(r => (
              <div key={r.id} className="flex items-center justify-between">
                <span>{r.label} — {r.account}</span>
                {r.amount != null && <span className="font-mono tabular-nums">{fmtIDR(r.amount)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        <RuleLedger gate={state.gate} title="Desk-wide gate" />
      </div>
    </div>
  );
};

export default CommandTab;
