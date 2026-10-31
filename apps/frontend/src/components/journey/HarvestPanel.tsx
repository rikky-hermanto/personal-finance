import { useEffect, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { HarvestCard } from '@/components/journey/HarvestCard';
import { FocusPick } from '@/components/journey/FocusPick';
import { useCountUp } from '@/hooks/use-count-up';
import { CARD_DWELL_MS } from '@/lib/journey/harvest/harvestMotion';
import { initialReveal, isFinished, revealReducer, shownCount } from '@/lib/journey/harvest/revealMachine';
import { rhythmLabel } from '@/lib/journey/harvest/rhythm';
import type { Harvest, QuestCard, Rhythm } from '@/types/Journey';

interface Props {
  harvest: Harvest;
  rhythm: Rhythm;
  offers: QuestCard[];
  focusCode: string | null;
  focusPending: boolean;
  onSeen: (ids: number[], month: string | null) => void;
  onPickFocus: (code: string) => void;
  onDone: () => void;
}

export const HarvestPanel = ({
  harvest, rhythm, offers, focusCode, focusPending, onSeen, onPickFocus, onDone,
}: Props) => {
  const reduced = useReducedMotion() ?? false;
  const animated = !reduced;
  const [state, dispatch] = useReducer(
    revealReducer,
    undefined,
    () => initialReveal(harvest.items.length, reduced),
  );
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const seenSent = useRef(false);
  const finished = isFinished(state);

  // A tab opened in the background must not play the reveal, or use it up, unwatched.
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Advance by itself, but never while the owner is hovering or focused inside the panel.
  useEffect(() => {
    if (finished || reduced || paused || hidden) return;
    const timer = window.setTimeout(() => dispatch({ type: 'next' }), CARD_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [state.step, finished, reduced, paused, hidden]);

  // Mark seen once, when every card has been shown or the owner skipped, and only while visible.
  useEffect(() => {
    if (!finished || hidden || seenSent.current) return;
    seenSent.current = true;
    onSeen(harvest.items.flatMap((item) => item.completionIds), harvest.month);
  }, [finished, hidden, harvest, onSeen]);

  const shown = harvest.items.slice(0, shownCount(state));
  const runningTotal = harvest.gardenBefore + shown.reduce((sum, item) => sum + item.count, 0);
  const garden = useCountUp(runningTotal, animated, harvest.gardenBefore);
  const rhythmText = rhythmLabel(rhythm);

  return (
    <section
      aria-label="Monthly harvest"
      data-testid="harvest-panel"
      data-result={harvest.result ?? 'none'}
      className="pf-card space-y-4 p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'Escape' && !finished) dispatch({ type: 'skip' }); }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{harvest.title}</h2>
          {harvest.basis && <p className="mt-0.5 text-xs text-muted-foreground">{harvest.basis}</p>}
          {harvest.resultLine && <p className="mt-2 text-sm">{harvest.resultLine}</p>}
          {harvest.closing && <p className="mt-1 text-sm text-muted-foreground">{harvest.closing}</p>}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Garden <span className="font-mono tabular-nums text-foreground" data-testid="garden-count">{garden}</span>
          </p>
          {!finished && (
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'skip' })}>
              Skip
            </Button>
          )}
        </div>
      </header>

      {shown.length > 0 && (
        <ul aria-live="polite" className="space-y-2">
          {shown.map((item) => (
            <HarvestCard key={item.completionIds.join('-')} item={item} animated={animated} />
          ))}
        </ul>
      )}

      {finished && (
        <div className="space-y-4">
          {rhythmText && <p className="text-xs text-muted-foreground">{rhythmText}</p>}
          {offers.length > 0 && (
            <FocusPick offers={offers} focusCode={focusCode} pending={focusPending} onPick={onPickFocus} />
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </section>
  );
};
