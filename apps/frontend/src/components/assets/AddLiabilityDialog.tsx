import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addLiability } from '@/api/liabilitiesApi';

type Props = { onSuccess: () => void; onClose: () => void };

type FormValues = {
  name: string;
  liabilityType: 'revolving' | 'installment' | 'personal';
  principal: number;
  interestRate?: number;
  startDate: string;
  endDate?: string;
  monthlyPayment?: number;
};

export function AddLiabilityDialog({ onSuccess, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { startDate: today },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      addLiability({
        name: values.name,
        liabilityType: values.liabilityType,
        principal: values.principal,
        interestRate: values.interestRate || undefined,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        monthlyPayment: values.monthlyPayment || undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">Add Liability</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="e.g. KPR Rumah Silangit"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <select
              {...register('liabilityType', { required: 'Type is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select type…</option>
              <option value="revolving">Revolving</option>
              <option value="installment">Installment</option>
              <option value="personal">Personal</option>
            </select>
            {errors.liabilityType && <p className="text-xs text-destructive mt-1">{errors.liabilityType.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Principal (IDR)</label>
            <input
              type="number"
              step="any"
              {...register('principal', { required: 'Principal is required', valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
              placeholder="0"
            />
            {errors.principal && <p className="text-xs text-destructive mt-1">{errors.principal.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Interest Rate % <span className="text-muted-foreground">(p.a., optional)</span></label>
              <input
                type="number"
                step="0.01"
                {...register('interestRate', { valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0.0"
              />
              {errors.interestRate && <p className="text-xs text-destructive mt-1">{errors.interestRate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Monthly Payment <span className="text-muted-foreground">(optional)</span></label>
              <input
                type="number"
                step="any"
                {...register('monthlyPayment', { valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0"
              />
              {errors.monthlyPayment && <p className="text-xs text-destructive mt-1">{errors.monthlyPayment.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Start Date</label>
              <input
                type="date"
                {...register('startDate', { required: 'Start date is required' })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              />
              {errors.startDate && <p className="text-xs text-destructive mt-1">{errors.startDate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">End Date <span className="text-muted-foreground">(optional)</span></label>
              <input
                type="date"
                {...register('endDate')}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              />
            </div>
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
