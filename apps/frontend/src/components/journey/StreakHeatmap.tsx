import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

async function fetchDailyActivity(): Promise<Record<string, number>> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 83); // 12 weeks = 84 days
  const r = await fetch(
    `${API}/api/transactions?page=1&pageSize=1000&from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`
  );
  if (!r.ok) return {};
  const data = await r.json();
  const items: { date: string }[] = data.items ?? data ?? [];
  const counts: Record<string, number> = {};
  for (const tx of items) {
    const day = tx.date?.slice(0, 10);
    if (day) counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

function buildWeeks(): Date[][] {
  const today = new Date();
  const days: Date[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  const weeks: Date[][] = [];
  let week: Date[] = [];
  for (const day of days) {
    week.push(day);
    if (day.getDay() === 6) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);
  return weeks;
}

function cellColor(count: number | undefined): string {
  if (!count) return 'bg-muted';
  if (count === 1) return 'bg-emerald-200';
  if (count <= 3)  return 'bg-emerald-400';
  return 'bg-emerald-600';
}

export const StreakHeatmap = () => {
  const { data: activity = {} } = useQuery({
    queryKey: ['streak-activity'],
    queryFn: fetchDailyActivity,
    staleTime: 5 * 60 * 1000,
  });

  const weeks = buildWeeks();
  const dayLabels = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1" style={{ minWidth: 'max-content' }}>
        {/* Day labels */}
        <div className="flex flex-col gap-1 justify-around mr-1">
          {dayLabels.map((label, i) => (
            <span key={i} className="text-[9px] text-muted-foreground w-5 text-right leading-none"
              style={{ height: 10 }}>
              {label}
            </span>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, di) => {
              const day = week[di];
              if (!day) return <div key={di} className="w-2.5 h-2.5 rounded-sm opacity-0" />;
              const key = day.toISOString().slice(0, 10);
              const count = activity[key];
              return (
                <Tooltip key={di}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('w-2.5 h-2.5 rounded-sm transition-colors cursor-default', cellColor(count))}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="text-xs">
                      {key}: {count ?? 0} transaction{count !== 1 ? 's' : ''}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
