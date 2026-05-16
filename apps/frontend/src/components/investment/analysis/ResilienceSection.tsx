import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StressTest {
  shock_name: string;
  shock_magnitude: string;
  estimated_drawdown_pct: number;
  recovery_months_est?: number;
  most_exposed_holdings?: string[];
}

const GaugeArc = ({ score }: { score: number }) => {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
  // semicircle: radius 15, circumference of half-circle = pi*15 ≈ 47.12
  const half = Math.PI * 15;
  const dash = (pct / 100) * half;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 36 20" className="w-24 h-14">
        <path d="M3 18 A 15 15 0 0 1 33 18" fill="none" stroke="currentColor" strokeWidth="3"
          className="text-foreground/10" strokeLinecap="round" />
        <path d="M3 18 A 15 15 0 0 1 33 18" fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${half}`} />
        <text x="18" y="17" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">{pct}</text>
      </svg>
      <span className="text-[10px] text-muted-foreground">Resilience score</span>
    </div>
  );
};

const ResilienceSection = ({ data }: { data: { overall_resilience_score: number; stress_tests: StressTest[] } }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">5 — Resilience Test</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <GaugeArc score={data.overall_resilience_score} />
      <div className="space-y-2">
        {data.stress_tests?.map((t, i) => (
          <div key={i} className="p-3 rounded-lg border bg-foreground/2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{t.shock_name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{t.shock_magnitude}</span>
                <span className={cn('text-xs font-mono font-bold',
                  t.estimated_drawdown_pct < -30 ? 'text-red-600' :
                  t.estimated_drawdown_pct < -15 ? 'text-amber-600' : 'text-foreground')}>
                  {t.estimated_drawdown_pct}%
                </span>
              </div>
            </div>
            {t.recovery_months_est != null && (
              <span className="text-[10px] text-muted-foreground">Recovery ~{t.recovery_months_est} months</span>
            )}
            {t.most_exposed_holdings && t.most_exposed_holdings.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {t.most_exposed_holdings.map((h, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5">{h}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default ResilienceSection;
