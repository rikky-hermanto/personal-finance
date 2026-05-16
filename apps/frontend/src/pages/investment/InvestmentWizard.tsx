import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ARCHETYPES, Archetype } from '@/data/archetypes';
import { createSetup, upsertHoldings, runReview } from '@/api/investmentApi';

type Step = 1 | 2 | 3;

interface HoldingRow {
  name: string;
  ticker: string;
  assetClass: string;
  allocationPct: string;
}

const ASSET_CLASSES = ['equity', 'bond', 'crypto', 'forex', 'commodity', 'property', 'cash', 'other'];
const CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR', 'JPY', 'AUD', 'GBP'];

const emptyRow = (): HoldingRow => ({ name: '', ticker: '', assetClass: 'equity', allocationPct: '' });

const ScoreBar = ({ value, max = 5, color }: { value: number; max?: number; color: string }) => (
  <div className="flex gap-0.5">
    {Array.from({ length: max }).map((_, i) => (
      <div key={i} className={cn('h-1.5 w-4 rounded-sm', i < value ? '' : 'opacity-20')}
        style={{ background: i < value ? color : '#888' }} />
    ))}
  </div>
);

const ArchetypeDetail = ({ arch }: { arch: Archetype }) => (
  <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: `${arch.color}30`, background: `${arch.color}08` }}>
    <div className="flex items-start gap-3 mb-3">
      <span className="text-2xl">{arch.glyph}</span>
      <div>
        <div className="font-semibold text-sm" style={{ color: arch.color }}>{arch.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 italic">{arch.tagline}</div>
      </div>
    </div>
    <p className="text-xs text-muted-foreground mb-3">{arch.thesis}</p>
    <div className="grid grid-cols-2 gap-3 mb-3">
      {[
        { label: 'Risk', value: arch.risk },
        { label: 'Return', value: arch.returnScore },
      ].map(({ label, value }) => (
        <div key={label}>
          <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
          <ScoreBar value={value} color={arch.color} />
        </div>
      ))}
      {[
        { label: 'Time Horizon', value: arch.timeHorizon },
        { label: 'Max Drawdown', value: arch.maxDD },
        { label: 'Target Return', value: arch.targetReturn },
        { label: 'Max Positions', value: `${arch.maxPositions}` },
      ].map(({ label, value }) => (
        <div key={label}>
          <div className="text-[10px] text-muted-foreground">{label}</div>
          <div className="text-xs font-medium">{value}</div>
        </div>
      ))}
    </div>
    <div className="flex flex-wrap gap-1 mb-2">
      {arch.primaryTags.map(t => (
        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{ background: `${arch.color}20`, color: arch.color }}>
          {t}
        </span>
      ))}
    </div>
    <p className="text-[10px] text-muted-foreground">{arch.idxContext}</p>
  </div>
);

