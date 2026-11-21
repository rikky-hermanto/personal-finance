import { Plus } from 'lucide-react';
import { CATEGORIES, CATEGORY_ORDER, COPY } from '@/lib/goals/copy';
import { goalTrack } from '@/lib/goals/colors';
import type { GoalCategory } from '@/types/Goal';
import { CARD, CardTitle, CategoryIcon, IconTile, PRIMARY_BUTTON } from './goalUi';

// Empty-state guidance (handoff README "Empty state"). Fixed copy from copy.ts only: no API data,
// no arithmetic, nothing saved or counted.

export const GettingStartedCard = ({ onStart }: { onStart: () => void }) => (
  <section className={`${CARD} flex-[7_1_440px] min-w-0 flex flex-col`} aria-label={COPY.guideTitle}>
    <CardTitle right={<span className="text-[11px] text-muted-foreground">{COPY.guideMeta}</span>}>{COPY.guideTitle}</CardTitle>
    <ol className="mt-4 flex flex-col gap-1 flex-1">
      {COPY.guide.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-xl px-3 py-2.5 bg-foreground/[0.025]">
          <span className="w-6 h-6 rounded-lg bg-foreground/[0.06] text-[11px] font-semibold font-data text-foreground/70 flex items-center justify-center flex-shrink-0">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">{s.title}</div>
            <div className="text-[12px] text-muted-foreground leading-relaxed mt-0.5 text-pretty">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
    <div className="mt-5">
      <button type="button" onClick={onStart} className={PRIMARY_BUTTON}>
        <Plus size={14} />
        {COPY.guideCta}
      </button>
    </div>
  </section>
);

/** Not focusable, not clickable, never saved. */
export const ExampleGoalCard = () => {
  const e = COPY.example;
  return (
    <div aria-label="Example goal, not saved" data-testid="example-goal" className="rounded-2xl border border-dashed border-border p-5 flex flex-col select-none">
      <div className="flex items-start gap-3 opacity-80">
        <IconTile category="vehicle" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-foreground truncate">{e.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.meta}</div>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.05] text-foreground/60 flex-shrink-0">{e.chip}</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-x-3 flex-wrap opacity-80">
        <span className="text-2xl font-data text-foreground tracking-tight whitespace-nowrap">{e.allocated}</span>
        <span className="text-xs text-muted-foreground font-data whitespace-nowrap">{e.target}</span>
      </div>
      <div className="mt-2.5 w-full h-2 rounded-full opacity-80" style={{ background: goalTrack(0) }} />
      <div className="mt-4 flex-1 text-[13px] leading-snug text-foreground/70">{e.next}</div>
      <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed text-pretty">{e.note}</p>
    </div>
  );
};

export const StarterTile = ({ onStart }: { onStart: (category: GoalCategory) => void }) => (
  <div className="rounded-2xl border border-dashed border-border p-5 flex flex-col min-h-[200px]" data-testid="starter-tile">
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center text-muted-foreground flex-shrink-0">
        <Plus size={18} strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-foreground">{COPY.starterTitle}</div>
        <div className="text-[11px] text-muted-foreground">{COPY.starterSub}</div>
      </div>
    </div>
    <div className="mt-3 flex flex-col gap-0.5">
      {CATEGORY_ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onStart(k)}
          className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] outline-none transition-colors min-w-0"
        >
          <CategoryIcon category={k} size={14} strokeWidth={1.5} className="text-foreground/60 flex-shrink-0" />
          <span className="text-[13px] text-foreground whitespace-nowrap">{CATEGORIES[k].label}</span>
          <span className="text-[11px] text-muted-foreground truncate">{CATEGORIES[k].hint}</span>
        </button>
      ))}
    </div>
  </div>
);
