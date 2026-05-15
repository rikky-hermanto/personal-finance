import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Wallet, TrendingUp, TrendingDown, X, LayoutList, LayoutGrid, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TransactionTable from '@/components/TransactionTable';
import CashflowStatementTable from '@/components/CashflowStatementTable';
import { getWalletSummaries, getCashflowStatement, WalletSummary } from '@/api/transactionsApi';
import { CashflowStatement } from '@/types/CashflowStatement';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/Transaction';

const CUSTOM_WALLETS_KEY = 'pf_custom_wallets';

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

type ViewMode = 'table' | 'statement';

interface CustomWallet {
  name: string;
  currency: 'IDR' | 'USD';
  type: 'Banking' | 'Investment' | 'E-Wallet' | 'Other';
}

function loadCustomWallets(): CustomWallet[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_WALLETS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCustomWallets(wallets: CustomWallet[]) {
  localStorage.setItem(CUSTOM_WALLETS_KEY, JSON.stringify(wallets));
}

const WalletCard = ({
  name,
  summary,
  selected,
  onClick,
}: {
  name: string;
  summary?: WalletSummary;
  selected: boolean;
  onClick: () => void;
}) => {
  const net = summary?.net ?? 0;
  const isPositive = net >= 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg border transition-all duration-150',
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border bg-card hover:bg-muted/50 text-foreground',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold',
            selected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium">{name}</span>
        </div>
        {summary && (
          <span className={cn(
            'text-xs font-mono font-medium',
            isPositive ? 'text-emerald-400' : 'text-red-400'
          )}>
            {isPositive ? '+' : ''}Rp {formatCompact(net)}
          </span>
        )}
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] text-muted-foreground font-mono">Rp {formatCompact(summary.totalIncome)}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-[11px] text-muted-foreground font-mono">Rp {formatCompact(summary.totalExpenses)}</span>
          </div>
        </div>
      )}
      {summary && (
        <div className="text-[10px] text-muted-foreground mt-1.5">
          {summary.transactionCount.toLocaleString()} transactions
        </div>
      )}
      {!summary && (
        <div className="text-[11px] text-muted-foreground">No transactions yet</div>
      )}
    </button>
  );
};

