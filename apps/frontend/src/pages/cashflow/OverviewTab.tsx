import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '@/api/transactionsApi';
import { getInsights, getDailyPulse } from '@/api/insightsApi';
import type { DashboardData } from '@/types/Dashboard';
import type { Insight } from '@/types/Insight';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import TopSpendingCard from '@/components/dashboard/widgets/TopSpendingCard';
import CurrentBalanceStrip from '@/components/dashboard/CurrentBalanceStrip';
import { DailyPulse } from '@/components/cashflow/DailyPulse';
import { CashflowQuestStrip } from '@/components/cashflow/CashflowQuestStrip';
import { InsightStack } from '@/components/cashflow/InsightStack';
import { Button } from '@/components/ui/button';
import { Upload, Zap, Shield, Target, ArrowRight, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CashflowQuest } from '@/components/cashflow/CashflowQuestStrip';

interface ActiveQuest {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  points: number;
  tag: string;
  actionPath: string;
}

const CASHFLOW_QUESTS: ActiveQuest[] = [
  {
    id: 'cq-monthly-budget',
    title: 'Review your monthly budget',
    description: "Check last month's spending breakdown and identify the top category to reduce.",
    difficulty: 'Easy',
    points: 10,
    tag: 'spend it income',
    actionPath: '/cashflow/overview',
  },
  {
    id: 'cq-savings-balance',
    title: 'Update your savings account balance',
    description: 'Record your current savings balance to get an accurate emergency fund score.',
    difficulty: 'Easy',
    points: 8,
    tag: 'liquid savings ratio',
    actionPath: '/assets',
  },
  {
    id: 'cq-debt-obligations',
    title: 'Check debt obligations',
    description: 'Review your active liabilities and update monthly payment amounts.',
    difficulty: 'Medium',
    points: 6,
    tag: 'manageable dti',
    actionPath: '/assets',
  },
];

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

const MOCK_INSIGHTS: Insight[] = [
  {
    id: 'mock-statement-gap-superbank',
    type: 'statement_gap',
    severity: 'alert',
    title: 'Superbank: statement belum diupload',
    body: 'Data terakhir dari Superbank sudah 42 hari yang lalu. Upload statement terbaru agar insight tetap akurat.',
    metricLabel: 'Hari terakhir',
    metricValue: 42,
    actionType: 'navigate',
    actionTarget: '/cashflow/upload',
    validUntil: '2026-06-28',
  },
  {
    id: 'mock-over-budget-food',
    type: 'over_budget',
    severity: 'warning',
    title: 'Food sudah melebihi rata-rata',
    body: 'Pengeluaran Food bulan ini Rp 1.850.000, sudah 48% di atas rata-rata 3 bulan terakhir (Rp 1.250.000). Pertimbangkan untuk mengurangi frekuensi makan di luar.',
    metricLabel: 'Di atas rata-rata',
    metricValue: 48,
    category: 'Food',
    actionType: null,
    actionTarget: null,
    validUntil: '2026-05-31',
  },
  {
    id: 'mock-habit-break-investment',
    type: 'habit_break',
    severity: 'streak_break',
    title: 'Belum ada transaksi investasi bulan ini',
    body: 'Kamu biasanya berinvestasi setiap bulan. Bulan ini belum ada. Cek apakah sudah terjadwal atau transfer manual ke rekening investasimu.',
    metricLabel: 'Bulan berturut sebelumnya',
    metricValue: 3,
    actionType: 'navigate',
    actionTarget: '/investment/overview',
    validUntil: '2026-05-31',
  },
  {
    id: 'mock-large-tx-medical',
    type: 'large_transaction',
    severity: 'info',
    title: 'Transaksi besar di Medical',
    body: 'Klinik Hewan Sehat (15 Mei) senilai Rp 2.100.000 — lebih dari 2× rata-rata bulananmu untuk kategori ini (Rp 950.000).',
    metricLabel: 'Rata-rata bulanan',
    metricValue: 950000,
    category: 'Medical',
    actionType: null,
    actionTarget: null,
    validUntil: '2026-06-04',
  },
  {
    id: 'mock-under-budget-transport',
    type: 'under_budget',
    severity: 'win',
    title: 'Hemat di Transport bulan ini!',
    body: 'Kamu menghemat sekitar Rp 320.000 di Transport dibanding rata-rata. Mungkin lebih banyak WFH bulan ini? Bisa dialokasikan ke tabungan darurat.',
    metricLabel: 'Dihemat bulan ini',
    metricValue: 320000,
    category: 'Transport',
    actionType: 'navigate',
    actionTarget: '/investment/overview',
    validUntil: '2026-05-31',
  },
];

