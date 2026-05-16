import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSetup, runReview } from '@/api/investmentApi';
import { ARCHETYPES } from '@/data/archetypes';

const InvestmentSetupDetail = () => {
  const { setupId } = useParams<{ setupId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [label, setLabel] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['investment', 'setup', setupId],
    queryFn: () => getSetup(setupId!),
    enabled: !!setupId,
  });

  const reviewMutation = useMutation({
    mutationFn: () => runReview(setupId!, {
      label: label || `Review ${new Date().toLocaleDateString()}`,
      totalValue: totalValue ? parseFloat(totalValue) : undefined,
      currency: data?.setup.baseCurrency ?? 'IDR',
    }),
    onSuccess: snapshot => {
      qc.invalidateQueries({ queryKey: ['investment', 'setup', setupId] });
      navigate(`/investment/${setupId}/review/${snapshot.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Setup not found.</div>;

  const arch = ARCHETYPES.find(a => a.id === data.setup.archetypeId);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/investment')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5 flex-1">
            <span className="text-2xl">{arch?.glyph ?? '📊'}</span>
            <div>
              <h1 className="text-base font-semibold">{data.setup.name}</h1>
              <p className="text-xs text-muted-foreground">{arch?.label ?? data.setup.archetypeId} · {data.setup.baseCurrency}</p>
            </div>
          </div>
        </div>

        {/* Holdings table */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Holdings ({data.holdings.length})</div>
          {data.holdings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No holdings saved.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5 border-b">
                  <tr>
                    {['Name', 'Ticker', 'Asset class', 'Allocation'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map(h => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{h.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{h.ticker ?? '—'}</td>
                      <td className="px-3 py-2">{h.assetClass}</td>
                      <td className="px-3 py-2 font-mono">{h.allocationPct != null ? `${h.allocationPct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Run review */}
        <div className="border rounded-lg p-4 space-y-4">
          <div className="text-sm font-medium">Run new review</div>
          <div className="space-y-1.5">
            <Label htmlFor="rl">Snapshot label</Label>
            <Input id="rl" value={label} onChange={e => setLabel(e.target.value)}
              placeholder={`Review ${new Date().toLocaleDateString()}`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tv">Total value ({data.setup.baseCurrency}) <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="tv" type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} placeholder="e.g. 100000000" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
            {reviewMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Play className="w-4 h-4 mr-1.5" />}
            {reviewMutation.isPending ? 'Running AI review…' : 'Run portfolio review'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InvestmentSetupDetail;
