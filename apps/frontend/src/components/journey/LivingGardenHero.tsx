import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { JourneyState, Quest } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';

const PEAK_KEY = 'pf-journey-peak-stages';
const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;

// 4 growth stages — user-specified progression
const PLANT_STAGES: [string, string, string, string] = ['🌱', '🌿', '🌳', '🌳🍎'];

function stageFromScore(score: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(score / 25)) as 0 | 1 | 2 | 3;
}

function loadPeaks(): Record<string, 0 | 1 | 2 | 3> {
  try {
    return JSON.parse(localStorage.getItem(PEAK_KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface Props {
  state: JourneyState;
  topQuest?: Quest;
}

export const LivingGardenHero = ({ state, topQuest }: Props) => {
  const peaks = useRef<Record<string, 0 | 1 | 2 | 3>>(loadPeaks());

  const currentKey = `L${state.currentLevel}`;
  const currentScore = state.levelScores[currentKey] ?? 0;
  const rawStage = stageFromScore(currentScore);
  const peakStage = (peaks.current[currentKey] ?? 0) as 0 | 1 | 2 | 3;
  const effectiveStage = Math.max(rawStage, peakStage) as 0 | 1 | 2 | 3;
  if (effectiveStage > peakStage) peaks.current[currentKey] = effectiveStage;

  useEffect(() => {
    localStorage.setItem(PEAK_KEY, JSON.stringify(peaks.current));
  });

  const meta = TIER_META[currentKey];
  const emoji = PLANT_STAGES[effectiveStage];

  return (
    <div
      data-testid="garden-hero"
      className="relative px-4 pt-2 pb-4"
    >
      {/* Level progress dots */}
      <div className="flex justify-center gap-6 mb-6">
        {LEVEL_KEYS.map((key) => {
          const s = state.levelScores[key] ?? 0;
          const graduated = s >= 70;
          const active = key === currentKey;
          return (
            <button
              key={key}
              onClick={() =>
                document.getElementById(`tier-card-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="flex flex-col items-center gap-1.5 group"
              title={`${key} · ${TIER_META[key].label} · ${s.toFixed(0)}/100`}
            >
              <div className={cn(
                'rounded-full transition-all duration-200 group-hover:scale-125',
                active
                  ? 'w-3 h-3 bg-amber-400 ring-2 ring-amber-200 ring-offset-1'
                  : graduated
                    ? 'w-2.5 h-2.5 bg-emerald-400'
                    : 'w-2.5 h-2.5 bg-muted-foreground/20',
              )} />
              <span className={cn(
                'text-[9px] font-medium transition-colors',
                active ? 'text-foreground/60' : 'text-muted-foreground/35',
              )}>
                {key}
              </span>
            </button>
          );
        })}
      </div>

      {/* Big plant emoji — single, animated on stage change */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentKey}-${effectiveStage}`}
          initial={{ opacity: 0, scale: 0.65, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -6 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex justify-center"
        >
          <span
            data-testid={`plant-${currentKey.toLowerCase()}`}
            data-stage={effectiveStage}
            role="img"
            aria-label={`${meta.label}, stage ${effectiveStage} of 3`}
            style={{ fontSize: '88px', lineHeight: 1, userSelect: 'none' }}
          >
            {emoji}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Level name + score */}
      <div className="text-center mt-4 mb-5">
        <p className="text-[10px] tracking-widest uppercase text-muted-foreground/60 font-medium mb-1">
          {currentKey}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{meta.label}</h2>
        <div className="flex items-center justify-center gap-2.5 mt-3">
          <div className="w-36 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${currentScore}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
            />
          </div>
          <span className="text-sm font-mono font-semibold tabular-nums">
            {currentScore.toFixed(0)}
            <span className="text-muted-foreground font-normal text-xs">/100</span>
          </span>
        </div>
      </div>

      {/* Integrated top quest — next action CTA */}
      {topQuest ? (
        <div className="flex justify-center">
          <Link
            to={topQuest.actionDeeplink ?? meta.deeplink}
            className="inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200/80 text-amber-800 rounded-full px-4 py-1.5 hover:bg-amber-100 transition-colors font-medium"
          >
            {topQuest.title}
            <ArrowRight className="w-3 h-3 shrink-0" />
          </Link>
        </div>
      ) : (
        <div className="flex justify-center">
          <Link
            to={meta.deeplink}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Open {meta.module} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
};
