import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { previewGoal } from '@/api/goalsApi';
import type { GoalPreviewDraft } from '@/types/Goal';

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Live form previews from POST /api/goals/preview (FIN-01: the browser never does goal math).
 * Pass `null` while the draft does not parse; the previous result stays on screen so the line doesn't flicker. */
export function useGoalPreview(draft: GoalPreviewDraft | null) {
  const key = draft ? JSON.stringify(draft) : null;
  const debouncedKey = useDebounced(key, DEBOUNCE_MS);
  const query = useQuery({
    queryKey: ['goals', 'preview', debouncedKey],
    queryFn: () => previewGoal(JSON.parse(debouncedKey as string) as GoalPreviewDraft),
    enabled: debouncedKey !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  // True once the preview on screen belongs to the draft as typed now (not a debounced or previous one).
  const settled = key !== null && key === debouncedKey && query.isSuccess && !query.isFetching && !query.isPlaceholderData;
  return { ...query, settled };
}
