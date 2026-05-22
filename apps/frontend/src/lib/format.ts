export function formatCurrency(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}k`;
  }
  return String(amount);
}

export function formatMonth(monthString: string): string {
  if (!monthString) return '—';

  // Try YYYY-MM first
  const parts = monthString.split('-');
  if (parts.length === 2) {
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    if (!isNaN(year) && !isNaN(month)) {
      const d = new Date(year, month - 1);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
  }

  // Only attempt native Date parsing for strings that look like dates (e.g. "Jan 26", "March 2024").
  // Reject anything containing spaces beyond a simple "Mon YY/YYYY" pattern to avoid V8's
  // fuzzy legacy parser producing nonsense dates from label strings like "All Time".
  const looksLikeDate = /^[A-Za-z]{3,9}\s+\d{2,4}$/.test(monthString.trim());
  if (looksLikeDate) {
    const d = new Date(monthString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }

  return monthString;
}

export function formatDelta(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
