import { cn } from '@/lib/utils';

/** Proportion bar drawn in SVG so its width needs no inline style. */
export function ZenBar({ value, tone, track = 'soft', className }: {
  value: number; // 0–1
  tone: 'neutral' | 'warm';
  track?: 'soft' | 'strong';
  className?: string;
}) {
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <svg className={cn('block w-full overflow-hidden rounded-full', className)} aria-hidden="true">
      <rect width="100%" height="100%" className={track === 'strong' ? 'fill-zen-track-strong' : 'fill-zen-track'} />
      <rect width={pct} height="100%" className={tone === 'warm' ? 'fill-zen-warm' : 'fill-zen-bar'} />
    </svg>
  );
}

export function ZenLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[13px] text-zen-faint', className)}>{children}</p>;
}
