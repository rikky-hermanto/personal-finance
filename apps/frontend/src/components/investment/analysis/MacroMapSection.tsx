import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MacroFactor {
  factor: string;
  direction: 'TAILWIND' | 'HEADWIND' | 'NEUTRAL';
  magnitude: 'HIGH' | 'MEDIUM' | 'LOW';
  portfolio_impact: string;
  source?: string;
}

const DIR_STYLE: Record<string, string> = {
  TAILWIND: 'text-emerald-600 bg-emerald-500/10',
  HEADWIND: 'text-red-600 bg-red-500/10',
  NEUTRAL: 'text-muted-foreground bg-foreground/5',
};
const DIR_ARROW: Record<string, string> = { TAILWIND: '↑', HEADWIND: '↓', NEUTRAL: '→' };

const MacroMapSection = ({ data }: { data: { factors: MacroFactor[] } }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">3 — Macro Map</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.factors?.map((f, i) => (
          <div key={i} className="p-3 rounded-lg border bg-foreground/2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{f.factor}</span>
              <div className="flex items-center gap-1">
                <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', DIR_STYLE[f.direction])}>
                  {DIR_ARROW[f.direction]} {f.direction}
                </span>
                <span className="text-[10px] text-muted-foreground">{f.magnitude}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{f.portfolio_impact}</p>
            {f.source && <span className="text-[10px] text-muted-foreground/60">{f.source}</span>}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default MacroMapSection;
