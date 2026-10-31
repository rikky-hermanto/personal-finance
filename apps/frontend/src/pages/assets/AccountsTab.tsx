import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountsHeader } from '@/components/accounts/AccountsHeader';
import { StaleNudge } from '@/components/accounts/StaleNudge';
import { AccountGroup } from '@/components/accounts/AccountGroup';
import { AccountRow, FinishSetupRow } from '@/components/accounts/AccountRow';
import { AccountSheet } from '@/components/accounts/AccountSheet';
import { BalanceCheckIn } from '@/components/accounts/BalanceCheckIn';
import { AddAccountDialog } from '@/components/assets/AddAccountDialog';
import { AccountView, invalidateAccountQueries, useAccounts } from '@/hooks/use-accounts';
import {
  ACCOUNT_GROUPS,
  AccountGroup as Group,
  accountGroup,
  accountValue,
  institutionGroup,
  staleQueue,
} from '@/lib/accounts';
import { cn } from '@/lib/utils';

type Filter = 'all' | Exclude<Group, 'other'>;

const FILTER_LABELS: Record<Filter, string> = { all: 'All', cash: 'Cash', investing: 'Investing', crypto: 'Crypto' };

export default function AccountsTab() {
  const queryClient = useQueryClient();
  const { accounts, institutions, isLoading, valuationsLoading, error } = useAccounts();
  const [filter, setFilter] = useState<Filter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [editAccount, setEditAccount] = useState<AccountView | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [checkInQueue, setCheckInQueue] = useState<AccountView[] | null>(null);

  const loading = isLoading || valuationsLoading;
  const active = useMemo(() => accounts.filter(a => a.isActive), [accounts]);
  const archivedCount = accounts.length - active.length;
  const stale = useMemo(() => staleQueue(accounts), [accounts]);
  const total = active.reduce((s, a) => s + accountValue(a), 0);

  const groups = useMemo(() => {
    const withAccounts = new Set(accounts.map(a => a.institutionId).filter(Boolean));
    const unfinished = institutions.filter(i => !withAccounts.has(i.id));
    const listed = showArchived ? accounts : active;
    return ACCOUNT_GROUPS.map(g => {
      const rows = listed.filter(a => accountGroup(a.accountType, a.institution?.type) === g.key);
      return {
        ...g,
        rows,
        unfinished: unfinished.filter(i => institutionGroup(i.type) === g.key),
        subtotal: rows.filter(a => a.isActive).reduce((s, a) => s + accountValue(a), 0),
      };
    }).filter(g => g.rows.length > 0 || g.unfinished.length > 0);
  }, [accounts, active, institutions, showArchived]);

  const filters: Filter[] = ['all', ...groups.map(g => g.key).filter((k): k is Exclude<Group, 'other'> => k !== 'other')];
  const visibleGroups = filter === 'all' ? groups : groups.filter(g => g.key === filter);

  const openAccount = (id: string) => setSelectedAccountId(id);
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null;

  // The edit dialog replaces the sheet while it is open, then hands back to it.
  const startEdit = (account: AccountView) => {
    setSelectedAccountId(null);
    setEditAccount(account);
  };
  const endEdit = () => {
    if (editAccount) setSelectedAccountId(editAccount.id);
    setEditAccount(null);
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-11 sm:px-0">
      <AccountsHeader total={loading ? null : total} count={active.length} onAdd={() => setAddOpen(true)} />

      {!loading && stale.length > 0 && <StaleNudge count={stale.length} onReview={() => setCheckInQueue(stale)} />}

      {filters.length > 2 && (
        <div className="mt-[22px] flex flex-wrap gap-1.5" role="group" aria-label="Filter accounts">
          {filters.map(f => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'h-[30px] rounded-full px-3 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === f ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="mt-8 text-xs text-destructive">Couldn’t load your accounts. Refresh to try again.</p>
      ) : loading ? (
        <div className="mt-[30px] flex flex-col gap-1" aria-label="Loading accounts">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-[60px] rounded-xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No accounts yet.</p>
      ) : (
        visibleGroups.map(g => (
          <AccountGroup key={g.key} label={g.label} subtotal={g.subtotal}>
            {g.rows.map(a => <AccountRow key={a.id} account={a} onOpen={openAccount} />)}
            {g.unfinished.map(i => <FinishSetupRow key={i.id} institution={i} onFinish={() => setAddOpen(true)} />)}
          </AccountGroup>
        ))
      )}

      {!loading && archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived(v => !v)}
          className="mt-6 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </button>
      )}

      {addOpen && (
        <AddAccountDialog
          institutions={institutions}
          onSuccess={() => invalidateAccountQueries(queryClient)}
          onClose={() => setAddOpen(false)}
        />
      )}
      {checkInQueue && <BalanceCheckIn queue={checkInQueue} onClose={() => setCheckInQueue(null)} />}

      <AccountSheet account={selectedAccount} onClose={() => setSelectedAccountId(null)} onEdit={startEdit} />

      {editAccount && (
        <AddAccountDialog
          institutions={institutions}
          initial={editAccount}
          onSuccess={() => invalidateAccountQueries(queryClient)}
          onClose={endEdit}
        />
      )}
    </div>
  );
}
