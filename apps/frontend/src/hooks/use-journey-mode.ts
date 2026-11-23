import { useCallback, useState } from 'react';

/** The two Journey views: the pixel pyramid with the level card, or the growing plant with the trail. */
export type JourneyMode = 'pyramid' | 'plant';

const STORAGE_KEY = 'pf-journey-mode';

// Storage can be missing or throw (private windows, blocked site data); the page must still render.
const readMode = (): JourneyMode => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'plant' ? 'plant' : 'pyramid';
  } catch {
    return 'pyramid';
  }
};

/** The Journey view the owner picked last, remembered in this browser only. */
export function useJourneyMode() {
  const [mode, setModeState] = useState<JourneyMode>(readMode);
  const setMode = useCallback((next: JourneyMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering the choice is a convenience; ignore a storage failure.
    }
  }, []);
  return [mode, setMode] as const;
}
