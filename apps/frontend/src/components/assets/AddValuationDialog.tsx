import { ValuationStrategy } from '@/types/Asset';

type Props = {
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  subjectName: string;
  currency: string;
  strategy: ValuationStrategy;
  onSuccess: () => void;
  onClose: () => void;
};

export function AddValuationDialog({ subjectType, subjectName, strategy, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-lg font-semibold mb-1">Add Valuation</h2>
        <p className="text-sm text-muted-foreground mb-4">For {subjectName}</p>
        
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Value (Native)</label>
            <input name="valueNative" type="number" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded bg-secondary text-secondary-foreground">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
