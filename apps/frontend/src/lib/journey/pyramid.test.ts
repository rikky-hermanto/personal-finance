import { describe, expect, it } from 'vitest';
import type { IndicatorScore, JourneyState } from '@/types/Journey';
import { PYRAMID_SCENES } from '@/lib/journey/pyramidScenes.generated';
import {
  CLEARED_SCORE,
  PYRAMID_LEVELS,
  clearingHeadline,
  fitPyramid,
  labelLeft,
  plantStage,
  pointsToClear,
  pyramidLayout,
  tierStatus,
  trapezoidPath,
} from './pyramid';

const ind = (code: string, level: IndicatorScore['level'], score: number, status: IndicatorScore['status'] = 'in_progress'): IndicatorScore => ({
  code,
  level,
  score,
  rawValue: null,
  status,
  displayName: code,
  description: '',
  stars: 0,
});

const state = (over: Partial<JourneyState> = {}): JourneyState => ({
  currentLevel: 1,
  totalScore: 40,
  levelScores: { L1: 58, L2: 24, L3: 0, L4: 0, L5: 0 },
  indicators: [ind('spend_lt_income', 'L1', 74, 'achieved'), ind('bills_on_time', 'L1', 44), ind('liquid_savings_ratio', 'L2', 24), ind('manageable_dti', 'L2', 0, 'no_data')],
  achievements: [],
  lastComputedAt: '2026-11-23T00:00:00Z',
  ...over,
});

describe('tierStatus', () => {
  it('marks the current level active, and higher levels locked', () => {
    const s = state();
    expect(tierStatus(s, 'L1')).toMatchObject({ active: true, locked: false, cleared: false, score: 58 });
    expect(tierStatus(s, 'L2')).toMatchObject({ active: false, locked: true, cleared: false });
  });

  it('clears a level only when every live indicator reaches 70', () => {
    const s = state({ indicators: [ind('a', 'L1', 70), ind('b', 'L1', 99)] });
    expect(tierStatus(s, 'L1').cleared).toBe(true);
    const t = state({ indicators: [ind('a', 'L1', 70), ind('b', 'L1', 69.9)] });
    expect(tierStatus(t, 'L1').cleared).toBe(false);
  });

  it('keeps indicators without data out of the score and never clears on them (FIN-04)', () => {
    const s = state();
    const l2 = tierStatus(s, 'L2');
    expect(l2.live.map((i) => i.code)).toEqual(['liquid_savings_ratio']);
    expect(l2.pending.map((i) => i.code)).toEqual(['manageable_dti']);
  });

  it('gives no score and no clear to a level without live indicators', () => {
    const s = state();
    expect(tierStatus(s, 'L3')).toMatchObject({ evaluated: false, score: null, cleared: false, locked: true });
    const onlyPending = state({ indicators: [ind('x', 'L1', 0, 'no_data')] });
    expect(tierStatus(onlyPending, 'L1')).toMatchObject({ evaluated: false, score: null, cleared: false });
  });
});

describe('pointsToClear and plantStage', () => {
  it('counts whole points up to 70 and stops there', () => {
    expect(pointsToClear(44)).toBe(26);
    expect(pointsToClear(69.2)).toBe(1);
    expect(pointsToClear(CLEARED_SCORE)).toBe(0);
    expect(pointsToClear(100)).toBe(0);
  });

  it('grows one stage per 25 points, and stays a seed when there is no score', () => {
    expect(plantStage(null)).toBe(0);
    expect(plantStage(24.9)).toBe(0);
    expect(plantStage(59)).toBe(2);
    expect(plantStage(100)).toBe(3);
    expect(plantStage(Number.NaN)).toBe(0);
  });
});

describe('clearingHeadline', () => {
  it('counts the habits still under 70', () => {
    expect(clearingHeadline(tierStatus(state(), 'L1'), 'Foundations')).toBe('One habit away from clearing Foundations.');
    const two = state({ indicators: [ind('a', 'L1', 10), ind('b', 'L1', 20)] });
    expect(clearingHeadline(tierStatus(two, 'L1'), 'Foundations')).toBe('2 habits to go before Foundations is cleared.');
    const done = state({ indicators: [ind('a', 'L1', 80)] });
    expect(clearingHeadline(tierStatus(done, 'L1'), 'Foundations')).toBe('All habits cleared. Foundations is yours.');
  });

  it('says not scored yet instead of a count when there is no data', () => {
    expect(clearingHeadline(tierStatus(state(), 'L3'), 'Growth')).toBe('Growth is not scored yet. Add data to start.');
  });
});

describe('fitPyramid and pyramidLayout', () => {
  it('picks a whole-number scale and drops labels as the space shrinks', () => {
    expect(fitPyramid(1200)).toEqual({ scale: 3, labels: 'full' });
    expect(fitPyramid(800)).toEqual({ scale: 2, labels: 'full' });
    expect(fitPyramid(560)).toEqual({ scale: 2, labels: 'short' });
    expect(fitPyramid(669)).toEqual({ scale: 2, labels: 'short' });
    expect(fitPyramid(400)).toEqual({ scale: 2, labels: 'none' });
  });

  it('fits the drawing inside the space it was picked for', () => {
    for (const w of [950, 1400, 670, 700, 545, 600, 480]) {
      expect(pyramidLayout(fitPyramid(w)).totalWidth).toBeLessThanOrEqual(w);
    }
  });

  it('narrows every layer upward and keeps L1 at the bottom', () => {
    const layout = pyramidLayout({ scale: 3, labels: 'full' });
    expect(layout.layers.map((l) => l.level)).toEqual([...PYRAMID_LEVELS]);
    layout.layers.forEach((l, i) => {
      expect(l.topWidth).toBeLessThan(l.bottomWidth);
      if (i > 0) expect(l.y1).toBeLessThan(layout.layers[i - 1].y0);
    });
    expect(layout.layers[0].y1).toBe(layout.height);
    expect(layout.layers[4].topWidth).toBeGreaterThan(0);
  });

  it('leaves room in every layer for its scene at the chosen scale', () => {
    for (const scale of [2, 3] as const) {
      const layout = pyramidLayout({ scale, labels: 'none' });
      layout.layers.forEach((l, i) => {
        const scene = PYRAMID_SCENES[(i + 1) as 1 | 2 | 3 | 4 | 5].width * scale;
        expect(scene).toBeLessThanOrEqual(l.bottomWidth);
      });
    }
  });

  it('puts labels to the right of the layer', () => {
    const layout = pyramidLayout({ scale: 3, labels: 'full' });
    for (const l of layout.layers) expect(labelLeft(layout, l)).toBeGreaterThan(layout.width / 2 + l.midWidth / 2);
  });

  it('draws a closed path for each layer', () => {
    const layout = pyramidLayout({ scale: 2, labels: 'none' });
    for (const l of layout.layers) {
      const d = trapezoidPath(layout.width, l, layout.radius);
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      expect(d.match(/Q/g)).toHaveLength(4);
    }
  });
});
