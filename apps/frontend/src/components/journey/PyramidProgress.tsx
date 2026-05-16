import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';

const GHOST = 'rgb(226 232 240)';
const GA = 0.55; // ghost alpha

interface Props {
  state: JourneyState;
}

export const PyramidProgress = ({ state }: Props) => {
  const sc = (lvl: string) => (state.levelScores[lvl] ?? 0) / 100;
  const isActive = (lvl: string) => lvl === `L${state.currentLevel}`;

  // Inline tooltip content per tier
  const tip = (level: string) => {
    const meta = TIER_META[level];
    const inds = state.indicators.filter((i) => i.level === level && i.status !== 'no_data');
    return (
      <TooltipContent side="right" className="max-w-48">
        <p className="font-semibold">{level} · {meta.label}</p>
        <p className="text-xs text-muted-foreground">
          Score: {(state.levelScores[level] ?? 0).toFixed(1)} / 100
        </p>
        {inds.map((ind) => (
          <p key={ind.code} className="text-xs mt-0.5">
            {ind.displayName}: {ind.score.toFixed(0)}
          </p>
        ))}
        {inds.length === 0 && (
          <p className="text-xs text-muted-foreground">No live indicators yet</p>
        )}
      </TooltipContent>
    );
  };

  return (
    <svg
      viewBox="0 0 400 370"
      data-testid="pyramid"
      className="w-full max-w-xs mx-auto select-none"
      aria-label="Financial journey tree"
    >
      <defs>
        <filter id="t-glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ground */}
      <ellipse cx="200" cy="313" rx="92" ry="11" fill="rgb(196 218 190)" />
      <ellipse cx="200" cy="316" rx="68" ry="7" fill="rgb(172 202 166)" />

      {/* ═══════════════════════════════════════
          L1 — ROOTS + BASE TRUNK (Cashflow)
      ═══════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.0 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 278px', cursor: 'default' }}
          >
            {/* Ghost roots */}
            <g opacity={GA} fill="none" stroke={GHOST} strokeLinecap="round">
              <path d="M 196 302 Q 172 323 152 344" strokeWidth="7" />
              <path d="M 200 307 Q 200 331 199 354" strokeWidth="6" />
              <path d="M 204 302 Q 228 323 248 344" strokeWidth="7" />
            </g>
            {/* Ghost base trunk */}
            <path
              d="M 191 307 L 209 307 L 211 244 L 189 244 Z"
              fill={GHOST} opacity={GA}
            />

            {/* Colored roots */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L1') }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              fill="none"
              stroke={TIER_META.L1.color}
              strokeLinecap="round"
              filter={isActive('L1') ? 'url(#t-glow)' : undefined}
            >
              <path d="M 196 302 Q 172 323 152 344" strokeWidth="7" />
              <path d="M 200 307 Q 200 331 199 354" strokeWidth="6" />
              <path d="M 204 302 Q 228 323 248 344" strokeWidth="7" />
            </motion.g>
            {/* Colored base trunk */}
            <motion.path
              d="M 191 307 L 209 307 L 211 244 L 189 244 Z"
              fill={TIER_META.L1.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L1') }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              filter={isActive('L1') ? 'url(#t-glow)' : undefined}
            />

            {/* Active indicator ring */}
            {isActive('L1') && (
              <rect
                x="184" y="240" width="32" height="70" rx="3"
                fill="none"
                stroke={TIER_META.L1.color}
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity="0.7"
              />
            )}

            {/* Hit area */}
            <rect x="146" y="238" width="108" height="118" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L1')}
      </Tooltip>

      {/* ═══════════════════════════════════════
          L2 — MID TRUNK + BRANCHES (Defense)
      ═══════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 210px', cursor: 'default' }}
          >
            {/* Ghost mid trunk */}
            <path
              d="M 190 246 L 210 246 L 208 174 L 192 174 Z"
              fill={GHOST} opacity={GA}
            />
            {/* Ghost branches */}
            <g opacity={GA} fill="none" stroke={GHOST} strokeLinecap="round" strokeWidth="9">
              <path d="M 200 210 Q 162 196 126 183" />
              <path d="M 200 210 Q 238 196 274 183" />
            </g>
            {/* Ghost branch tip nubs */}
            <g opacity={GA}>
              <circle cx="124" cy="183" r="7" fill={GHOST} />
              <circle cx="276" cy="183" r="7" fill={GHOST} />
            </g>

            {/* Colored mid trunk */}
            <motion.path
              d="M 190 246 L 210 246 L 208 174 L 192 174 Z"
              fill={TIER_META.L2.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L2') }}
              transition={{ duration: 1.0, delay: 0.1, ease: 'easeOut' }}
              filter={isActive('L2') ? 'url(#t-glow)' : undefined}
            />
            {/* Colored branches */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L2') }}
              transition={{ duration: 1.0, delay: 0.1, ease: 'easeOut' }}
              fill="none" stroke={TIER_META.L2.color} strokeLinecap="round" strokeWidth="9"
              filter={isActive('L2') ? 'url(#t-glow)' : undefined}
            >
              <path d="M 200 210 Q 162 196 126 183" />
              <path d="M 200 210 Q 238 196 274 183" />
            </motion.g>
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L2') }}
              transition={{ duration: 1.0, delay: 0.1, ease: 'easeOut' }}
            >
              <circle cx="124" cy="183" r="7" fill={TIER_META.L2.color} />
              <circle cx="276" cy="183" r="7" fill={TIER_META.L2.color} />
            </motion.g>

            {/* Active indicator */}
            {isActive('L2') && (
              <rect
                x="184" y="170" width="32" height="80" rx="3"
                fill="none"
                stroke={TIER_META.L2.color}
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity="0.7"
              />
            )}

            {/* Hit area */}
            <rect x="122" y="170" width="156" height="80" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L2')}
      </Tooltip>

      {/* ═══════════════════════════════════════
          L3 — LOWER CANOPY (Growth)
      ═══════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.16 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 183px', cursor: 'default' }}
          >
            {/* Ghost */}
            <g opacity={GA}>
              <ellipse cx="140" cy="178" rx="46" ry="36" fill={GHOST} />
              <ellipse cx="260" cy="178" rx="46" ry="36" fill={GHOST} />
              <ellipse cx="200" cy="198" rx="56" ry="30" fill={GHOST} />
            </g>

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L3') }}
              transition={{ duration: 1.0, delay: 0.2, ease: 'easeOut' }}
              filter={isActive('L3') ? 'url(#t-glow)' : undefined}
            >
              <ellipse cx="140" cy="178" rx="46" ry="36" fill={TIER_META.L3.color} />
              <ellipse cx="260" cy="178" rx="46" ry="36" fill={TIER_META.L3.color} />
              <ellipse cx="200" cy="198" rx="56" ry="30" fill={TIER_META.L3.color} />
              {/* Small leaf highlights */}
              <ellipse cx="118" cy="170" rx="16" ry="14" fill={TIER_META.L3.color} opacity="0.7" />
              <ellipse cx="282" cy="170" rx="16" ry="14" fill={TIER_META.L3.color} opacity="0.7" />
            </motion.g>

            {/* Hit area */}
            <rect x="92" y="142" width="216" height="90" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L3')}
      </Tooltip>

      {/* ═══════════════════════════════════════
          L4 — UPPER CANOPY (Freedom)
      ═══════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.24 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 148px', cursor: 'default' }}
          >
            {/* Ghost */}
            <g opacity={GA}>
              <ellipse cx="170" cy="152" rx="48" ry="38" fill={GHOST} />
              <ellipse cx="230" cy="152" rx="48" ry="38" fill={GHOST} />
              <ellipse cx="200" cy="150" rx="62" ry="40" fill={GHOST} />
            </g>

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L4') }}
              transition={{ duration: 1.0, delay: 0.3, ease: 'easeOut' }}
              filter={isActive('L4') ? 'url(#t-glow)' : undefined}
            >
              <ellipse cx="170" cy="152" rx="48" ry="38" fill={TIER_META.L4.color} />
              <ellipse cx="230" cy="152" rx="48" ry="38" fill={TIER_META.L4.color} />
              <ellipse cx="200" cy="150" rx="62" ry="40" fill={TIER_META.L4.color} />
              {/* Small flower buds */}
              <circle cx="152" cy="140" r="6" fill="white" opacity="0.5" />
              <circle cx="248" cy="140" r="6" fill="white" opacity="0.5" />
              <circle cx="200" cy="122" r="5" fill="white" opacity="0.4" />
            </motion.g>

            {/* Hit area */}
            <rect x="120" y="110" width="160" height="82" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L4')}
      </Tooltip>

      {/* ═══════════════════════════════════════
          L5 — CROWN + FRUITS (Legacy)
      ═══════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.32 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 96px', cursor: 'default' }}
          >
            {/* Ghost */}
            <g opacity={GA}>
              <ellipse cx="200" cy="112" rx="60" ry="48" fill={GHOST} />
              <ellipse cx="200" cy="72" rx="38" ry="34" fill={GHOST} />
              <ellipse cx="200" cy="46" rx="20" ry="18" fill={GHOST} />
            </g>

            {/* Colored crown */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L5') }}
              transition={{ duration: 1.0, delay: 0.4, ease: 'easeOut' }}
              filter={isActive('L5') ? 'url(#t-glow)' : undefined}
            >
              <ellipse cx="200" cy="112" rx="60" ry="48" fill={TIER_META.L5.color} />
              <ellipse cx="200" cy="72" rx="38" ry="34" fill={TIER_META.L5.color} />
              <ellipse cx="200" cy="46" rx="20" ry="18" fill={TIER_META.L5.color} />
              {/* Golden fruits / legacy dots */}
              {(
                [
                  [173, 96, 6], [227, 94, 6], [196, 62, 5],
                  [212, 112, 5], [184, 120, 5], [220, 118, 5],
                  [200, 36, 4],
                ] as [number, number, number][]
              ).map(([x, y, r], i) => (
                <circle
                  key={i}
                  cx={x} cy={y} r={r}
                  fill="rgb(253 224 71)"
                  opacity="0.92"
                />
              ))}
            </motion.g>

            {/* Hit area */}
            <rect x="138" y="26" width="124" height="138" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L5')}
      </Tooltip>
    </svg>
  );
};
