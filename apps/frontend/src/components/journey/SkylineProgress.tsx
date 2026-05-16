import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';

const GHOST = 'rgb(226 232 240)';
const GA = 0.55;

interface Props { state: JourneyState; }

// Generate a grid of window rects: [x, y, w, h][]
function winGrid(
  bx: number, by: number, bw: number, bh: number,
  cols: number, rows: number,
  ww = 4, wh = 5,
): [number, number, number, number][] {
  const hGap = (bw - cols * ww) / (cols + 1);
  const vGap = (bh - rows * wh) / (rows + 1);
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push([bx + hGap + c * (ww + hGap), by + vGap + r * (wh + vGap), ww, wh]);
  return out;
}

function Windows({ wins, lit }: { wins: [number, number, number, number][]; lit: boolean }) {
  return (
    <>
      {wins.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h}
          fill={lit ? 'rgb(253 224 71)' : 'rgb(180 190 200)'} opacity={lit ? 0.9 : 0.5} rx="0.5" />
      ))}
    </>
  );
}

export const SkylineProgress = ({ state }: Props) => {
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

  // Building specs — [x, y, w, h] from ground up (y = top of building, height to y=244)
  const GROUND = 244;
  const b = {
    // L5 — center landmark tower
    l5Main:   [184, 90,  32, GROUND - 90]   as const,
    l5Upper:  [191, 68,  18, 24]            as const,
    // L4 — twin towers
    l4Left:   [106, 128, 50, GROUND - 128]  as const,
    l4Right:  [244, 128, 50, GROUND - 128]  as const,
    // L3 — office buildings (4 of them)
    l3FarL:   [50,  162, 42, GROUND - 162]  as const,
    l3NearL:  [143, 168, 32, GROUND - 168]  as const,
    l3NearR:  [225, 168, 32, GROUND - 168]  as const,
    l3FarR:   [308, 162, 42, GROUND - 162]  as const,
    // L2 — low buildings (4 of them)
    l2FarL:   [18,  200, 26, GROUND - 200]  as const,
    l2NearL:  [98,  206, 24, GROUND - 206]  as const,
    l2NearR:  [278, 206, 24, GROUND - 206]  as const,
    l2FarR:   [356, 200, 26, GROUND - 200]  as const,
    // L1 — small houses (2, flanking L5 at ground level)
    l1Left:   [163, 225, 18, GROUND - 225]  as const,
    l1Right:  [219, 225, 18, GROUND - 225]  as const,
  };

  // Roof triangles for L1 houses: [x1,y1, x2,y2, x3,y3]
  const roofL = `${b.l1Left[0]},${b.l1Left[1]} ${b.l1Left[0] + b.l1Left[2] / 2},${b.l1Left[1] - 10} ${b.l1Left[0] + b.l1Left[2]},${b.l1Left[1]}`;
  const roofR = `${b.l1Right[0]},${b.l1Right[1]} ${b.l1Right[0] + b.l1Right[2] / 2},${b.l1Right[1] - 10} ${b.l1Right[0] + b.l1Right[2]},${b.l1Right[1]}`;

  const GhostBuilding = ({ rect }: { rect: readonly [number, number, number, number] }) => (
    <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} fill={GHOST} opacity={GA} rx="1" />
  );

  return (
    <svg
      viewBox="0 0 400 256"
      data-testid="pyramid"
      className="w-full max-w-xs mx-auto select-none"
      aria-label="Financial journey city skyline"
    >
      <defs>
        <filter id="sk-glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="400" height="244" fill="rgb(248 250 252)" />

      {/* Ground */}
      <rect x="0" y="244" width="400" height="12" fill="rgb(196 218 190)" rx="1" />
      <rect x="15" y="242" width="370" height="5" fill="rgb(210 228 204)" rx="1" />

      {/* ═══════════════════════════════════
          L5 — CENTER LANDMARK (back, drawn first)
      ═══════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.32 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 167px', cursor: 'default' }}
          >
            {/* Ghost */}
            <GhostBuilding rect={b.l5Main} />
            <GhostBuilding rect={b.l5Upper} />
            <line x1="200" y1="68" x2="200" y2="50" stroke={GHOST} strokeWidth="2" opacity={GA} />
            <circle cx="200" cy="49" r="3" fill={GHOST} opacity={GA} />
            <Windows wins={winGrid(...b.l5Main, 3, 8)} lit={false} />

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L5') }}
              transition={{ duration: 1.0, delay: 0.4, ease: 'easeOut' }}
              filter={isActive('L5') ? 'url(#sk-glow)' : undefined}
            >
              <rect x={b.l5Main[0]} y={b.l5Main[1]} width={b.l5Main[2]} height={b.l5Main[3]}
                fill={TIER_META.L5.color} rx="1" />
              <rect x={b.l5Upper[0]} y={b.l5Upper[1]} width={b.l5Upper[2]} height={b.l5Upper[3]}
                fill={TIER_META.L5.color} rx="1" />
              <line x1="200" y1="68" x2="200" y2="50" stroke={TIER_META.L5.color} strokeWidth="2.5" />
              <circle cx="200" cy="49" r="3" fill="rgb(253 224 71)" />
              <Windows wins={winGrid(...b.l5Main, 3, 8)} lit={true} />
              {/* Stars in the sky */}
              {([[162, 72], [238, 68], [152, 88], [248, 85], [175, 52], [225, 50]] as [number, number][]).map(
                ([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="rgb(253 224 71)" opacity="0.85" />
              )}
            </motion.g>

            <rect x="182" y="46" width="36" height="200" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L5')}
      </Tooltip>

      {/* ═══════════════════════════════════
          L4 — TWIN SKYSCRAPERS
      ═══════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.24 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 186px', cursor: 'default' }}
          >
            {/* Ghost */}
            <GhostBuilding rect={b.l4Left} />
            <GhostBuilding rect={b.l4Right} />
            <Windows wins={winGrid(...b.l4Left, 2, 5)} lit={false} />
            <Windows wins={winGrid(...b.l4Right, 2, 5)} lit={false} />

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L4') }}
              transition={{ duration: 1.0, delay: 0.3, ease: 'easeOut' }}
              filter={isActive('L4') ? 'url(#sk-glow)' : undefined}
            >
              <rect x={b.l4Left[0]} y={b.l4Left[1]} width={b.l4Left[2]} height={b.l4Left[3]}
                fill={TIER_META.L4.color} rx="1" />
              <rect x={b.l4Right[0]} y={b.l4Right[1]} width={b.l4Right[2]} height={b.l4Right[3]}
                fill={TIER_META.L4.color} rx="1" />
              <Windows wins={winGrid(...b.l4Left, 2, 5)} lit={true} />
              <Windows wins={winGrid(...b.l4Right, 2, 5)} lit={true} />
            </motion.g>

            {/* Hit area: two side zones */}
            <rect x="102" y="124" width="56" height="122" fill="transparent" />
            <rect x="242" y="124" width="56" height="122" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L4')}
      </Tooltip>

      {/* ═══════════════════════════════════
          L3 — OFFICE BUILDINGS
      ═══════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.16 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 203px', cursor: 'default' }}
          >
            {/* Ghost */}
            {[b.l3FarL, b.l3NearL, b.l3NearR, b.l3FarR].map((rect, i) => (
              <GhostBuilding key={i} rect={rect} />
            ))}
            <Windows wins={winGrid(...b.l3FarL, 2, 3)} lit={false} />
            <Windows wins={winGrid(...b.l3NearL, 2, 3)} lit={false} />
            <Windows wins={winGrid(...b.l3NearR, 2, 3)} lit={false} />
            <Windows wins={winGrid(...b.l3FarR, 2, 3)} lit={false} />

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L3') }}
              transition={{ duration: 1.0, delay: 0.2, ease: 'easeOut' }}
              filter={isActive('L3') ? 'url(#sk-glow)' : undefined}
            >
              {[b.l3FarL, b.l3NearL, b.l3NearR, b.l3FarR].map((rect, i) => (
                <rect key={i} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]}
                  fill={TIER_META.L3.color} rx="1" />
              ))}
              <Windows wins={winGrid(...b.l3FarL, 2, 3)} lit={true} />
              <Windows wins={winGrid(...b.l3NearL, 2, 3)} lit={true} />
              <Windows wins={winGrid(...b.l3NearR, 2, 3)} lit={true} />
              <Windows wins={winGrid(...b.l3FarR, 2, 3)} lit={true} />
            </motion.g>

            <rect x="46" y="158" width="314" height="88" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L3')}
      </Tooltip>

      {/* ═══════════════════════════════════
          L2 — LOW BUILDINGS
      ═══════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 222px', cursor: 'default' }}
          >
            {/* Ghost */}
            {[b.l2FarL, b.l2NearL, b.l2NearR, b.l2FarR].map((rect, i) => (
              <GhostBuilding key={i} rect={rect} />
            ))}
            <Windows wins={winGrid(...b.l2FarL, 1, 2)} lit={false} />
            <Windows wins={winGrid(...b.l2NearL, 1, 2)} lit={false} />
            <Windows wins={winGrid(...b.l2NearR, 1, 2)} lit={false} />
            <Windows wins={winGrid(...b.l2FarR, 1, 2)} lit={false} />

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L2') }}
              transition={{ duration: 1.0, delay: 0.1, ease: 'easeOut' }}
              filter={isActive('L2') ? 'url(#sk-glow)' : undefined}
            >
              {[b.l2FarL, b.l2NearL, b.l2NearR, b.l2FarR].map((rect, i) => (
                <rect key={i} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]}
                  fill={TIER_META.L2.color} rx="1" />
              ))}
              <Windows wins={winGrid(...b.l2FarL, 1, 2)} lit={true} />
              <Windows wins={winGrid(...b.l2NearL, 1, 2)} lit={true} />
              <Windows wins={winGrid(...b.l2NearR, 1, 2)} lit={true} />
              <Windows wins={winGrid(...b.l2FarR, 1, 2)} lit={true} />
            </motion.g>

            <rect x="14" y="196" width="372" height="50" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L2')}
      </Tooltip>

      {/* ═══════════════════════════════════
          L1 — SMALL HOUSES (front row)
      ═══════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.0 }}
            whileHover={{ scale: 1.03 }}
            style={{ transformOrigin: '200px 235px', cursor: 'default' }}
          >
            {/* Ghost */}
            <GhostBuilding rect={b.l1Left} />
            <GhostBuilding rect={b.l1Right} />
            <polygon points={roofL} fill={GHOST} opacity={GA} />
            <polygon points={roofR} fill={GHOST} opacity={GA} />
            {/* Small door rects */}
            <rect x={b.l1Left[0] + 6}  y={b.l1Left[1] + 9}  width={6} height={9}
              fill={GHOST} opacity={GA * 0.7} rx="0.5" />
            <rect x={b.l1Right[0] + 6} y={b.l1Right[1] + 9} width={6} height={9}
              fill={GHOST} opacity={GA * 0.7} rx="0.5" />

            {/* Colored */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: sc('L1') }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              filter={isActive('L1') ? 'url(#sk-glow)' : undefined}
            >
              <rect x={b.l1Left[0]} y={b.l1Left[1]} width={b.l1Left[2]} height={b.l1Left[3]}
                fill={TIER_META.L1.color} rx="1" />
              <rect x={b.l1Right[0]} y={b.l1Right[1]} width={b.l1Right[2]} height={b.l1Right[3]}
                fill={TIER_META.L1.color} rx="1" />
              <polygon points={roofL} fill={TIER_META.L1.color} />
              <polygon points={roofR} fill={TIER_META.L1.color} />
              <rect x={b.l1Left[0] + 6}  y={b.l1Left[1] + 9}  width={6} height={9}
                fill="rgb(40 40 40)" opacity="0.35" rx="0.5" />
              <rect x={b.l1Right[0] + 6} y={b.l1Right[1] + 9} width={6} height={9}
                fill="rgb(40 40 40)" opacity="0.35" rx="0.5" />
            </motion.g>

            <rect x="158" y="212" width="84" height="35" fill="transparent" />
          </motion.g>
        </TooltipTrigger>
        {tip('L1')}
      </Tooltip>
    </svg>
  );
};
