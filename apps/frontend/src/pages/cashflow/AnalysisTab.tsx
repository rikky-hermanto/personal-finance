import SafeToSpendCard from '@/components/analysis/SafeToSpendCard';
import VarianceExplainerCard from '@/components/analysis/VarianceExplainerCard';

const AnalysisTab = () => (
  <div className="p-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SafeToSpendCard />
      <VarianceExplainerCard />
    </div>
  </div>
);

export default AnalysisTab;
