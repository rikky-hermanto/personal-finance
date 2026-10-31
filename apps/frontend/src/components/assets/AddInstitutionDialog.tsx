import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addInstitution, updateInstitution } from '@/api/accountsApi';
import { Institution } from '@/types/Institution';

type Props = {
  initial?: Institution;
  onSuccess: () => void;
  onClose: () => void;
};

type FormValues = {
  name: string;
  type: string;
  country: string;
  logoUrl: string;
};

export function AddInstitutionDialog({ initial, onSuccess, onClose }: Props) {
  const isEdit = !!initial;
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? '',
      country: initial?.country ?? 'ID',
      logoUrl: initial?.logoUrl ?? '',
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    // The update endpoint replaces every field, so the logo URL is always sent (empty means no logo).
    mutationFn: ({ logoUrl, ...values }: FormValues) =>
      isEdit
        ? updateInstitution(initial!.id, { ...values, logoUrl: logoUrl.trim() || undefined })
        : addInstitution({ ...values, logoUrl: logoUrl.trim() || undefined }),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">{isEdit ? 'Edit bank / app' : 'Add bank / app'}</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="e.g. BCA"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <select
              {...register('type', { required: 'Type is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
            >
              <option value="">Select type…</option>
              <option value="bank">Bank</option>
              <option value="broker">Investing app / broker</option>
              <option value="crypto_exchange">Crypto exchange</option>
              <option value="insurer">Insurance</option>
              <option value="other">Other</option>
            </select>
            {errors.type && <p className="text-xs text-destructive mt-1">{errors.type.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Country</label>
            <input
              type="text"
              {...register('country', { required: 'Country is required' })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="ID"
            />
            {errors.country && <p className="text-xs text-destructive mt-1">{errors.country.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Logo URL <span className="text-muted-foreground">(optional)</span></label>
            <input
              type="url"
              {...register('logoUrl')}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs"
              placeholder="https://…"
            />
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">Couldn’t save. Try again.</p>
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
