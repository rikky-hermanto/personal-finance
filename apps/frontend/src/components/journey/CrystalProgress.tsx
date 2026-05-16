import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';

/**
 * Diamond cut viewed from the front — 5 horizontal bands (bottom → top):
 *
 *   L5 TABLE      ┌────────────┐         y=62–108
 *   L4 CROWN      ╱            ╲         y=108–170
 *   L3 GIRDLE    ╱══════════════╲        y=170–182 (widest band)
 *   L2 PAVILION  ╲              ╱        y=182–240
 *   L1 CULET      ╲            ╱         y=240–292  (pointed base)
 *
 * Each band has a gray ghost polygon + an animated colored polygon.
 */

const GHOST = 'rgb(226 232 240)';
const GA = 0.55;

// Gem geometry — all x coords are absolute in the 400-wide viewBox
const G = {
  cx: 200,
  tableY:    62,  tableHW:  76,  // table top edge half-width
  crownY:   108,  crownHW:  68,  // bottom of table / top of crown
  girdleTopY: 170, girdleHW: 148, // widest point — top edge of girdle band
  girdleBotY: 182,               // bottom edge of girdle band
  pavilY:   240,  pavilHW:  82,  // top of pavilion base
  culetY:   292,                 // bottom tip (single point)
};

// Polygon points string helper
const pts = (...coords: [number, number][]) =>
  coords.map(([x, y]) => `${x},${y}`).join(' ');

// L5 TABLE — trapezoid at very top
const L5_POLY = pts(
  [G.cx - G.tableHW,  G.tableY],
  [G.cx + G.tableHW,  G.tableY],
  [G.cx + G.crownHW,  G.crownY],
  [G.cx - G.crownHW,  G.crownY],
);

// L4 CROWN — wide trapezoid narrowing up to table
const L4_POLY = pts(
  [G.cx - G.crownHW,      G.crownY],
  [G.cx + G.crownHW,      G.crownY],
  [G.cx + G.girdleHW,     G.girdleTopY],
  [G.cx - G.girdleHW,     G.girdleTopY],
);

// L3 GIRDLE — thin horizontal band at widest point
const L3_POLY = pts(
  [G.cx - G.girdleHW, G.girdleTopY],
  [G.cx + G.girdleHW, G.girdleTopY],
  [G.cx + G.girdleHW, G.girdleBotY],
  [G.cx - G.girdleHW, G.girdleBotY],
);

// L2 PAVILION — trapezoid narrowing toward culet
const L2_POLY = pts(
  [G.cx - G.girdleHW, G.girdleBotY],
  [G.cx + G.girdleHW, G.girdleBotY],
  [G.cx + G.pavilHW,  G.pavilY],
  [G.cx - G.pavilHW,  G.pavilY],
);

// L1 CULET — pointed bottom triangle
const L1_POLY = pts(
  [G.cx - G.pavilHW, G.pavilY],
  [G.cx + G.pavilHW, G.pavilY],
  [G.cx,             G.culetY],
);

// Internal facet lines (decorative, drawn over all fills)
const FACET_LINES = [
  // Crown facets from table corners to girdle extremes
  [[G.cx - G.tableHW, G.tableY], [G.cx - G.girdleHW, G.girdleTopY]],
  [[G.cx + G.tableHW, G.tableY], [G.cx + G.girdleHW, G.girdleTopY]],
  // Crown facets from table center bottom
  [[G.cx - G.tableHW, G.tableY],  [G.cx, G.girdleTopY]],
  [[G.cx + G.tableHW, G.tableY],  [G.cx, G.girdleTopY]],
  [[G.cx,             G.crownY],  [G.cx - G.girdleHW, G.girdleTopY]],
  [[G.cx,             G.crownY],  [G.cx + G.girdleHW, G.girdleTopY]],
  // Pavilion facets
  [[G.cx - G.girdleHW, G.girdleBotY], [G.cx, G.culetY]],
  [[G.cx + G.girdleHW, G.girdleBotY], [G.cx, G.culetY]],
  [[G.cx - G.pavilHW,  G.pavilY],     [G.cx, G.culetY]],
  [[G.cx + G.pavilHW,  G.pavilY],     [G.cx, G.culetY]],
  [[G.cx,              G.girdleBotY], [G.cx - G.pavilHW, G.pavilY]],
  [[G.cx,              G.girdleBotY], [G.cx + G.pavilHW, G.pavilY]],
] as [[number, number], [number, number]][];