const AccountsTab = () => {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [customWallets, setCustomWallets] = useState<CustomWallet[]>(loadCustomWallets);

  // Statement controls
  const [range, setRange] = useState(6);
  const [groupBy, setGroupBy] = useState<'quarterly' | 'monthly'>('quarterly');
  const [statementData, setStatementData] = useState<CashflowStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Add wallet dialog state
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletCurrency, setNewWalletCurrency] = useState<'IDR' | 'USD'>('IDR');
  const [newWalletType, setNewWalletType] = useState<CustomWallet['type']>('Banking');

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ['wallet-summaries'],
    queryFn: getWalletSummaries,
    staleTime: 60_000,
  });

  const summaryMap = Object.fromEntries(summaries.map((s) => [s.wallet, s]));

  const allWalletNames = Array.from(
    new Set([
      ...summaries.map((s) => s.wallet),
      ...customWallets.map((w) => w.name),
    ])
  ).sort();

  const totals = summaries.reduce(
    (acc, s) => ({
      income: acc.income + s.totalIncome,
      expenses: acc.expenses + s.totalExpenses,
      count: acc.count + s.transactionCount,
    }),
    { income: 0, expenses: 0, count: 0 }
  );
  const totalNet = totals.income - totals.expenses;

  // Fetch statement whenever view/wallet/range/groupBy changes
  useEffect(() => {
    if (viewMode !== 'statement') return;
    let cancelled = false;
    setStatementLoading(true);
    getCashflowStatement(range, selectedWallet ?? undefined, groupBy)
      .then((data) => { if (!cancelled) setStatementData(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setStatementLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, selectedWallet, range, groupBy]);

  const handleAddWallet = () => {
    if (!newWalletName.trim()) return;
    const updated = [
      ...customWallets,
      { name: newWalletName.trim(), currency: newWalletCurrency, type: newWalletType },
    ];
    setCustomWallets(updated);
    saveCustomWallets(updated);
    setNewWalletName('');
    setShowAddDialog(false);
  };

  const handleTransactionUpdate = useCallback((_id: string, _updates: Partial<Transaction>) => {}, []);

  const btnCls = (active: boolean) => cn(
    'h-7 px-2.5 text-xs font-medium transition-all rounded-md gap-1.5',
    active
      ? 'bg-secondary text-white shadow-none'
      : 'text-muted-foreground hover:text-white hover:bg-white/5',
  );

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel — wallet list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Wallets</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {/* Net position summary card */}
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Position</div>
            <div className={cn(
              'text-lg font-bold font-mono',
              totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {totalNet >= 0 ? '+' : ''}Rp {formatCompact(totalNet)}
            </div>
            <div className="flex gap-3 mt-1.5">
              <span className="text-emerald-400 font-mono text-[10px]">↑ Rp {formatCompact(totals.income)}</span>
              <span className="text-red-400 font-mono text-[10px]">↓ Rp {formatCompact(totals.expenses)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {/* All wallets option */}
          <button
            onClick={() => setSelectedWallet(null)}
            className={cn(
              'w-full text-left px-4 py-2.5 rounded-lg border transition-all duration-150',
              selectedWallet === null
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground',
            )}
          >
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              <span className="text-sm font-medium">All Wallets</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-6">
              {totals.count.toLocaleString()} transactions
            </div>
          </button>

          {/* Per-wallet cards */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading wallets…</div>
          ) : (
            allWalletNames.map((name) => (
              <WalletCard
                key={name}
                name={name}
                summary={summaryMap[name]}
                selected={selectedWallet === name}
                onClick={() => setSelectedWallet(name === selectedWallet ? null : name)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header row */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {selectedWallet ?? 'All Wallets'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedWallet
                  ? `Transactions for ${selectedWallet}`
                  : 'View transactions across all wallets'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                <Button variant="ghost" size="sm" className={btnCls(viewMode === 'table')} onClick={() => setViewMode('table')}>
                  <LayoutList className="w-3.5 h-3.5" />
                  Table
                </Button>
                <Button variant="ghost" size="sm" className={btnCls(viewMode === 'statement')} onClick={() => setViewMode('statement')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Statement
                </Button>
              </div>

              {/* Statement controls — only visible in statement view */}
              {viewMode === 'statement' && (
                <>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                    <Button variant="ghost" size="sm" className={btnCls(groupBy === 'quarterly')} onClick={() => setGroupBy('quarterly')}>
                      <LayoutGrid className="w-3 h-3" />
                      Quarterly
                    </Button>
                    <Button variant="ghost" size="sm" className={btnCls(groupBy === 'monthly')} onClick={() => setGroupBy('monthly')}>
                      <Calendar className="w-3 h-3" />
                      Monthly
                    </Button>
                  </div>

                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                    {RANGES.map((r) => (
                      <Button
                        key={r.label}
                        variant="ghost"
                        size="sm"
                        className={btnCls(range === r.value)}
                        onClick={() => setRange(r.value)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              {selectedWallet && (
                <Button variant="ghost" size="sm" className="text-muted-foreground h-7" onClick={() => setSelectedWallet(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {viewMode === 'table' ? (
            <TransactionTable
              key={selectedWallet ?? '__all__'}
              onTransactionUpdate={handleTransactionUpdate}
              walletFilter={selectedWallet ?? undefined}
            />
          ) : (
            <CashflowStatementTable
              data={statementData}
              isLoading={statementLoading}
            />
          )}
        </div>
      </div>

      {/* Add Wallet dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wallet-name">Wallet name</Label>
              <Input
                id="wallet-name"
                placeholder="e.g. Bank Jago, Mandiri"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddWallet(); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={newWalletCurrency} onValueChange={(v) => setNewWalletCurrency(v as 'IDR' | 'USD')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IDR">IDR — Indonesian Rupiah</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Wallet type</Label>
                <Select value={newWalletType} onValueChange={(v) => setNewWalletType(v as CustomWallet['type'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Banking">Banking</SelectItem>
                    <SelectItem value="Investment">Investment</SelectItem>
                    <SelectItem value="E-Wallet">E-Wallet</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddWallet} disabled={!newWalletName.trim()}>
              Add Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsTab;
