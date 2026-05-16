import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addAsset } from '@/api/assetsApi';

type Props = { onSuccess: () => void; onClose: () => void };

type FormValues = {
  name: string;
  assetClass: string;
  currency: string;
  valuationStrategy: string;
  acquiredDate?: string;
  acquisitionCost?: number;
  notes?: string;
};

export function AddAssetDialog({ onSuccess, onClose }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { currency: 'IDR', valuationStrategy: 'Manual' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      addAsset({
        name: values.name,
        assetClass: values.assetClass as never,
        currency: values.currency,
        valuationStrategy: values.valuationStrategy as never,
        acquiredDate: values.acquiredDate || undefined,
        acquisitionCost: values.acquisitionCost || undefined,
        metadata: values.notes ? { notes: values.notes } : undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">Add Asset</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="e.g. Tanah Silangit"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Asset Class</label>
            <select
              {...register('assetClass', { required: 'Asset class is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select class…</option>
              <option value="real_estate">Real Estate</option>
              <option value="tangibles">Tangibles</option>
              <option value="vehicles">Vehicles</option>
              <option value="receivables">Receivables</option>
              <option value="retirement">Retirement</option>
              <option value="fixed_income">Fixed Income</option>
            </select>
            {errors.assetClass && <p className="text-xs text-destructive mt-1">{errors.assetClass.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <input
                type="text"
                {...register('currency', { required: 'Currency is required' })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="IDR"
              />
              {errors.currency && <p className="text-xs text-destructive mt-1">{errors.currency.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Valuation Strategy</label>
              <select
                {...register('valuationStrategy', { required: true })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              >
                <option value="Manual">Manual</option>
                <option value="Amortized">Amortized</option>
                <option value="Algorithmic">Algorithmic</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Acquired Date <span className="text-muted-foreground">(optional)</span></label>
              <input
                type="date"
                {...register('acquiredDate')}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Acquisition Cost <span className="text-muted-foreground">(optional)</span></label>
              <input
                type="number"
                step="any"
                {...register('acquisitionCost', { valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0"
              />
              {errors.acquisitionCost && <p className="text-xs text-destructive mt-1">{errors.acquisitionCost.message}</p>}
            </div>
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
