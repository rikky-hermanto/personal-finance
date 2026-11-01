import { describe, expect, it } from 'vitest';
import { Account } from '@/types/Account';
import { Asset } from '@/types/Asset';
import { Holding } from '@/types/Holding';
import { Institution } from '@/types/Institution';
import { Liability } from '@/types/Liability';
import { Valuation } from '@/types/Valuation';
import {
  biggestMover,
  buildOweRows,
  buildOwnRows,
  debtRatio,
  formatCompactIdr,
  formatMilestone,
  formatShare,
  formatSignedIdr,
  heroParts,
  monthDelta,
  monthlySeries,
  nextMilestone,
  ownOweSentence,
  projectMilestone,
} from './netWorth';

const point = (date: string, valueIdr: number, assetsIdr = valueIdr, liabilitiesIdr = 0) => ({ date, valueIdr, assetsIdr, liabilitiesIdr });

const val = (subjectId: string, valueIdr: number, valuedAt: string): Valuation => ({
  id: `${subjectId}-${valuedAt}`,
  subjectType: 'asset',
  subjectId,
  valueNative: valueIdr,
  currency: 'IDR',
  fxRateToIdr: 1,
  valueIdr,
  source: 'manual',
  valuedAt,
});

const account = (o: Partial<Account> & { id: string; institution?: Institution }): Account & { institution?: Institution } => ({
  name: o.id,
  accountType: 'savings',
  currency: 'IDR',
  openingBalance: 0,
  openingDate: '2026-01-01',
  isActive: true,
  includeInCashflow: true,
  ...o,
});

const asset = (o: Partial<Asset> & { id: string }): Asset => ({
  name: o.id,
  assetClass: 'real_estate',
  currency: 'IDR',
  valuationStrategy: 'Manual',
  ...o,
});

const debt = (o: Partial<Liability> & { id: string }): Liability => ({
  name: o.id,
  liabilityType: 'installment',
  principal: 0,
  startDate: '2026-01-01',
  ...o,
});

describe('formatting', () => {
  it('splits the hero number into rupiah and cents', () => {
    expect(heroParts(808_052_170)).toEqual({ sign: '', int: '808.052.170', dec: '00' });
    expect(heroParts(-1_500.5)).toEqual({ sign: '−', int: '1.500', dec: '50' });
  });

  it('uses jt for millions and M for billions with a decimal comma', () => {
    expect(formatCompactIdr(1_586_932_170)).toBe('1,59 M');
    expect(formatCompactIdr(778_880_000)).toBe('778,9 jt');
    expect(formatCompactIdr(950_000)).toBe('950.000');
  });

  it('signs deltas', () => {
    expect(formatSignedIdr(16_852_170)).toBe('+Rp 16.852.170');
    expect(formatSignedIdr(-16_852_170, true)).toBe('−Rp 16,9 jt');
  });

  it('shows tiny shares as <1%', () => {
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0.797)).toBe('80%');
  });

  it('names milestones', () => {
    expect(formatMilestone(1_000_000_000)).toBe('Rp 1 miliar');
    expect(formatMilestone(2_000_000_000, 'short')).toBe('Rp 2 M');
  });
});

describe('monthlySeries', () => {
  it('keeps the last point of each month and fills empty months', () => {
    const series = monthlySeries([
      point('2026-03-31T00:00:00Z', 700),
      point('2026-03-10T00:00:00Z', 650),
      point('2026-05-31T00:00:00Z', 730),
    ]);
    expect(series.map(s => [s.key, s.valueIdr])).toEqual([
      ['2026-03', 700],
      ['2026-04', 700],
      ['2026-05', 730],
    ]);
  });

  it('returns nothing for no history', () => {
    expect(monthlySeries([])).toEqual([]);
  });
});

