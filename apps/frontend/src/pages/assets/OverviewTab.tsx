import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { NetWorthQuiet } from '@/components/assets/zen/NetWorthQuiet';
import { OwnOweLedger, LedgerFocus } from '@/components/assets/zen/OwnOweLedger';
import { NetWorthHorizon } from '@/components/assets/zen/NetWorthHorizon';
import { ZenPill, ZenSegment } from '@/components/assets/zen/ZenPill';
import { AddValuationDialog } from '@/components/assets/AddValuationDialog';
import { getNetWorthCurrent, getNetWorthHistory } from '@/api/netWorthApi';
import { getAssets, getHoldings, bulkAddValuations, BulkValuationResult } from '@/api/assetsApi';
import { getAccounts } from '@/api/accountsApi';
import { getLiabilities } from '@/api/liabilitiesApi';
import { useAccounts } from '@/hooks/use-accounts';
import { useValuationHistories } from '@/hooks/use-valuation-histories';
import { todayIso } from '@/lib/accounts';
import {
  LedgerRow,
  buildOweRows,
  buildOwnRows,
  debtRatio,
  monthDelta,
  monthlySeries,
  ownOweSentence,
  projectMilestone,
  shortDate,
} from '@/lib/netWorth';
import { cn } from '@/lib/utils';
import { Asset } from '@/types/Asset';
import {
  buildTemplateRows,
  rowsToCsv,
  downloadCsv,
  parseCsv,
  ParsedValuationRow,
} from '@/utils/assetsCsv';

// ── Import state machine ─────────────────────────────────────────────────────

type ImportState =
  | { phase: 'idle' }
  | { phase: 'preview'; rows: ParsedValuationRow[]; errors: string[]; skippedEmpty: number; filename: string }
  | { phase: 'importing' }
  | { phase: 'done'; result: BulkValuationResult; parseErrors: string[] };

// ── Component ────────────────────────────────────────────────────────────────

type View = 'overview' | 'ledger' | 'horizon';

