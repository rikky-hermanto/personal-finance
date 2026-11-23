import type { IndicatorScore, JourneyState } from '@/types/Journey';

// Journey pyramid: pure helpers for the Pyramid / Growing plant modes on /journey.
// Nothing here fetches or renders; components in src/components/journey use these.

/** Source: docs/references/finance-domain/scoring-rubric.md. A level is Cleared when every live indicator reaches 70. */
export const CLEARED_SCORE = 70;

export const PYRAMID_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type PyramidLevel = (typeof PYRAMID_LEVELS)[number];

/**
 * What each level asks of you, in one line. The figures are the Cleared bars from
 * docs/references/finance-domain/scoring-rubric.md (L1 89%, L2 2.1 months and 29.6%, L3 9%, L4 35%).
 */
export const LEVEL_ASK: Record<PyramidLevel, string> = {
  L1: 'Spend at most 89% of what you earn, and pay bills on time',
  L2: 'A 2.1-month cushion, debt payments under 29.6% of income',
  L3: 'Save or invest at least 9% of income',
  L4: 'Passive income that covers 35% of expenses',
  L5: 'Estate, succession and tax. No score yet',
};

/** Short, friendly name for what happens on each layer of the pyramid. Display copy only. */
export const LEVEL_TAGLINE: Record<PyramidLevel, string> = {
  L1: 'Earn, spend less, pay on time',
  L2: 'Build the cushion',
  L3: 'Make money grow',
  L4: 'Let it pay you',
  L5: 'Pass it on',
};

export interface TierStatus {
  level: PyramidLevel;
  /** 1–5, handy for colour tokens and sprite names. */
  index: 1 | 2 | 3 | 4 | 5;
  /** Indicators with data. A level without any is not evaluated (scoring rubric). */
  live: IndicatorScore[];
  /** Indicators that exist for the level but have no data yet. Shown as "Not evaluated", never as a score. */
  pending: IndicatorScore[];
  evaluated: boolean;
  /** The level score, or null when the level is not evaluated (FIN-04: no number for missing data). */
  score: number | null;
  cleared: boolean;
  active: boolean;
  locked: boolean;
}

export function tierStatus(state: JourneyState, level: PyramidLevel): TierStatus {
  const all = state.indicators.filter((i) => i.level === level);
  const live = all.filter((i) => i.status !== 'no_data');
  const pending = all.filter((i) => i.status === 'no_data');
  const evaluated = live.length > 0;
  const cleared = evaluated && live.every((i) => i.score >= CLEARED_SCORE);
  const index = (PYRAMID_LEVELS.indexOf(level) + 1) as TierStatus['index'];
  const active = index === state.currentLevel;
  return {
    level,
    index,
    live,
    pending,
    evaluated,
    score: evaluated ? (state.levelScores[level] ?? 0) : null,
    cleared,
    active,
    locked: !cleared && !active && index > state.currentLevel,
  };
}

/** Whole points still needed for one indicator to reach Cleared. 0 once it is there. */
export const pointsToClear = (score: number): number => Math.max(0, Math.ceil(CLEARED_SCORE - score));

/** Growth stage of the garden plant for a score: one stage per 25 points, capped at 3. Display band only. */
export const plantStage = (score: number | null): 0 | 1 | 2 | 3 =>
  score == null || !Number.isFinite(score) ? 0 : (Math.min(3, Math.max(0, Math.floor(score / 25))) as 0 | 1 | 2 | 3);

/** One sentence on how close the level is to Cleared. */
export function clearingHeadline(status: TierStatus, label: string): string {
  if (!status.evaluated) return `${label} is not scored yet. Add data to start.`;
  const left = status.live.filter((i) => i.score < CLEARED_SCORE).length;
  if (left === 0) return `All habits cleared. ${label} is yours.`;
  if (left === 1) return `One habit away from clearing ${label}.`;
  return `${left} habits to go before ${label} is cleared.`;
}

// ── Geometry ────────────────────────────────────────────────────────────────

