import { cn } from '@/lib/utils';
import type { QuestCard } from '@/types/Journey';

interface Props {
  offers: QuestCard[];
  focusCode: string | null;
  pending: boolean;
  onPick: (code: string) => void;
}

export const FocusPick = ({ offers, focusCode, pending, onPick }: Props) => (
  <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Pick next month's focus. You can swap it any time.</p>
    <ul className="grid gap-2 md:grid-cols-3">
      {offers.map((offer) => {
        const chosen = offer.code === focusCode;
        return (
          <li key={offer.code}>
            <button
              type="button"
              aria-pressed={chosen}
              disabled={pending}
              onClick={() => onPick(offer.code)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                chosen
                  ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-800'
                  : 'bg-muted/40 hover:bg-muted',
              )}
            >
              <span className="font-medium">{offer.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{offer.why}</span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);
