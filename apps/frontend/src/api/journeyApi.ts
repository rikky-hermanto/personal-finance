import type { JourneyState, Quest } from '@/types/Journey';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export const getJourneyState = async (): Promise<JourneyState> => {
  const r = await fetch(`${API}/api/journey/state`);
  if (!r.ok) throw new Error('Failed to load journey state');
  return r.json();
};

export const getJourneyQuests = async (): Promise<Quest[]> => {
  const r = await fetch(`${API}/api/journey/quests`);
  if (!r.ok) throw new Error('Failed to load quests');
  return r.json();
};

export const recalculateJourney = async (): Promise<JourneyState> => {
  const r = await fetch(`${API}/api/journey/recalculate`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to recalculate journey');
  return r.json();
};
