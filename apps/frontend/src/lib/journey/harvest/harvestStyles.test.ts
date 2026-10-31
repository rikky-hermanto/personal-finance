import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('/src/components/journey/{HarvestPanel,HarvestCard,FocusPick}.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// A harvest is never coloured as bad news, for green and red months alike (no red, no destructive token).
const FORBIDDEN = /(?:text|bg|ring|border|from|to|fill|stroke)-(?:red|rose|destructive)\b|destructive|expense/;

describe('Harvest components', () => {
  it('finds the three component files', () => {
    expect(Object.keys(sources)).toHaveLength(3);
  });

  it.each(Object.entries(sources))('%s uses no red or destructive class', (_path, source) => {
    expect(source).not.toMatch(FORBIDDEN);
  });
});
