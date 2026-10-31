import { ChevronRight } from 'lucide-react';
import { Monogram } from '@/components/accounts/Monogram';
import { AccountView } from '@/hooks/use-accounts';
import { accountTypeLabel, accountUpdatedAt, accountValue, isStale, relativeUpdated } from '@/lib/accounts';
import { formatCurrency } from '@/lib/format';
import { Institution } from '@/types/Institution';
import { cn } from '@/lib/utils';

const ROW_CLASS =
  'grid w-full grid-cols-[36px_1fr_auto_16px] items-center gap-3.5 rounded-xl p-3 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface AccountRowProps {
  account: AccountView;
  onOpen: (id: string) => void;
}

export const AccountRow = ({ account, onOpen }: AccountRowProps) => {
  const inst = account.institution;
  const typeLabel = accountTypeLabel(account.accountType, inst?.type);
  const showInst = inst && inst.name.trim().toLowerCase() !== account.name.trim().toLowerCase();
  const stale = account.isActive && isStale(account);

  return (
    <button type="button" onClick={() => onOpen(account.id)} className={cn(ROW_CLASS, !account.isActive && 'opacity-[.55]')}>
      <Monogram name={inst?.name ?? account.name} logoUrl={inst?.logoUrl} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{account.name}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {showInst ? `${typeLabel} · ${inst.name}` : typeLabel}
          {!account.isActive && ' · Archived'}
        </div>
      </div>
      <div className="text-right">
        <div className="font-data whitespace-nowrap text-sm font-medium">{formatCurrency(accountValue(account), 'IDR')}</div>
        <div className={cn('mt-0.5 whitespace-nowrap text-[11.5px]', stale ? 'text-warning' : 'text-muted-foreground')}>
          {stale ? 'Needs update' : relativeUpdated(accountUpdatedAt(account))}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
    </button>
  );
};

interface FinishSetupRowProps {
  institution: Institution;
  onFinish: (institution: Institution) => void;
}

/** A bank / app that was added without an account. */
export const FinishSetupRow = ({ institution, onFinish }: FinishSetupRowProps) => (
  <button type="button" onClick={() => onFinish(institution)} className={cn(ROW_CLASS, 'opacity-[.55] hover:opacity-100')}>
    <Monogram name={institution.name} logoUrl={institution.logoUrl} />
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{institution.name}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">No account added yet</div>
    </div>
    <div className="whitespace-nowrap text-right text-[11.5px] font-medium text-foreground">Finish setup</div>
    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
  </button>
);
