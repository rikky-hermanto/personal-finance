import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getJourneyState } from '@/api/journeyApi';
import { cn } from '@/lib/utils';

const ALL_ACHIEVEMENTS = [
  { code: 'positive_cashflow_3mo', name: 'Positive Cashflow Streak', desc: '3 consecutive months spending less than income' },
  { code: 'emergency_ready',       name: 'Emergency Ready',           desc: '3 months of expenses saved in liquid accounts' },
  { code: 'debt_free',             name: 'Light Footprint',           desc: 'Debt-to-income ratio below 20%' },
  { code: 'consistent_investor',   name: 'Steady Builder',            desc: 'Investing ≥15% of income for 3 months' },
  { code: 'graduated_l1',          name: 'Level 1 Cleared',           desc: 'All Cashflow indicators scored ≥70' },
  { code: 'graduated_l2',          name: 'Level 2 Cleared',           desc: 'All Defense indicators scored ≥70' },
  { code: 'graduated_l3',          name: 'Level 3 Cleared',           desc: 'All Growth indicators scored ≥70' },
] as const;

export const AchievementsPage = () => {
  const { data: state, isLoading } = useQuery({
    queryKey: ['journey-state'],
    queryFn: getJourneyState,
    staleTime: 5 * 60 * 1000,
  });

  const unlockedCodes = new Set(state?.achievements.map((a) => a.code) ?? []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/journey"><ArrowLeft className="w-4 h-4 mr-1" />Journey</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Achievements</h1>
          <p className="text-sm text-muted-foreground">
            {unlockedCodes.size} / {ALL_ACHIEVEMENTS.length} unlocked
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {ALL_ACHIEVEMENTS.map((ach) => {
            const unlocked = unlockedCodes.has(ach.code);
            const achievement = state?.achievements.find((a) => a.code === ach.code);

            return (
              <Tooltip key={ach.code}>
                <TooltipTrigger asChild>
                  <Card className={cn(
                    'cursor-default transition-colors',
                    unlocked ? 'ring-1 ring-amber-300 bg-amber-50/50' : 'opacity-50',
                  )}>
                    <CardContent className="pt-4 pb-3 text-center flex flex-col items-center gap-2">
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center',
                        unlocked ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground',
                      )}>
                        {unlocked ? <Trophy className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                      </div>
                      <p className="text-xs font-semibold leading-tight">{ach.name}</p>
                      {achievement && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(achievement.unlockedAt).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-40">{ach.desc}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
};
