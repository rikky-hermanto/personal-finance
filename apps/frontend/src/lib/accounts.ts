import { Account } from '@/types/Account';

// An account whose balance hasn't been recorded for this many days shows "Needs update"
// and joins the balance check-in queue. Product choice from the Accounts Revamp spec
// (docs/ideas/prototypes/accounts-management-revamp/README.md), not a financial threshold.
export const STALE_DAYS = 30;

export type AccountGroup = 'cash' | 'investing' | 'crypto' | 'other';

export const ACCOUNT_GROUPS: { key: AccountGroup; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'investing', label: 'Investing' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'other', label: 'Other' },
];

const DAY_MS = 86_400_000;

export function accountValue(account: Account): number {
  return account.latestValuation?.valueIdr ?? account.openingBalance;
}

export function accountUpdatedAt(account: Account): string {
  return account.latestValuation?.valuedAt ?? account.openingDate;
}

// Date-only strings ("2026-10-31") are calendar dates, so read them in local time;
// `new Date('2026-10-31')` would read them as UTC midnight and shift the day west of UTC.
function toLocalDate(iso: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(iso);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysSince(iso: string, now: Date = new Date()): number {
  const diff = Math.round((startOfDay(now) - startOfDay(toLocalDate(iso))) / DAY_MS);
  return Math.max(0, diff);
}

/** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "last month", "4 months ago", "last year", "6 years ago". */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return 'last year';
  return `${Math.floor(days / 365)} years ago`;
}

export function relativeUpdated(iso: string, now: Date = new Date()): string {
  return `Updated ${relativeAge(iso, now)}`;
}

export function isStale(account: Account, now: Date = new Date()): boolean {
  return daysSince(accountUpdatedAt(account), now) >= STALE_DAYS;
}

/** Active stale accounts, the one updated longest ago first. */
export function staleQueue<T extends Account>(accounts: T[], now: Date = new Date()): T[] {
  return accounts
    .filter(a => a.isActive && isStale(a, now))
    .sort((a, b) => toLocalDate(accountUpdatedAt(a)).getTime() - toLocalDate(accountUpdatedAt(b)).getTime());
}

// account_type is one of checking, savings, credit_card, brokerage, wallet, loan
// (CreateAccountCommandValidator). A wallet at a crypto exchange holds crypto; any other
// wallet is an e-wallet, which is spendable cash.
export function accountGroup(accountType: string, institutionType?: string): AccountGroup {
  switch (accountType) {
    case 'checking':
    case 'savings':
      return 'cash';
    case 'brokerage':
      return 'investing';
    case 'wallet':
      return institutionType === 'crypto_exchange' ? 'crypto' : 'cash';
    default:
      return 'other';
  }
}

// Institution type is one of bank, broker, crypto_exchange, insurer, other (CreateInstitutionCommandValidator).
export function institutionGroup(institutionType: string): AccountGroup {
  switch (institutionType) {
    case 'bank': return 'cash';
    case 'broker': return 'investing';
    case 'crypto_exchange': return 'crypto';
    default: return 'other';
  }
}

export function accountTypeLabel(accountType: string, institutionType?: string): string {
  switch (accountType) {
    case 'checking': return 'Checking';
    case 'savings': return 'Savings';
    case 'credit_card': return 'Credit card';
    case 'brokerage': return 'Brokerage';
    case 'wallet': return institutionType === 'crypto_exchange' ? 'Crypto wallet' : 'E-wallet';
    case 'loan': return 'Loan';
    default: return accountType;
  }
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Parses an id-ID amount ("38.750.000", "1.000,50") into a number; null when empty. */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const [int, frac = ''] = cleaned.split(',');
  const value = Number(`${int || '0'}.${frac.replace(/,/g, '') || '0'}`);
  return Number.isFinite(value) ? value : null;
}

/** Re-formats what the user typed with id-ID thousand separators, keeping up to two decimals. */
export function formatAmountTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  if (cleaned === '') return '';
  const commaAt = cleaned.indexOf(',');
  const intDigits = (commaAt === -1 ? cleaned : cleaned.slice(0, commaAt)).replace(/^0+(?=\d)/, '');
  const intPart = (intDigits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (commaAt === -1) return intPart;
  return `${intPart},${cleaned.slice(commaAt + 1).replace(/,/g, '').slice(0, 2)}`;
}

export function formatAmountInput(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
}

export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
