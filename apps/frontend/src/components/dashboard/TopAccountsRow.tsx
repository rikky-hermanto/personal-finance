import { WalletBalance, BankId } from '@/types/Transaction';
import { formatCurrency, formatCompact } from '@/lib/format';
import MiniSparkline from './MiniSparkline';
import { cn } from '@/lib/utils';

interface TopAccountsRowProps {
  wallets: WalletBalance[];
  selected: 'all' | BankId;
}

const TopAccountsRow = ({ wallets, selected }: TopAccountsRowProps) => {
  return (
    <div className="grid grid-cols-5 gap-px bg-border">
      {wallets.map((wallet) => {
        const isActive = selected === 'all' || selected === wallet.bankId;
        const positive = wallet.delta30d >= 0;

        return (
          <div
            key={wallet.bankId}
            className={cn(
              'bg-card px-4 py-4 transition-opacity',
              !isActive && 'opacity-30'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{wallet.label}</div>
                <div className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {wallet.currency === 'USD'
                    ? `$${formatCompact(wallet.balance)}`
                    : `Rp ${formatCompact(wallet.balance)}`}
                </div>
              </div>
              <span
                className={cn(
                  'text-xs font-mono tabular-nums mt-0.5',
                  positive ? 'text-success' : 'text-destructive'
                )}
              >
                {positive ? '▴' : '▾'} {Math.abs(wallet.delta30d).toFixed(1)}%
              </span>
            </div>
            <MiniSparkline data={wallet.sparkline} positive={positive} />
          </div>
        );
      })}
    </div>
  );
};

export default TopAccountsRow;
