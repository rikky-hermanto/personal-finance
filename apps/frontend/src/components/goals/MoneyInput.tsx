import { useLayoutEffect, useRef } from 'react';
import { formatIdr } from '@/lib/goals/money';
import { cn } from '@/lib/utils';

interface MoneyInputProps {
  /** Canonical whole-rupiah digits ("12500000") or "". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** "Rp" prefix, regrouped id-ID as you type, caret kept at the end. Strings only (FIN-01). */
export const MoneyInput = ({ value, onChange, placeholder = '0', autoFocus, ariaLabel, className }: MoneyInputProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const display = value ? formatIdr(value).replace(/^Rp /, '') : '';

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement === el) el.setSelectionRange(display.length, display.length);
  }, [display]);

  return (
    <div className={cn('flex items-center gap-2 px-3 h-10 rounded-xl bg-foreground/[0.04] focus-within:bg-foreground/[0.06] transition-colors', className)}>
      <span className="text-sm text-muted-foreground">Rp</span>
      <input
        ref={ref}
        autoFocus={autoFocus}
        inputMode="numeric"
        aria-label={ariaLabel}
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-sm font-data text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  );
};
