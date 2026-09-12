import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import DriverConsole from '@/components/macro-lab/DriverConsole';
import DerivedOutcomePanel from '@/components/macro-lab/DerivedOutcomePanel';
import CapitalFlowPanel from '@/components/macro-lab/CapitalFlowPanel';
import InstrumentRotationTable from '@/components/macro-lab/InstrumentRotationTable';
import StakeholderLedger from '@/components/macro-lab/StakeholderLedger';
import PersonalImpactPanel from '@/components/macro-lab/PersonalImpactPanel';
import ScenarioComparisonPanel from '@/components/macro-lab/ScenarioComparisonPanel';
import MacroLabDisclaimer from '@/components/macro-lab/MacroLabDisclaimer';
import { Button } from '@/components/ui/button';
import { computeScenario, BASE, type MacroDrivers } from '@/lib/macroScenario';
import { compareScenarios } from '@/lib/macroScenario/comparison';
import { estimateEmergencyFundRunway, estimateLiabilityImpact, mapPortfolioToWeights, mapSpendingToWeights } from '@/lib/macroScenario/personalization';
import { useMacroLabPersonalizationData, useSaveMacroScenario, useDeleteMacroScenario, useSavedMacroScenarios } from '@/hooks/useMacroLab';

const MacroLabPage = () => {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<MacroDrivers>({ ...BASE });
  const [comparing, setComparing] = useState(false);
  const [altDrivers, setAltDrivers] = useState<MacroDrivers>({ ...BASE });

  const { holdings, assets, liabilities, variance, buckets } = useMacroLabPersonalizationData();
  const { data: savedScenarios = [] } = useSavedMacroScenarios();
  const saveMutation = useSaveMacroScenario();
  const deleteMutation = useDeleteMacroScenario();

  const portfolioMapping = useMemo(() => mapPortfolioToWeights(holdings, assets), [holdings, assets]);
  const spendingMapping = useMemo(() => mapSpendingToWeights(variance?.drivers ?? []), [variance]);

  const todayMonthlyCostIdr = (buckets?.committed ?? 0) + (buckets?.freeBudget ?? 0);
  const todayEmergencyMonths = buckets && todayMonthlyCostIdr > 0 ? buckets.emergencyFund.now / todayMonthlyCostIdr : buckets?.emergencyFund.targetMonths ?? 0;

  const result = useMemo(
    () => computeScenario(drivers, { spendingWeights: spendingMapping.weights, portfolioWeights: portfolioMapping.weights }),
    [drivers, spendingMapping.weights, portfolioMapping.weights],
  );
  const liabilityImpact = useMemo(
    () => estimateLiabilityImpact(liabilities, BASE.i, drivers.i),
    [liabilities, drivers.i],
  );
  const emergencyFundImpact = buckets
    ? estimateEmergencyFundRunway(buckets.emergencyFund.now, todayMonthlyCostIdr, todayEmergencyMonths, result.state.cpiBottom)
    : null;

  const altResult = useMemo(
    () => (comparing ? computeScenario(altDrivers, { spendingWeights: spendingMapping.weights, portfolioWeights: portfolioMapping.weights }) : null),
    [comparing, altDrivers, spendingMapping.weights, portfolioMapping.weights],
  );
  const altLiabilityImpact = useMemo(
    () => (comparing ? estimateLiabilityImpact(liabilities, BASE.i, altDrivers.i) : null),
    [comparing, liabilities, altDrivers.i],
  );
  const altEmergencyFundImpact =
    comparing && altResult && buckets
      ? estimateEmergencyFundRunway(buckets.emergencyFund.now, todayMonthlyCostIdr, todayEmergencyMonths, altResult.state.cpiBottom)
      : null;

  const comparison = altResult
    ? compareScenarios({
        base: result,
        alt: altResult,
        basePortfolioValueIdr: portfolioMapping.totalMappedValueIdr * (1 + result.portfolio.realReturnPct / 100),
        altPortfolioValueIdr: portfolioMapping.totalMappedValueIdr * (1 + altResult.portfolio.realReturnPct / 100),
        baseLiabilityMonthlyIdr: liabilityImpact.totalMonthlyDeltaIdr,
        altLiabilityMonthlyIdr: altLiabilityImpact?.totalMonthlyDeltaIdr,
        baseEmergencyFundMonths: emergencyFundImpact?.scenarioMonths,
        altEmergencyFundMonths: altEmergencyFundImpact?.scenarioMonths,
      })
    : null;

  // The single-scenario panels always reflect whichever driver set is being edited (base, or the
  // alternative once comparison mode starts) — the comparison panel is the only place base-vs-alt
  // deltas are shown side by side.
  const activeResult = comparing && altResult ? altResult : result;
  const activeLiabilityImpact = comparing && altLiabilityImpact ? altLiabilityImpact : liabilityImpact;
  const activeEmergencyFundImpact = comparing ? altEmergencyFundImpact : emergencyFundImpact;
  const activeDrivers = comparing ? altDrivers : drivers;
  const setActiveDriver = (key: keyof MacroDrivers, value: number) => {
    if (comparing) setAltDrivers((p) => ({ ...p, [key]: value }));
    else setDrivers((p) => ({ ...p, [key]: value }));
  };
  const loadDrivers = (next: MacroDrivers) => {
    if (comparing) setAltDrivers(next);
    else setDrivers(next);
  };

  const handleSave = (name: string) => {
    saveMutation.mutate(
      { name, driversJson: JSON.stringify(drivers) },
      {
        onSuccess: () => toast({ title: `Saved "${name}"` }),
        onError: () => toast({ title: 'Could not save this scenario', variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-6 pt-6 pb-5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Macro Scenario Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Move the drivers a policymaker actually controls. Everything else — inflation, growth, jobs, the
          rupiah, and what it means for your own money — is computed.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="grid gap-7" style={{ gridTemplateColumns: 'minmax(280px, 320px) minmax(0, 1fr)' }}>
          <DriverConsole
            drivers={activeDrivers}
            onChange={setActiveDriver}
            onLoadDrivers={loadDrivers}
            savedScenarios={savedScenarios}
            onSave={handleSave}
            onDelete={(id) => deleteMutation.mutate(id, { onError: () => toast({ title: 'Could not delete this scenario', variant: 'destructive' }) })}
            isSaving={saveMutation.isPending}
          />

          <div className="min-w-0">
            <div className="flex justify-end mb-3">
              {!comparing ? (
                <Button variant="outline" size="sm" onClick={() => { setAltDrivers({ ...drivers }); setComparing(true); }}>
                  Compare against an alternative
                </Button>
              ) : null}
            </div>

            {comparing && comparison && (
              <ScenarioComparisonPanel comparison={comparison} altLabel="your alternative scenario" onClear={() => setComparing(false)} />
            )}

            <DerivedOutcomePanel result={activeResult} />
            <PersonalImpactPanel
              state={activeResult.state}
              portfolio={activeResult.portfolio}
              portfolioMapping={portfolioMapping}
              spendingMapping={spendingMapping}
              liabilityImpact={activeLiabilityImpact}
              emergencyFundImpact={activeEmergencyFundImpact}
            />
            <CapitalFlowPanel result={activeResult} />
            <div className="mb-5">
              <div className="flex flex-wrap items-baseline justify-between mb-2.5 gap-2">
                <span className="text-sm text-foreground font-medium">Instrument rotation and market sentiment</span>
                <span className="text-[11px] text-muted-foreground">high sentiment + thin return = crowded and expensive</span>
              </div>
              <InstrumentRotationTable instruments={activeResult.instruments} />
            </div>
            <StakeholderLedger rows={activeResult.stakeholders} />
          </div>
        </div>
      </div>

      <MacroLabDisclaimer />
    </div>
  );
};

export default MacroLabPage;
