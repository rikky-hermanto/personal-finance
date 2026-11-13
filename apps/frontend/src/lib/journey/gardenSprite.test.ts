import { describe, expect, it } from 'vitest';
import { GARDEN_SPRITES } from '@/lib/journey/gardenSprites.generated';
import {
  leafBurst,
  stageFromScore,
  toGardenLevel,
  type GardenLevel,
  type PlantStage,
} from './gardenSprite';

const LEVELS: GardenLevel[] = [1, 2, 3, 4, 5];
const STAGES: PlantStage[] = [0, 1, 2, 3];

// A small seeded generator so "random" tests give the same answer every run.
const seeded = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('stageFromScore', () => {
  it('moves up one stage for every 25 points', () => {
    expect(stageFromScore(0)).toBe(0);
    expect(stageFromScore(24.9)).toBe(0);
    expect(stageFromScore(25)).toBe(1);
    expect(stageFromScore(49.9)).toBe(1);
    expect(stageFromScore(50)).toBe(2);
    expect(stageFromScore(75)).toBe(3);
    expect(stageFromScore(100)).toBe(3);
  });

  it('clamps scores outside 0-100', () => {
    expect(stageFromScore(140)).toBe(3);
    expect(stageFromScore(-5)).toBe(0);
  });

  it('treats a score that is not a finite number as stage 0', () => {
    expect(stageFromScore(Number.NaN)).toBe(0);
    expect(stageFromScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(stageFromScore(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('toGardenLevel', () => {
  it('keeps levels 1-5 and clamps everything else', () => {
    expect(LEVELS.map(toGardenLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(toGardenLevel(0)).toBe(1);
    expect(toGardenLevel(9)).toBe(5);
    expect(toGardenLevel(2.6)).toBe(3);
    expect(toGardenLevel(Number.NaN)).toBe(1);
  });
});

describe('garden manifest', () => {
  it('describes all 20 sprites with a canopy that fits the 192px frame above the ground', () => {
    for (const level of LEVELS) {
      for (const stage of STAGES) {
        const s = GARDEN_SPRITES[level][stage];
        expect(s.halfWidth).toBeGreaterThan(0);
        expect(s.halfWidth).toBeLessThanOrEqual(96);
        expect(s.top).toBeGreaterThanOrEqual(-96);
        expect(s.top).toBeLessThan(s.bottom);
        expect(s.bottom).toBeLessThan(s.ground);
        expect(s.ground).toBeLessThanOrEqual(96);
      }
    }
  });

  it('gives every sprite two literal Tailwind colour classes', () => {
    for (const level of LEVELS) {
      for (const stage of STAGES) {
        for (const cls of GARDEN_SPRITES[level][stage].colorClasses) {
          expect(cls).toMatch(/^bg-\[#[0-9a-f]{6}\]$/);
        }
      }
    }
  });
});

describe('leafBurst', () => {
  it('drops 2, 4, 6 and 6 leaves for stages 0 to 3', () => {
    for (const level of LEVELS) {
      expect(STAGES.map((stage) => leafBurst(level, stage, 0, seeded(1)).length)).toEqual([2, 4, 6, 6]);
    }
  });

  it('numbers leaves consecutively from firstId', () => {
    const leaves = leafBurst(3, 2, 40, seeded(2));
    expect(leaves.map((l) => l.id)).toEqual([40, 41, 42, 43, 44, 45]);
  });

  it('starts every leaf inside the canopy box and above the ground', () => {
    for (const rand of [() => 0, () => 0.5, () => 0.999]) {
      for (const level of LEVELS) {
        for (const stage of STAGES) {
          const box = GARDEN_SPRITES[level][stage];
          for (const leaf of leafBurst(level, stage, 0, rand)) {
            expect(leaf.x).toBeGreaterThanOrEqual(-box.halfWidth);
            expect(leaf.x).toBeLessThanOrEqual(box.halfWidth);
            expect(leaf.y).toBeGreaterThanOrEqual(box.top);
            expect(leaf.y).toBeLessThanOrEqual(box.bottom);
            expect(leaf.y).toBeLessThan(box.ground);
          }
        }
      }
    }
  });

  it('drifts at most 16px sideways and falls for 0.8 to 1.5 seconds', () => {
    for (const rand of [() => 0, () => 0.5, () => 0.999]) {
      for (const leaf of leafBurst(4, 3, 0, rand)) {
        expect(Math.abs(leaf.drift)).toBeLessThanOrEqual(16);
        expect(leaf.duration).toBeGreaterThanOrEqual(0.8);
        expect(leaf.duration).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('alternates the two leaf colours of the species', () => {
    const [a, b] = GARDEN_SPRITES[1][2].colorClasses;
    expect(leafBurst(1, 2, 0, seeded(3)).map((l) => l.colorClass)).toEqual([a, b, a, b, a, b]);
  });

  it('is deterministic for a fixed random source', () => {
    expect(leafBurst(5, 3, 7, seeded(99))).toEqual(leafBurst(5, 3, 7, seeded(99)));
  });

  it('uses the real random source by default', () => {
    const leaves = leafBurst(2, 1, 0);
    expect(leaves).toHaveLength(4);
    for (const leaf of leaves) expect(Number.isFinite(leaf.x + leaf.y + leaf.drift + leaf.duration)).toBe(true);
  });
});
