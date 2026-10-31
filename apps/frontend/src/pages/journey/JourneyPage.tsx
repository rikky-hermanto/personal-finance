import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LivingGardenHero } from '@/components/journey/LivingGardenHero';
import { TierCard } from '@/components/journey/TierCard';
import { QuestCard } from '@/components/journey/QuestCard';
import { HarvestPanel } from '@/components/journey/HarvestPanel';
import {
  getJourneyState,
  getJourneyQuests,
  recalculateJourney,
  setQuestFocus,
  snoozeQuest,
  markHarvestSeen,
} from '@/api/journeyApi';
import { rhythmLabel } from '@/lib/journey/harvest/rhythm';
import type { Harvest, QuestBoard } from '@/types/Journey';

export const JourneyPage = () => {
  const queryClient = useQueryClient();

  const { data: state, isLoading: stateLoading } = useQuery({
    queryKey: ['journey-state'],
    queryFn: getJourneyState,
    staleTime: 5 * 60 * 1000,
    // Uploads and asset edits change the scores while this page is closed.
    refetchOnMount: 'always',
  });

  const { data: board, isLoading: questsLoading } = useQuery({
    queryKey: ['journey-quests'],
    queryFn: getJourneyQuests,
    refetchOnMount: 'always',
  });

  const recalc = useMutation({
    mutationFn: recalculateJourney,
    onSuccess: (data) => {
      queryClient.setQueryData(['journey-state'], data);
      queryClient.invalidateQueries({ queryKey: ['journey-quests'] });
    },
  });

  const setBoard = (next: QuestBoard) => queryClient.setQueryData(['journey-quests'], next);
  const focusQuest = useMutation({ mutationFn: setQuestFocus, onSuccess: setBoard });
  const snooze = useMutation({ mutationFn: snoozeQuest, onSuccess: setBoard });
  const questBusy = focusQuest.isPending || snooze.isPending;

  // Snapshot the harvest once, so a refetch (after mark-seen, or on window focus) cannot remove the
  // panel in the middle of the reveal.
  const [revealed, setRevealed] = useState<Harvest | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (board?.harvest && !revealed) setRevealed(board.harvest);
  }, [board, revealed]);

  // The board is cached under ['journey-quests'] (not 'journey-state'). Strip the harvest from the cache
  // as soon as the server confirms, so leaving Journey and coming back cannot snapshot a stale copy and
  // replay it. On failure the cache is left alone, which replays next time: a missed seen call must never
  // swallow a harvest.
  const seen = useMutation({
    mutationFn: markHarvestSeen,
    onSuccess: () => {
      queryClient.setQueryData<QuestBoard>(['journey-quests'], (old) => (old ? { ...old, harvest: null } : old));
      queryClient.invalidateQueries({ queryKey: ['journey-quests'] });
    },
  });
  const { mutate: markSeen } = seen;
  const onSeen = useCallback(
    (ids: number[], month: string | null) => markSeen({ ids, month }),
    [markSeen],
  );

  const topQuest = board?.focus ?? board?.offers[0];
  const cards = board ? [...(board.focus ? [board.focus] : []), ...board.offers] : [];

  if (stateLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-80" />
          <div className="md:col-span-2 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Could not load journey data.</p>
        <Button onClick={() => recalc.mutate()} disabled={recalc.isPending}>
          {recalc.isPending ? 'Calculating…' : 'Calculate now'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your Financial Journey</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Level {state.currentLevel} &middot; Score {state.totalScore.toFixed(1)} / 100 &middot;{' '}
            <span className="text-xs">
              updated {new Date(state.lastComputedAt).toLocaleDateString()}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 mt-8">
          <Button asChild variant="ghost" size="sm">
            <Link to="/journey/achievements">
              <Trophy className="w-4 h-4 mr-1.5" />
              Achievements ({state.achievements.length})
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalc.mutate()}
            disabled={recalc.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recalc.isPending ? 'animate-spin' : ''}`} />
            Recalculate
          </Button>
        </div>
      </div>

      {revealed && !dismissed && board && (
        <HarvestPanel
          harvest={revealed}
          rhythm={board.rhythm}
          offers={[...(board.focus ? [board.focus] : []), ...board.offers]}
          focusCode={board.focus?.code ?? null}
          focusPending={focusQuest.isPending}
          onSeen={onSeen}
          onPickFocus={(code) => focusQuest.mutate(code)}
          onDone={() => setDismissed(true)}
        />
      )}

      {/* Hero (left) + Tier Cards (right) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <LivingGardenHero state={state} topQuest={topQuest} />
        </div>
        <div className="md:col-span-2 space-y-2">
          {['L1', 'L2', 'L3', 'L4', 'L5'].map((lvl) => (
            <TierCard key={lvl} level={lvl} state={state} />
          ))}
        </div>
      </div>

      {/* Active Quests */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Active Quests</h2>
        {board && rhythmLabel(board.rhythm) && (
          <p data-testid="rhythm-line" className="mb-3 text-xs text-muted-foreground">{rhythmLabel(board.rhythm)}</p>
        )}
        {questsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : cards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((q) => (
              <QuestCard
                key={q.code}
                quest={q}
                isFocus={board?.focus?.code === q.code}
                onFocus={() => focusQuest.mutate(q.code)}
                onSnooze={() => snooze.mutate(q.code)}
                busy={questBusy}
              />
            ))}
          </div>
        ) : board?.levelGoal ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{board.levelGoal.title}</p>
            {board.levelGoal.notEvaluated ? (
              <p className="text-sm text-muted-foreground">Not scored yet, add data to start.</p>
            ) : (
              board.levelGoal.gaps.map((g) => (
                <p key={g.indicatorCode} className="text-sm text-muted-foreground">{g.label}</p>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to suggest right now.</p>
        )}
      </section>

    </div>
  );
};
