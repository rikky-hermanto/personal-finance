import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Scenario {
  label: 'BULL' | 'BASE' | 'BEAR';
  probability_pct: number;
  key_driver: string;
  portfolio_return_est: string;
  action_trigger?: string;
  portfolio_adjustments?: string[];
}

const SCENARIO_STYLE: Record<string, string> = {
  BULL: 'border-emerald-500/30 bg-emerald-500/5',
  BASE: 'border-blue-500/30 bg-blue-500/5',
  BEAR: 'border-red-500/30 bg-red-500/5',
};
const SCENARIO_COLOR: Record<string, string> = {
  BULL: 'text-emerald-600', BASE: 'text-blue-600', BEAR: 'text-red-600',
};

const ScenariosSection = ({ data }: { data: { scenarios: Scenario[] } }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">4 — Scenarios</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.scenarios?.map((s, i) => (
          <div key={i} className={cn('p-3 rounded-lg border space-y-2', SCENARIO_STYLE[s.label])}>
            <div className="flex items-center justify-between">
              <span className={cn('text-xs font-bold', SCENARIO_COLOR[s.label])}>{s.label}</span>
              <span className="text-[10px] text-muted-foreground">{s.probability_pct}%</span>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Key driver</div>
              <p className="text-xs">{s.key_driver}</p>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Return est.</div>
              <p className="text-xs font-mono">{s.portfolio_return_est}</p>
            </div>
            {s.action_trigger && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Trigger</div>
                <p className="text-[11px] text-muted-foreground">{s.action_trigger}</p>
              </div>
            )}
            {s.portfolio_adjustments && s.portfolio_adjustments.length > 0 && (
              <ul className="space-y-0.5">
                {s.portfolio_adjustments.map((a, j) => (
                  <li key={j} className="text-[11px] text-muted-foreground flex gap-1">
                    <span>•</span>{a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default ScenariosSection;
