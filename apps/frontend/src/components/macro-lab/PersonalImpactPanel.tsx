import { Badge } from '@/components/ui/badge';
import StatTile from './StatTile';
import type { MacroState, PortfolioAggregate } from '@/lib/macroScenario';
import type { EmergencyFundImpact, LiabilityImpactSummary, PersonalPortfolioMapping, PersonalSpendingMapping } from '@/lib/macroScenario/personalization';

const idr = (v: number) => `Rp${Math.round(v).toLocaleString('id-ID')}`;

interface PersonalImpactPanelProps {
  state: MacroState;
  portfolio: PortfolioAggregate;
  portfolioMapping: PersonalPortfolioMapping;
  spendingMapping: PersonalSpendingMapping;
  liabilityImpact: LiabilityImpactSummary;
  emergencyFundImpact: EmergencyFundImpact | null;
}

const SourceBadge = ({ source, label }: { source: 'personal' | 'default'; label: string }) => (
  <Badge variant={source === 'personal' ? 'default' : 'outline'} className="text-[10px] font-normal">
    {source === 'personal' ? label : `estimate — ${label}`}
  </Badge>
);

const PersonalImpactPanel = ({ state, portfolio, portfolioMapping, spendingMapping, liabilityImpact, emergencyFundImpact }: PersonalImpactPanelProps) => (
  <div className="pf-card p-4 mb-5">
    <div className="flex items-baseline justify-between mb-3.5">
      <span className="text-sm text-foreground font-medium">What this means for you</span>
      <span className="text-[11px] text-muted-foreground">based on your own data, where available</span>
    </div>

    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xs text-muted-foreground">Your portfolio, real return</span>
        <SourceBadge source={portfolioMapping.source} label="from your holdings" />
      </div>
      <div className="grid gap-3 mb-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatTile label="Blended real return" value={`${portfolio.realReturnPct >= 0 ? '+' : ''}${portfolio.realReturnPct.toFixed(1)}%`} tone={portfolio.realReturnPct >= 0 ? 'positive' : 'negative'} />
        {portfolioMapping.source === 'personal' && (
          <StatTile label="Mapped net worth" value={idr(portfolioMapping.totalMappedValueIdr)} />
        )}
        {portfolioMapping.unmappedValueIdr > 0 && (
          <StatTile label="Not modeled" value={idr(portfolioMapping.unmappedValueIdr)} sub={portfolioMapping.unmappedAssetClasses.join(', ')} tone="neutral" />
        )}
      </div>
      {portfolioMapping.source === 'personal' && portfolioMapping.contributions.length > 0 && (
        <div className="space-y-1">
          {portfolioMapping.contributions.filter((c) => c.valueIdr > 0).map((c) => (
            <div key={c.sourceLabel} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate">{c.sourceLabel} <span className="text-[10.5px]">→ {c.instrument ?? 'not modeled'}</span></span>
              <span className="font-data tabular-nums text-foreground shrink-0 ml-2">{idr(c.valueIdr)}</span>
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xs text-muted-foreground">Inflation you actually feel</span>
        <SourceBadge source={spendingMapping.source} label={spendingMapping.windowLabel} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatTile label="Felt inflation" value={`${state.cpiBottom.toFixed(1)}%`} tone={state.feltGap > 0.8 ? 'negative' : 'neutral'} sub={`official ${state.pi.toFixed(1)}%`} />
        <StatTile label="Gap vs. official CPI" value={`${state.feltGap >= 0 ? '+' : ''}${state.feltGap.toFixed(1)} pp`} tone={state.feltGap > 0.8 ? 'negative' : 'neutral'} />
      </div>
    </div>

    {liabilityImpact.perLiability.length > 0 && (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-xs text-muted-foreground">Your loan payments</span>
          <Badge variant="outline" className="text-[10px] font-normal text-warning border-warning/40">assumes floating rate</Badge>
        </div>
        <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <StatTile
            label="Est. monthly payment change"
            value={`${liabilityImpact.totalMonthlyDeltaIdr >= 0 ? '+' : ''}${idr(liabilityImpact.totalMonthlyDeltaIdr)}`}
            tone={liabilityImpact.totalMonthlyDeltaIdr > 0 ? 'negative' : liabilityImpact.totalMonthlyDeltaIdr < 0 ? 'positive' : 'neutral'}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{liabilityImpact.assumptionNote}</p>
      </div>
    )}

    {emergencyFundImpact && (
      <div>
        <div className="text-xs text-muted-foreground mb-2.5">Emergency fund runway in this scenario</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <StatTile label="Runway today" value={`${emergencyFundImpact.todayMonths.toFixed(1)} mo`} />
          <StatTile
            label="Runway in this scenario"
            value={`${emergencyFundImpact.scenarioMonths.toFixed(1)} mo`}
            tone={emergencyFundImpact.scenarioMonths < emergencyFundImpact.todayMonths ? 'negative' : 'positive'}
          />
          <StatTile label="Scenario monthly cost" value={idr(emergencyFundImpact.scenarioMonthlyCostIdr)} />
        </div>
      </div>
    )}
  </div>
);

export default PersonalImpactPanel;
