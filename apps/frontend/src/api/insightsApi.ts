import type { Insight, DailyPulse } from '@/types/Insight';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export const getInsights = (): Promise<Insight[]> =>
  fetch(`${BASE}/api/insights`).then(r => {
    if (!r.ok) throw new Error('Failed to load insights');
    return r.json();
  });

export const getDailyPulse = (): Promise<DailyPulse> =>
  fetch(`${BASE}/api/insights/daily-pulse`).then(r => {
    if (!r.ok) throw new Error('Failed to load daily pulse');
    return r.json();
  });
