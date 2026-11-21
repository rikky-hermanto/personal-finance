import { describe, expect, it } from 'vitest';
import {
  absMoney,
  formatDecimal,
  formatIdr,
  formatIdrShort,
  formatRatioPercent,
  isPositiveMoney,
  moneySign,
  negateMoney,
  parseIdrInput,
  percentForBar,
  percentToRate,
  rateToPercent,
} from './money';

describe('formatIdr', () => {
  it('groups with dots and drops .00', () => {
    expect(formatIdr('12500000.00')).toBe('Rp 12.500.000');
    expect(formatIdr('8333334')).toBe('Rp 8.333.334');
    expect(formatIdr('0')).toBe('Rp 0');
    expect(formatIdr('999')).toBe('Rp 999');
  });

  it('keeps cents with a comma', () => {
    expect(formatIdr('0.40')).toBe('Rp 0,4');
    expect(formatIdr('1250.55')).toBe('Rp 1.250,55');
  });

  it('formats negatives', () => {
    expect(formatIdr('-2500000')).toBe('-Rp 2.500.000');
    expect(formatIdr('-0.00')).toBe('Rp 0');
  });

  it('handles values above Number.MAX_SAFE_INTEGER exactly', () => {
    expect(formatIdr('999999999999999999.99')).toBe('Rp 999.999.999.999.999.999,99');
    expect(formatIdr('9007199254740993')).toBe('Rp 9.007.199.254.740.993');
  });

  it('returns empty for invalid input', () => {
    expect(formatIdr('abc')).toBe('');
    expect(formatIdr('1e9')).toBe('');
  });
});

describe('formatIdrShort', () => {
  it('falls back to the full format below 1 jt', () => {
    expect(formatIdrShort('999999')).toBe('Rp 999.999');
  });

  it('uses jt from 1 million with up to one decimal', () => {
    expect(formatIdrShort('1000000')).toBe('Rp 1 jt');
    expect(formatIdrShort('12300000')).toBe('Rp 12,3 jt');
    expect(formatIdrShort('50000000.00')).toBe('Rp 50 jt');
    expect(formatIdrShort('200000000')).toBe('Rp 200 jt');
    expect(formatIdrShort('12350000')).toBe('Rp 12,4 jt'); // half up
  });

  it('rolls 999,95 jt up to 1 M', () => {
    expect(formatIdrShort('999949999')).toBe('Rp 999,9 jt');
    expect(formatIdrShort('999950000')).toBe('Rp 1 M');
  });

  it('uses M from 1 billion with up to two decimals', () => {
    expect(formatIdrShort('1200000000')).toBe('Rp 1,2 M');
    expect(formatIdrShort('1234567890')).toBe('Rp 1,23 M');
    expect(formatIdrShort('1235000000')).toBe('Rp 1,24 M');
    expect(formatIdrShort('99999999999999999999')).toBe('Rp 100.000.000.000 M');
  });

  it('keeps the sign', () => {
    expect(formatIdrShort('-12300000')).toBe('-Rp 12,3 jt');
  });
});

describe('formatRatioPercent', () => {
  it('shifts the decimal point', () => {
    expect(formatRatioPercent('0.0820', 1)).toBe('8.2');
    expect(formatRatioPercent('0.296', 1)).toBe('29.6');
    expect(formatRatioPercent('0.34', 1)).toBe('34');
    expect(formatRatioPercent('0.68', 0)).toBe('68');
    expect(formatRatioPercent('1.2', 1)).toBe('120');
    expect(formatRatioPercent('0', 1)).toBe('0');
    expect(formatRatioPercent('0.31055', 1)).toBe('31.1');
  });
});

describe('formatDecimal', () => {
  it('truncates, never rounds up', () => {
    expect(formatDecimal('1.63', 1)).toBe('1.6');
    expect(formatDecimal('1.99', 1)).toBe('1.9');
    expect(formatDecimal('3.00', 1)).toBe('3');
  });
});

describe('parseIdrInput', () => {
  it('accepts grouped rupiah and a comma decimal mark', () => {
    expect(parseIdrInput('Rp 12.500.000')).toBe('12500000');
    expect(parseIdrInput('12500000')).toBe('12500000');
    expect(parseIdrInput('1.250,5')).toBe('1250.5');
    expect(parseIdrInput('007')).toBe('7');
  });

  it('rejects invalid input', () => {
    expect(parseIdrInput('')).toBeNull();
    expect(parseIdrInput('Rp')).toBeNull();
    expect(parseIdrInput('12a')).toBeNull();
    expect(parseIdrInput('-5')).toBeNull();
  });
});

describe('sign helpers', () => {
  it('reads the sign without arithmetic', () => {
    expect(moneySign('0.00')).toBe(0);
    expect(moneySign('5000000')).toBe(1);
    expect(moneySign('-1')).toBe(-1);
    expect(moneySign(null)).toBeNull();
    expect(isPositiveMoney('0')).toBe(false);
    expect(isPositiveMoney('0.01')).toBe(true);
    expect(negateMoney('50000000')).toBe('-50000000');
    expect(negateMoney('-5')).toBe('5');
    expect(negateMoney('0')).toBe('0');
    expect(absMoney('-5')).toBe('5');
  });
});

describe('percentForBar', () => {
  it('clamps to 0-100 for CSS width', () => {
    expect(percentForBar('120.0')).toBe(100);
    expect(percentForBar('-3')).toBe(0);
    expect(percentForBar('25.5')).toBe(25.5);
    expect(percentForBar(null)).toBe(0);
  });
});

describe('percentToRate', () => {
  it('moves the decimal point two places', () => {
    expect(percentToRate('5')).toBe('0.05');
    expect(percentToRate('5.5')).toBe('0.055');
    expect(percentToRate('12,25')).toBe('0.1225');
    expect(percentToRate('100')).toBe('1');
    expect(percentToRate('0')).toBe('0');
  });

  it('rejects above 100% and junk', () => {
    expect(percentToRate('101')).toBeNull();
    expect(percentToRate('abc')).toBeNull();
    expect(percentToRate('')).toBeNull();
  });

  it('round-trips through rateToPercent', () => {
    expect(rateToPercent('0.055')).toBe('5.5');
    expect(rateToPercent('0.050000')).toBe('5');
  });
});
