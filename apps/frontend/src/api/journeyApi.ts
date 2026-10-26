import { authenticatedFetch } from '@/api/authenticatedFetch';
import type { JourneyState, NoDebtsConfirmation, QuestBoard } from '@/types/Journey';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export const getJourneyState = async (): Promise<JourneyState> => {
  const r = await authenticatedFetch(`${API}/api/journey/state`);
  if (!r.ok) throw new Error('Failed to load journey state');
  return r.json();
};

export const getJourneyQuests = async (): Promise<QuestBoard> => {
  const r = await authenticatedFetch(`${API}/api/journey/quests`);
  if (!r.ok) throw new Error('Failed to load quests');
  return r.json();
};

export const recalculateJourney = async (): Promise<JourneyState> => {
  const r = await authenticatedFetch(`${API}/api/journey/recalculate`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to recalculate journey');
  return r.json();
};

export const getNoDebtsConfirmation = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`);
  if (!r.ok) throw new Error('Failed to load debt confirmation');
  return r.json();
};

export const confirmNoDebts = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`, { method: 'PUT' });
  if (!r.ok) throw new Error('Failed to confirm no debts');
  return r.json();
};

export const clearNoDebts = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to clear debt confirmation');
  return r.json();
};

export const setQuestFocus = async (code: string): Promise<QuestBoard> => {
  const r = await authenticatedFetch(`${API}/api/journey/quests/${encodeURIComponent(code)}/focus`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to set focus quest');
  return r.json();
};

export const snoozeQuest = async (code: string): Promise<QuestBoard> => {
  const r = await authenticatedFetch(`${API}/api/journey/quests/${encodeURIComponent(code)}/snooze`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to snooze quest');
  return r.json();
};

export const markQuestsSeen = async (ids: number[]): Promise<void> => {
  const r = await authenticatedFetch(`${API}/api/journey/quests/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) throw new Error('Failed to mark quests seen');
};
