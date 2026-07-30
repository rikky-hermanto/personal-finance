import { useOutletContext } from 'react-router-dom';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { DeskState } from '@/types/desk';
import { fmtIDR } from '@/lib/desk/deskFormat';
import { useResolveReconIssue } from '@/hooks/useDeskState';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const ReconcileTab = () => {
  const state = useOutletContext<DeskState>();
  const resolveIssue = useResolveReconIssue();
  const { toast } = useToast();

  const handleResolve = (id: string, resolution: string) => {
    resolveIssue.mutate({ id, resolution }, {
      onError: () => toast({
        title: 'Failed to update reconciliation',
        description: 'The change was not saved — NAV inputs still reflect the prior state.',
        variant: 'destructive',
      }),
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 text-sm font-semibold">Broker accounts</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground uppercase tracking-wide text-[10px] border-b border-border">
              <th className="text-left font-semibold px-4 py-2">Account</th>
              <th className="text-left font-semibold px-4 py-2">Portfolio</th>
              <th className="text-right font-semibold px-4 py-2">Reported equity</th>
              <th className="text-right font-semibold px-4 py-2">Cash</th>
              <th className="text-left font-semibold px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {state.accounts.map(a => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{a.portfolioLabel ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtIDR(a.reportedEquity)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtIDR(a.cash)}</td>
                <td className="px-4 py-2 text-muted-foreground">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Reconciliation issues</div>
        <div className="space-y-2">
          {state.reconIssues.map(issue => (
            <div key={issue.id} className="rounded-lg border border-border p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{issue.label} — {issue.account}</span>
                {issue.resolution === 'unresolved'
                  ? <span className="text-warning uppercase text-[10px] font-semibold">unresolved</span>
                  : (
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-success text-[10px] font-semibold uppercase"><CheckCircle2 className="w-3 h-3" />{issue.resolution}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => handleResolve(issue.id, 'unresolved')}
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        Undo
                      </Button>
                    </span>
                  )}
              </div>
              {issue.amount != null && (
                <div className="text-muted-foreground mt-1 font-mono tabular-nums">
                  {issue.currency && issue.currency !== 'IDR' ? `${issue.amount} ${issue.currency}` : fmtIDR(issue.amount)}
                </div>
              )}
              {issue.resolution === 'unresolved' && (
                <div className="flex gap-2 mt-2">
                  {issue.options.map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolve(issue.id, value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {state.reconIssues.length === 0 && (
            <p className="text-xs text-muted-foreground">No reconciliation issues.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="text-sm font-semibold mb-1">FX settings</div>
        <p className="text-xs text-muted-foreground">
          FX rate freshness is not tracked live in this phase — the <code>stale-fx</code> gate rule
          is deferred to PF-135 alongside sector concentration and liquidity.
        </p>
      </div>
    </div>
  );
};

export default ReconcileTab;
