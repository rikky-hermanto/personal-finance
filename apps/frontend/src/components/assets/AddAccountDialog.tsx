import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addAccount, updateAccount } from '@/api/accountsApi';
import { Account } from '@/types/Account';
import { Institution } from '@/types/Institution';

type Props = {
  institutions: Institution[];
  initial?: Account;
  onSuccess: () => void;
  onClose: () => void;
};

type FormValues = {
  institutionId: string;
  name: string;
  accountType: string;
  currency: string;
  openingBalance: number;
  openingDate: string;
};

export function AddAccountDialog({ institutions, initial, onSuccess, onClose }: Props) {
  const isEdit = !!initial;
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      institutionId: initial?.institutionId ?? '',
      name: initial?.name ?? '',
      accountType: initial?.accountType ?? '',
      currency: initial?.currency ?? 'IDR',
      openingBalance: initial?.openingBalance ?? 0,
      openingDate: initial?.openingDate?.slice(0, 10) ?? today,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isEdit
        ? updateAccount(initial!.id, values)
        : addAccount(values),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">{isEdit ? 'Edit Account' : 'Add Account'}</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Institution</label>
            <select
              {...register('institutionId', { required: 'Institution is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select institution…</option>
              {institutions.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            {errors.institutionId && <p className="text-xs text-destructive mt-1">{errors.institutionId.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Account Name</label>
            <input
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="e.g. BCA Tabungan"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Account Type</label>
            <select
              {...register('accountType', { required: 'Account type is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select type…</option>
              <option value="savings">Savings</option>
              <option value="checking">Checking / Giro</option>
              <option value="credit_card">Credit Card</option>
              <option value="brokerage">Brokerage</option>
              <option value="wallet">E-Wallet / Crypto</option>
              <option value="loan">Loan</option>
            </select>
            {errors.accountType && <p className="text-xs text-destructive mt-1">{errors.accountType.message}</p>}
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
              <label className="block text-xs font-medium mb-1">Opening Balance</label>
              <input
                type="number"
                step="any"
                {...register('openingBalance', { valueAsNumber: true, min: { value: 0, message: 'Must be ≥ 0' } })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono"
                placeholder="0"
              />
              {errors.openingBalance && <p className="text-xs text-destructive mt-1">{errors.openingBalance.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Opening Date</label>
            <input
              type="date"
              {...register('openingDate', { required: 'Opening date is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            />
            {errors.openingDate && <p className="text-xs text-destructive mt-1">{errors.openingDate.message}</p>}
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
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
