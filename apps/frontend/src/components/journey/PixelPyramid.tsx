import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JourneyState } from '@/types/Journey';
import { TIER_META } from '@/types/Journey';
import { PYRAMID_SCENES, PYRAMID_SCENE_HEIGHT } from '@/lib/journey/pyramidScenes.generated';
import {
  LEVEL_TAGLINE,
  fitPyramid,
  labelLeft,
  pyramidLayout,
  tierStatus,
  trapezoidPath,
  type TierStatus,
} from '@/lib/journey/pyramid';

// Layer colours are theme tokens in index.css (--pyramid-N / --pyramid-N-fill). Geometry, widths and
// sprite offsets are runtime numbers, so they are inline styles and SVG attributes, as in goalUi.

const describe = (t: TierStatus, label: string) =>
  `${t.level} ${label}, ${t.score == null ? 'not evaluated' : `${t.score.toFixed(0)} of 100`}${
    t.cleared ? ', cleared' : t.active ? ', in progress' : t.locked ? ', locked' : ''
  }`;

/**
 * The Financial Pyramid as five pastel layers, L1 at the bottom. Each layer holds a two-frame pixel scene of
 * people doing what that level asks (public/pyramid, from scripts/generate-pyramid-scenes.mjs). The darker band
 * fills to the level score. The current level glows; locked levels are faded and still. Not interactive.
 *
 * Fits its container: 3× pixels with full labels when there is room, 2× with shorter or no labels when not,
 * and below ~480px the 2× drawing is scaled down.
 */
export const PixelPyramid = ({ state }: { state: JourneyState }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(960);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = fitPyramid(available);
  const layout = pyramidLayout(fit);
  const shrink = Math.min(1, available / layout.totalWidth);
  const uid = useId().replace(/:/g, '');
  const tiers = layout.layers.map((layer) => ({ layer, t: tierStatus(state, layer.level), meta: TIER_META[layer.level] }));
  const k = layout.scale / 3;

  return (
    <div ref={ref} className="w-full" data-testid="journey-pyramid">
      <div
        className="relative mx-auto origin-top"
        role="img"
        aria-label={`Financial pyramid. ${tiers.map(({ t, meta }) => describe(t, meta.label)).join('. ')}.`}
        style={{
          width: layout.totalWidth,
          height: layout.height,
          transform: shrink < 1 ? `scale(${shrink})` : undefined,
          marginBottom: shrink < 1 ? -layout.height * (1 - shrink) : undefined,
        }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="absolute left-0 top-0 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {tiers.map(({ layer }) => (
              <clipPath key={layer.level} id={`${uid}-${layer.level}`}>
                <path d={trapezoidPath(layout.width, layer, layout.radius)} />
              </clipPath>
            ))}
            <filter id={`${uid}-glow`} x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy={6 * k} stdDeviation={9 * k} floodColor="rgb(251 191 36)" floodOpacity="0.35" />
            </filter>
          </defs>
          {tiers.map(({ layer, t }) => {
            const d = trapezoidPath(layout.width, layer, layout.radius);
            return (
              <g key={layer.level} className={cn(t.locked && 'opacity-[.55]')} filter={t.active ? `url(#${uid}-glow)` : undefined}>
                <path d={d} className="stroke-card" strokeWidth={5 * k} style={{ fill: `var(--pyramid-${t.index})` }} />
                <g clipPath={`url(#${uid}-${layer.level})`}>
                  <rect
                    x={layout.width / 2 - layer.bottomWidth / 2}
                    y={layer.y0}
                    height={layout.layerHeight}
                    width={(layer.bottomWidth * (t.score ?? 0)) / 100}
                    className="transition-[width] duration-700 ease-out"
                    style={{ fill: `var(--pyramid-${t.index}-fill)` }}
                  />
                </g>
                {t.active && <path d={d} fill="none" className="stroke-amber-400" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>

        {tiers.map(({ layer, t }) => {
          const w = PYRAMID_SCENES[t.index].width * layout.scale;
          const h = PYRAMID_SCENE_HEIGHT * layout.scale;
          const moving = t.active || t.cleared;
          return (
            <span
              key={layer.level}
              aria-hidden="true"
              data-testid={`pyramid-scene-${layer.level.toLowerCase()}`}
              className={cn(
                'pointer-events-none absolute bg-no-repeat [image-rendering:pixelated]',
                moving ? 'animate-pyramid-step motion-reduce:animate-none' : '',
                t.locked && 'opacity-[.55] saturate-[.3]',
              )}
              style={{
                '--scene-w': `${w}px`,
                width: w,
                height: h,
                left: layout.width / 2 - w / 2,
                top: layer.y1 - 4 * k - h,
                backgroundImage: `url('/pyramid/pyramid-l${t.index}.png')`,
                backgroundSize: `${w * 2}px ${h}px`,
              } as CSSProperties}
            />
          );
        })}

        {fit.labels !== 'none' &&
          tiers.map(({ layer, t, meta }) => (
            <div
              key={layer.level}
              aria-hidden="true"
              className="absolute flex items-center gap-2.5"
              style={{ left: labelLeft(layout, layer), top: layer.midY - 22, height: 44, width: layout.labelWidth }}
            >
              <span className="w-6 flex-shrink-0 border-t-2 border-dotted border-foreground/15" />
              <span className="min-w-0">
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap',
                    t.active ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground/70',
                  )}
                >
                  {layer.level} · {t.score == null ? '—' : t.score.toFixed(0)}
                  {t.locked && <Lock className="w-2.5 h-2.5" />}
                  {t.cleared && <Check className="w-2.5 h-2.5 text-emerald-600" strokeWidth={3} />}
                </span>
                <span className={cn('block leading-tight truncate', fit.labels === 'full' ? 'text-sm' : 'text-xs', t.locked ? 'text-muted-foreground/70' : 'text-foreground')}>
                  {meta.label}
                </span>
                {fit.labels === 'full' && (
                  <span className="block text-[11px] text-muted-foreground/70 truncate">{LEVEL_TAGLINE[layer.level]}</span>
                )}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};
