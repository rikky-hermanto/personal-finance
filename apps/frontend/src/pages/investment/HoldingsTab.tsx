import { BarChart3 } from 'lucide-react';

const HoldingsTab = () => (
  <div className="flex flex-col items-center justify-center h-full py-24 text-center">
    <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
      <BarChart3 className="w-6 h-6 text-muted-foreground" />
    </div>
    <h2 className="text-base font-medium mb-1">Consolidated holdings</h2>
    <p className="text-sm text-muted-foreground max-w-xs">
      A flat view of all positions across your portfolios. Coming in Slice 2.
    </p>
  </div>
);

export default HoldingsTab;
