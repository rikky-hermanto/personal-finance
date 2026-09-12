import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMacroScenario, deleteMacroScenario, getMacroScenarios } from '@/api/macroScenarioApi';
import { getAssets, getHoldings } from '@/api/assetsApi';
import { getLiabilities } from '@/api/liabilitiesApi';
import { getVarianceExplainer } from '@/api/spendingAnalysisApi';
import { getBuckets } from '@/api/bucketsApi';

const MACRO_SCENARIOS_KEY = ['macro-lab', 'saved-scenarios'];

export function useSavedMacroScenarios() {
  return useQuery({ queryKey: MACRO_SCENARIOS_KEY, queryFn: getMacroScenarios });
}

export function useSaveMacroScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, driversJson }: { name: string; driversJson: string }) => createMacroScenario(name, driversJson),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MACRO_SCENARIOS_KEY }),
  });
}

export function useDeleteMacroScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMacroScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MACRO_SCENARIOS_KEY }),
  });
}

export function useMacroLabPersonalizationData() {
  const holdings = useQuery({ queryKey: ['holdings'], queryFn: getHoldings });
  const assets = useQuery({ queryKey: ['assets'], queryFn: getAssets });
  const liabilities = useQuery({ queryKey: ['liabilities'], queryFn: getLiabilities });
  const variance = useQuery({ queryKey: ['spending-analysis', 'variance'], queryFn: () => getVarianceExplainer() });
  const buckets = useQuery({ queryKey: ['buckets'], queryFn: getBuckets });

  return {
    holdings: holdings.data ?? [],
    assets: assets.data ?? [],
    liabilities: liabilities.data ?? [],
    variance: variance.data,
    buckets: buckets.data,
    isLoading: holdings.isLoading || assets.isLoading || liabilities.isLoading || variance.isLoading || buckets.isLoading,
  };
}
