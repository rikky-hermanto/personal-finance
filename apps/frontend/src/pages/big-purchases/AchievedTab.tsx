import { Skeleton } from '@/components/ui/skeleton';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalOverlays } from '@/components/goals/GoalOverlays';
import { GoalsDisclosure } from '@/components/goals/GoalsDisclosure';
import { SECONDARY_BUTTON } from '@/components/goals/goalUi';
import { useGoalList, useGoalOverlays } from '@/hooks/use-goals';
import { COPY } from '@/lib/goals/copy';

export default function AchievedTab() {
  const { query, items, foundation } = useGoalList('closed');
  const ui = useGoalOverlays(items);

  return (
    <div className="p-8 min-h-full">
      <div className="max-w-7xl mx-auto">
        {query.isError && (
          <p className="mb-8 text-sm text-muted-foreground" role="alert">
            Big Purchases could not load just now. Try again in a moment.
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {query.isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px] rounded-2xl" />)}
          {items.map((g) => (
            <GoalCard key={g.id} goal={g} onOpen={() => ui.openDrawer(g)} onContribute={() => ui.contribute(g)} />
          ))}
          {!query.isPending && !query.isError && items.length === 0 && (
            <div className="col-span-full py-20 text-center text-sm text-muted-foreground">{COPY.achievedEmpty}</div>
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
