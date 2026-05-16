import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, TrendingUp, TrendingDown, Trash2, ArrowUpRight,
  BarChart3, Zap, Clock, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listSetups, deleteSetup, InvestmentSetupDto } from '@/api/investmentApi';
import { ARCHETYPES } from '@/data/archetypes';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Dummy market data ───────────────────────────────────────────────────────
const MARKET_INDICES = [
  { label: 'IHSG',    value: '6,723',  change: -1.98, flag: '🇮🇩' },
  { label: 'S&P 500', value: '5,908',  change: +0.24, flag: '🇺🇸' },
  { label: 'NASDAQ',  value: '19,230', change: -0.41, flag: '🇺🇸' },
  { label: 'Nikkei',  value: '37,120', change: -0.88, flag: '🇯🇵' },
  { label: 'Gold',    value: '3,280',  change: +0.51, flag: '🥇' },
  { label: 'USD/IDR', value: '16,240', change: +0.32, flag: '💱' },
];

const DUMMY_ALLOCATION = [
  { name: 'Equity',    value: 60, color: '#6366F1' },
  { name: 'Bonds',     value: 20, color: '#10B981' },
  { name: 'Gold',      value: 10, color: '#F59E0B' },
  { name: 'Cash',      value: 10, color: '#94A3B8' },
];

const DUMMY_INSIGHTS = [
  'Equity concentration at 60% — within archetype range. Monitor IHSG correction risk.',
  'BBCA holding has appreciated 18% since last review. Consider trimming 5% to rebalance.',
  'Add bonds exposure — current allocation 20% vs target 25–30% for Balanced archetype.',
];

// ─── Dummy per-setup enrichment (overlaid on real setups from API) ───────────
const DUMMY_SETUP_STATS: Record<string, {
  totalValue: string; returnPct: number; holdingsCount: number;
  lastReview: string; alloc: { label: string; pct: number; color: string }[];
}> = {
  _default: {
    totalValue: 'Rp 245.8 M',
    returnPct: +12.4,
    holdingsCount: 5,
    lastReview: 'May 2026',
    alloc: [
      { label: 'Equity', pct: 60, color: '#6366F1' },
      { label: 'Bonds',  pct: 20, color: '#10B981' },
      { label: 'Gold',   pct: 10, color: '#F59E0B' },
      { label: 'Cash',   pct: 10, color: '#94A3B8' },
    ],
  },
};

const getStats = (id: string) => DUMMY_SETUP_STATS[id] ?? DUMMY_SETUP_STATS._default;

// ─── Sub-components ───────────────────────────────────────────────────────────

const MetricCard = ({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean;
}) => (
  <Card className="flex-1 min-w-0">
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      {sub && (
        <div className={cn(
          'text-xs mt-0.5 font-medium',
          positive === true  ? 'text-emerald-500' :
          positive === false ? 'text-red-500' :
          'text-muted-foreground',
        )}>{sub}</div>
      )}
    </CardContent>
  </Card>
);

const MarketRow = ({ label, value, change, flag }: typeof MARKET_INDICES[0]) => (
  <div className="flex items-center justify-between py-1.5">
    <div className="flex items-center gap-2">
      <span className="text-base leading-none">{flag}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
    <div className="flex items-center gap-2 text-right">
      <span className="text-xs tabular-nums">{value}</span>
      <span className={cn(
        'text-[10px] font-semibold tabular-nums w-14 text-right',
        change >= 0 ? 'text-emerald-500' : 'text-red-500',
      )}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  </div>
);

const AllocBar = ({ alloc }: { alloc: { label: string; pct: number; color: string }[] }) => (
  <div className="flex rounded overflow-hidden h-1.5 w-full gap-px">
    {alloc.map(a => (
      <div key={a.label} style={{ width: `${a.pct}%`, background: a.color }} />
    ))}
  </div>
);

