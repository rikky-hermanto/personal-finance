import { History } from 'lucide-react';

const SnapshotsTab = () => (
  <div className="flex flex-col items-center justify-center h-full py-24 text-center">
    <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
      <History className="w-6 h-6 text-muted-foreground" />
    </div>
    <h2 className="text-base font-medium mb-1">Snapshot history</h2>
    <p className="text-sm text-muted-foreground max-w-xs">
      Historical AI reviews across all portfolios with side-by-side comparison. Coming in Slice 2.
    </p>
  </div>
);

export default SnapshotsTab;
