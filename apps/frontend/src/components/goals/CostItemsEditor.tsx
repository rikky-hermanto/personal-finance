import { Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COPY, COST_TYPES } from '@/lib/goals/copy';
import { formatIdr } from '@/lib/goals/money';
import { cn } from '@/lib/utils';
import type { CostItemType, GoalCategory, GoalPreview } from '@/types/Goal';
import { FIELD } from './goalUi';
import { MoneyInput } from './MoneyInput';
import { newCostRow, type CostRow } from '@/lib/goals/costRows';

interface CostItemsEditorProps {
  rows: CostRow[];
  onChange: (rows: CostRow[]) => void;
  category: GoalCategory;
  preview: GoalPreview | undefined;
}

/** Amounts only; no rate is offered or filled in (FIN-06). Totals come from the preview API, never summed here. */
export const CostItemsEditor = ({ rows, onChange, category, preview }: CostItemsEditorProps) => {
  const update = (key: string, patch: Partial<CostRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <Select value={r.itemType} onValueChange={(v) => update(r.key, { itemType: v as CostItemType })}>
            <SelectTrigger className={cn(FIELD, 'w-36 flex-shrink-0 border-0 shadow-none focus:ring-0')} aria-label="Cost type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COST_TYPES) as CostItemType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {COST_TYPES[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            value={r.label}
            onChange={(e) => update(r.key, { label: e.target.value })}
            placeholder={COST_TYPES[r.itemType]}
            maxLength={80}
            aria-label="Cost label"
            className={cn(FIELD, 'flex-1 min-w-0')}
          />
          <MoneyInput value={r.amount} onChange={(v) => update(r.key, { amount: v })} ariaLabel="Cost amount" className="w-40 flex-shrink-0" />
          <button
            type="button"
            onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove cost"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {rows.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...rows, newCostRow(rows.length ? 'fee' : 'down_payment')])}
          className="self-start text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
        >
          <Plus size={12} />
          Add a cost
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">{COPY.costHelper}</p>
      {category === 'vehicle' && <p className="text-[11px] text-muted-foreground">{COPY.costOtr}</p>}
      <div className="flex justify-between text-sm mt-1" data-testid="cost-preview">
        <span className="text-muted-foreground">{COPY.costCashNeeded}</span>
        <span className="font-data text-foreground">
          {preview?.cashNeeded ? formatIdr(preview.cashNeeded) : '—'}
          {preview?.totalCost && <span className="text-muted-foreground text-xs"> · full cost {formatIdr(preview.totalCost)}</span>}
        </span>
      </div>
    </div>
  );
};
