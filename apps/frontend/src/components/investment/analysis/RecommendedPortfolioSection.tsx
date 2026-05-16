import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { cn } from '@/lib/utils';

interface TargetAlloc { asset_class: string; current_pct: number; target_pct: number; delta_pct: number; }
interface PriorityAction { action: string; rationale: string; timeline: string; }
interface RecommendedPortfolioData {
  rebalance_urgency: string;
  target_allocations: TargetAlloc[];
  priority_actions: PriorityAction[];
  expected_improvement?: string;
}

const URGENCY_STYLE: Record<string, string> = {
  IMMEDIATE: 'bg-red-500/10 text-red-600',
  WITHIN_30_DAYS: 'bg-amber-500/10 text-amber-600',
  QUARTERLY: 'bg-blue-500/10 text-blue-600',
  NONE: 'bg-foreground/5 text-muted-foreground',
};

const RecommendedPortfolioSection = ({ data }: { data: RecommendedPortfolioData }) => {
  const chartData = (data.target_allocations ?? []).map(a => ({
    name: a.asset_class,
    current: a.current_pct,
    target: a.target_pct,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">7 — Recommended Portfolio</CardTitle>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded', URGENCY_STYLE[data.rebalance_urgency] ?? 'bg-foreground/5')}>
            {data.rebalance_urgency?.replace(/_/g, ' ')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {chartData.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2">Current vs Target allocation</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="current" name="Current" fill="#6366F1" radius={[0, 2, 2, 0]} />
                <Bar dataKey="target" name="Target" fill="#10B981" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.priority_actions && data.priority_actions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2">Priority actions</div>
            <div className="space-y-2">
              {data.priority_actions.map((a, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg border bg-foreground/2">
                  <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                    {i + 1}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">{a.action}</p>
                    <p className="text-[11px] text-muted-foreground">{a.rationale}</p>
                    <span className="text-[10px] text-muted-foreground/70">{a.timeline}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.expected_improvement && (
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <div className="text-[10px] text-emerald-600 font-medium mb-0.5">Expected improvement</div>
            <p className="text-xs">{data.expected_improvement}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecommendedPortfolioSection;