describe('monthDelta', () => {
  it('compares the last two months', () => {
    const d = monthDelta(monthlySeries([point('2026-09-30', 791_200_000), point('2026-10-31', 808_052_170)]));
    expect(d?.abs).toBe(16_852_170);
    expect(d?.pct).toBeCloseTo(2.13, 2);
    expect(d?.prevKey).toBe('2026-09');
  });

  it('is null under two months', () => {
    expect(monthDelta(monthlySeries([point('2026-10-31', 1)]))).toBeNull();
  });
});

describe('projectMilestone', () => {
  const series = monthlySeries([
    point('2026-03-31', 700_000_000),
    point('2026-10-31', 808_052_170),
  ]);

  it('projects the next round miliar at the average monthly pace', () => {
    const p = projectMilestone(series, 808_052_170);
    expect(p?.milestoneIdr).toBe(1_000_000_000);
    expect(p?.remainingIdr).toBe(191_947_830);
    // avg = 108.05 jt / 7 months ≈ 15.4 jt → 13 months → Nov 2027
    expect(p?.monthsAway).toBe(13);
    expect(p?.etaKey).toBe('2027-11');
  });

  it('is null when the pace is flat or falling', () => {
    const falling = monthlySeries([point('2026-03-31', 800), point('2026-04-30', 700)]);
    expect(projectMilestone(falling, 700)).toBeNull();
  });

  it('picks the next multiple above the current value', () => {
    expect(nextMilestone(50_000_000)).toBe(1_000_000_000);
    expect(nextMilestone(1_000_000_000)).toBe(2_000_000_000);
    expect(nextMilestone(-5)).toBe(1_000_000_000);
  });
});

describe('own / owe', () => {
  it('computes the debt ratio, clamped', () => {
    expect(debtRatio(1_586_932_170, 778_880_000)).toBeCloseTo(0.4908, 4);
    expect(debtRatio(0, 10)).toBe(1);
    expect(debtRatio(10, 0)).toBe(0);
  });

  it('picks the sentence by band', () => {
    expect(ownOweSentence(0.1)).toBe('Most of what you own is yours outright.');
    expect(ownOweSentence(0.49, { name: 'Apartemen Taman Rasuna', share: 0.987 }))
      .toBe('About half of what you own is still borrowed, almost all of it for Apartemen Taman Rasuna.');
    expect(ownOweSentence(0.49)).toBe('About half of what you own is still borrowed.');
    expect(ownOweSentence(0.7)).toBe('Most of what you own is still borrowed.');
  });
});

