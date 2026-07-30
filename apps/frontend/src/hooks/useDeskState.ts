import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApproveMandatePayload, SaveMandateDraftPayload,
  approveMandate, getDeskState, getMandateVersions, resolveReconIssue, saveMandateDraft, setPositionSleeve,
} from '@/api/deskApi';

const DESK_STATE_KEY = ['desk', 'state'];
const DESK_MANDATE_VERSIONS_KEY = ['desk', 'mandate', 'versions'];

export function useDeskState() {
  return useQuery({ queryKey: DESK_STATE_KEY, queryFn: getDeskState });
}

export function useDeskMandateVersions() {
  return useQuery({ queryKey: DESK_MANDATE_VERSIONS_KEY, queryFn: getMandateVersions });
}

// Every mutation invalidates desk state — the sticky GateBar must reflect server truth
// immediately after a recon resolution, sleeve change, or mandate approval. No optimistic
// local updates: those would let the gate show PASS before the server agrees.

export function useSaveMandateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveMandateDraftPayload) => saveMandateDraft(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DESK_STATE_KEY });
      queryClient.invalidateQueries({ queryKey: DESK_MANDATE_VERSIONS_KEY });
    },
  });
}

export function useApproveMandate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApproveMandatePayload) => approveMandate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DESK_STATE_KEY });
      queryClient.invalidateQueries({ queryKey: DESK_MANDATE_VERSIONS_KEY });
    },
  });
}

export function useResolveReconIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) => resolveReconIssue(id, resolution),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DESK_STATE_KEY }),
  });
}

export function useSetPositionSleeve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sleeve }: { id: string; sleeve: string }) => setPositionSleeve(id, sleeve),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DESK_STATE_KEY }),
  });
}
