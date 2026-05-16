import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

interface AllocationRow { asset_class: string; current_pct: number; target_pct: number; }
interface DiagnosticsData {
  health_score: number;
  archetype_fit_score: number;
  strengths: string[];
  gaps: string[];
  allocation_summary: AllocationRow[];
}

const ScoreRing = ({ value, label }: { value: number; label: string }) => {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-foreground/10" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
};

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#0EA5E9'];

const DiagnosticsSection = ({ data }: { data: DiagnosticsData }) => {
  const pieData = (data.allocation_summary ?? []).map(r => ({ name: r.asset_class, value: r.current_pct }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">1 — Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-6">
          <ScoreRing value={data.health_score} label="Health" />
          <ScoreRing value={data.archetype_fit_score} label="Fit" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium mb-1.5 text-emerald-600">Strengths</div>
            <ul className="space-y-1">
              {data.strengths?.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-emerald-500 mt-0.5">•</span>{s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5 text-destructive">Gaps</div>
            <ul className="space-y-1">
              {data.gaps?.map((g, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-destructive mt-0.5">•</span>{g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {pieData.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2">Allocation</div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                    dataKey="value" paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name} {d.value}%
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DiagnosticsSection;
