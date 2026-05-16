import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSnapshot } from '@/api/investmentApi';
import DiagnosticsSection from '@/components/investment/analysis/DiagnosticsSection';
import HoldingsEvaluationSection from '@/components/investment/analysis/HoldingsEvaluationSection';
import MacroMapSection from '@/components/investment/analysis/MacroMapSection';
import ScenariosSection from '@/components/investment/analysis/ScenariosSection';
import ResilienceSection from '@/components/investment/analysis/ResilienceSection';
import DecisionTreeSection from '@/components/investment/analysis/DecisionTreeSection';
import RecommendedPortfolioSection from '@/components/investment/analysis/RecommendedPortfolioSection';

const InvestmentAnalysis = () => {
  const { setupId, snapshotId } = useParams<{ setupId: string; snapshotId: string }>();
  const navigate = useNavigate();

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['investment', 'snapshot', snapshotId],
    queryFn: () => getSnapshot(setupId!, snapshotId!),
    enabled: !!setupId && !!snapshotId,
    staleTime: Infinity, // snapshots are immutable
  });

  const analysis = snapshot?.analysisJson ? JSON.parse(snapshot.analysisJson) : null;

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => navigate(`/investment/${setupId}`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">Portfolio Review</h1>
            {snapshot && (
              <p className="text-xs text-muted-foreground">
                {snapshot.label} · {snapshot.aiProvider}/{snapshot.aiModel} · {snapshot.snapshotDate}
              </p>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading analysis…
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive py-6">Failed to load analysis.</div>
        )}

        {analysis && (
          <div className="space-y-6">
            {analysis.diagnostics && <DiagnosticsSection data={analysis.diagnostics} />}
            {analysis.holdings_evaluation && <HoldingsEvaluationSection data={analysis.holdings_evaluation} />}
            {analysis.macro_map && <MacroMapSection data={analysis.macro_map} />}
            {analysis.scenarios && <ScenariosSection data={analysis.scenarios} />}
            {analysis.resilience_test && <ResilienceSection data={analysis.resilience_test} />}
            {analysis.decision_tree && <DecisionTreeSection data={analysis.decision_tree} />}
            {analysis.recommended_portfolio && <RecommendedPortfolioSection data={analysis.recommended_portfolio} />}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestmentAnalysis;
