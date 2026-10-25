import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { clearNoDebts, confirmNoDebts, getNoDebtsConfirmation } from '@/api/journeyApi';

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Shown in place of the table when no liability is recorded. The Journey debt score stays
// "not evaluated" until the owner adds a debt or confirms here (FIN-04).
export const NoDebtsPrompt = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['no-debts-confirmation'],
    queryFn: getNoDebtsConfirmation,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['no-debts-confirmation'] });
    queryClient.invalidateQueries({ queryKey: ['journey-state'] });
  };
  const confirm = useMutation({ mutationFn: confirmNoDebts, onSuccess: refresh });
  const clear = useMutation({ mutationFn: clearNoDebts, onSuccess: refresh });

  if (isLoading) return null;

  const confirmedAt = data?.confirmedAt ?? null;

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {confirmedAt ? (
        <>
          <p className="text-sm text-foreground">
            You confirmed on {formatDay(confirmedAt)} that you have no debts.
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Your debt score on Journey is based on that. Adding a debt later replaces it.
          </p>
          <Button variant="ghost" size="sm" disabled={clear.isPending} onClick={() => clear.mutate()}>
            Undo
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">No debts recorded yet.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add a debt above, or tell us you have none. Until then your debt score on Journey stays
            "not evaluated".
          </p>
          <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            I have no debts
          </Button>
        </>
      )}
      {(confirm.isError || clear.isError) && (
        <p className="text-xs text-destructive">Could not save that. Try again.</p>
      )}
    </div>
  );
};