describe('buildOwnRows', () => {
  it('groups accounts into buckets, keeps property individual, and sorts by value', () => {
    const accounts = [
      account({ id: 'bca', accountType: 'checking', latestValuation: val('bca', 5_000_000, '2026-10-31') }),
      account({ id: 'jago', openingBalance: 1_000_000 }),
      account({ id: 'ajaib', accountType: 'brokerage', institution: { id: 'i', name: 'Ajaib', type: 'broker', country: 'ID' } }),
      account({ id: 'old', isActive: false, openingBalance: 9_000_000 }),
    ];
    const holdings: Holding[] = [
      { id: 'h1', accountId: 'ajaib', ticker: 'BBCA', quantity: 1, costBasis: 0, currency: 'IDR' },
      { id: 'h2', accountId: 'ajaib', ticker: 'VOO', quantity: 1, costBasis: 0, currency: 'IDR' },
      { id: 'h3', accountId: 'ajaib', ticker: 'NOVAL', quantity: 1, costBasis: 0, currency: 'IDR' },
    ];
    const assets = [
      asset({ id: 'apt', name: 'Apartemen', assetClass: 'real_estate' }),
      asset({ id: 'gold', name: 'Emas Antam', assetClass: 'tangibles' }),
      asset({ id: 'unvalued', assetClass: 'vehicles' }),
    ];

    const { rows, total } = buildOwnRows({
      accounts,
      assets,
      holdings,
      assetValuations: new Map([
        ['apt', val('apt', 100_000_000, '2026-09-30')],
        ['gold', val('gold', 2_000_000, '2026-09-30')],
      ]),
      holdingValues: new Map([['h1', 20_000_000], ['h2', 30_000_000]]),
    });

    expect(total).toBe(158_000_000);
    expect(rows.map(r => [r.name, r.amountIdr])).toEqual([
      ['Apartemen', 100_000_000],
      ['Stocks & ETF', 50_000_000],
      ['Cash', 6_000_000],
      ['Emas Antam', 2_000_000],
    ]);
    expect(rows[0].meta).toBe('Property · revalued 30 Sep');
    expect(rows[1].meta).toBe('VOO, BBCA · Ajaib');
    expect(rows[2].meta).toBe('2 accounts');
    expect(rows[0].share).toBeCloseTo(100 / 158, 5);
    expect(rows[0].target).toEqual({ kind: 'asset', asset: assets[0] });
  });

  it('groups several assets of one class into a single row', () => {
    const { rows } = buildOwnRows({
      accounts: [],
      assets: [asset({ id: 'a', assetClass: 'receivables' }), asset({ id: 'b', assetClass: 'receivables' })],
      holdings: [],
      assetValuations: new Map([['a', val('a', 3, '2026-04-30')], ['b', val('b', 5, '2026-04-30')]]),
      holdingValues: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Receivables', amountIdr: 8, meta: '2 items' });
  });
});

describe('buildOweRows', () => {
  const now = new Date(2026, 9, 31);

  it('describes each debt and flags the highest-rate revolving one', () => {
    const { rows, total, anchor } = buildOweRows([
      debt({ id: 'kpr', name: 'KPR', principal: 768_400_000, interestRate: 7.5, monthlyPayment: 7_200_000, assetId: 'apt' }),
      debt({ id: 'kredivo', name: 'Kredivo', principal: 6_300_000, interestRate: 2.6, monthlyPayment: 1_050_000, endDate: '2027-04-30' }),
      debt({ id: 'cc', name: 'BCA CC', liabilityType: 'revolving', principal: 4_180_000, interestRate: 21 }),
      debt({ id: 'paid', principal: 0 }),
    ], [asset({ id: 'apt', name: 'Apartemen' })], now);

    expect(total).toBe(778_880_000);
    expect(rows.map(r => r.meta)).toEqual([
      '7,5% · Rp 7,2 jt / month',
      '2,6% · Rp 1,1 jt / month · 6 left',
      '21% · highest rate, pay first',
    ]);
    expect(rows[2].caution).toBe(true);
    expect(anchor?.name).toBe('Apartemen');
    expect(anchor?.share).toBeCloseTo(0.9865, 3);
  });

  it('does not flag a revolving debt when another debt charges more', () => {
    const { rows } = buildOweRows([
      debt({ id: 'a', interestRate: 30, principal: 10 }),
      debt({ id: 'b', liabilityType: 'revolving', interestRate: 21, principal: 5 }),
    ], [], now);
    expect(rows.some(r => r.caution)).toBe(false);
  });

  it('is empty when nothing is owed', () => {
    expect(buildOweRows([debt({ id: 'cc', principal: 0 })], [], now)).toMatchObject({ rows: [], total: 0 });
  });
});

describe('biggestMover', () => {
  it('finds the holding with the largest % change between two month-ends', () => {
    const mover = biggestMover([
      { ticker: 'BBCA', history: [val('x', 100, '2026-09-30'), val('x', 101, '2026-10-31')] },
      { ticker: 'VOO', history: [val('y', 100, '2026-09-30'), val('y', 102.4, '2026-10-31')] },
      { ticker: 'NEW', history: [val('z', 100, '2026-10-31')] },
    ], '2026-09', '2026-10');
    expect(mover?.ticker).toBe('VOO');
    expect(mover?.pct).toBeCloseTo(2.4, 5);
  });

  it('is null without two month-end values', () => {
    expect(biggestMover([{ ticker: 'NEW', history: [val('z', 100, '2026-10-31')] }], '2026-09', '2026-10')).toBeNull();
  });
});
