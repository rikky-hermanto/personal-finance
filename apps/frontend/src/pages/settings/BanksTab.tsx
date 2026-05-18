import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Trash2, Building2, Pencil } from 'lucide-react';
import {
  getInstitutions,
  getAccounts,
  addInstitution,
  deleteInstitution,
  setAccountCashflowFlag,
} from '@/api/accountsApi';
import { Institution } from '@/types/Institution';
import { AddAccountDialog } from '@/components/assets/AddAccountDialog';
import { AddInstitutionDialog } from '@/components/assets/AddInstitutionDialog';

const INSTITUTION_TYPES = [
  { value: 'bank',            label: 'Bank' },
  { value: 'broker',          label: 'Broker' },
  { value: 'crypto_exchange', label: 'Crypto Exchange' },
  { value: 'insurer',         label: 'Insurance' },
  { value: 'other',           label: 'Other' },
];

const emptyForm = () => ({ name: '', type: 'bank', country: 'ID', logoUrl: '' });

const BanksTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editInstitution, setEditInstitution] = useState<Institution | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const { data: institutions = [], isLoading: instLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: getInstitutions,
  });

  const { data: accounts = [], isLoading: acctLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Partial<Institution>) => addInstitution(payload),
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

  const cashflowMutation = useMutation({
    mutationFn: ({ id, include }: { id: string; include: boolean }) =>
      setAccountCashflowFlag(id, include),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-summaries'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, logoUrl: form.logoUrl || undefined });
  };

  const isLoading = instLoading || acctLoading;

  const accountsByInst = accounts.reduce<Record<string, typeof accounts>>(
    (acc, a) => {
      const key = a.institutionId ?? '__none__';
      (acc[key] ??= []).push(a);
      return acc;
    },
    {},
  );

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Banks &amp; Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage financial institutions and their accounts. Toggle cashflow to control which
            accounts appear in the Cashflow module.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddAccountOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Account
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Institution
          </Button>
        </div>
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
        <div className="space-y-3">
          {institutions.map((inst) => {
            const instAccounts = accountsByInst[inst.id] ?? [];
            return (
              <div key={inst.id} className="border border-border rounded-lg overflow-hidden">
                {/* Institution row */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{inst.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {INSTITUTION_TYPES.find((t) => t.value === inst.type)?.label ?? inst.type}
                        {' · '}{inst.country}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditInstitution(inst)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
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

                {/* Accounts under this institution */}
                {instAccounts.length > 0 && (
                  <div className="divide-y divide-border">
                    {instAccounts.map((acct) => (
                      <div
                        key={acct.id}
                        className="flex items-center justify-between px-4 py-2.5 pl-14"
                      >
                        <div>
                          <p className="text-sm text-foreground">{acct.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {acct.accountType} · {acct.currency}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Cashflow</span>
                          <Switch
                            checked={acct.includeInCashflow}
                            onCheckedChange={(checked) =>
                              cashflowMutation.mutate({ id: acct.id, include: checked })
                            }
                            disabled={cashflowMutation.isPending}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {instAccounts.length === 0 && (
                  <div className="px-4 py-2.5 pl-14">
                    <p className="text-xs text-muted-foreground italic">No accounts yet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Institution dialog (inline — used for create only) */}
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

      {/* Edit Institution dialog */}
      {editInstitution && (
        <AddInstitutionDialog
          initial={editInstitution}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['institutions'] })}
          onClose={() => setEditInstitution(null)}
        />
      )}

      {/* Add Account dialog */}
      {addAccountOpen && (
        <AddAccountDialog
          institutions={institutions}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })}
          onClose={() => setAddAccountOpen(false)}
        />
      )}
    </div>
  );
};

export default BanksTab;
