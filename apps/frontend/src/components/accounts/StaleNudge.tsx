interface StaleNudgeProps {
  count: number;
  onReview: () => void;
}

// Copy follows STALE_DAYS (30) in @/lib/accounts; change both together.
export const StaleNudge = ({ count, onReview }: StaleNudgeProps) => (
  <div className="mt-[22px] flex items-center justify-between gap-3 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
      {count} {count === 1 ? 'balance hasn’t' : 'balances haven’t'} been updated in 30+ days
    </span>
    <button
      type="button"
      onClick={onReview}
      className="shrink-0 rounded-sm font-medium text-foreground hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Review now →
    </button>
  </div>
);
