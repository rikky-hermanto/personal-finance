import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { getAssets } from '@/api/assetsApi';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog';
import { AddValuationDialog } from '@/components/assets/AddValuationDialog';
import { Asset, AssetClass } from '@/types/Asset';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const PROPERTY_CLASSES: AssetClass[] = [
  'real_estate', 'tangibles', 'vehicles', 'receivables', 'retirement', 'fixed_income',
];

const CLASS_LABELS: Record<string, string> = {
  real_estate:  'Real Estate',
  tangibles:    'Tangibles',
  vehicles:     'Vehicles',
  receivables:  'Receivables',
  retirement:   'Retirement',
  fixed_income: 'Fixed Income',
};

const CLASS_COLORS: Record<string, string> = {
  real_estate:  'text-blue-500 bg-blue-500/10 border-blue-500/20',
  tangibles:    'text-amber-500 bg-amber-500/10 border-amber-500/20',
  vehicles:     'text-sky-500 bg-sky-500/10 border-sky-500/20',
  receivables:  'text-orange-500 bg-orange-500/10 border-orange-500/20',
  retirement:   'text-purple-500 bg-purple-500/10 border-purple-500/20',
  fixed_income: 'text-green-500 bg-green-500/10 border-green-500/20',
};

const STRATEGY_COLORS: Record<string, string> = {
  Manual:      'text-muted-foreground bg-muted border-border',
  Amortized:   'text-blue-500 bg-blue-500/10 border-blue-500/20',
  Algorithmic: 'text-green-500 bg-green-500/10 border-green-500/20',
};

function relativeDate(iso: string) {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function assetValue(asset: Asset): number {
  return asset.latestValuation?.valueIdr ?? asset.acquisitionCost ?? 0;
}

function assetUpdatedAt(asset: Asset): string | undefined {
  return asset.latestValuation?.valuedAt ?? asset.acquiredDate;
}

export default function PropertiesTab() {
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [valuationTarget, setValuationTarget] = useState<Asset | null>(null);

  const { data: assets = [], refetch } = useQuery({
    queryKey: ['assets'],
    queryFn: getAssets,
  });

  const properties = assets.filter(a => PROPERTY_CLASSES.includes(a.assetClass));
  const total = properties.reduce((s, p) => s + assetValue(p), 0);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Non-Liquid Assets</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(total, 'IDR')}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowAddAsset(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
            >
              Add Asset
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
            A non-liquid asset — property, vehicle, receivable, or retirement fund — valued manually or periodically.
          </TooltipContent>
        </Tooltip>
      </div>

      {properties.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No assets yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {properties.map(prop => {
            const updatedAt = assetUpdatedAt(prop);
            const notes = prop.metadata?.notes as string | undefined;
            return (
              <div
                key={prop.id}
                className="border border-border rounded-lg bg-card hover:border-border/80 hover:bg-accent/20 transition-colors overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${CLASS_COLORS[prop.assetClass] ?? 'text-muted-foreground bg-muted border-border'}`}>
                    {CLASS_LABELS[prop.assetClass] ?? prop.assetClass}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STRATEGY_COLORS[prop.valuationStrategy] ?? 'text-muted-foreground bg-muted border-border'}`}>
                    {prop.valuationStrategy}
                  </span>
                </div>
                <div className="px-4 py-4">
                  <p className="text-sm font-medium text-foreground">{prop.name}</p>
                  {notes && <p className="text-xs text-muted-foreground mt-0.5">{notes}</p>}
                  <p className="text-xl font-mono font-semibold tracking-tight mt-3">
                    {formatCurrency(assetValue(prop), 'IDR')}
                  </p>
                  {updatedAt && (
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      Updated {relativeDate(updatedAt)}
                    </p>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-border flex justify-end">
                  <button
                    onClick={() => setValuationTarget(prop)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Update Valuation
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddAsset && (
        <AddAssetDialog
          onSuccess={() => refetch()}
          onClose={() => setShowAddAsset(false)}
        />
      )}
      {valuationTarget && (
        <AddValuationDialog
          subjectType="asset"
          subjectId={valuationTarget.id}
          subjectName={valuationTarget.name}
          currency={valuationTarget.currency}
          strategy={valuationTarget.valuationStrategy}
          onSuccess={() => refetch()}
          onClose={() => setValuationTarget(null)}
        />
      )}
    </div>
  );
}
