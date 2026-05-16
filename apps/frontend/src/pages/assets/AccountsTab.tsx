import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { getInstitutions, getAccounts } from '@/api/accountsApi';
import { AddInstitutionDialog } from '@/components/assets/AddInstitutionDialog';
import { AddAccountDialog } from '@/components/assets/AddAccountDialog';
import { AddValuationDialog } from '@/components/assets/AddValuationDialog';
import { Account } from '@/types/Account';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ValuationTarget = {
  subjectId: string;
  subjectName: string;
  currency: string;
};

function relativeDate(iso: string) {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function accountValue(account: Account): number {
  return account.latestValuation?.valueIdr ?? account.openingBalance;
}

function accountUpdatedAt(account: Account): string {
  return account.latestValuation?.valuedAt ?? account.openingDate;
}

export default function AccountsTab() {
  const [showAddInstitution, setShowAddInstitution] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [valuationTarget, setValuationTarget] = useState<ValuationTarget | null>(null);

  const { data: institutions = [], refetch: refetchInst } = useQuery({
    queryKey: ['institutions'],
    queryFn: getInstitutions,
  });
  const { data: accounts = [], refetch: refetchAcc } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const byInstitution = institutions.map(inst => ({
    ...inst,
    accounts: accounts.filter(a => a.institutionId === inst.id),
  }));

  const totalIdr = accounts.reduce((s, a) => s + accountValue(a), 0);

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Cash & Savings</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(totalIdr, 'IDR')}</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowAddInstitution(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
              >
                Add Institution
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
              A bank or financial institution (e.g. BCA, Superbank). Accounts live inside an institution.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowAddAccount(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
              >
                Add Account
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
              A specific account at an institution — savings, current, or e-wallet.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Institutions */}
      {byInstitution.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No institutions yet. Add one to get started.</p>
      )}
      {byInstitution.map(inst => {
        const instTotal = inst.accounts.reduce((s, a) => s + accountValue(a), 0);
        return (
          <div key={inst.id} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{inst.name}</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{inst.type}</span>
              </div>
              <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(instTotal, 'IDR')}</span>
            </div>

            {inst.accounts.length === 0 ? (
              <p className="px-5 py-4 text-xs text-muted-foreground">No accounts yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Account</th>
                    <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Currency</th>
                    <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Value (IDR)</th>
                    <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Last Updated</th>
                    <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inst.accounts.map(account => (
                    <tr key={account.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground text-xs">{account.name}</td>
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{account.currency}</td>
                      <td className="px-5 py-3 font-mono text-right text-foreground text-xs">
                        {formatCurrency(accountValue(account), 'IDR')}
                      </td>
                      <td className="px-5 py-3 font-mono text-right text-muted-foreground text-xs">
                        {relativeDate(accountUpdatedAt(account))}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setValuationTarget({
                            subjectId: account.id,
                            subjectName: account.name,
                            currency: account.currency,
                          })}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {showAddInstitution && (
        <AddInstitutionDialog
          onSuccess={() => refetchInst()}
          onClose={() => setShowAddInstitution(false)}
        />
      )}
      {showAddAccount && (
        <AddAccountDialog
          institutions={institutions}
          onSuccess={() => refetchAcc()}
          onClose={() => setShowAddAccount(false)}
        />
      )}
      {valuationTarget && (
        <AddValuationDialog
          subjectType="account"
          subjectId={valuationTarget.subjectId}
          subjectName={valuationTarget.subjectName}
          currency={valuationTarget.currency}
          strategy="Manual"
          onSuccess={() => refetchAcc()}
          onClose={() => setValuationTarget(null)}
        />
      )}
    </div>
  );
}
