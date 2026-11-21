import type { CostItemType } from '@/types/Goal';

/** One editable cost line in the goal form. Amount is canonical digits or "". */
export interface CostRow {
  key: string;
  itemType: CostItemType;
  label: string;
  amount: string;
}

let seq = 0;
export const newCostRow = (itemType: CostItemType, label = ''): CostRow => ({ key: `cost-${++seq}`, itemType, label, amount: '' });