// Zen Net Worth page (docs/ideas/prototypes/networth_zen/README.md): three views of one page,
// switched by the bottom pill. Tabs, sidebar and activity rail are hidden on this route.
export default function OverviewTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('overview');
  const [focus, setFocus] = useState<LedgerFocus>('owned');
  const [switched, setSwitched] = useState(false);
  const [valuationTarget, setValuationTarget] = useState<Asset | null>(null);

  const currentQuery = useQuery({ queryKey: ['networth-current'], queryFn: getNetWorthCurrent });
  const current = currentQuery.data;
  const { data: history = [] } = useQuery({ queryKey: ['networth-history'], queryFn: () => getNetWorthHistory() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: getAssets });
  const { data: holdings = [] } = useQuery({ queryKey: ['holdings'], queryFn: getHoldings });
  const { data: liabilities = [] } = useQuery({ queryKey: ['liabilities'], queryFn: getLiabilities });
  const { accounts: accountViews } = useAccounts();
  const assetHistories = useValuationHistories('asset', assets.map(a => a.id));
  const holdingHistories = useValuationHistories('holding', holdings.map(h => h.id));

  const series = useMemo(() => monthlySeries(history), [history]);
  const delta = monthDelta(series);
  const projection = current ? projectMilestone(series, current.netWorthIdr) : null;

  const own = useMemo(() => buildOwnRows({
    accounts: accountViews,
    assets,
    holdings,
    assetValuations: new Map(assets.map(a => [a.id, assetHistories.byId.get(a.id)?.[0]])),
    holdingValues: new Map(holdings.map(h => [h.id, holdingHistories.byId.get(h.id)?.[0]?.valueIdr])),
  }), [accountViews, assets, holdings, assetHistories.byId, holdingHistories.byId]);
  const owe = useMemo(() => buildOweRows(liabilities, assets), [liabilities, assets]);

  const holdingSeries = useMemo(
    () => holdings.map(h => ({ ticker: h.ticker, history: holdingHistories.byId.get(h.id) ?? [] })),
    [holdings, holdingHistories.byId],
  );

  const lastPoint = series[series.length - 1];
  const asOfLabel = shortDate(lastPoint?.date ?? todayIso());

  // ── Export ───────────────────────────────────────────────────────────────

  function handleExportTemplate() {
    const rows = buildTemplateRows(accounts, assets, holdings);
    if (rows.length === 0) {
      alert('No accounts, assets, or holdings found. Add some first.');
      return;
    }
    const csv = rowsToCsv(rows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `assets-valuation-template-${date}.csv`);
  }

  // ── Import ───────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors, skippedEmpty } = parseCsv(text);
      setImportState({ phase: 'preview', rows, errors, skippedEmpty, filename: file.name });
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleConfirmImport() {
    if (importState.phase !== 'preview') return;
    const { rows, errors: parseErrors } = importState;
    setImportState({ phase: 'importing' });

    const valuations = rows.map(r => ({
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      valueNative: r.valueNative,
      currency: r.currency,
      fxRateToIdr: r.fxRateToIdr,
      valueIdr: r.valueIdr,
      source: 'manual' as const,
      valuedAt: r.valuedAt,
      notes: r.notes,
      name: r.name,
    }));

    const result = await bulkAddValuations(valuations);

    // Invalidate all asset-related queries so everything refreshes
    await queryClient.invalidateQueries({ queryKey: ['networth-current'] });
    await queryClient.invalidateQueries({ queryKey: ['networth-history'] });
    await queryClient.invalidateQueries({ queryKey: ['networth-allocation'] });
    await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    await queryClient.invalidateQueries({ queryKey: ['assets'] });
    await queryClient.invalidateQueries({ queryKey: ['holdings'] });
    await queryClient.invalidateQueries({ queryKey: ['account-valuations'] });
    await queryClient.invalidateQueries({ queryKey: ['asset-valuations'] });
    await queryClient.invalidateQueries({ queryKey: ['holding-valuations'] });

    setImportState({ phase: 'done', result, parseErrors });
  }

  function closeModal() {
    setImportState({ phase: 'idle' });
  }

  // ── Views ────────────────────────────────────────────────────────────────

  function selectSegment(segment: ZenSegment) {
    setSwitched(true);
    if (segment === 'overview' || segment === 'horizon') {
      setView(segment);
    } else {
      setFocus(segment);
      setView('ledger');
    }
  }

  function openRow(row: LedgerRow) {
    if (row.target.kind === 'asset') setValuationTarget(row.target.asset);
    else navigate(row.target.path);
  }

  async function onValuationSaved() {
    for (const key of ['networth-current', 'networth-history', 'networth-allocation', 'asset-valuations', 'assets']) {
      await queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const activeSegment: ZenSegment = view === 'ledger' ? focus : view;
  const animate = !switched;
  const ratio = current ? debtRatio(current.assetsIdr, current.liabilitiesIdr) : 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative flex min-h-full flex-col">
      {currentQuery.isLoading && (
        <p className="py-40 text-center text-sm text-zen-faint">Loading your net worth…</p>
      )}
      {currentQuery.isError && (
        <p className="py-40 text-center text-sm text-muted-foreground">Couldn’t load your net worth. Try again in a moment.</p>
      )}

      {current && (
        <div key={view} className={cn('flex flex-1 flex-col', switched && 'zen-fade')}>
          {view === 'overview' && (
            <NetWorthQuiet
              summary={current}
              series={series}
              delta={delta}
              asOfLabel={asOfLabel}
              debtRatio={ratio}
              sentence={ownOweSentence(ratio, owe.anchor)}
              animate={animate}
            />
          )}
          {view === 'ledger' && (
            <OwnOweLedger
              summary={current}
              delta={delta}
              own={own}
              owe={owe}
              focus={focus}
              onRowClick={openRow}
              animate={animate}
            />
          )}
          {view === 'horizon' && (
            <NetWorthHorizon
              netWorthIdr={current.netWorthIdr}
              series={series}
              projection={projection}
              holdings={holdingSeries}
              animate={animate}
            />
          )}
        </div>
      )}

      <ZenPill
        active={activeSegment}
        onSelect={selectSegment}
        onExport={handleExportTemplate}
        onImport={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {valuationTarget && (
        <AddValuationDialog
          subjectType="asset"
          subjectId={valuationTarget.id}
          subjectName={valuationTarget.name}
          currency={valuationTarget.currency}
          strategy={valuationTarget.valuationStrategy}
          onSuccess={onValuationSaved}
          onClose={() => setValuationTarget(null)}
        />
      )}

      {/* Import modal */}
      {importState.phase !== 'idle' && (
        <ImportModal
          state={importState}
          onConfirm={handleConfirmImport}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// ── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
  state,
  onConfirm,
  onClose,
}: {
  state: Exclude<ImportState, { phase: 'idle' }>;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-lg">
        {state.phase === 'preview' && (
          <PreviewPanel state={state} onConfirm={onConfirm} onClose={onClose} />
        )}
        {state.phase === 'importing' && (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm font-medium">Importing valuations…</p>
            <p className="text-xs text-muted-foreground">Please wait</p>
          </div>
        )}
        {state.phase === 'done' && (
          <DonePanel state={state} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function PreviewPanel({
  state,
  onConfirm,
  onClose,
}: {
  state: Extract<ImportState, { phase: 'preview' }>;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { rows, errors, skippedEmpty, filename } = state;
  const hasRows = rows.length > 0;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Import Valuations</h2>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{filename}</p>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <StatCell label="Rows to import" value={rows.length} accent={rows.length > 0 ? 'green' : undefined} />
        <StatCell label="Skipped (empty)" value={skippedEmpty} />
        <StatCell label="Parse errors" value={errors.length} accent={errors.length > 0 ? 'red' : undefined} />
      </div>

      {/* Row preview table */}
      {hasRows && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">CCY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">{r.name || r.subjectId}</td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono">{r.valuedAt}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {r.valueNative.toLocaleString('id-ID')}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Parse errors */}
      {errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 space-y-1 max-h-28 overflow-y-auto">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive flex gap-1.5 items-start">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              {e}
            </p>
          ))}
        </div>
      )}

      {!hasRows && errors.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No rows with values found. Fill in the <code>value_native</code> column and try again.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!hasRows}
          className="px-4 py-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors"
        >
          Import {rows.length} valuation{rows.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

function DonePanel({
  state,
  onClose,
}: {
  state: Extract<ImportState, { phase: 'done' }>;
  onClose: () => void;
}) {
  const { result, parseErrors } = state;
  const allOk = result.failed.length === 0 && parseErrors.length === 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        {allOk
          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
          : <XCircle className="w-5 h-5 text-destructive" />
        }
        <h2 className="text-sm font-semibold">
          {allOk ? 'Import complete' : 'Import finished with issues'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCell label="Succeeded" value={result.succeeded} accent={result.succeeded > 0 ? 'green' : undefined} />
        <StatCell label="Failed" value={result.failed.length} accent={result.failed.length > 0 ? 'red' : undefined} />
      </div>

      {result.failed.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 space-y-1 max-h-36 overflow-y-auto">
          {result.failed.map((f, i) => (
            <p key={i} className="text-xs text-destructive flex gap-1.5 items-start">
              <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span><span className="font-medium">{f.name}</span>: {f.error}</span>
            </p>
          ))}
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="bg-muted rounded-lg px-3 py-2 space-y-1 max-h-24 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1">Parse warnings (rows skipped before import)</p>
          {parseErrors.map((e, i) => (
            <p key={i} className="text-xs text-muted-foreground">{e}</p>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent?: 'green' | 'red' }) {
  const valueClass =
    accent === 'green' ? 'text-green-500' :
    accent === 'red' ? 'text-destructive' :
    'text-foreground';

  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-lg font-mono font-semibold mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  );
}
