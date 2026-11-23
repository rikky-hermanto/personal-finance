import { describe, expect, it } from 'vitest';
import { rateLimitMessage } from './rateLimitMessage';

describe('rateLimitMessage', () => {
  it('uses seconds for a short wait', () => {
    expect(rateLimitMessage(12)).toBe('Terlalu banyak pertanyaan. Coba lagi dalam 12 detik.');
  });
  it('never says zero seconds', () => {
    expect(rateLimitMessage(0)).toContain('1 detik');
  });
  it('uses minutes for a medium wait', () => {
    expect(rateLimitMessage(300)).toContain('5 menit');
  });
  it('uses hours when the daily cap is hit', () => {
    expect(rateLimitMessage(7200)).toContain('2 jam');
  });
});
