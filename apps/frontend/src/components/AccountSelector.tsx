import { useQuery } from '@tanstack/react-query';
import { getAccounts } from '@/api/accountsApi';
import { getInstitutions } from '@/api/accountsApi';
import { cn } from '@/lib/utils';
import { Building2, Check } from 'lucide-react';

interface AccountSelectorProps {
  value: string | null;
  onChange: (id: string, name: string, institutionName: string) => void;
  prefilledAccountId?: string | null;
  prefilledNote?: string;
}

const AccountSelector = ({ value, onChange, prefilledAccountId, prefilledNote }: AccountSelectorProps) => {
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
    staleTime: 60_000,
  });

  const { data: institutions = [] } = useQuery({
    queryKey: ['institutions'],
    queryFn: getInstitutions,
    staleTime: 60_000,
  });

  const instMap = Object.fromEntries(institutions.map(i => [i.id, i.name]));

  // Group accounts by institution
  const grouped: Record<string, typeof accounts> = {};
  const noInst: typeof accounts = [];

  for (const acc of accounts) {
    if (acc.institutionId) {
      if (!grouped[acc.institutionId]) grouped[acc.institutionId] = [];
      grouped[acc.institutionId].push(acc);
    } else {
      noInst.push(acc);
    }
  }

  if (accountsLoading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">Loading accounts…</div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
        No bank accounts set up yet.
        <br />
        <span className="text-[11px]">Add accounts in Settings → Banks &amp; Accounts first.</span>
      </div>
    );
  }

  const renderAccount = (acc: typeof accounts[number]) => {
    const selected = value === acc.id;
    const isPrefilled = prefilledAccountId === acc.id && !value;

    return (
      <button
        key={acc.id}
        type="button"
        onClick={() => onChange(acc.id, acc.name, acc.institutionId ? (instMap[acc.institutionId] ?? '') : '')}
        className={cn(
          'w-full text-left px-3 py-2.5 rounded-md border transition-all duration-150 flex items-center justify-between gap-2',
          selected
            ? 'border-primary/60 bg-primary/10 text-foreground'
            : isPrefilled
            ? 'border-border/80 bg-muted/30 text-foreground'
            : 'border-border bg-card hover:bg-muted/40 text-foreground',
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{acc.name}</span>
            {isPrefilled && !selected && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                {prefilledNote ?? 'Last used'}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">{acc.currency}</span>
        </div>
        {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2} />}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([instId, accs]) => (
        <div key={instId}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Building2 className="w-3 h-3 text-muted-foreground/60" strokeWidth={1.5} />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {instMap[instId] ?? 'Unknown'}
            </span>
          </div>
          <div className="space-y-1 pl-4">
            {accs.map(renderAccount)}
          </div>
        </div>
      ))}

      {noInst.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Building2 className="w-3 h-3 text-muted-foreground/60" strokeWidth={1.5} />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Other</span>
          </div>
          <div className="space-y-1 pl-4">
            {noInst.map(renderAccount)}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSelector;
