import { useState } from 'react';
import { CheckCircle2, Circle, ShieldHalf } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeskState } from '@/types/desk';
import { Button } from '@/components/ui/button';

interface TriageOverlayProps {
  state: DeskState;
  onNavigate: (tab: 'reconcile' | 'portfolio' | 'mandate') => void;
}

const TriageOverlay = ({ state, onNavigate }: TriageOverlayProps) => {
  const [dismissed, setDismissed] = useState(false);

  const steps = [
    {
      key: 'recon',
      label: 'Resolve all reconciliation issues',
      done: state.reconIssues.every(r => r.resolution !== 'unresolved'),
      tab: 'reconcile' as const,
    },
    {
      key: 'sleeve',
      label: 'Classify every legacy position',
      done: state.positions.every(p => p.sleeve !== 'Legacy / Unclassified'),
      tab: 'portfolio' as const,
    },
    {
      key: 'mandate',
      label: 'Create a mandate',
      done: state.mandateVersions.length > 0,
      tab: 'mandate' as const,
    },
    {
      key: 'nav-approved',
      label: 'Approve Active Trading NAV',
      done: state.gate.rows.find(r => r.id === 'nav-approved')?.state === 'pass',
      tab: 'mandate' as const,
    },
  ];

  const allDone = steps.every(s => s.done);

  // Dismissal is local UI state only — it never affects the gate. The gate stays BLOCKED on
  // nav-approved until step 4 genuinely completes server-side, regardless of this overlay.
  if (dismissed || allDone) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-1">
          <ShieldHalf className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
          <div className="text-base font-semibold">Set up the Trading Desk</div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Complete these steps before trading unlocks. Nothing here executes trades.
        </p>
        <div className="space-y-2.5 mb-5">
          {steps.map(s => (
            <button
              key={s.key}
              onClick={() => onNavigate(s.tab)}
              className={cn(
                'w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-xs transition-colors',
                s.done ? 'text-muted-foreground' : 'text-foreground hover:bg-foreground/5'
              )}
            >
              {s.done
                ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                : <Circle className="w-4 h-4 flex-shrink-0" />}
              <span className={cn(s.done && 'line-through')}>{s.label}</span>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setDismissed(true)}>
          Continue looking around
        </Button>
      </div>
    </div>
  );
};

export default TriageOverlay;
