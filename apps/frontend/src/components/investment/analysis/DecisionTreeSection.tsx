import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TreeNode {
  condition: string;
  true_action: string;
  false_action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  child_nodes?: TreeNode[];
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'text-red-600 bg-red-500/10',
  MEDIUM: 'text-amber-600 bg-amber-500/10',
  LOW: 'text-muted-foreground bg-foreground/5',
};

const NodeCard = ({ node, depth = 0 }: { node: TreeNode; depth?: number }) => (
  <div className={cn('border rounded-lg p-3 space-y-2', depth > 0 && 'ml-4 mt-2')}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium">IF {node.condition}</p>
      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0', PRIORITY_COLOR[node.priority])}>
        {node.priority}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
        <div className="text-[10px] text-emerald-600 font-medium mb-0.5">THEN</div>
        <p className="text-[11px]">{node.true_action}</p>
      </div>
      <div className="p-2 rounded bg-foreground/3 border border-foreground/10">
        <div className="text-[10px] text-muted-foreground font-medium mb-0.5">ELSE</div>
        <p className="text-[11px]">{node.false_action}</p>
      </div>
    </div>
    {node.child_nodes?.map((child, i) => <NodeCard key={i} node={child} depth={depth + 1} />)}
  </div>
);

const DecisionTreeSection = ({ data }: { data: { nodes: TreeNode[] } }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">6 — Decision Tree</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {data.nodes?.map((node, i) => <NodeCard key={i} node={node} />)}
      </div>
    </CardContent>
  </Card>
);

export default DecisionTreeSection;
