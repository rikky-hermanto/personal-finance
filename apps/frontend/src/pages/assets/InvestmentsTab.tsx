import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { getHoldings } from '@/api/assetsApi';
import { getAccounts } from '@/api/accountsApi';
import { HoldingsTable } from '@/components/assets/HoldingsTable';
import { AddHoldingDialog } from '@/components/assets/AddHoldingDialog';
import { AddValuationDialog } from '@/components/assets/AddValuationDialog';
import { Holding } from '@/types/Holding';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function InvestmentsTab() {
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [valuationTarget, setValuationTarget] = useState<Holding | null>(null);

  const { data: holdings = [], refetch } = useQuery({
    queryKey: ['holdings'],
    queryFn: getHoldings,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const totalPortfolioValue = holdings.reduce((s, h) => {
    return s + (h.latestValuation?.valueIdr ?? h.costBasis);
  }, 0);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Portfolio Value</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(totalPortfolioValue, 'IDR')}</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowAddHolding(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
              >
                Add Holding
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
              A stock, mutual fund, crypto, or other investment position tracked by ticker or name.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <HoldingsTable
        holdings={holdings}
        onAddValuation={(h) => setValuationTarget(h)}
      />

      {showAddHolding && (
        <AddHoldingDialog
          accounts={accounts}
          onSuccess={() => refetch()}
          onClose={() => setShowAddHolding(false)}
        />
      )}
      {valuationTarget && (
        <AddValuationDialog
          subjectType="holding"
          subjectId={valuationTarget.id}
          subjectName={valuationTarget.ticker}
          currency={valuationTarget.currency}
          strategy="RealTime"
          onSuccess={() => refetch()}
          onClose={() => setValuationTarget(null)}
        />
      )}
    </div>
  );
}
