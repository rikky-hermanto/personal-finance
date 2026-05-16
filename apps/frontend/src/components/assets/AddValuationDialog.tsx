import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addValuation } from '@/api/assetsApi';
import { ValuationStrategy } from '@/types/Asset';

type Props = {
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  subjectName: string;
  currency: string;
  strategy: ValuationStrategy;
  onSuccess: () => void;
  onClose: () => void;
};

type FormValues = {
  valueNative: number;
  valuedAt: string;
  notes?: string;
};

export function AddValuationDialog({ subjectType, subjectId, subjectName, currency, strategy, onSuccess, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { valuedAt: today },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      addValuation({
        subjectType,
        subjectId,
        valueNative: values.valueNative,
        currency,
        fxRateToIdr: 1,
        valueIdr: values.valueNative,
        source: 'manual',
        notes: values.notes,
        valuedAt: values.valuedAt,
      }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const isAutoPricing = strategy === 'RealTime' || strategy === 'Algorithmic' || strategy === 'Amortized';

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-1">Add Valuation</h2>
        <p className="text-xs text-muted-foreground mb-4">For {subjectName}</p>

        {isAutoPricing && (
          <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2 mb-4">
            Auto-pricing arrives in Phase 2. Enter manually for now.
          </p>
        )}

        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Date</label>
            <input
              type="date"
              {...register('valuedAt', { required: 'Date is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            />
            {errors.valuedAt && <p className="text-xs text-destructive mt-1">{errors.valuedAt.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Value ({currency})</label>
            <input
              type="number"
              step="any"
              {...register('valueNative', { required: 'Value is required', valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
              placeholder="0"
            />
            {errors.valueNative && <p className="text-xs text-destructive mt-1">{errors.valueNative.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes <span className="text-muted-foreground">(optional)</span></label>
            <input
              type="text"
              {...register('notes')}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder=""
            />
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">{String(mutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
