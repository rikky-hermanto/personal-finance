// Goal colour identity from the PF-154 design handoff. A design token, not a financial constant
// (FIN-02 does not apply). The index is stored on the goal at creation, so colours never shift.
export const GOAL_HUES = [155, 250, 300, 30, 200, 340, 95, 60] as const;

export const goalColor = (index: number): string =>
  `oklch(0.6 0.1 ${GOAL_HUES[((index % GOAL_HUES.length) + GOAL_HUES.length) % GOAL_HUES.length]})`;

export const goalTrack = (index: number): string => `color-mix(in oklch, ${goalColor(index)} 20%, transparent)`;
