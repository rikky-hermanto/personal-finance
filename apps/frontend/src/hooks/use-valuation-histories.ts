import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getValuations } from '@/api/assetsApi';
import { Valuation } from '@/types/Valuation';

/**
 * Valuation history (newest first) for each asset or holding id.
 * GET /api/assets and /api/assets/holdings do not join a latest valuation, so it is read
 * per subject, the same way use-accounts reads account balances.
 */
export function useValuationHistories(subjectType: 'asset' | 'holding', ids: string[]) {
  const queries = useQueries({
    queries: ids.map(id => ({
      queryKey: [`${subjectType}-valuations`, id],
      queryFn: () => getValuations(subjectType, id),
    })),
  });

  const idsKey = ids.join('|');
  const versionKey = queries.map(q => q.dataUpdatedAt).join('|');

  const byId = useMemo(
    () => new Map<string, Valuation[]>(ids.map((id, i) => [id, queries[i]?.data ?? []])),
    // idsKey and versionKey stand in for ids and queries, which are new arrays every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, versionKey],
  );

  return { byId, isLoading: queries.some(q => q.isLoading) };
}
