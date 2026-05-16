import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addHolding } from '@/api/assetsApi';
import { Account } from '@/types/Account';

type Props = {
  accounts: Account[];
  onSuccess: () => void;
  onClose: () => void;
};

type FormValues = {
  accountId: string;
  ticker: string;
  quantity: number;
  costBasis: number;
  currency: string;
};

export function AddHoldingDialog({ accounts, onSuccess, onClose }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { currency: 'IDR' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => addHolding(values),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">Add Holding</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Account</label>
            <select
              {...register('accountId', { required: 'Account is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select account…</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.accountId && <p className="text-xs text-destructive mt-1">{errors.accountId.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Ticker</label>
            <input
              type="text"
              {...register('ticker', { required: 'Ticker is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
              placeholder="e.g. BBCA, BTC"
            />
            {errors.ticker && <p className="text-xs text-destructive mt-1">{errors.ticker.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                {...register('quantity', { required: 'Quantity is required', valueAsNumber: true, min: { value: 0, message: 'Must be > 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0"
              />
              {errors.quantity && <p className="text-xs text-destructive mt-1">{errors.quantity.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cost Basis (IDR)</label>
              <input
                type="number"
                step="any"
                {...register('costBasis', { required: 'Cost basis is required', valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0"
              />
              {errors.costBasis && <p className="text-xs text-destructive mt-1">{errors.costBasis.message}</p>}
            </div>
          </div>
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
