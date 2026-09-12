import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import StatTile from './StatTile';
import { verdictLabel, type StakeholderRow } from '@/lib/macroScenario';

interface StakeholderLedgerProps {
  rows: StakeholderRow[];
}

const scoreClass = (v: number) => (v > 12 ? 'text-success' : v < -12 ? 'text-destructive' : 'text-warning');
const scoreFill = (v: number) => (v > 12 ? 'hsl(var(--success))' : v < -12 ? 'hsl(var(--destructive))' : 'hsl(var(--warning))');

const StakeholderLedger = ({ rows }: StakeholderLedgerProps) => {
  const pctBar = (score: number) => Math.abs(score) / 2;
  const barData = rows.map((r) => ({ name: r.name, score: +r.score.toFixed(1) }));

  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between border-b border-border pb-2 mb-1">
        <span className="text-sm text-foreground font-medium">Net impact by stakeholder</span>
        <span className="font-data text-[11px] text-muted-foreground tabular-nums">−100 · 0 · +100</span>
      </div>
      {rows.map((row, idx) => (
        <div key={row.key} className={cn('py-4', idx < rows.length - 1 && 'border-b border-border/60')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[17px] text-foreground tracking-tight">{row.name}</div>
              <div className="text-xs text-muted-foreground">{row.subtitle}</div>
            </div>
            <div className="text-right">
              <div className={cn('font-data text-2xl leading-none tabular-nums', scoreClass(row.score))}>
                {row.score >= 0 ? '+' : ''}{row.score.toFixed(1)}
              </div>
              <div className="text-[11px] text-muted-foreground">{verdictLabel(row.score)}</div>
            </div>
          </div>
          <div className="relative h-2.5 mt-3 mb-3.5 bg-secondary rounded-sm">
            <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-border" />
            <div
              className={cn('absolute top-0 bottom-0 rounded-sm', scoreClass(row.score).replace('text-', 'bg-'))}
              style={{ left: row.score >= 0 ? '50%' : `${50 - pctBar(row.score)}%`, width: `${pctBar(row.score)}%` }}
            />
          </div>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {row.stats.map((s) => <StatTile key={s.label} {...s} />)}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground max-w-[72ch]">{row.mechanism}</p>
        </div>
      ))}

      <div className="pf-card p-3.5 mt-5">
        <div className="text-[13px] text-muted-foreground mb-2.5">Winners and losers</div>
        <ResponsiveContainer width="100%" height={215}>
          <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
            <XAxis type="number" domain={[-100, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <Tooltip
              cursor={{ fill: 'hsl(var(--foreground) / 0.03)' }}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 3, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v}`, 'score']}
            />
            <Bar dataKey="score" radius={[0, 2, 2, 0]}>
              {barData.map((d) => <Cell key={d.name} fill={scoreFill(d.score)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StakeholderLedger;
