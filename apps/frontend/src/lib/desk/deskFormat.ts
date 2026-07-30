// Ported verbatim from docs/ideas/prototypes/trading-desk/pf-desk-data.js:89-98

export function fmtIDR(v: number | null | undefined, decimals?: boolean): string {
  if (v == null) return '—';
  const n = Math.round(v * (decimals ? 100 : 1)) / (decimals ? 100 : 1);
  return 'Rp' + n.toLocaleString('id-ID', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}

export function fmtUSD(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtSGD(v: number | null | undefined): string {
  if (v == null) return '—';
  return 'S$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(v: number | null | undefined, opts?: { decimals?: number; signed?: boolean }): string {
  const o = opts || {};
  if (v == null || Number.isNaN(v)) return '—';
  const decimals = o.decimals != null ? o.decimals : 2;
  const s = v.toFixed(decimals);
  return (v > 0 && o.signed !== false ? '+' : '') + (v < 0 ? '−' + Math.abs(v).toFixed(decimals) : s) + '%';
}

export function fmtR(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R';
}

export function fmtLots(shares: number, lotSize?: number): string {
  const step = lotSize || 100;
  const lots = Math.floor(shares / step);
  return lots + ' lots (' + shares.toLocaleString('id-ID') + ' shares)';
}

export function floorToStep(v: number, step: number): number {
  if (step === 0) return v;
  return Math.floor(v / step) * step;
}