export type PyramidLabels = 'full' | 'short' | 'none';

export interface PyramidFit {
  /** Whole-number pixel scale for the scenes, so pixel art stays crisp. */
  scale: 2 | 3;
  labels: PyramidLabels;
}

/** Widest drawing first: 3× with full labels from 950px, then 2× with full, short or no labels. */
export function fitPyramid(available: number): PyramidFit {
  if (available >= 950) return { scale: 3, labels: 'full' };
  if (available >= 670) return { scale: 2, labels: 'full' };
  if (available >= 545) return { scale: 2, labels: 'short' };
  return { scale: 2, labels: 'none' };
}

export interface PyramidLayer {
  level: PyramidLevel;
  /** Top and bottom edge, measured down from the top of the drawing. */
  y0: number;
  y1: number;
  bottomWidth: number;
  topWidth: number;
  midY: number;
  midWidth: number;
}

export interface PyramidLayout {
  scale: 2 | 3;
  /** Width of the pyramid itself; layers are centred on width / 2. */
  width: number;
  height: number;
  layerHeight: number;
  radius: number;
  labelWidth: number;
  /** Pyramid plus labels. */
  totalWidth: number;
  layers: PyramidLayer[];
}

const LABEL_WIDTH: Record<PyramidLabels, number> = { full: 200, short: 74, none: 0 };
const LABEL_GAP = 10;

/** Layout at 3× is 720 wide with 112px layers; 2× is the same drawing at two thirds. The apex sits above the top layer. */
export function pyramidLayout({ scale, labels }: PyramidFit): PyramidLayout {
  const k = scale / 3;
  const width = 720 * k;
  const layerHeight = 112 * k;
  const gap = 10 * k;
  const apex = 640 * k;
  const height = layerHeight * 5 + gap * 4;
  const widthAt = (h: number) => width * (1 - h / apex);
  const layers = PYRAMID_LEVELS.map((level, i) => {
    const hb = i * (layerHeight + gap);
    const ht = hb + layerHeight;
    return {
      level,
      y0: height - ht,
      y1: height - hb,
      bottomWidth: widthAt(hb),
      topWidth: widthAt(ht),
      midY: height - (hb + ht) / 2,
      midWidth: widthAt((hb + ht) / 2),
    };
  });
  const labelWidth = LABEL_WIDTH[labels];
  const totalWidth = labels === 'none'
    ? width
    : Math.max(width, ...layers.map((l) => width / 2 + l.midWidth / 2 + LABEL_GAP + labelWidth));
  return { scale, width, height, layerHeight, radius: 14 * k, labelWidth, totalWidth, layers };
}

/** Left edge of a layer's label, just past the layer's right slope at mid height. */
export const labelLeft = (layout: PyramidLayout, layer: PyramidLayer): number =>
  layout.width / 2 + layer.midWidth / 2 + LABEL_GAP;

/** SVG path for a trapezoid layer centred on `width / 2`, with rounded corners. */
export function trapezoidPath(width: number, layer: PyramidLayer, radius: number): string {
  const c = width / 2;
  const pts: [number, number][] = [
    [c - layer.bottomWidth / 2, layer.y1],
    [c + layer.bottomWidth / 2, layer.y1],
    [c + layer.topWidth / 2, layer.y0],
    [c - layer.topWidth / 2, layer.y0],
  ];
  const toward = (a: [number, number], b: [number, number], d: number): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len];
  };
  const f = (n: number) => n.toFixed(1);
  return (
    pts
      .map((cur, i) => {
        const prev = pts[(i + 3) % 4];
        const next = pts[(i + 1) % 4];
        const r = Math.min(radius, Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 2, Math.hypot(cur[0] - next[0], cur[1] - next[1]) / 2);
        const a = toward(cur, prev, r);
        const b = toward(cur, next, r);
        return `${i ? 'L' : 'M'}${f(a[0])},${f(a[1])}Q${f(cur[0])},${f(cur[1])} ${f(b[0])},${f(b[1])}`;
      })
      .join('') + 'Z'
  );
}
