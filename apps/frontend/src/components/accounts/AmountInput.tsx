import { forwardRef } from 'react';
import { formatAmountTyping } from '@/lib/accounts';
import { cn } from '@/lib/utils';

interface AmountInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/** Text input for money in id-ID format (1.234.567,89) with a currency prefix. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ id, value, onChange, currency, size = 'md', autoFocus, invalid, className, ...aria }, ref) => {
    const prefix = currency === 'IDR' ? 'Rp' : currency;
    return (
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          size === 'lg' ? 'h-[60px] justify-center' : 'h-12',
          invalid && 'border-destructive',
          className,
        )}
      >
        <span className={cn('text-muted-foreground', size === 'lg' ? 'text-base' : 'text-sm')}>{prefix}</span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(formatAmountTyping(e.target.value))}
          placeholder="0"
          // In the large centred variant the input grows with its text so "Rp" stays beside the number.
          size={size === 'lg' ? Math.max(value.length, 1) : undefined}
          aria-invalid={invalid || undefined}
          className={cn(
            'font-data min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50',
            size === 'lg' ? 'w-auto max-w-full text-2xl' : 'flex-1 text-lg',
          )}
          {...aria}
        />
      </label>
    );
  },
);
AmountInput.displayName = 'AmountInput';
