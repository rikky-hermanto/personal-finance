import { describe, expect, it } from 'vitest';
import { rhythmLabel } from './rhythm';

const SHAME = /\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|lose|loss|miss\w*|broke\w*|streak\w*|mistake\w*)\b/i;

describe('rhythmLabel', () => {
  it('shows the current rhythm and the longest when it is longer', () => {
    expect(rhythmLabel({ current: 7, longest: 9 })).toBe('Monthly rhythm · 7 months · longest 9 months');
    expect(rhythmLabel({ current: 7, longest: 7 })).toBe('Monthly rhythm · 7 months');
    expect(rhythmLabel({ current: 1, longest: 1 })).toBe('Monthly rhythm · 1 month');
  });

  it('after a quiet restart only shows the new count', () => {
    expect(rhythmLabel({ current: 2, longest: 7 })).toBe('Monthly rhythm · 2 months · longest 7 months');
  });

  it('when the run has ended it shows only the longest', () => {
    expect(rhythmLabel({ current: 0, longest: 9 })).toBe('Longest rhythm · 9 months');
  });

  it('shows nothing before the first harvest', () => {
    expect(rhythmLabel({ current: 0, longest: 0 })).toBeNull();
  });

  it('never uses loss or shame wording', () => {
    for (let current = 0; current <= 12; current++) {
      for (let longest = current; longest <= 12; longest++) {
        expect(rhythmLabel({ current, longest }) ?? '').not.toMatch(SHAME);
      }
    }
  });
});
