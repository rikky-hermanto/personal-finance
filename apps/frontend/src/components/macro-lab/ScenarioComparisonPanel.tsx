import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import StatTile from './StatTile';
import type { ScenarioComparison } from '@/lib/macroScenario/comparison';

const idr = (v: number) => `${v >= 0 ? '+' : ''}Rp${Math.round(Math.abs(v)).toLocaleString('id-ID')}`;
const pp = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;

interface ScenarioComparisonPanelProps {
  comparison: ScenarioComparison;
  altLabel: string;
  onClear: () => void;
}

const ScenarioComparisonPanel = ({ comparison, altLabel, onClear }: ScenarioComparisonPanelProps) => (
  <div className="pf-card p-4 mb-5 border-l-[3px] border-l-primary">
    <div className="flex items-center justify-between mb-3.5">
      <span className="text-sm text-foreground font-medium">Comparing against: {altLabel}</span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> Clear comparison
      </Button>
    </div>
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      <StatTile label="Inflation" value={pp(comparison.inflationDeltaPp)} tone={comparison.inflationDeltaPp <= 0 ? 'positive' : 'negative'} />
      <StatTile label="Growth" value={pp(comparison.growthDeltaPp)} tone={comparison.growthDeltaPp >= 0 ? 'positive' : 'negative'} />
      <StatTile label="Unemployment" value={pp(comparison.unemploymentDeltaPp)} tone={comparison.unemploymentDeltaPp <= 0 ? 'positive' : 'negative'} />
      <StatTile label="Rupiah" value={pp(comparison.idrDeltaPct)} tone={comparison.idrDeltaPct >= 0 ? 'positive' : 'negative'} />
      <StatTile label="Your portfolio real return" value={pp(comparison.portfolioRealReturnDeltaPp)} tone={comparison.portfolioRealReturnDeltaPp >= 0 ? 'positive' : 'negative'} />
      <StatTile label="Your purchasing power" value={pp(comparison.purchasingPowerDeltaPp)} tone={comparison.purchasingPowerDeltaPp >= 0 ? 'positive' : 'negative'} />
      {comparison.portfolioValueDeltaIdr != null && (
        <StatTile label="Portfolio value" value={idr(comparison.portfolioValueDeltaIdr)} tone={comparison.portfolioValueDeltaIdr >= 0 ? 'positive' : 'negative'} />
      )}
      {comparison.liabilityMonthlyDeltaIdr != null && (
        <StatTile label="Loan payment" value={idr(comparison.liabilityMonthlyDeltaIdr)} tone={comparison.liabilityMonthlyDeltaIdr <= 0 ? 'positive' : 'negative'} />
      )}
      {comparison.emergencyFundMonthsDelta != null && (
        <StatTile label="Emergency fund runway" value={`${comparison.emergencyFundMonthsDelta >= 0 ? '+' : ''}${comparison.emergencyFundMonthsDelta.toFixed(1)} mo`} tone={comparison.emergencyFundMonthsDelta >= 0 ? 'positive' : 'negative'} />
      )}
    </div>
  </div>
);

export default ScenarioComparisonPanel;
