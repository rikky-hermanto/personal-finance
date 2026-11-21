import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getGoals } from '@/api/goalsApi';
import type { Goal, GoalCategory } from '@/types/Goal';

const PAGE_SIZE = 50;

/** Big Purchases goals for one tab, 50 per page with "Load more". Order comes from the API (priority, then date). */
export function useGoalList(status: 'open' | 'closed') {
  const query = useInfiniteQuery({
    queryKey: ['goals', 'big_purchase', status],
    queryFn: ({ pageParam }) => getGoals({ kind: 'big_purchase', status, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, p) => n + p.items.length, 0) < last.total ? last.page + 1 : undefined),
  });
  const first = query.data?.pages[0];
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return { query, items, total: first?.total ?? 0, foundation: first?.foundation, summary: first?.summary ?? null };
}

/** The page owns the UI state: which goal's drawer is open, the goal form, and the contribution form. */
export function useGoalOverlays(items: Goal[]) {
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [form, setForm] = useState<'new' | Goal | null>(null);
  const [preset, setPreset] = useState<GoalCategory | null>(null);
  const [contribution, setContribution] = useState<Goal | 'pick' | null>(null);

  return {
    openGoal: items.find((g) => g.id === openGoalId) ?? null,
    openDrawer: (g: Goal) => setOpenGoalId(g.id),
    closeDrawer: () => setOpenGoalId(null),
    form,
    preset,
    newGoal: (category?: GoalCategory) => {
      setPreset(category ?? null);
      setForm('new');
    },
    editGoal: (g: Goal) => setForm(g),
    closeForm: () => setForm(null),
    contribution,
    contribute: (g: Goal | 'pick') => setContribution(g),
    closeContribution: () => setContribution(null),
  };
}
