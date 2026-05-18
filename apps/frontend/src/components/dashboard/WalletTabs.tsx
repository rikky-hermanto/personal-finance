import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BankId } from '@/types/Transaction';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

type WalletFilter = 'all' | BankId;

interface WalletTabsProps {
  selected: WalletFilter;
  onChange: (v: WalletFilter) => void;
  netWorth: number;
  lastUpdated?: Date;
}

const TABS: { id: WalletFilter; label: string }[] = [
  { id: 'all', label: 'All Bank Accounts' },
  { id: 'BCA', label: 'BCA' },
  { id: 'Superbank', label: 'Superbank' },
  { id: 'NeoBank', label: 'Neo' },
  { id: 'Wise', label: 'Wise' },
  { id: 'Jago', label: 'Jago' },
];

const WalletTabs = ({ selected, onChange, netWorth, lastUpdated }: WalletTabsProps) => {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
      <Tabs value={selected} onValueChange={(v) => onChange(v as WalletFilter)}>
        <TabsList className="bg-muted h-8 gap-0.5 p-0.5">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'text-xs h-7 px-3 rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground',
              )}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Net</span>
            <span
              className={cn(
                'font-mono text-sm font-medium tabular-nums',
                netWorth >= 0 ? 'text-success' : 'text-destructive'
              )}
            >
              {formatCurrency(netWorth)}
            </span>
            <span className={cn('text-xs', netWorth >= 0 ? 'text-success' : 'text-destructive')}>
              {netWorth >= 0 ? '▴' : '▾'}
            </span>
          </div>
        </div>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground">
            Updated{' '}
            {lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
};

export default WalletTabs;
