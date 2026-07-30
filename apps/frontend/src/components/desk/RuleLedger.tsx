import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GateRule } from '@/types/desk';
import StateChip from './StateChip';

interface RuleRowProps {
  row: GateRule;
}

export const RuleRow = ({ row }: RuleRowProps) => {
  const [open, setOpen] = useState(false);
  const muted = row.state === 'pass';

  return (
    <div className="py-0.5">
      <div className="grid grid-cols-[80px_1.6fr_1fr_1fr_1fr_24px] items-center gap-2 py-1.5 text-xs">
        <StateChip state={row.state} notImplemented={row.notImplemented} />
        <span className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{row.name}</span>
        <span className={cn('font-mono tabular-nums', muted ? 'text-muted-foreground' : 'text-foreground')}>{row.value}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{row.limit}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{row.headroom}</span>
        <button
          onClick={() => setOpen(!open)}
          className="justify-self-end text-muted-foreground hover:text-foreground transition-colors"
          title="Why"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {open && <div className="pb-2 pl-[92px] text-[11px] text-muted-foreground max-w-xl">{row.why}</div>}
    </div>
  );
};

interface RuleLedgerProps {
  gate: { rows: GateRule[] };
  title?: string;
}

const RuleLedger = ({ gate, title }: RuleLedgerProps) => {
  const [showPassing, setShowPassing] = useState(true);
  const blocked = gate.rows.filter(r => r.state === 'blocked');
  const warning = gate.rows.filter(r => r.state === 'warning');
  const unresolved = gate.rows.filter(r => r.state === 'unresolved');
  const passing = gate.rows.filter(r => r.state === 'pass');

  return (
    <div>
      {title && <div className="text-sm font-semibold mb-2">{title}</div>}
      <div className="grid grid-cols-[80px_1.6fr_1fr_1fr_1fr_24px] gap-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold border-b border-border pb-1.5">
        <span />
        <span>Rule</span>
        <span>Your value</span>
        <span>Limit</span>
        <span>Headroom</span>
        <span />
      </div>
      {blocked.map(r => <RuleRow key={r.id} row={r} />)}
      {warning.map(r => <RuleRow key={r.id} row={r} />)}
      {unresolved.map(r => <RuleRow key={r.id} row={r} />)}
      {passing.length > 0 && (
        <button
          onClick={() => setShowPassing(!showPassing)}
          className="my-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPassing ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showPassing ? 'Hide' : 'Show'} passing ({passing.length})
        </button>
      )}
      {showPassing && passing.map(r => <RuleRow key={r.id} row={r} />)}
    </div>
  );
};

export default RuleLedger;
