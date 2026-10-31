import { describe, expect, it } from 'vitest';
import { Account } from '@/types/Account';
import {
  accountGroup,
  accountUpdatedAt,
  accountValue,
  formatAmountTyping,
  initials,
  isStale,
  parseAmountInput,
  relativeAge,
  relativeUpdated,
  staleQueue,
} from './accounts';

const NOW = new Date(2026, 9, 31, 15, 0); // 31 Oct 2026, local time

const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'a1',
  name: 'BCA',
  accountType: 'checking',
  currency: 'IDR',
  openingBalance: 1_000_000,
  openingDate: '2026-01-01',
  isActive: true,
  includeInCashflow: true,
  ...overrides,
});

const valuation = (valueIdr: number, valuedAt: string) => ({
  id: 'v1', subjectType: 'account' as const, subjectId: 'a1', valueNative: valueIdr,
  currency: 'IDR', fxRateToIdr: 1, valueIdr, source: 'manual' as const, valuedAt,
});

describe('accountValue and accountUpdatedAt', () => {
  it('use the opening balance when there is no valuation', () => {
    const a = makeAccount();
    expect(accountValue(a)).toBe(1_000_000);
    expect(accountUpdatedAt(a)).toBe('2026-01-01');
  });

  it('use the latest valuation when there is one', () => {
    const a = makeAccount({ latestValuation: valuation(2_500_000, '2026-10-30T09:00:00Z') });
    expect(accountValue(a)).toBe(2_500_000);
    expect(accountUpdatedAt(a)).toBe('2026-10-30T09:00:00Z');
  });
});

describe('relativeAge', () => {
  it.each([
    ['2026-10-31', 'today'],
    ['2026-10-30', 'yesterday'],
    ['2026-10-28', '3 days ago'],
    ['2026-10-24', 'last week'],
    ['2026-10-14', '2 weeks ago'],
    ['2026-09-20', 'last month'],
    ['2026-06-30', '4 months ago'],
    ['2025-09-01', 'last year'],
    ['2020-10-01', '6 years ago'],
    ['2026-11-05', 'today'],
  ])('%s reads as %s', (iso, expected) => {
    expect(relativeAge(iso, NOW)).toBe(expected);
  });

  it('prefixes "Updated" for list rows', () => {
    expect(relativeUpdated('2026-10-30', NOW)).toBe('Updated yesterday');
  });
});

describe('isStale and staleQueue', () => {
  it('marks an account stale at 30 days without an update', () => {
    expect(isStale(makeAccount({ openingDate: '2026-10-02' }), NOW)).toBe(false);
    expect(isStale(makeAccount({ openingDate: '2026-10-01' }), NOW)).toBe(true);
  });

  it('queues active stale accounts, oldest update first', () => {
    const fresh = makeAccount({ id: 'fresh', openingDate: '2026-10-30' });
    const old = makeAccount({ id: 'old', openingDate: '2020-01-01' });
    const older = makeAccount({ id: 'older', openingDate: '2019-01-01' });
    const archived = makeAccount({ id: 'archived', openingDate: '2018-01-01', isActive: false });
    expect(staleQueue([fresh, old, archived, older], NOW).map(a => a.id)).toEqual(['older', 'old']);
  });
});

describe('accountGroup', () => {
  it.each([
    ['checking', undefined, 'cash'],
    ['savings', 'bank', 'cash'],
    ['brokerage', 'broker', 'investing'],
    ['wallet', 'crypto_exchange', 'crypto'],
    ['wallet', 'other', 'cash'],
    ['credit_card', 'bank', 'other'],
    ['loan', undefined, 'other'],
  ])('%s at %s is %s', (type, instType, expected) => {
    expect(accountGroup(type, instType)).toBe(expected);
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words, or two letters of one word', () => {
    expect(initials('Bank Jago')).toBe('BJ');
    expect(initials('BCA')).toBe('BC');
    expect(initials('  neo   bank  digital ')).toBe('NB');
    expect(initials('')).toBe('?');
  });
});

describe('amount input', () => {
  it('formats typing with id-ID separators', () => {
    expect(formatAmountTyping('38750000')).toBe('38.750.000');
    expect(formatAmountTyping('Rp 1.000,505')).toBe('1.000,50');
    expect(formatAmountTyping('0012')).toBe('12');
    expect(formatAmountTyping('')).toBe('');
  });

  it('parses id-ID amounts', () => {
    expect(parseAmountInput('38.750.000')).toBe(38_750_000);
    expect(parseAmountInput('1.000,5')).toBe(1000.5);
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('Rp')).toBeNull();
  });
});
