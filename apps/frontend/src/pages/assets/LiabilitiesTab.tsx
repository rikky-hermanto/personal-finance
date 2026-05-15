import { formatCurrency } from '@/lib/format';
import { LtvBadge } from '@/components/assets/LtvBadge';

const DUMMY_LIABILITIES = [
  {
    id: 'l1',
    name: 'KPR Rumah Silangit',
    type: 'installment' as const,
    principal: 320_000_000,
    interestRate: 8.5,
    monthlyPayment: 3_200_000,
    linkedAsset: 'Tanah Silangit',
    ltv: 0.80,
  },
  {
    id: 'l2',
    name: 'Kartu Kredit BCA',
    type: 'revolving' as const,
    principal: 4_500_000,
    interestRate: 24.0,
    monthlyPayment: undefined,
    linkedAsset: undefined,
    ltv: undefined,
  },
];

const TYPE_LABELS = { revolving: 'Revolving', installment: 'Installment', personal: 'Personal' };
const TYPE_COLORS = {
  revolving:   'text-amber-500 bg-amber-500/10 border-amber-500/20',
  installment: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  personal:    'text-muted-foreground bg-muted border-border',
};

export default function LiabilitiesTab() {
  const total = DUMMY_LIABILITIES.reduce((s, l) => s + l.principal, 0);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Liabilities</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(total, 'IDR')}</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors">
          Add Liability
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Name</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Type</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Principal</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Rate</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Monthly</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Linked Asset</th>
              <th className="px-5 py-3 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">LTV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {DUMMY_LIABILITIES.map(l => (
              <tr key={l.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-5 py-3.5 font-medium text-foreground">{l.name}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${TYPE_COLORS[l.type]}`}>
                    {TYPE_LABELS[l.type]}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-foreground">{formatCurrency(l.principal, 'IDR')}</td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground">
                  {l.interestRate != null ? `${l.interestRate.toFixed(1)}%` : '—'}
                </td>
                <td className="px-5 py-3.5 font-mono text-right text-muted-foreground">
                  {l.monthlyPayment != null ? formatCurrency(l.monthlyPayment, 'IDR') : '—'}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{l.linkedAsset ?? '—'}</td>
                <td className="px-5 py-3.5 text-right"><LtvBadge ltv={l.ltv} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
