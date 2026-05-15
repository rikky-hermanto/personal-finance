interface LtvBadgeProps { ltv?: number }

export function LtvBadge({ ltv }: LtvBadgeProps) {
  if (ltv == null) return null;
  const pct = Math.round(ltv * 100);
  const color = pct < 60 ? 'text-green-500' : pct < 80 ? 'text-yellow-500' : 'text-red-500';
  return (
    <span className={`font-mono tabular-nums text-xs ${color}`}>
      LTV {pct}%
    </span>
  );
}
