import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/types/Transaction';
import { findRowProblems, isOpeningBalance, splitZeroAmountRows, summarizeImport } from './importPreview';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: '1',
  date: '2024-01-01',
  description: 'Kopi',
  amount: -100,
  flow: 'DB',
  type: 'expense',
  category: 'Food',
  bank: 'BCA',
  ...over,
});

describe('findRowProblems', () => {
  it('returns nothing when every row is complete', () => {
    expect(findRowProblems([tx({}), tx({ id: '2' })])).toEqual([]);
  });

  it('reports the row number and exactly which fields are missing', () => {
    const rows = [tx({ id: 'a' }), tx({ id: 'b', category: '' }), tx({ id: 'c', description: '  ', date: '' })];
    const problems = findRowProblems(rows);
    expect(problems.map(p => [p.tx.id, p.rowNumber, p.missing])).toEqual([
      ['b', 2, ['category']],
      ['c', 3, ['date', 'description']],
    ]);
  });
});

describe('splitZeroAmountRows', () => {
  it('moves zero-amount rows aside and keeps everything else in order', () => {
    const rows = [tx({ id: 'a' }), tx({ id: 'z', amount: 0 }), tx({ id: 'b', amount: 50, flow: 'CR' })];
    const { kept, skipped } = splitZeroAmountRows(rows);
    expect(kept.map(t => t.id)).toEqual(['a', 'b']);
    expect(skipped.map(t => t.id)).toEqual(['z']);
  });

  it('flags a row whose amount is edited to zero as a problem', () => {
    expect(findRowProblems([tx({ amount: 0 })])[0].missing).toEqual(['amount']);
  });
});

describe('summarizeImport', () => {
  it('keeps the opening balance and transfers out of income and expenses', () => {
    const rows = [
      tx({ id: 'o', description: 'Initial Balance', amount: 1000, flow: 'CR', type: 'expense' }),
      tx({ id: 'i', amount: 500, flow: 'CR', type: 'income' }),
      tx({ id: 'e', amount: -200, type: 'expense' }),
      tx({ id: 't', amount: -10, type: 'transfer' }),
    ];
    const s = summarizeImport(rows);
    expect(s.income).toBe(500);
    expect(s.expenses).toBe(-200);
    expect(s.transfers).toBe(-10);
    expect(s.openingBalance).toBe(1000);
  });

  it('nets every row so it matches the statement end balance', () => {
    const rows = [
      tx({ id: 'o', description: 'Initial Balance', amount: 1000, flow: 'CR', type: 'expense' }),
      tx({ id: 'i', amount: 500, flow: 'CR', type: 'income' }),
      tx({ id: 'e', amount: -200, type: 'expense' }),
      tx({ id: 't', amount: -10, type: 'transfer' }),
    ];
    expect(summarizeImport(rows).netBalance).toBe(1290);
  });

  it('works for a statement with no opening row', () => {
    const s = summarizeImport([tx({ amount: 300, flow: 'CR', type: 'income' }), tx({ id: '2', amount: -50 })]);
    expect(s.openingBalance).toBe(0);
    expect(s.netBalance).toBe(250);
  });
});

describe('isOpeningBalance', () => {
  it('matches the exact label case-insensitively and nothing longer', () => {
    expect(isOpeningBalance({ description: 'initial balance' })).toBe(true);
    expect(isOpeningBalance({ description: 'Initial Balance transfer' })).toBe(false);
  });
});
