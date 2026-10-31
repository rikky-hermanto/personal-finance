import { useMemo } from 'react';
import { QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccounts, getInstitutions, setAccountCashflowFlag } from '@/api/accountsApi';
import { addValuation, getValuations } from '@/api/assetsApi';
import { Account } from '@/types/Account';
import { Institution } from '@/types/Institution';

export interface AccountView extends Account {
  institution?: Institution;
}

/**
 * Accounts joined with their bank / app and their latest balance.
 * GET /api/accounts does not return latestValuation, so the latest balance is read per
 * account from the valuation history (newest first), as the net worth service does.
 */
export function useAccounts() {
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const institutionsQuery = useQuery({ queryKey: ['institutions'], queryFn: getInstitutions });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const institutions = useMemo(() => institutionsQuery.data ?? [], [institutionsQuery.data]);

  const valuationQueries = useQueries({
    queries: accounts.map(a => ({
      queryKey: ['account-valuations', a.id],
      queryFn: () => getValuations('account', a.id),
    })),
  });
  const latestById = valuationQueries.map(q => q.data?.[0]);
  const valuationsLoading = valuationQueries.some(q => q.isLoading);
  const latestKey = latestById.map(v => v?.id ?? '').join('|');

  const views = useMemo<AccountView[]>(() => {
    const instById = new Map(institutions.map(i => [i.id, i]));
    return accounts.map((a, i) => ({
      ...a,
      latestValuation: a.latestValuation ?? latestById[i],
      institution: a.institutionId ? instById.get(a.institutionId) : undefined,
    }));
    // latestKey stands in for latestById, which is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, institutions, latestKey]);

  return {
    accounts: views,
    institutions,
    isLoading: accountsQuery.isLoading || institutionsQuery.isLoading,
    valuationsLoading,
    error: accountsQuery.error ?? institutionsQuery.error,
  };
}

/** Everything that shows an account, its balance, or a total built from it. */
export function invalidateAccountQueries(queryClient: QueryClient) {
  for (const key of [
    'accounts',
    'institutions',
    'account-valuations',
    'account-balances',
    'account-summaries',
    'networth-current',
    'networth-history',
    'networth-allocation',
    'journey-state',
    'journey-quests',
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Records today's balance for an account as a manual valuation (same payload as AddValuationDialog). */
export function useSaveBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ account, value }: { account: Account; value: number }) =>
      addValuation({
        subjectType: 'account',
        subjectId: account.id,
        valueNative: value,
        currency: account.currency,
        fxRateToIdr: 1,
        valueIdr: value,
        source: 'manual',
        // A full timestamp, not just today's date, so two saves on one day still sort newest first.
        valuedAt: new Date().toISOString(),
      }),
    onSuccess: () => invalidateAccountQueries(queryClient),
  });
}

/** Flips include_in_cashflow on the cached account first, and rolls back if the API refuses. */
export function useCashflowFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, include }: { id: string; include: boolean }) => setAccountCashflowFlag(id, include),
    onMutate: async ({ id, include }) => {
      await queryClient.cancelQueries({ queryKey: ['accounts'] });
      const previous = queryClient.getQueryData<Account[]>(['accounts']);
      queryClient.setQueryData<Account[]>(['accounts'], old =>
        old?.map(a => (a.id === id ? { ...a, includeInCashflow: include } : a)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['accounts'], context.previous);
    },
    onSettled: () => invalidateAccountQueries(queryClient),
  });
}