// Sparkle positions around the table (L5 effect)
const SPARKLES: [number, number, number][] = [
  [G.cx - G.tableHW - 14, G.tableY + 4, 7],
  [G.cx + G.tableHW + 14, G.tableY + 4, 7],
  [G.cx - 20, G.tableY - 14, 5],
  [G.cx + 20, G.tableY - 14, 5],
  [G.cx,      G.tableY - 22, 6],
];

interface Props { state: JourneyState; }

export const CrystalProgress = ({ state }: Props) => {
  const sc = (lvl: string) => (state.levelScores[lvl] ?? 0) / 100;
  const isActive = (lvl: string) => lvl === `L${state.currentLevel}`;

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

  const tierDefs: { level: string; poly: string; hitY: number; hitH: number }[] = [
    { level: 'L1', poly: L1_POLY, hitY: G.pavilY,      hitH: G.culetY - G.pavilY + 8 },
    { level: 'L2', poly: L2_POLY, hitY: G.girdleBotY,  hitH: G.pavilY - G.girdleBotY },
    { level: 'L3', poly: L3_POLY, hitY: G.girdleTopY,  hitH: G.girdleBotY - G.girdleTopY + 4 },
    { level: 'L4', poly: L4_POLY, hitY: G.crownY,      hitH: G.girdleTopY - G.crownY },
    { level: 'L5', poly: L5_POLY, hitY: G.tableY - 30, hitH: G.crownY - G.tableY + 30 },
  ];

  return (
    <svg
      viewBox="0 0 400 320"
      data-testid="pyramid"
      className="w-full max-w-xs mx-auto select-none"
      aria-label="Financial journey diamond"
    >
      <defs>
        <filter id="cr-glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Soft inner-light reflection for colored gem */}
        <linearGradient id="gem-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18" />
          <stop offset="40%"  stopColor="white" stopOpacity="0.06" />
          <stop offset="100%" stopColor="white" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      {/* ── L1 CULET ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.0 }}
            whileHover={{ scale: 1.02 }}
            style={{ transformOrigin: `${G.cx}px ${(G.pavilY + G.culetY) / 2}px`, cursor: 'default' }}
          >
            <polygon points={L1_POLY} fill={GHOST} opacity={GA} />
            <motion.polygon
              points={L1_POLY}
              fill={TIER_META.L1.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L1') }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              filter={isActive('L1') ? 'url(#cr-glow)' : undefined}
            />
            <rect x={G.cx - G.pavilHW} y={G.pavilY} width={G.pavilHW * 2} height={G.culetY - G.pavilY + 8}
              fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L1')}
      </Tooltip>

      {/* ── L2 PAVILION ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            whileHover={{ scale: 1.02 }}
            style={{ transformOrigin: `${G.cx}px ${(G.girdleBotY + G.pavilY) / 2}px`, cursor: 'default' }}
          >
            <polygon points={L2_POLY} fill={GHOST} opacity={GA} />
            <motion.polygon
              points={L2_POLY}
              fill={TIER_META.L2.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L2') }}
              transition={{ duration: 1.0, delay: 0.1, ease: 'easeOut' }}
              filter={isActive('L2') ? 'url(#cr-glow)' : undefined}
            />
            <rect x={G.cx - G.girdleHW} y={G.girdleBotY} width={G.girdleHW * 2} height={G.pavilY - G.girdleBotY}
              fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L2')}
      </Tooltip>

      {/* ── L3 GIRDLE ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.16 }}
            whileHover={{ scale: 1.02 }}
            style={{ transformOrigin: `${G.cx}px ${(G.girdleTopY + G.girdleBotY) / 2}px`, cursor: 'default' }}
          >
            <polygon points={L3_POLY} fill={GHOST} opacity={GA} />
            <motion.polygon
              points={L3_POLY}
              fill={TIER_META.L3.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L3') }}
              transition={{ duration: 1.0, delay: 0.2, ease: 'easeOut' }}
              filter={isActive('L3') ? 'url(#cr-glow)' : undefined}
            />
            {/* Wider hit area for the thin girdle */}
            <rect x={G.cx - G.girdleHW} y={G.girdleTopY - 6} width={G.girdleHW * 2} height={G.girdleBotY - G.girdleTopY + 12}
              fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L3')}
      </Tooltip>

      {/* ── L4 CROWN ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.24 }}
            whileHover={{ scale: 1.02 }}
            style={{ transformOrigin: `${G.cx}px ${(G.crownY + G.girdleTopY) / 2}px`, cursor: 'default' }}
          >
            <polygon points={L4_POLY} fill={GHOST} opacity={GA} />
            <motion.polygon
              points={L4_POLY}
              fill={TIER_META.L4.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L4') }}
              transition={{ duration: 1.0, delay: 0.3, ease: 'easeOut' }}
              filter={isActive('L4') ? 'url(#cr-glow)' : undefined}
            />
            <rect x={G.cx - G.girdleHW} y={G.crownY} width={G.girdleHW * 2} height={G.girdleTopY - G.crownY}
              fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L4')}
      </Tooltip>

      {/* ── L5 TABLE (top) ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.32 }}
            whileHover={{ scale: 1.02 }}
            style={{ transformOrigin: `${G.cx}px ${(G.tableY + G.crownY) / 2}px`, cursor: 'default' }}
          >
            <polygon points={L5_POLY} fill={GHOST} opacity={GA} />
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L5') }}
              transition={{ duration: 1.0, delay: 0.4, ease: 'easeOut' }}
              filter={isActive('L5') ? 'url(#cr-glow)' : undefined}
            >
              <polygon points={L5_POLY} fill={TIER_META.L5.color} />
              {/* Sparkle bursts at table top */}
              {SPARKLES.map(([x, y, r], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r={r} fill="rgb(253 224 71)" opacity="0.9" />
                  <line x1={x - r - 3} y1={y} x2={x + r + 3} y2={y}
                    stroke="rgb(253 224 71)" strokeWidth="1.5" opacity="0.7" />
                  <line x1={x} y1={y - r - 3} x2={x} y2={y + r + 3}
                    stroke="rgb(253 224 71)" strokeWidth="1.5" opacity="0.7" />
                </g>
              ))}
            </motion.g>
            <rect x={G.cx - G.crownHW} y={G.tableY - 30} width={G.crownHW * 2} height={G.crownY - G.tableY + 30}
              fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L5')}
      </Tooltip>

      {/* Facet lines overlay — subtle white lines showing gem cut */}
      <g fill="none" stroke="white" strokeWidth="0.8" opacity="0.35" pointerEvents="none">
        {FACET_LINES.map(([[x1, y1], [x2, y2]], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* Sheen overlay on colored sections */}
      <g pointerEvents="none" opacity="0.6">
        <polygon points={L5_POLY} fill="url(#gem-sheen)" />
        <polygon points={L4_POLY} fill="url(#gem-sheen)" />
        <polygon points={L3_POLY} fill="url(#gem-sheen)" />
        <polygon points={L2_POLY} fill="url(#gem-sheen)" />
        <polygon points={L1_POLY} fill="url(#gem-sheen)" />
      </g>
    </svg>
  );
};
