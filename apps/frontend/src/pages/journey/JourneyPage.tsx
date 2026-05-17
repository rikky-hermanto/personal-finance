import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LivingGardenHero } from '@/components/journey/LivingGardenHero';
import { TierCard } from '@/components/journey/TierCard';
import { QuestCard } from '@/components/journey/QuestCard';
import { getJourneyState, getJourneyQuests, recalculateJourney } from '@/api/journeyApi';

export const JourneyPage = () => {
  const queryClient = useQueryClient();

  const { data: state, isLoading: stateLoading } = useQuery({
    queryKey: ['journey-state'],
    queryFn: getJourneyState,
    staleTime: 5 * 60 * 1000,
  });

  const { data: quests, isLoading: questsLoading } = useQuery({
    queryKey: ['journey-quests'],
    queryFn: getJourneyQuests,
    staleTime: 60 * 60 * 1000,
  });

  const recalc = useMutation({
    mutationFn: recalculateJourney,
    onSuccess: (data) => {
      queryClient.setQueryData(['journey-state'], data);
    },
  });

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
        <div className="flex items-center gap-2">
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

      {/* Hero (left) + Tier Cards (right) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <LivingGardenHero state={state} topQuest={quests?.[0]} />
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
        {questsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : quests && quests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quests.map((q) => <QuestCard key={q.title} quest={q} />)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No quests available. Recalculate to generate new quests.</p>
        )}
      </section>

    </div>
  );
};
