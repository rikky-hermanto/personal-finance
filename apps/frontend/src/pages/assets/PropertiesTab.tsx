import { formatCurrency } from '@/lib/format';

type AssetClass = 'real_estate' | 'tangibles' | 'receivables' | 'retirement';

interface Property {
  id: string;
  name: string;
  assetClass: AssetClass;
  valueIdr: number;
  valuationStrategy: 'Manual' | 'Amortized' | 'Algorithmic';
  updatedAt: string;
  notes?: string;
}

const DUMMY_PROPERTIES: Property[] = [
  {
    id: 'p1',
    name: 'Tanah Silangit',
    assetClass: 'real_estate',
    valueIdr: 400_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2026-03-15',
    notes: 'Plot tanah kavling Silangit',
  },
  {
    id: 'p2',
    name: 'Emas Batangan (Tokopedia)',
    assetClass: 'tangibles',
    valueIdr: 52_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2026-04-20',
    notes: '100g @ Rp 520.000/g',
  },
  {
    id: 'p3',
    name: 'Emas Batangan (Bulaklak)',
    assetClass: 'tangibles',
    valueIdr: 28_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2026-04-20',
    notes: '50g @ Rp 560.000/g',
  },
  {
    id: 'p4',
    name: 'Piutang - Melda / Lae',
    assetClass: 'receivables',
    valueIdr: 50_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2026-01-10',
    notes: 'Status: Collectible',
  },
  {
    id: 'p5',
    name: 'Piutang - Nelly',
    assetClass: 'receivables',
    valueIdr: 25_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2026-01-10',
    notes: 'Status: Collectible',
  },
  {
    id: 'p6',
    name: 'Piutang - Roga',
    assetClass: 'receivables',
    valueIdr: 15_000_000,
    valuationStrategy: 'Manual',
    updatedAt: '2025-12-01',
    notes: 'Status: Doubtful',
  },
  {
    id: 'p7',
    name: 'BPJS Ketenagakerjaan',
    assetClass: 'retirement',
    valueIdr: 42_000_000,
    valuationStrategy: 'Amortized',
    updatedAt: '2026-04-01',
    notes: 'JHT + JP accumulated',
  },
];

const CLASS_LABELS: Record<AssetClass, string> = {
  real_estate: 'Real Estate',
  tangibles:   'Tangibles',
  receivables: 'Receivables',
  retirement:  'Retirement',
};

const CLASS_COLORS: Record<AssetClass, string> = {
  real_estate: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  tangibles:   'text-amber-500 bg-amber-500/10 border-amber-500/20',
  receivables: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  retirement:  'text-purple-500 bg-purple-500/10 border-purple-500/20',
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

export default function PropertiesTab() {
  const total = DUMMY_PROPERTIES.reduce((s, p) => s + p.valueIdr, 0);

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Non-Liquid Assets</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(total, 'IDR')}</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors">
          Add Asset
        </button>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {DUMMY_PROPERTIES.map(prop => (
          <div
            key={prop.id}
            className="border border-border rounded-lg bg-card hover:border-border/80 hover:bg-accent/20 transition-colors overflow-hidden"
          >
            {/* Card top: class color bar */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${CLASS_COLORS[prop.assetClass]}`}>
                {CLASS_LABELS[prop.assetClass]}
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STRATEGY_COLORS[prop.valuationStrategy]}`}>
                {prop.valuationStrategy}
              </span>
            </div>

            {/* Card body */}
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-foreground">{prop.name}</p>
              {prop.notes && (
                <p className="text-xs text-muted-foreground mt-0.5">{prop.notes}</p>
              )}
              <p className="text-xl font-mono font-semibold tracking-tight mt-3">
                {formatCurrency(prop.valueIdr, 'IDR')}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                Updated {relativeDate(prop.updatedAt)}
              </p>
            </div>

            {/* Card footer */}
            <div className="px-4 py-2.5 border-t border-border flex justify-end">
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Update Valuation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
