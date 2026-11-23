import { Link } from 'react-router-dom';
import { ArrowRight, Check, Flag, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';
import { getJourneyLabel, NOT_EVALUATED_ACTIONS } from '@/utils/journeyLabels';
import {
  CLEARED_SCORE,
  LEVEL_ASK,
  PYRAMID_LEVELS,
  clearingHeadline,
  plantStage,
  pointsToClear,
  tierStatus,
} from '@/lib/journey/pyramid';

const THUMB = 48; // first frame of the 8-frame garden sheet (public/garden), 96px art shown at half size

/** Bar with a flag at Cleared (70) and a star at Mastered (100), from the scoring rubric. */
const MilestoneBar = ({ score }: { score: number }) => (
  <div className="relative pt-3">
    <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', score >= CLEARED_SCORE ? 'bg-emerald-500' : 'bg-amber-400')}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
    <span className="absolute top-0 -translate-x-1/2 text-muted-foreground/60" style={{ left: `${CLEARED_SCORE}%` }} title="Cleared at 70">
      <Flag className="w-2.5 h-2.5" />
    </span>
    <span className="absolute top-0 right-0 text-muted-foreground/40" title="Mastered at 100">
      <Star className="w-2.5 h-2.5" />
    </span>
  </div>
);

/**
 * Growing-plant mode, right column: L1 to L5 as a dotted trail. The level you are on opens up with one
 * sentence and a bar per indicator; cleared levels get a tick, later ones a lock and what they ask of you.
 */
export const JourneyTrail = ({ state }: { state: JourneyState }) => {
  const tiers = PYRAMID_LEVELS.map((level) => tierStatus(state, level));
  const upNext = tiers.find((t) => t.locked)?.level;

  return (
    <ol className="relative" aria-label="Journey levels" data-testid="journey-trail">
      {tiers.map((t, idx) => {
        const meta = TIER_META[t.level];
        const last = idx === tiers.length - 1;
        return (
          <li key={t.level} className="relative flex gap-4">
            <div className="flex flex-col items-center w-14 flex-shrink-0">
              {t.active ? (
                <span className="w-14 h-14 rounded-2xl bg-amber-100/70 dark:bg-amber-400/10 flex items-center justify-center">
                  <span
                    role="img"
                    aria-label={`${meta.label} plant, stage ${plantStage(t.score)} of 3`}
                    className="bg-no-repeat [image-rendering:pixelated]"
                    style={{
                      width: THUMB,
                      height: THUMB,
                      backgroundImage: `url('/garden/l${t.index}-stage-${plantStage(t.score)}.png')`,
                      backgroundSize: `${THUMB * 8}px ${THUMB}px`,
                    }}
                  />
                </span>
              ) : t.cleared ? (
                <span className="w-8 h-8 mt-1 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} aria-label="Cleared" />
                </span>
              ) : (
                <span className="w-8 h-8 mt-1 rounded-full bg-foreground/[0.05] text-muted-foreground/60 flex items-center justify-center">
                  <Lock className="w-3 h-3" aria-label="Locked" />
                </span>
              )}
              {!last && <span className="flex-1 my-1.5 border-l-2 border-dotted border-foreground/15" />}
            </div>

            <div className={cn('flex-1 min-w-0', last ? 'pb-0' : 'pb-6', t.active ? 'pt-1' : 'pt-2')}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    'text-[10px] font-semibold tracking-widest uppercase',
                    t.active ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground/70',
                  )}
                >
                  {t.level} · {meta.label}
                  {t.level === upNext && <span className="ml-2 normal-case tracking-normal font-medium text-muted-foreground/80">up next</span>}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground/70">
                  {t.score == null ? 'Not evaluated' : t.score.toFixed(0)}
                </span>
              </div>

              {t.active ? (
                <>
                  <p className="mt-1.5 [font-family:var(--font-title)] text-[19px] leading-snug text-foreground">{clearingHeadline(t, meta.label)}</p>
                  <div className="mt-4 flex flex-col gap-3.5">
                    {t.live.map((i) => (
                      <div key={i.code}>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="text-foreground/85">{getJourneyLabel(i.code).headline}</span>
                          {i.score >= CLEARED_SCORE ? (
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                              <Check className="w-3 h-3" strokeWidth={2.5} />
                              Cleared
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">{pointsToClear(i.score)} to clear</span>
                          )}
                        </div>
                        <MilestoneBar score={i.score} />
                      </div>
                    ))}
                    {t.pending.map((i) => {
                      const action = NOT_EVALUATED_ACTIONS[i.code];
                      return (
                        <div key={i.code} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="text-foreground/85">{getJourneyLabel(i.code).headline}</span>
                          {action ? (
                            <Link to={action.href} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                              Not evaluated · {action.action}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Not evaluated</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Link
                    to={meta.deeplink}
                    className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Open {meta.module} <ArrowRight className="w-3 h-3" />
                  </Link>
                </>
              ) : (
                <p className={cn('mt-0.5 text-[13px]', t.locked ? 'text-muted-foreground/70' : 'text-foreground/70')}>{LEVEL_ASK[t.level]}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
