import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ExampleGoalCard, GettingStartedCard, StarterTile } from '@/components/goals/EmptyStateGuide';
import { FoundationCheckCard } from '@/components/goals/FoundationCheckCard';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalOverlays } from '@/components/goals/GoalOverlays';
import { GoalsDisclosure } from '@/components/goals/GoalsDisclosure';
import { MonthlyPlanCard } from '@/components/goals/MonthlyPlanCard';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/goals/goalUi';
import { useGoalList, useGoalOverlays } from '@/hooks/use-goals';
import { COPY } from '@/lib/goals/copy';

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4';

export default function PlansTab() {
  const { query, items, total, foundation, summary } = useGoalList('open');
  const ui = useGoalOverlays(items);
  const loading = query.isPending;
  // Guidance, not data, only once the first page says there are no open goals (never while loading).
  const empty = !loading && !query.isError && total === 0;
  const hasActive = items.some((g) => g.status === 'active');

  return (
    <div className="p-8 min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <p className="text-sm text-muted-foreground">{COPY.pageIntro}</p>
          {!empty && !loading && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => ui.contribute('pick')} disabled={!hasActive} className={SECONDARY_BUTTON}>
                {COPY.recordContribution}
              </button>
              <button type="button" onClick={() => ui.newGoal()} className={PRIMARY_BUTTON}>
                <Plus size={14} />
                {COPY.newGoal}
              </button>
            </div>
          )}
        </div>

        {query.isError && (
          <p className="mb-8 text-sm text-muted-foreground" role="alert">
            Big Purchases could not load just now. Try again in a moment.
          </p>
        )}

        <div className="flex flex-wrap gap-4 mb-8">
          {loading ? (
            <>
              <Skeleton className="flex-[7_1_440px] h-64 rounded-2xl" />
              <Skeleton className="flex-[5_1_340px] h-64 rounded-2xl" />
            </>
          ) : (
            <>
              {empty ? <GettingStartedCard onStart={() => ui.newGoal()} /> : summary && <MonthlyPlanCard summary={summary} />}
              {foundation && <FoundationCheckCard foundation={foundation} />}
            </>
          )}
        </div>

        {empty ? (
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-[15px] font-medium text-foreground">{COPY.emptyGoalsTitle}</h2>
            <span className="text-[11px] text-muted-foreground">{COPY.emptyGoalsMeta}</span>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-[15px] font-medium text-foreground">
              Goals <span className="text-muted-foreground font-normal">· {total}</span>
            </h2>
            <span className="text-[11px] text-muted-foreground">{COPY.goalsSorted}</span>
          </div>
        )}

        <div className={GRID}>
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px] rounded-2xl" />)}
          {empty && (
            <>
              <ExampleGoalCard />
              <StarterTile onStart={(c) => ui.newGoal(c)} />
            </>
          )}
          {items.map((g) => (
            <GoalCard key={g.id} goal={g} onOpen={() => ui.openDrawer(g)} onContribute={() => ui.contribute(g)} />
          ))}
          {!empty && !loading && (
            <button
              type="button"
              onClick={() => ui.newGoal()}
              className="rounded-2xl border border-dashed border-border min-h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02] transition-colors"
            >
              <span className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center">
                <Plus size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[13px]">{COPY.newBigPurchase}</span>
            </button>
          )}
        </div>

        {query.hasNextPage && (
          <div className="mt-6">
            <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className={SECONDARY_BUTTON}>
              Load more
            </button>
          </div>
        )}

        <GoalsDisclosure />
      </div>

      <GoalOverlays ui={ui} goals={items} foundation={foundation} />
    </div>
  );
}
