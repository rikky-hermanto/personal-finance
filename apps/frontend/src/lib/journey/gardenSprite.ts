import { GARDEN_SPRITES } from '@/lib/journey/gardenSprites.generated';

export type PlantStage = 0 | 1 | 2 | 3;
export type GardenLevel = 1 | 2 | 3 | 4 | 5;

/**
 * One growth stage per 25 points of the level score, capped at stage 3.
 * These are display bands carried over from PF-114, not financial thresholds.
 */
export const stageFromScore = (score: number): PlantStage => {
  if (!Number.isFinite(score)) return 0;
  return Math.min(3, Math.max(0, Math.floor(score / 25))) as PlantStage;
};

/** The journey level as a garden level: rounded and clamped to 1-5, so a bad value still draws a tree. */
export const toGardenLevel = (level: number): GardenLevel => {
  if (!Number.isFinite(level)) return 1;
  return Math.min(5, Math.max(1, Math.round(level))) as GardenLevel;
};

/** A falling leaf. Positions are display pixels relative to the centre of the sprite. */
export interface Leaf {
  id: number;
  x: number;
  y: number;
  drift: number;
  duration: number;
  colorClass: string;
}

const LEAVES_PER_STAGE: Record<PlantStage, number> = { 0: 2, 1: 4, 2: 6, 3: 6 };
const MAX_DRIFT_PX = 16;
const MIN_FALL_SECONDS = 0.8;
const MAX_FALL_SECONDS = 1.5;

/**
 * Leaves shaken loose by a tap: 2, 4, 6 or 6 for stages 0-3. Each starts inside that sprite's
 * canopy box (from the generated manifest, so it never drifts from the art), above the ground,
 * and alternates the species' two leaf colours. `rand` is injectable so tests are deterministic.
 */
export const leafBurst = (
  level: GardenLevel,
  stage: PlantStage,
  firstId: number,
  rand: () => number = Math.random,
): Leaf[] => {
  const sprite = GARDEN_SPRITES[level][stage];
  const lowestStart = Math.min(sprite.bottom, sprite.ground - 1);
  return Array.from({ length: LEAVES_PER_STAGE[stage] }, (_, i) => ({
    id: firstId + i,
    x: -sprite.halfWidth + rand() * 2 * sprite.halfWidth,
    y: sprite.top + rand() * (lowestStart - sprite.top),
    drift: (rand() * 2 - 1) * MAX_DRIFT_PX,
    duration: MIN_FALL_SECONDS + rand() * (MAX_FALL_SECONDS - MIN_FALL_SECONDS),
    colorClass: sprite.colorClasses[i % 2],
  }));
};