const OverviewTab = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useLocalStorage<number>('pf_overview_range', 1);
  const [chartExpanded, setChartExpanded] = useLocalStorage<boolean>('pf_overview_chart_open', true);

  const { data: insights = [], isLoading: insightsLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: getInsights,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['daily-pulse'],
    queryFn: getDailyPulse,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getDashboardData(undefined, undefined, undefined, range);
        setData(result);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Could not load dashboard data — check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [range]);

  const isPreview = !insightsLoading && insights.length === 0;
  const displayInsights: Insight[] = isPreview ? MOCK_INSIGHTS : insights;
  const sparklineNets = data?.cashFlow?.map(m => m.net) ?? [];

  const quests: CashflowQuest[] = [
    ...insights.filter(i => i.type === 'statement_gap').map(i => ({
      id: i.id,
      label: i.title,
      actionPath: '/cashflow/upload',
      icon: 'alert' as const,
    })),
    ...(insights.some(i => i.type === 'habit_break')
      ? [{ id: 'habit', label: 'Check investment habits', actionPath: '/investment/overview', icon: 'refresh' as const }]
      : []),
  ];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <CurrentBalanceStrip />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-medium gap-1.5"
              onClick={() => navigate('/cashflow/upload')}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Statement
            </Button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <Button
                  key={r.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-2.5 text-xs font-medium transition-all rounded-md',
                    range === r.value
                      ? 'bg-secondary text-foreground hover:bg-secondary'
                      : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                  )}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Daily Pulse */}
        <DailyPulse pulse={pulse ?? null} isLoading={pulseLoading} />

        {/* Quest chips */}
        {quests.length > 0 && <CashflowQuestStrip quests={quests} />}

        {/* Main 2-col: [Net Cashflow + Insights] | [Top Categories] */}
        <div className="grid grid-cols-[1fr_300px] gap-4 items-start">

          {/* Left column */}
          <div className="space-y-3">
            <NetCashflowCard
              data={data?.currentMonth || null}
              isLoading={isLoading}
              sparklineData={sparklineNets}
              chartData={data?.cashFlow || null}
              chartExpanded={chartExpanded}
              onToggleChart={() => setChartExpanded(!chartExpanded)}
            />

            {/* Staleness badge */}
            {!error && data?.dataThrough && (() => {
              const [monthName, yearStr] = data.dataThrough.split(' ');
              const dateThroughDate = new Date(`${monthName} 1, ${yearStr}`);
              const isStale = !isNaN(dateThroughDate.getTime()) &&
                new Date().getTime() - dateThroughDate.getTime() > 30 * 24 * 60 * 60 * 1000;
              return isStale ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span>Data through {data.dataThrough} —{' '}</span>
                  <button
                    onClick={() => navigate('/cashflow/upload')}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    upload a new statement to sync
                  </button>
                </div>
              ) : null;
            })()}

            {/* Preview label */}
            {isPreview && (
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/60">PREVIEW</span>
                <span className="text-[11px] text-muted-foreground/60">Sample insights — real data appears after PF-121 ships</span>
              </div>
            )}

            <InsightStack insights={displayInsights} isLoading={insightsLoading} />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <TopCategoriesCard
              data={data?.topCategories || null}
              month={data?.currentMonth?.month || ''}
              isLoading={isLoading}
            />
            <TopSpendingCard />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* YTD single-month notice */}
        {range === 0 && data && data.cashFlow.length === 1 && (
          <p className="text-xs text-muted-foreground">
            Showing {data.dataThrough} only — upload data for subsequent months to see full YTD.
          </p>
        )}

        {/* Active Quests */}
        <div className="space-y-3 pt-3">
          <h2 className="text-lg font-semibold text-foreground">Active Quests</h2>
          <div className="grid grid-cols-3 gap-3">
            {CASHFLOW_QUESTS.map(quest => {
              const difficultyColor =
                quest.difficulty === 'Easy' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' :
                quest.difficulty === 'Medium' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' :
                'text-rose-600 bg-rose-50 dark:bg-rose-950/40';
              const DiffIcon = quest.difficulty === 'Easy' ? Zap : quest.difficulty === 'Medium' ? Shield : Target;
              return (
                <div key={quest.id} className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground leading-snug">{quest.title}</span>
                      <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', difficultyColor)}>
                        <DiffIcon className="h-3 w-3" />
                        {quest.difficulty}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{quest.description}</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">+{quest.points} pts</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">{quest.tag}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(quest.actionPath)}
                        className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
                      >
                        Start <ArrowRight className="h-3 w-3" />
                      </button>
                      <span className="text-muted-foreground/30">·</span>
                      <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Bell className="h-3 w-3" /> Remind me
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverviewTab;
