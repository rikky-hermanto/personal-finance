import { NetWorthPoint } from '@/api/netWorthApi';
import { AccountGroup, accountGroup, accountValue } from '@/lib/accounts';
import { Account } from '@/types/Account';
import { Asset, AssetClass } from '@/types/Asset';
import { Holding } from '@/types/Holding';
import { Institution } from '@/types/Institution';
import { Liability } from '@/types/Liability';
import { Valuation } from '@/types/Valuation';

// ── Formatting (id-ID numbers, English words) ────────────────────────────────

const intFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const MINUS = '−';

function sign(n: number): string {
  return n < 0 ? MINUS : '';
}

/** "808.052.170" — whole rupiah, no "Rp". */
export function formatIdr(n: number): string {
  return sign(n) + intFmt.format(Math.abs(Math.round(n)));
}

/** Hero number split for styling: "Rp" + "808.052.170" + ",00". */
export function heroParts(n: number): { sign: string; int: string; dec: string } {
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100);
  return {
    sign: sign(n),
    int: intFmt.format(Math.floor(cents / 100)),
    dec: String(cents % 100).padStart(2, '0'),
  };
}

function decimals(n: number, digits: number): string {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** "1,59 M" for billions, "778,9 jt" for millions, "950.000" below that. No "Rp". */
export function formatCompactIdr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign(n)}${decimals(abs / 1_000_000_000, 2)} M`;
  if (abs >= 1_000_000) return `${sign(n)}${decimals(abs / 1_000_000, 1)} jt`;
  return formatIdr(n);
}

/** "+Rp 16.852.170" / "−Rp 16,9 jt". */
export function formatSignedIdr(n: number, compact = false): string {
  const body = compact ? formatCompactIdr(Math.abs(n)) : formatIdr(Math.abs(n));
  return `${n < 0 ? MINUS : '+'}Rp ${body}`;
}

/** "2,13%" — unsigned. */
export function formatPct(pct: number, digits = 2): string {
  return `${decimals(Math.abs(pct), digits)}%`;
}

/** Interest rate as stored ("7.5" → "7,5%"), up to two decimals. */
export function formatRate(rate: number): string {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(rate)}%`;
}

/** Share of a column (0–1) → "80%", "<1%". */
export function formatShare(share: number): string {
  if (share <= 0) return '0%';
  if (share < 0.01) return '<1%';
  return `${Math.round(share * 100)}%`;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS_LONG.map(m => m.slice(0, 3));

/** "2026-09" → "September" / "Sep". */
export function monthName(key: string, style: 'long' | 'short' = 'short'): string {
  const m = Number(key.slice(5, 7)) - 1;
  return (style === 'long' ? MONTHS_LONG : MONTHS_SHORT)[m] ?? key;
}

/** "2026-10-31…" → "31 Oct". Reads the calendar date from the string, so no timezone shift. */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;
}

function addMonths(key: string, n: number): string {
  const total = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function monthsBetween(fromKey: string, toKey: string): number {
  return (Number(toKey.slice(0, 4)) - Number(fromKey.slice(0, 4))) * 12 + Number(toKey.slice(5, 7)) - Number(fromKey.slice(5, 7));
}

// ── Monthly series ───────────────────────────────────────────────────────────

export interface MonthPoint {
  key: string; // YYYY-MM
  date: string; // date of the last valuation day in or before this month
  valueIdr: number;
  assetsIdr: number;
  liabilitiesIdr: number;
}

/**
 * The last history point of each month, from the first month with data to the last.
 * A month with no valuation repeats the month before it, since nothing was re-valued.
 */
export function monthlySeries(points: NetWorthPoint[]): MonthPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, NetWorthPoint>();
  for (const p of sorted) byMonth.set(p.date.slice(0, 7), p);
  if (byMonth.size === 0) return [];

  const keys = [...byMonth.keys()];
  const last = keys[keys.length - 1];
  const series: MonthPoint[] = [];
  let carry: NetWorthPoint | undefined;
  for (let key = keys[0]; key <= last; key = addMonths(key, 1)) {
    carry = byMonth.get(key) ?? carry;
    if (carry) series.push({ key, date: carry.date, valueIdr: carry.valueIdr, assetsIdr: carry.assetsIdr, liabilitiesIdr: carry.liabilitiesIdr });
  }
  return series;
}

