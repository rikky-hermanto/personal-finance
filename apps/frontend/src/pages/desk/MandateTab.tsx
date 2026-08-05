import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeskState, MandateParams } from '@/types/desk';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';
import { useApproveMandate, useDeskMandateVersions, useMandatePresets, useSaveMandateDraft } from '@/hooks/useDeskState';
import MandatePresetPicker from '@/components/desk/MandatePresetPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

// Every label carries its plain-language meaning inline. Desk jargon (NAV, heat, ceiling) is
// unavoidable in a risk tool, but a user should be able to read their own screen without a glossary.
const FIELDS: { key: keyof MandateParams; label: string; hint: string; suffix?: string }[] = [
  { key: 'activeTradingNav', label: 'Active Trading NAV', hint: 'The capital this plan is sized against — not your whole portfolio', suffix: 'IDR' },
  { key: 'riskPerTradePct', label: 'Risk per trade', hint: 'Most you may lose on one trade if the stop is hit', suffix: '%' },
  { key: 'hardCeilingPct', label: 'Hard risk ceiling', hint: 'Absolute per-trade cap — no override above this', suffix: '%' },
  { key: 'dailyLossLimitPct', label: 'Daily loss limit', hint: 'Trading stops for the day once losses reach this', suffix: '%' },
  { key: 'weeklyLossLimitPct', label: 'Weekly loss limit', hint: 'Same idea, measured over the ISO week', suffix: '%' },
  { key: 'monthlyLossLimitPct', label: 'Monthly loss limit', hint: 'Same idea, measured over the calendar month', suffix: '%' },
  { key: 'hardHeatPct', label: 'Hard portfolio heat', hint: 'Total risk across every open position at once', suffix: '%' },
  { key: 'maxSingleStockPct', label: 'Max single-symbol exposure', hint: 'Largest share of capital one ticker may hold', suffix: '%' },
  { key: 'minRR', label: 'Minimum reward:risk', hint: 'Target must be at least this many times the risk', suffix: 'R' },
  { key: 'consecutiveLossStop', label: 'Consecutive-loss breaker', hint: 'Losses in a row that pause trading until you review' },
];

const MandateTab = () => {
  const state = useOutletContext<DeskState>();
  const { data: versions = state.mandateVersions } = useDeskMandateVersions();
  const saveDraft = useSaveMandateDraft();
  const approveMandate = useApproveMandate();

  const { data: presets = [] } = useMandatePresets();

  const latest = versions[0] ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MandateParams>(latest?.params ?? ({} as MandateParams));
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [pickingPreset, setPickingPreset] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Shown on first-run automatically (nothing to edit yet), or as an opt-in toggle from an
  // already-open draft ("Browse presets") — never as the default landing screen for an edit,
  // since most edits are a field tweak, not a tier switch.
  const showPicker = presets.length > 0 && (pickingPreset || (!latest && !editing));

  const startDraft = () => {
    setDraft(latest?.params ?? draft);
    setPresetKey(latest?.preset ?? null);
    setPickingPreset(false);
    setEditing(true);
  };

  const choosePreset = (params: MandateParams, key: string) => {
    setDraft(params);
    setPresetKey(key);
    setChangeReason(`Started from the ${params.preset} preset.`);
    setPickingPreset(false);
    setEditing(true);
  };

  const submitDraft = () => {
    saveDraft.mutate(
      { params: draft, preset: presetKey ?? latest?.preset ?? null, changeReason },
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
      {showPicker ? (
        <MandatePresetPicker
          presets={presets}
          onSelect={choosePreset}
          onCustom={editing ? undefined : startDraft}
          onCancel={editing ? () => setPickingPreset(false) : undefined}
          currentPresetKey={editing ? presetKey : null}
        />
      ) : (
      <>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">
          {editing ? 'New draft' : latest ? `Version ${latest.version} — ${latest.status}` : 'No mandate yet'}
        </div>
        <div className="flex gap-2">
          {editing && presets.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setPickingPreset(true)}>
              Browse presets
            </Button>
          )}
          {!editing && (
            <Button size="sm" variant="outline" onClick={startDraft}>
              {latest ? 'Edit (creates new draft)' : 'Create mandate'}
            </Button>
          )}
        </div>
      </div>

      {(editing || latest) && (
        <div className="rounded-lg border border-border p-4 grid grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <div key={String(f.key)} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <p className="text-[11px] leading-tight text-muted-foreground/80">{f.hint}</p>
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
      </>
      )}
    </div>
  );
};

export default MandateTab;