const InvestmentWizard = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('IDR');
  const [archetypeId, setArchetypeId] = useState('');
  const [holdings, setHoldings] = useState<HoldingRow[]>([emptyRow()]);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [error, setError] = useState('');

  const totalAlloc = holdings.reduce((s, h) => s + (parseFloat(h.allocationPct) || 0), 0);
  const selectedArch = ARCHETYPES.find(a => a.id === archetypeId);

  const runMutation = useMutation({
    mutationFn: async () => {
      const setup = await createSetup({ name, archetypeId, baseCurrency });
      await upsertHoldings(setup.id, {
        holdings: holdings.filter(h => h.name).map(h => ({
          name: h.name,
          ticker: h.ticker || undefined,
          assetClass: h.assetClass,
          allocationPct: h.allocationPct ? parseFloat(h.allocationPct) : undefined,
        })),
      });
      const snapshot = await runReview(setup.id, {
        label: snapshotLabel || 'Initial review',
        totalValue: totalValue ? parseFloat(totalValue) : undefined,
        currency: baseCurrency,
      });
      return { setupId: setup.id, snapshotId: snapshot.id };
    },
    onSuccess: ({ setupId, snapshotId }) => {
      qc.invalidateQueries({ queryKey: ['investment', 'setups'] });
      navigate(`/investment/${setupId}/review/${snapshotId}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const addRow = () => setHoldings(h => [...h, emptyRow()]);
  const removeRow = (i: number) => setHoldings(h => h.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof HoldingRow, value: string) =>
    setHoldings(h => h.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const canNext1 = name.trim() && archetypeId;
  const canNext2 = holdings.some(h => h.name.trim());

  const steps = ['Identity', 'Holdings', 'Review & Run'];

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/investment')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">New Portfolio Setup</h1>
            <p className="text-xs text-muted-foreground">Step {step} of 3 — {steps[step - 1]}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors',
              i + 1 < step ? 'bg-foreground' : i + 1 === step ? 'bg-foreground/50' : 'bg-foreground/10')} />
          ))}
        </div>

        {/* Step 1 — Identity */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="name">Portfolio name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. My Long-Term Portfolio" />
            </div>
            <div className="space-y-1.5">
              <Label>Base currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Investor archetype</Label>
              <div className="grid grid-cols-2 gap-2">
                {ARCHETYPES.map(arch => (
                  <button key={arch.id}
                    onClick={() => setArchetypeId(arch.id)}
                    className={cn(
                      'text-left p-3 rounded-lg border transition-all',
                      archetypeId === arch.id
                        ? 'border-foreground/40 bg-foreground/5'
                        : 'border-border hover:border-foreground/20'
                    )}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{arch.glyph}</span>
                      <div>
                        <div className="text-xs font-medium leading-tight">{arch.label}</div>
                        <div className="text-[10px] text-muted-foreground">{arch.tagline}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {selectedArch && <ArchetypeDetail arch={selectedArch} />}
            </div>
          </div>
        )}

        {/* Step 2 — Holdings */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Holdings</div>
                <div className="text-xs text-muted-foreground">Enter each position manually</div>
              </div>
              <div className={cn('text-xs font-mono px-2 py-0.5 rounded',
                Math.abs(totalAlloc - 100) < 0.1
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-foreground/5 text-muted-foreground')}>
                {totalAlloc.toFixed(1)}% / 100%
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5 border-b">
                  <tr>
                    {['Name', 'Ticker', 'Asset class', 'Alloc %', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1">
                        <Input className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                          value={row.name} onChange={e => updateRow(i, 'name', e.target.value)}
                          placeholder="e.g. Bank Central Asia" />
                      </td>
                      <td className="px-2 py-1 w-20">
                        <Input className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                          value={row.ticker} onChange={e => updateRow(i, 'ticker', e.target.value.toUpperCase())}
                          placeholder="BBCA" />
                      </td>
                      <td className="px-2 py-1 w-32">
                        <Select value={row.assetClass} onValueChange={v => updateRow(i, 'assetClass', v)}>
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSET_CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1 w-20">
                        <Input className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 text-right"
                          value={row.allocationPct} onChange={e => updateRow(i, 'allocationPct', e.target.value)}
                          placeholder="40" type="number" min={0} max={100} />
                      </td>
                      <td className="px-2 py-1 w-8">
                        {holdings.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"
                            onClick={() => removeRow(i)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add position
            </Button>
          </div>
        )}

        {/* Step 3 — Review & Run */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="p-4 rounded-lg border bg-foreground/2 space-y-2">
              <div className="text-sm font-medium">Summary</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div><span className="font-medium text-foreground">{name}</span> · {baseCurrency}</div>
                <div>Archetype: {selectedArch?.label ?? archetypeId}</div>
                <div>{holdings.filter(h => h.name).length} positions · {totalAlloc.toFixed(1)}% allocated</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label">Snapshot label</Label>
              <Input id="label" value={snapshotLabel} onChange={e => setSnapshotLabel(e.target.value)}
                placeholder={`${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()} review`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totalValue">Total portfolio value ({baseCurrency}) <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="totalValue" type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)}
                placeholder="e.g. 100000000" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {runMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running AI portfolio review… this may take up to 60 seconds
              </div>
            )}
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep((step - 1) as Step) : navigate('/investment')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 3 ? (
            <Button size="sm"
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              onClick={() => setStep((step + 1) as Step)}>
              Continue
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Run portfolio review
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvestmentWizard;
