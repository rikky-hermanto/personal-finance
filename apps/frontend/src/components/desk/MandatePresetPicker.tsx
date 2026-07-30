import { Lock } from 'lucide-react';
import { MandateParams, MandatePreset } from '@/types/desk';
import { Button } from '@/components/ui/button';
import { fmtIDR } from '@/lib/desk/deskFormat';
import { cn } from '@/lib/utils';

interface Props {
  presets: MandatePreset[];
  onSelect: (params: MandateParams, presetKey: string) => void;
  onCustom: () => void;
  onCancel?: () => void;
  customLabel?: string;
}

/**
 * First-run entry point into mandate creation. A user should never have to choose 20 risk
 * parameters cold — they pick a tier, see it in plain language, and can still open the full
 * parameter form afterwards. Locked tiers render as locked, never as a selectable menu item.
 */
const MandatePresetPicker = ({ presets, onSelect, onCustom, onCancel, customLabel }: Props) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <h2 className="text-sm font-semibold">Pick a starting point</h2>
      <p className="text-xs text-muted-foreground max-w-2xl">
        A mandate is the set of limits you agree to before you trade — how much you may lose on one
        trade, in one day, and across everything you hold at once. The desk refuses any trade plan
        that breaks them. You can change it later; every version is kept.
      </p>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      {presets.map(p => (
        <div
          key={p.key}
          className={cn(
            'rounded-lg border border-border p-4 flex flex-col gap-3',
            p.locked && 'opacity-60'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {p.locked && <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />}
                {p.name}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{p.tagline}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono tabular-nums text-sm">{p.params.riskPerTradePct}%</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">per trade</div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{p.whoItIsFor}</p>

          <ul className="space-y-1 text-xs">
            {p.highlights.map(h => (
              <li key={h} className="flex gap-2">
                <span className="text-muted-foreground shrink-0" aria-hidden>·</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-1">
            <div className="text-[11px] text-muted-foreground mb-2 font-mono tabular-nums">
              Trading capital {fmtIDR(p.params.activeTradingNav)}
            </div>
            {p.locked ? (
              <p className="text-[11px] text-muted-foreground">{p.unlockRequirement}</p>
            ) : (
              <Button size="sm" className="w-full" onClick={() => onSelect(p.params, p.key)}>
                Use {p.name}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>

    <div className="flex gap-2">
      <Button size="sm" variant="ghost" onClick={onCustom} className="text-xs">
        {customLabel ?? 'Advanced — set every parameter myself'}
      </Button>
      {onCancel && (
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
      )}
    </div>
  </div>
);

export default MandatePresetPicker;
