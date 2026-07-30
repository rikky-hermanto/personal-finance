import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeskState, MandateParams } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';
import { useApproveMandate, useDeskMandateVersions, useSaveMandateDraft } from '@/hooks/useDeskState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

const FIELDS: { key: keyof MandateParams; label: string; suffix?: string }[] = [
  { key: 'activeTradingNav', label: 'Active Trading NAV', suffix: 'IDR' },
  { key: 'riskPerTradePct', label: 'Risk per trade', suffix: '%' },
  { key: 'hardCeilingPct', label: 'Hard risk ceiling', suffix: '%' },
  { key: 'dailyLossLimitPct', label: 'Daily loss limit', suffix: '%' },
  { key: 'weeklyLossLimitPct', label: 'Weekly loss limit', suffix: '%' },
  { key: 'monthlyLossLimitPct', label: 'Monthly loss limit', suffix: '%' },
  { key: 'hardHeatPct', label: 'Hard portfolio heat', suffix: '%' },
  { key: 'maxSingleStockPct', label: 'Max single-symbol exposure', suffix: '%' },
  { key: 'minRR', label: 'Minimum reward:risk', suffix: 'R' },
  { key: 'consecutiveLossStop', label: 'Consecutive-loss breaker' },
];

const MandateTab = () => {
  const state = useOutletContext<DeskState>();
  const { data: versions = state.mandateVersions } = useDeskMandateVersions();
  const saveDraft = useSaveMandateDraft();
  const approveMandate = useApproveMandate();

  const latest = versions[0] ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MandateParams>(latest?.params ?? ({} as MandateParams));
  const [changeReason, setChangeReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const startDraft = () => {
    setDraft(latest?.params ?? draft);
    setEditing(true);
  };

  const submitDraft = () => {
    saveDraft.mutate(
      { params: draft, preset: latest?.preset ?? null, changeReason },
      { onSuccess: () => { setEditing(false); setChangeReason(''); } }
    );
  };

  const submitApproval = (versionId: string) => {
    approveMandate.mutate(
      { versionId, changeReason, reviewed },
      { onSuccess: () => { setApprovingId(null); setChangeReason(''); setReviewed(false); } }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">
          {editing ? 'New draft' : latest ? `Version ${latest.version} — ${latest.status}` : 'No mandate yet'}
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={startDraft}>
            {latest ? 'Edit (creates new draft)' : 'Create mandate'}
          </Button>
        )}
      </div>

      {(editing || latest) && (
        <div className="rounded-lg border border-border p-4 grid grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <div key={String(f.key)} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              {editing ? (
                <Input
                  type="number"
                  value={String(draft[f.key] ?? '')}
                  onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                  className="h-8 text-xs"
                />
              ) : (
                <div className="font-mono tabular-nums text-sm">
                  {f.suffix === 'IDR' ? fmtIDR(latest!.params[f.key] as number) : `${latest!.params[f.key]}${f.suffix ?? ''}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Change reason</Label>
            <Textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="text-xs" rows={2} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={submitDraft} disabled={saveDraft.isPending || !changeReason.trim()}>
              Save draft
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Version history</div>
        <div className="space-y-2">
          {versions.map((v, i) => {
            const prev = versions[i + 1];
            const diffKeys = prev ? FIELDS.filter(f => v.params[f.key] !== prev.params[f.key]) : [];
            return (
              <div key={v.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{v.version} — {v.status}{v.preset ? ` — ${v.preset}` : ''}</span>
                  {v.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => setApprovingId(approvingId === v.id ? null : v.id)}>
                      Approve
                    </Button>
                  )}
                </div>
                {v.changeReason && <p className="text-muted-foreground mt-1">{v.changeReason}</p>}
                {diffKeys.length > 0 && (
                  <div className="mt-1.5 text-muted-foreground">
                    Changed: {diffKeys.map(f => f.label).join(', ')}
                  </div>
                )}
                {approvingId === v.id && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Textarea
                      placeholder="Why is this version being approved?"
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox id={`reviewed-${v.id}`} checked={reviewed} onCheckedChange={(c) => setReviewed(c === true)} />
                      <Label htmlFor={`reviewed-${v.id}`} className="text-xs">I have reviewed this mandate version</Label>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => submitApproval(v.id)}
                      disabled={!changeReason.trim() || !reviewed || approveMandate.isPending}
                    >
                      Confirm approval
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MandateTab;
