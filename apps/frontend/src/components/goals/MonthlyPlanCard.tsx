import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COPY, planOverdue, planSub } from '@/lib/goals/copy';
import { goalColor, goalTrack } from '@/lib/goals/colors';
import { formatIdr, formatIdrShort, percentForBar } from '@/lib/goals/money';
import type { GoalPlanSummary } from '@/types/Goal';
import { CARD, CardTitle } from './goalUi';

/** Every number comes from the API summary; segment widths arrive as BarShare percentages. */
export const MonthlyPlanCard = ({ summary }: { summary: GoalPlanSummary }) => {
  const overdue = planOverdue(summary);
  return (
    <section className={`${CARD} flex-[7_1_440px] min-w-0 flex flex-col`} aria-label={COPY.planTitle}>
      <CardTitle right={<span className="text-[11px] text-muted-foreground">{COPY.planMeta}</span>}>{COPY.planTitle}</CardTitle>
      <div className="flex-1 flex flex-col justify-center pt-2 pb-14">
        <div
          className="font-data text-[44px] leading-none tracking-tight text-foreground whitespace-nowrap"
          title={formatIdr(summary.monthlyTotal)}
          data-testid="plan-monthly-total"
        >
          {formatIdrShort(summary.monthlyTotal)}
          <span className="text-lg text-muted-foreground"> / month</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3 text-pretty">
          {planSub(summary)}
          {overdue && <span className="text-warning"> {overdue}</span>}
        </p>
      </div>
      {summary.segments.length > 0 && (
        <div>
          <div className="flex h-2.5 gap-1">
            {summary.segments.map((s) => (
              <Tooltip key={s.goalId}>
                <TooltipTrigger asChild>
                  <div
                    className="h-full rounded-full overflow-hidden basis-0"
                    style={{ flexGrow: percentForBar(s.barShare) || 0.01, background: goalTrack(s.colorIndex) }}
                  >
                    <div className="h-full" style={{ width: `${percentForBar(s.percentComplete)}%`, background: goalColor(s.colorIndex) }} />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  {s.name} · {formatIdr(s.allocated)} of {formatIdr(s.effectiveTarget)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {summary.segments.map((s) => (
              <span key={s.goalId} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: goalColor(s.colorIndex) }} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
