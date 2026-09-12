import StatTile, { StatTone } from './StatTile';
import type { MacroScenarioResult } from '@/lib/macroScenario';

const sign = (v: number) => (v >= 0 ? '+' : '');

interface DerivedOutcomePanelProps {
  result: MacroScenarioResult;
}

const DerivedOutcomePanel = ({ result }: DerivedOutcomePanelProps) => {
  const { state, drivers, regime } = result;

  const tiles: { label: string; value: string; sub?: string; tone?: StatTone }[] = [
    { label: 'CPI inflation', value: `${state.pi.toFixed(1)}%`, tone: Math.abs(state.piGap) > 2 ? 'negative' : 'positive', sub: `target ${drivers.target.toFixed(1)}%` },
    { label: 'Real GDP growth', value: `${sign(state.g)}${state.g.toFixed(1)}%`, sub: `potential ${state.gPot.toFixed(1)}%` },
    { label: 'Output gap', value: `${sign(state.gap)}${state.gap.toFixed(1)} pp`, tone: state.gap < -1 ? 'negative' : 'positive' },
    { label: 'Open unemployment', value: `${state.u.toFixed(1)}%`, sub: "Okun's law result" },
    { label: 'Underemployment', value: `${state.underemp.toFixed(1)}%`, tone: state.underemp > 24 ? 'negative' : 'neutral', sub: 'the real shock absorber' },
    { label: 'Real policy rate', value: `${sign(state.rEx)}${state.rEx.toFixed(1)}%`, tone: state.rEx < 0 ? 'warning' : 'neutral' },
    { label: 'Rupiah', value: `${sign(state.idr)}${state.idr.toFixed(1)}%`, tone: state.idr < 0 ? 'negative' : 'positive' },
    { label: 'Food inflation', value: `${state.foodInfl.toFixed(1)}%`, tone: state.foodInfl > state.pi + 1.5 ? 'negative' : 'neutral' },
    { label: 'Rent growth', value: `${state.rentGrowth.toFixed(1)}%`, tone: state.rentBurden > 0 ? 'negative' : 'neutral' },
    { label: 'Fuel price', value: `${sign(state.fuelPrice)}${state.fuelPrice.toFixed(1)}%`, tone: state.fuelPrice > 5 ? 'negative' : 'neutral' },
    { label: '10Y bond yield (SBN)', value: `${state.sbnYield.toFixed(1)}%` },
    { label: 'Actual deficit', value: `${state.deficitActual.toFixed(1)}%`, tone: state.deficitActual > 3 ? 'negative' : 'positive', sub: `subsidy ${state.subsidyCost.toFixed(1)}% GDP` },
  ];

  return (
    <div className="pf-card border-l-[3px] border-l-success p-4 mb-5">
      <div className="flex items-baseline justify-between mb-3.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm text-foreground font-medium">{regime.regime}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">computed — not directly adjustable</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">{regime.regimeNote}</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {tiles.map((t) => <StatTile key={t.label} {...t} />)}
      </div>
    </div>
  );
};

export default DerivedOutcomePanel;
