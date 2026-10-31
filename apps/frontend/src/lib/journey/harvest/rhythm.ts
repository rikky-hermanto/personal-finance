import type { Rhythm } from '@/types/Journey';

const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`;

/** One quiet line. After a restart it simply shows the new count: no message about the break. */
export const rhythmLabel = ({ current, longest }: Rhythm): string | null => {
  if (current > 0) {
    return longest > current
      ? `Monthly rhythm · ${months(current)} · longest ${months(longest)}`
      : `Monthly rhythm · ${months(current)}`;
  }
  return longest > 0 ? `Longest rhythm · ${months(longest)}` : null;
};
