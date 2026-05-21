import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccountBalances } from '@/api/accountsApi';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'decimal', minimumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const CurrentBalanceStrip = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['account-balances'],
    queryFn: getAccountBalances,
    staleTime: 60_000,
  });

  const total = data?.reduce((sum, a) => sum + a.currentBalance, 0) ?? 0;

  if (isLoading) return <Skeleton className="h-5 w-48" />;

  if (error) {
    return (
      <span className="text-xs text-destructive/70">Balance unavailable</span>
    );
  }

  if (!data?.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-baseline gap-2 group cursor-pointer",
          "hover:opacity-80 transition-opacity"
        )}>
          <span className="text-xs text-muted-foreground">Current Balance</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            Rp {fmt(total)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Balance by Account
          </p>
        </div>
        <div className="divide-y">
          {data.map((a) => (
            <div key={a.accountId} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{a.accountName}</p>
                {a.institutionName && (
                  <p className="text-xs text-muted-foreground">{a.institutionName}</p>
                )}
                {a.asOf && (
                  <p className="text-xs text-muted-foreground/60">as of {fmtDate(a.asOf)}</p>
                )}
                {a.currency !== 'IDR' && (
                  <p className="text-xs text-muted-foreground/70">shown in {a.currency}</p>
                )}
              </div>
              <span className={cn(
                "text-sm tabular-nums font-medium",
                a.currentBalance >= 0 ? "text-foreground" : "text-destructive"
              )}>
                {a.currency !== 'IDR' ? a.currency : 'Rp'} {fmt(a.currentBalance)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 border-t bg-muted/30">
          <span className="text-xs font-semibold text-muted-foreground">Total (IDR)</span>
          <span className="text-sm font-bold tabular-nums">Rp {fmt(total)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CurrentBalanceStrip;
