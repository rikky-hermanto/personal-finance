import { useState } from 'react';

export type JourneyStyle = 'tree' | 'skyline' | 'crystal';

export const JOURNEY_STYLE_OPTIONS: { id: JourneyStyle; label: string; desc: string }[] = [
  { id: 'tree',    label: 'Growing Tree',    desc: 'From roots to crown' },
  { id: 'skyline', label: 'City Skyline',    desc: 'From house to landmark' },
  { id: 'crystal', label: 'Diamond',         desc: 'From rough stone to gem' },
];

const KEY = 'pf:journey-style';

export function useJourneyStyle() {
  const [style, setStyleState] = useState<JourneyStyle>(() => {
    try {
      return (localStorage.getItem(KEY) as JourneyStyle) ?? 'tree';
    } catch {
      return 'tree';
    }
  });

  const setStyle = (s: JourneyStyle) => {
    try { localStorage.setItem(KEY, s); } catch {}
    setStyleState(s);
  };

  return { style, setStyle };
}
