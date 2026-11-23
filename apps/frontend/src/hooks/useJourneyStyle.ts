import { useState } from 'react';
import type { GardenLevel } from '@/lib/journey/gardenSprite';

export type JourneyStyle = 'cherry' | 'bush' | 'maple';

/**
 * The tree species drawn in the Journey garden hero. Each reuses one level's generated sprite
 * sheets (see scripts/generate-garden-sprites.mjs), so `spriteLevel` picks the art, not the level.
 */
export const JOURNEY_STYLE_OPTIONS: {
  id: JourneyStyle;
  label: string;
  desc: string;
  spriteLevel: GardenLevel;
}[] = [
  { id: 'cherry', label: 'Cherry Blossom', desc: 'Pink petals in bloom', spriteLevel: 3 },
  { id: 'bush',   label: 'Green Bush',     desc: 'Round and evergreen',  spriteLevel: 1 },
  { id: 'maple',  label: 'Autumn Maple',   desc: 'Gold and amber leaves', spriteLevel: 4 },
];

const DEFAULT_STYLE: JourneyStyle = 'cherry';
const KEY = 'pf:journey-style';

const isJourneyStyle = (v: string | null): v is JourneyStyle =>
  JOURNEY_STYLE_OPTIONS.some((o) => o.id === v);

export const spriteLevelFor = (style: JourneyStyle): GardenLevel =>
  JOURNEY_STYLE_OPTIONS.find((o) => o.id === style)?.spriteLevel ?? 3;

export function useJourneyStyle() {
  const [style, setStyleState] = useState<JourneyStyle>(() => {
    try {
      // Older saved values (tree, skyline, crystal) fall back to the default species.
      const stored = localStorage.getItem(KEY);
      return isJourneyStyle(stored) ? stored : DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  });

  const setStyle = (s: JourneyStyle) => {
    try { localStorage.setItem(KEY, s); } catch { /* storage unavailable; keep in-memory style */ }
    setStyleState(s);
  };

  return { style, setStyle };
}