const SetupCard = ({
  setup,
  onDelete,
  onClick,
}: {
  setup: InvestmentSetupDto;
  onDelete: (id: string) => void;
  onClick: () => void;
}) => {
  const arch  = ARCHETYPES.find(a => a.id === setup.archetypeId);
  const stats = getStats(setup.id);

  return (
    <Card
      className="group cursor-pointer hover:border-foreground/25 transition-all duration-150"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
              style={{ background: arch ? `${arch.color}18` : '#f1f5f9' }}
            >
              {arch?.glyph ?? '📊'}
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{setup.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {arch?.label ?? setup.archetypeId}
                <span className="mx-1">·</span>
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-60">
                  {setup.baseCurrency}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={e => { e.stopPropagation(); onDelete(setup.id); }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        {/* Allocation bar */}
        <AllocBar alloc={stats.alloc} />

        {/* Stats row */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              {stats.holdingsCount} holdings
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {stats.lastReview}
            </span>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold tabular-nums">{stats.totalValue}</div>
            <div className={cn(
              'text-[10px] font-medium tabular-nums',
              stats.returnPct >= 0 ? 'text-emerald-500' : 'text-red-500',
            )}>
              {stats.returnPct >= 0 ? '+' : ''}{stats.returnPct}% return
            </div>
          </div>
        </div>

        {/* Allocation legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
          {stats.alloc.map(a => (
            <div key={a.label} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
              <span className="text-[10px] text-muted-foreground">{a.label} {a.pct}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const InvestmentHome = () => {
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const { data: setups = [], isLoading } = useQuery({
    queryKey: ['investment', 'setups'],
    queryFn: listSetups,
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSetup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment', 'setups'] }),
  });

  return (
    <div className="flex-1 p-6 overflow-auto">

      {/* ── Summary metric cards ─────────────────────────────────────────── */}
      <div className="flex gap-3 mb-5">
        <MetricCard label="Total Portfolio" value="Rp 245.8 M" sub="across 1 setup" />
        <MetricCard label="Est. Return" value="+12.4%" sub="+Rp 27.1 M" positive={true} />
        <MetricCard label="Holdings" value="5" sub="5 positions" />
        <MetricCard label="Last Review" value="May 2026" sub="3 days ago" />
        <div className="flex-1 flex items-center justify-end">
          <Button onClick={() => navigate('/investment/new')} size="sm" className="h-9 px-4">
            <Plus className="w-4 h-4 mr-1.5" />
            New setup
          </Button>
        </div>
      </div>

      {/* ── Body: left (setups) + right (market + insights) ──────────────── */}
      <div className="flex gap-5 items-start">

        {/* Left — setup cards */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          )}

          {!isLoading && setups.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-muted-foreground" />
                </div>
                <h2 className="text-base font-medium mb-1">No portfolios yet</h2>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                  Create a setup, enter your holdings, and run an AI portfolio review.
                </p>
                <Button onClick={() => navigate('/investment/new')} size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New setup
                </Button>
              </CardContent>
            </Card>
          )}

          {setups.map((setup: InvestmentSetupDto) => (
            <SetupCard
              key={setup.id}
              setup={setup}
              onDelete={id => deleteMutation.mutate(id)}
              onClick={() => navigate(`/investment/${setup.id}`)}
            />
          ))}

          {/* Dummy data note */}
          {setups.length > 0 && (
            <p className="text-[11px] text-muted-foreground/50 text-center pt-1">
              Portfolio values and returns are illustrative — connect holdings to a price feed to see live data.
            </p>
          )}
        </div>

        {/* Right — sidebar panels */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">

          {/* Market pulse */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Market Pulse
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 divide-y divide-border">
              {MARKET_INDICES.map(m => <MarketRow key={m.label} {...m} />)}
            </CardContent>
          </Card>

          {/* Allocation snapshot */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Allocation Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={DUMMY_ALLOCATION}
                      cx="50%" cy="50%"
                      innerRadius={42} outerRadius={62}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {DUMMY_ALLOCATION.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, '']}
                      contentStyle={{ fontSize: 11, borderRadius: 6, padding: '4px 8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
                {DUMMY_ALLOCATION.map(a => (
                  <div key={a.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }} />
                    <span className="text-xs text-muted-foreground">{a.name}</span>
                    <span className="text-xs font-semibold ml-auto">{a.value}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Last AI insight */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Last AI Insight
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-auto">May 2026</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex flex-col gap-2.5">
              {DUMMY_INSIGHTS.map((insight, i) => (
                <div key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <Zap className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                  <span>{insight}</span>
                </div>
              ))}
              <Button
                variant="outline" size="sm"
                className="mt-1 w-full text-xs h-7"
                onClick={() => navigate('/investment/ai-review')}
              >
                View full analysis
                <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default InvestmentHome;