/** Change between the last two months; null with fewer than two. pct is null when the base is zero. */
export function monthDelta(series: MonthPoint[]): { abs: number; pct: number | null; prevKey: string } | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  const abs = cur.valueIdr - prev.valueIdr;
  return { abs, pct: prev.valueIdr === 0 ? null : (abs / Math.abs(prev.valueIdr)) * 100, prevKey: prev.key };
}

// ── Projection ───────────────────────────────────────────────────────────────

// Round markers every Rp 1 miliar: a product choice from the Net Worth zen handoff
// (docs/ideas/prototypes/networth_zen/README.md), not a financial threshold.
export const MILESTONE_STEP_IDR = 1_000_000_000;

export function nextMilestone(valueIdr: number): number {
  return Math.max(1, Math.floor(valueIdr / MILESTONE_STEP_IDR) + 1) * MILESTONE_STEP_IDR;
}

/** "Rp 1 miliar" (long) or "Rp 1 M" (short). */
export function formatMilestone(milestoneIdr: number, style: 'long' | 'short' = 'long'): string {
  const n = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(milestoneIdr / 1_000_000_000);
  return style === 'long' ? `Rp ${n} miliar` : `Rp ${n} M`;
}

export interface Projection {
  avgMonthlyDelta: number;
  milestoneIdr: number;
  remainingIdr: number;
  monthsAway: number;
  etaKey: string; // YYYY-MM
}

/**
 * Straight line at the average monthly change over the series. Null with fewer than two
 * months or when the average is not positive (no marker is ever reached).
 */
export function projectMilestone(series: MonthPoint[], currentIdr: number): Projection | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const avg = (last.valueIdr - first.valueIdr) / (series.length - 1);
  if (avg <= 0) return null;
  const milestoneIdr = nextMilestone(currentIdr);
  const remainingIdr = milestoneIdr - currentIdr;
  const monthsAway = Math.max(1, Math.ceil(remainingIdr / avg));
  return { avgMonthlyDelta: avg, milestoneIdr, remainingIdr, monthsAway, etaKey: addMonths(last.key, monthsAway) };
}

// ── Own / owe ────────────────────────────────────────────────────────────────

/** Liabilities ÷ assets, clamped to 0–1 for the bar. */
export function debtRatio(assetsIdr: number, liabilitiesIdr: number): number {
  if (liabilitiesIdr <= 0) return 0;
  if (assetsIdr <= 0) return 1;
  return Math.min(1, liabilitiesIdr / assetsIdr);
}

// Wording bands (under 30%, 30–60%, over 60%) come from the Net Worth zen handoff
// (docs/ideas/prototypes/networth_zen/README.md). They pick a sentence, not a health verdict.
export function ownOweSentence(ratio: number, anchor?: { name: string; share: number }): string {
  if (ratio < 0.3) return 'Most of what you own is yours outright.';
  if (ratio > 0.6) return 'Most of what you own is still borrowed.';
  let tail = '';
  if (anchor && anchor.share >= 0.9) tail = `, almost all of it for ${anchor.name}`;
  else if (anchor && anchor.share >= 0.5) tail = `, most of it for ${anchor.name}`;
  return `About half of what you own is still borrowed${tail}.`;
}

// ── Ledger rows ──────────────────────────────────────────────────────────────

export type LedgerTarget =
  | { kind: 'asset'; asset: Asset }
  | { kind: 'route'; path: string };

export interface LedgerRow {
  key: string;
  name: string;
  amountIdr: number;
  meta: string;
  share: number;
  caution?: boolean;
  target: LedgerTarget;
}

const CLASS_LABELS: Record<AssetClass, string> = {
  cash: 'Cash',
  investments: 'Investments',
  fixed_income: 'Bonds',
  crypto: 'Crypto',
  real_estate: 'Property',
  tangibles: 'Gold & valuables',
  vehicles: 'Vehicle',
  receivables: 'Receivables',
  retirement: 'Retirement',
};

// Named things the user would look for one by one.
const INDIVIDUAL_CLASSES: AssetClass[] = ['real_estate', 'vehicles'];

