import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

interface Institution {
  id: string;
  name: string;
  type: string;
  country: string;
  logoUrl?: string;
}

interface CreateInstitutionPayload {
  name: string;
  type: string;
  country: string;
  logoUrl?: string;
}

const INSTITUTION_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'broker', label: 'Broker' },
  { value: 'crypto_exchange', label: 'Crypto Exchange' },
  { value: 'insurer', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

async function fetchInstitutions(): Promise<Institution[]> {
  const res = await fetch(`${API_BASE}/api/accounts/institutions`);
  if (!res.ok) throw new Error('Failed to fetch institutions');
  return res.json();
}

async function createInstitution(payload: CreateInstitutionPayload): Promise<Institution> {
  const res = await fetch(`${API_BASE}/api/accounts/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create institution');
  return res.json();
}

async function deleteInstitution(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/accounts/institutions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete institution');
}

const emptyForm = (): CreateInstitutionPayload => ({
  name: '',
  type: 'bank',
  country: 'ID',
  logoUrl: '',
});

const BanksTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateInstitutionPayload>(emptyForm());

  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: fetchInstitutions,
  });

  const createMutation = useMutation({
    mutationFn: createInstitution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInstitution,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['institutions'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      logoUrl: form.logoUrl || undefined,
    });
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Banks & Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage financial institutions linked to your accounts.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Institution
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : institutions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
          <Building2 className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No institutions yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your banks, brokers, and crypto exchanges here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg">
          {institutions.map((inst) => (
            <div
              key={inst.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{inst.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {INSTITUTION_TYPES.find((t) => t.value === inst.type)?.label ?? inst.type} · {inst.country}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(inst.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Institution</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. BCA, Mandiri, IPOT"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTITUTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="ID"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">Logo URL (optional)</Label>
              <Input
                id="logoUrl"
                placeholder="https://…"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              />
            </div>
            <DialogFooter className="mt-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving…' : 'Add Institution'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BanksTab;
