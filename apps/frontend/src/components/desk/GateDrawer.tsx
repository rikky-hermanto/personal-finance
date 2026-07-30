import { X } from 'lucide-react';
import { GateResult } from '@/types/desk';
import RuleLedger from './RuleLedger';

interface GateDrawerProps {
  open: boolean;
  onClose: () => void;
  gate: GateResult;
}

const GateDrawer = ({ open, onClose, gate }: GateDrawerProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/25" />
      <div className="absolute top-0 right-0 h-full w-[460px] bg-card border-l border-border p-4 overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Rule ledger</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <RuleLedger gate={gate} />
      </div>
    </div>
  );
};

export default GateDrawer;
