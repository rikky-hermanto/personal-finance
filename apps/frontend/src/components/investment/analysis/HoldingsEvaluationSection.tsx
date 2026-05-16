import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HoldingEval {
  name: string;
  ticker?: string;
  asset_class: string;
  current_allocation_pct?: number;
  recommendation: 'HOLD' | 'ADD' | 'REDUCE' | 'REPLACE' | 'SELL';
  conviction: 'HIGH' | 'MEDIUM' | 'LOW';
  rationale: string;
  risk_flags?: string[];
}

const RECO_COLORS: Record<string, string> = {
  HOLD: 'bg-blue-500/10 text-blue-600',
  ADD: 'bg-emerald-500/10 text-emerald-600',
  REDUCE: 'bg-amber-500/10 text-amber-600',
  REPLACE: 'bg-orange-500/10 text-orange-600',
  SELL: 'bg-red-500/10 text-red-600',
};

const HoldingsEvaluationSection = ({ data }: { data: { holdings: HoldingEval[] } }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">2 — Holdings Evaluation</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {data.holdings?.map((h, i) => (
          <div key={i} className="p-3 rounded-lg border bg-foreground/2 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-medium">{h.name}</span>
                {h.ticker && <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">{h.ticker}</span>}
                <span className="text-[10px] text-muted-foreground ml-1.5">{h.asset_class}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {h.current_allocation_pct != null && (
                  <span className="text-[10px] text-muted-foreground font-mono">{h.current_allocation_pct}%</span>
                )}
                <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', RECO_COLORS[h.recommendation] ?? 'bg-foreground/5')}>
                  {h.recommendation}
                </span>
                <span className="text-[10px] text-muted-foreground">{h.conviction}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{h.rationale}</p>
            {h.risk_flags && h.risk_flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {h.risk_flags.map((f, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{f}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default HoldingsEvaluationSection;
