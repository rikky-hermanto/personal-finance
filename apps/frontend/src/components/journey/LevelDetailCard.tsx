import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';
import { getJourneyLabel, NOT_EVALUATED_ACTIONS } from '@/utils/journeyLabels';
import { PYRAMID_SCENES, PYRAMID_SCENE_HEIGHT } from '@/lib/journey/pyramidScenes.generated';
import { CLEARED_SCORE, PYRAMID_LEVELS, clearingHeadline, pointsToClear, tierStatus } from '@/lib/journey/pyramid';

const CROP_SCALE = 3;

/** A score ring with a dot at Cleared (70). Colours: green once cleared, amber before. */
const ScoreRing = ({ score, size = 64 }: { score: number; size?: number }) => {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tick = 2 * Math.PI * (CLEARED_SCORE / 100) - Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${score.toFixed(0)} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" className="stroke-foreground/[0.06]" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={cn('transition-[stroke-dasharray] duration-700 ease-out', score >= CLEARED_SCORE ? 'stroke-emerald-500' : 'stroke-amber-400')}
      />
      <circle cx={size / 2 + r * Math.cos(tick)} cy={size / 2 + r * Math.sin(tick)} r="2" className="fill-foreground/35" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="15" className="font-data fill-foreground">
        {score.toFixed(0)}
      </text>
    </svg>
  );
};

/**
 * Pyramid mode, right column: the level you are on. A crop of its pyramid scene, one sentence on how close it
 * is to Cleared, each indicator as a ring, and the module to open. Indicators without data say "Not evaluated"
 * and never show a ring (FIN-04).
 */
export const LevelDetailCard = ({ state }: { state: JourneyState }) => {
  const level = PYRAMID_LEVELS[Math.min(4, Math.max(0, state.currentLevel - 1))];
  const t = tierStatus(state, level);
  const meta = TIER_META[level];
  const scene = PYRAMID_SCENES[t.index];
  const crop = scene.crop;

  return (
    <section className="rounded-2xl bg-foreground/[0.025] p-6 flex flex-col w-full" aria-label={`${level} ${meta.label}`} data-testid="level-detail-card">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="rounded-xl overflow-hidden flex-shrink-0 flex items-end justify-center"
          style={{ background: `var(--pyramid-${t.index})`, width: crop.width * CROP_SCALE + 8, height: crop.height * CROP_SCALE + 4 }}
        >
          <span
            className="bg-no-repeat [image-rendering:pixelated]"
            style={{
              width: crop.width * CROP_SCALE,
              height: crop.height * CROP_SCALE,
              backgroundImage: `url('/pyramid/pyramid-l${t.index}.png')`,
              backgroundSize: `${scene.width * 2 * CROP_SCALE}px ${PYRAMID_SCENE_HEIGHT * CROP_SCALE}px`,
              backgroundPosition: `${-crop.x * CROP_SCALE}px ${-crop.y * CROP_SCALE}px`,
            }}
          />
        </span>
        <div>
          <div className="text-[10px] font-semibold tracking-widest uppercase text-amber-700 dark:text-amber-400">{level} · You are here</div>
          <div className="text-[17px] font-medium text-foreground">{meta.label}</div>
        </div>
      </div>

      <p className="mt-4 [font-family:var(--font-title)] text-[17px] leading-snug text-foreground">{clearingHeadline(t, meta.label)}</p>

      <div className="mt-5 flex gap-6 flex-wrap">
        {t.live.map((i) => (
          <div key={i.code} className="flex flex-col items-center gap-1.5 w-28 text-center">
            <ScoreRing score={i.score} />
            <span className="text-xs text-foreground/85 leading-tight">{getJourneyLabel(i.code).headline}</span>
            <span className={cn('text-[11px]', i.score >= CLEARED_SCORE ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
              {i.score >= CLEARED_SCORE ? 'Cleared' : `${pointsToClear(i.score)} to clear`}
            </span>
          </div>
        ))}
        {t.pending.map((i) => {
          const action = NOT_EVALUATED_ACTIONS[i.code];
          return (
            <div key={i.code} className="flex flex-col items-center gap-1.5 w-28 text-center">
              <span className="w-16 h-16 rounded-full border-[6px] border-foreground/[0.06] flex items-center justify-center text-[11px] text-muted-foreground">—</span>
              <span className="text-xs text-foreground/85 leading-tight">{getJourneyLabel(i.code).headline}</span>
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

      <Link to={meta.deeplink} className="mt-5 self-start inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        Open {meta.module} <ArrowRight className="w-3 h-3" />
      </Link>
    </section>
  );
};
