// FIN-01: money arrives from the API as decimal strings. Everything here is string and BigInt work:
// no Number() on an amount, ever. The one float in this module is percentForBar, a CSS width.

interface Dec {
  neg: boolean;
  int: string; // digits, no leading zeros except "0"
  frac: string; // digits, may be empty
}

const DEC = /^(-)?(\d+)(?:\.(\d+))?$/;

function parse(value: string): Dec | null {
  const m = DEC.exec(value.trim());
  if (!m) return null;
  const int = m[2].replace(/^0+(?=\d)/, '');
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const isZero = /^0+$/.test(int) && frac === '';
  return { neg: !!m[1] && !isZero, int, frac };
}

/** The value scaled to `dp` decimals as a non-negative BigInt, rounded half up (away from zero). */
function scaled(d: Dec, dp: number, mode: 'half_up' | 'truncate'): bigint {
  const frac = d.frac.padEnd(dp + 1, '0');
  let n = BigInt(d.int + frac.slice(0, dp));
  if (mode === 'half_up' && Number(frac[dp]) >= 5) n += 1n;
  return n;
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** BigInt with `dp` implied decimals, as "1.234,5" style text with trailing zeros dropped. */
function render(n: bigint, dp: number, decimalMark: string, grouped: boolean): string {
  const s = n.toString().padStart(dp + 1, '0');
  const int = dp === 0 ? s : s.slice(0, -dp);
  const frac = dp === 0 ? '' : s.slice(-dp).replace(/0+$/, '');
  const head = grouped ? group(int) : int;
  return frac ? `${head}${decimalMark}${frac}` : head;
}

/** "12500000.00" → "Rp 12.500.000"; "-2500000" → "-Rp 2.500.000"; cents kept as ",5". */
export function formatIdr(value: string): string {
  const d = parse(value);
  if (!d) return '';
  const frac = d.frac.slice(0, 2);
  const body = `Rp ${group(d.int)}${frac ? `,${frac}` : ''}`;
  return d.neg ? `-${body}` : body;
}

const MILLION_TENTHS = 100_000n; // Rp per 0.1 jt
const BILLION_HUNDREDTHS = 10_000_000n; // Rp per 0.01 M

/** Headline format: "Rp 1,2 M" from 1e9 (≤ 2 dp), "Rp 12,3 jt" from 1e6 (≤ 1 dp), else formatIdr. Half up. */
export function formatIdrShort(value: string): string {
  const d = parse(value);
  if (!d) return '';
  const rupiah = scaled(d, 0, 'half_up');
  const sign = d.neg ? '-' : '';

  if (rupiah >= 1_000_000n) {
    const tenths = (rupiah + MILLION_TENTHS / 2n) / MILLION_TENTHS;
    if (tenths < 10_000n) return `${sign}Rp ${render(tenths, 1, ',', true)} jt`;
  }
  if (rupiah >= 999_950_000n) {
    const hundredths = (rupiah + BILLION_HUNDREDTHS / 2n) / BILLION_HUNDREDTHS;
    return `${sign}Rp ${render(hundredths, 2, ',', true)} M`;
  }
  return formatIdr(value);
}

/** A ratio as a percentage by shifting the decimal point: "0.0820" → "8.2" (dp 1, half up, zeros dropped). */
export function formatRatioPercent(ratio: string, dp: number): string {
  const d = parse(ratio);
  if (!d) return '';
  const shifted: Dec = { neg: d.neg, int: (d.int + d.frac.padEnd(2, '0').slice(0, 2)).replace(/^0+(?=\d)/, ''), frac: d.frac.slice(2) };
  const out = render(scaled(shifted, dp, 'half_up'), dp, '.', false);
  return d.neg && out !== '0' ? `-${out}` : out;
}

/** Truncates to `dp` decimals, matching the ToZero rounding in formulas.md §9: "1.63" → "1.6". */
export function formatDecimal(value: string, dp: number): string {
  const d = parse(value);
  if (!d) return '';
  const out = render(scaled(d, dp, 'truncate'), dp, '.', false);
  return d.neg && out !== '0' ? `-${out}` : out;
}

/** User input to a canonical decimal string: "Rp 12.500.000" → "12500000", "1.250,5" → "1250.5". Null if invalid. */
export function parseIdrInput(input: string): string | null {
  const cleaned = input.replace(/rp/gi, '').replace(/\s/g, '').replace(/\./g, '');
  if (cleaned === '') return null;
  const m = /^(\d+)(?:,(\d{0,2}))?$/.exec(cleaned);
  if (!m) return null;
  const int = m[1].replace(/^0+(?=\d)/, '');
  const frac = (m[2] ?? '').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/** -1, 0 or 1 by string inspection; null for an unparsable value. */
export function moneySign(value: string | null | undefined): -1 | 0 | 1 | null {
  if (value == null) return null;
  const d = parse(value);
  if (!d) return null;
  if (/^0+$/.test(d.int) && d.frac === '') return 0;
  return d.neg ? -1 : 1;
}

export const isPositiveMoney = (value: string | null | undefined) => moneySign(value) === 1;

/** Sign flip for a withdrawal ("50000000" → "-50000000"). Not arithmetic. */
export function negateMoney(value: string): string {
  return value.startsWith('-') ? value.slice(1) : moneySign(value) === 0 ? value : `-${value}`;
}

/** Absolute value by dropping the sign. */
export function absMoney(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

/** Clamps to 0–100 for a CSS width (progress fill, bar share). A pixel ratio, not money. */
export function percentForBar(value: string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** "5" or "5.5" (percent a year) → "0.05" / "0.055" by moving the decimal point. Null if invalid or above 100. */
export function percentToRate(input: string): string | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,4}))?$/.exec(input.trim());
  if (!m) return null;
  const digits = (m[1].padStart(3, '0') + (m[2] ?? '')).replace(/^0+(?=\d)/, '');
  const scale = 2 + (m[2]?.length ?? 0);
  const padded = digits.padStart(scale + 1, '0');
  const rate = `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/\.?0+$/, '');
  const d = parse(rate);
  if (!d || BigInt(d.int) > 1n || (d.int === '1' && d.frac !== '')) return null;
  return rate === '' ? '0' : rate;
}

/** "0.05" → "5" for the edit form's growth field. */
export const rateToPercent = (rate: string): string => formatRatioPercent(rate, 4);
