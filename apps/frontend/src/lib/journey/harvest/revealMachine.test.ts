import { describe, expect, it } from 'vitest';
import { initialReveal, isFinished, revealReducer, shownCount } from './revealMachine';

describe('revealMachine', () => {
  it('plays one card at a time and finishes after the last one', () => {
    let s = initialReveal(2, false);
    expect(shownCount(s)).toBe(1);
    expect(isFinished(s)).toBe(false);
    s = revealReducer(s, { type: 'next' });
    expect(shownCount(s)).toBe(2);
    expect(isFinished(s)).toBe(false);
    s = revealReducer(s, { type: 'next' });
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(2);
  });

  it('skip jumps to finished with every card shown', () => {
    const s = revealReducer(initialReveal(3, false), { type: 'skip' });
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(3);
  });

  it('reduced motion starts finished with every card shown', () => {
    const s = initialReveal(2, true);
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(2);
  });

  it('a harvest with no cards is finished immediately', () => {
    expect(isFinished(initialReveal(0, false))).toBe(true);
  });

  it('never moves past the end', () => {
    let s = initialReveal(1, false);
    for (let i = 0; i < 5; i++) s = revealReducer(s, { type: 'next' });
    expect(s.step).toBe(1);
  });
});
