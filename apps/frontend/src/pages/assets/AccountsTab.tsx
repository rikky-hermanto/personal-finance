import { formatCurrency } from '@/lib/format';
import { LtvBadge } from '@/components/assets/LtvBadge';

const DUMMY_INSTITUTIONS = [
  {
    id: '1',
    name: 'BCA',
    type: 'Bank',
    accounts: [
      { id: 'a1', name: 'BCA Tabungan', currency: 'IDR', valueIdr: 85_000_000, updatedAt: '2026-04-28' },
      { id: 'a2', name: 'BCA Giro',     currency: 'IDR', valueIdr: 12_000_000, updatedAt: '2026-04-28' },
    ],
  },
  {
    id: '2',
    name: 'Bank Jago',
    type: 'Bank',
    accounts: [
      { id: 'a3', name: 'Jago Tabungan', currency: 'IDR', valueIdr: 45_000_000, updatedAt: '2026-04-27' },
    ],
  },
  {
    id: '3',
    name: 'Wise',
    type: 'E-Money',
    accounts: [
      { id: 'a4', name: 'Wise USD',  currency: 'USD', valueIdr: 32_000_000, nativeValue: 1_975.31, updatedAt: '2026-04-25' },
      { id: 'a5', name: 'Wise IDR',  currency: 'IDR', valueIdr: 8_000_000,  updatedAt: '2026-04-25' },
    ],
  },
  {
    id: '4',
    name: 'Neo Bank',
    type: 'Bank',
    accounts: [
      { id: 'a6', name: 'Neo Tabungan', currency: 'IDR', valueIdr: 28_000_000, updatedAt: '2026-04-20' },
    ],
  },
  {
    id: '5',
    name: 'Seabank',
    type: 'Bank',
    accounts: [
      { id: 'a7', name: 'Seabank Tabungan', currency: 'IDR', valueIdr: 40_000_000, updatedAt: '2026-04-20' },
    ],
  },
];

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

export default function AccountsTab() {
  const totalIdr = DUMMY_INSTITUTIONS.flatMap(i => i.accounts).reduce((s, a) => s + a.valueIdr, 0);

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">Total Cash & Savings</p>
          <p className="text-2xl font-mono font-semibold tracking-tight mt-0.5">{formatCurrency(totalIdr, 'IDR')}</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors">
            Add Institution
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors">
            Add Account
          </button>
        </div>
      </div>

      {/* Institutions */}
      {DUMMY_INSTITUTIONS.map(inst => {
        const instTotal = inst.accounts.reduce((s, a) => s + a.valueIdr, 0);
        return (
          <div key={inst.id} className="border border-border rounded-lg overflow-hidden">
            {/* Institution header */}
            <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{inst.name}</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{inst.type}</span>
              </div>
              <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(instTotal, 'IDR')}</span>
            </div>

            {/* Accounts table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Account</th>
                  <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-left">Currency</th>
                  <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Value (IDR)</th>
                  <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Last Updated</th>
                  <th className="px-5 py-2.5 text-[10px] uppercase tracking-[0.07em] font-semibold text-muted-foreground text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inst.accounts.map(account => (
                  <tr key={account.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{account.name}</td>
                    <td className="px-5 py-3 text-muted-foreground font-mono">{account.currency}</td>
                    <td className="px-5 py-3 font-mono text-right text-foreground">
                      {formatCurrency(account.valueIdr, 'IDR')}
                      {'nativeValue' in account && (
                        <div className="text-[11px] text-muted-foreground">
                          {account.currency} {account.nativeValue?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-right text-muted-foreground text-xs">{relativeDate(account.updatedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
