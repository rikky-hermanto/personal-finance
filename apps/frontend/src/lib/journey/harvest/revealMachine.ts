export interface RevealState {
  /** Index of the newest card on screen. Equals itemCount once every card has been shown. */
  step: number;
  itemCount: number;
}

export type RevealAction = { type: 'next' } | { type: 'skip' };

/** Reduced motion shows everything at once, so it starts finished. */
export const initialReveal = (itemCount: number, reducedMotion: boolean): RevealState => ({
  step: reducedMotion ? itemCount : 0,
  itemCount,
});

export const revealReducer = (state: RevealState, action: RevealAction): RevealState =>
  action.type === 'skip'
    ? { ...state, step: state.itemCount }
    : { ...state, step: Math.min(state.step + 1, state.itemCount) };

export const isFinished = (state: RevealState): boolean => state.step >= state.itemCount;

/** Cards on screen: the ones already played plus the newest, or all of them once finished. */
export const shownCount = (state: RevealState): number =>
  isFinished(state) ? state.itemCount : state.step + 1;