// Asset classes that fold into an account bucket instead of a class row.
const CLASS_TO_BUCKET: Partial<Record<AssetClass, AccountGroup>> = {
  cash: 'cash',
  investments: 'investing',
  crypto: 'crypto',
};

const BUCKETS: Record<AccountGroup, { name: string; path: string }> = {
  cash: { name: 'Cash', path: '/assets/accounts' },
  investing: { name: 'Stocks & ETF', path: '/assets/investments' },
  crypto: { name: 'Crypto', path: '/assets/investments' },
  other: { name: 'Other accounts', path: '/assets/accounts' },
};

type LedgerAccount = Account & { institution?: Institution };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function listWithMore(items: string[], max: number): string {
  return items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} +${items.length - max}`;
}

function withShares(rows: Omit<LedgerRow, 'share'>[], total: number): LedgerRow[] {
  return rows
    .filter(r => r.amountIdr !== 0)
    .sort((a, b) => b.amountIdr - a.amountIdr)
    .map(r => ({ ...r, share: total > 0 ? Math.max(0, r.amountIdr) / total : 0 }));
}

/**
 * "What you own": each property and vehicle on its own, accounts and their holdings by bucket
 * (cash, stocks, crypto), other asset classes by class. Values follow the net worth service:
 * active accounts at latest balance or opening balance, assets and holdings only once valued.
 */
export function buildOwnRows(input: {
  accounts: LedgerAccount[];
  assets: Asset[];
  holdings: Holding[];
  assetValuations: Map<string, Valuation | undefined>;
  holdingValues: Map<string, number | undefined>;
}): { rows: LedgerRow[]; total: number } {
  const { accounts, assets, holdings, assetValuations, holdingValues } = input;
  const accountById = new Map(accounts.map(a => [a.id, a]));
  const bucketOf = (a?: LedgerAccount): AccountGroup => (a ? accountGroup(a.accountType, a.institution?.type) : 'investing');

  const buckets = new Map<AccountGroup, { amount: number; accounts: LedgerAccount[]; tickers: { ticker: string; value: number }[] }>();
  const bucket = (g: AccountGroup) => {
    if (!buckets.has(g)) buckets.set(g, { amount: 0, accounts: [], tickers: [] });
    return buckets.get(g)!;
  };

  for (const a of accounts.filter(a => a.isActive)) {
    const b = bucket(bucketOf(a));
    b.amount += accountValue(a);
    b.accounts.push(a);
  }
  for (const h of holdings) {
    const value = holdingValues.get(h.id);
    if (value === undefined) continue;
    const b = bucket(bucketOf(accountById.get(h.accountId)));
    b.amount += value;
    if (value > 0) b.tickers.push({ ticker: h.ticker, value });
  }

  const rows: Omit<LedgerRow, 'share'>[] = [];
  const classGroups = new Map<AssetClass, { asset: Asset; valuation: Valuation }[]>();

  for (const asset of assets) {
    const valuation = assetValuations.get(asset.id);
    if (!valuation) continue;
    const folded = CLASS_TO_BUCKET[asset.assetClass];
    if (folded) {
      bucket(folded).amount += valuation.valueIdr;
    } else if (INDIVIDUAL_CLASSES.includes(asset.assetClass)) {
      rows.push(assetRow(asset, valuation));
    } else {
      const list = classGroups.get(asset.assetClass) ?? [];
      list.push({ asset, valuation });
      classGroups.set(asset.assetClass, list);
    }
  }

  for (const [cls, list] of classGroups) {
    if (list.length === 1) {
      rows.push(assetRow(list[0].asset, list[0].valuation));
      continue;
    }
    rows.push({
      key: `class:${cls}`,
      name: CLASS_LABELS[cls],
      amountIdr: list.reduce((s, x) => s + x.valuation.valueIdr, 0),
      meta: plural(list.length, 'item'),
      target: { kind: 'route', path: '/assets/properties' },
    });
  }

  for (const [group, b] of buckets) {
    const places = [...new Set(b.accounts.map(a => a.institution?.name ?? a.name))];
    const tickers = b.tickers.sort((x, y) => y.value - x.value).slice(0, 3).map(t => t.ticker);
    const meta = tickers.length > 0
      ? [tickers.join(', '), listWithMore(places, 2)].filter(Boolean).join(' · ')
      : plural(b.accounts.length, 'account');
    rows.push({ key: `bucket:${group}`, name: BUCKETS[group].name, amountIdr: b.amount, meta, target: { kind: 'route', path: BUCKETS[group].path } });
  }

  const total = rows.reduce((s, r) => s + r.amountIdr, 0);
  return { rows: withShares(rows, total), total };
}

function assetRow(asset: Asset, valuation: Valuation): Omit<LedgerRow, 'share'> {
  return {
    key: `asset:${asset.id}`,
    name: asset.name,
    amountIdr: valuation.valueIdr,
    meta: `${CLASS_LABELS[asset.assetClass]} · revalued ${shortDate(valuation.valuedAt)}`,
    target: { kind: 'asset', asset },
  };
}

const LIABILITY_LABELS: Record<Liability['liabilityType'], string> = {
  revolving: 'Revolving',
  installment: 'Installment',
  personal: 'Personal loan',
};

/**
 * "What you owe": debts with a balance, largest first. With two or more debts, the revolving
 * debt with the highest rate is flagged to pay first (avalanche order).
 */
export function buildOweRows(
  liabilities: Liability[],
  assets: Asset[],
  now: Date = new Date(),
): { rows: LedgerRow[]; total: number; anchor?: { name: string; share: number } } {
  const debts = liabilities.filter(l => l.principal > 0);
  const total = debts.reduce((s, l) => s + l.principal, 0);
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // "Highest rate" must be true across every debt, so a revolving debt is flagged only when
  // nothing else charges more.
  const rated = debts.filter(l => l.interestRate != null);
  const highest = rated.length > 0
    ? rated.reduce((a, b) => ((b.interestRate ?? 0) > (a.interestRate ?? 0) ? b : a))
    : undefined;
  const payFirst = debts.length >= 2 && highest?.liabilityType === 'revolving' ? highest : undefined;

  const rows = debts.map((l): Omit<LedgerRow, 'share'> => {
    const flagged = l.id === payFirst?.id;
    const parts: string[] = [];
    if (l.interestRate != null) parts.push(formatRate(l.interestRate));
    if (flagged) {
      parts.push('highest rate, pay first');
    } else {
      if (l.monthlyPayment != null) parts.push(`Rp ${formatCompactIdr(l.monthlyPayment)} / month`);
      const left = l.endDate ? monthsBetween(nowKey, l.endDate.slice(0, 7)) : 0;
      if (l.liabilityType === 'installment' && left > 0) parts.push(`${left} left`);
    }
    return {
      key: `debt:${l.id}`,
      name: l.name,
      amountIdr: l.principal,
      meta: parts.length > 0 ? parts.join(' · ') : LIABILITY_LABELS[l.liabilityType],
      caution: flagged,
      target: { kind: 'route', path: '/assets/liabilities' },
    };
  });

  const largest = [...debts].sort((a, b) => b.principal - a.principal)[0];
  const linked = largest?.assetId ? assets.find(a => a.id === largest.assetId) : undefined;
  const anchor = linked && total > 0 ? { name: linked.name, share: largest.principal / total } : undefined;

  return { rows: withShares(rows, total), total, anchor };
}

// ── Horizon readouts ─────────────────────────────────────────────────────────

/** Latest valuation on or before the end of a month, from a history sorted either way. */
export function valueAtMonth(history: Valuation[], monthKey: string): number | undefined {
  let best: Valuation | undefined;
  for (const v of history) {
    if (v.valuedAt.slice(0, 7) > monthKey) continue;
    if (!best || v.valuedAt > best.valuedAt) best = v;
  }
  return best?.valueIdr;
}

/** Holding with the largest % change between two month-ends. Null when none had a value in both. */
export function biggestMover(
  holdings: { ticker: string; history: Valuation[] }[],
  prevKey: string,
  monthKey: string,
): { ticker: string; pct: number } | null {
  let best: { ticker: string; pct: number } | null = null;
  for (const h of holdings) {
    const prev = valueAtMonth(h.history, prevKey);
    const cur = valueAtMonth(h.history, monthKey);
    if (prev === undefined || cur === undefined || prev <= 0) continue;
    const pct = ((cur - prev) / prev) * 100;
    if (pct === 0) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { ticker: h.ticker, pct };
  }
  return best;
}
