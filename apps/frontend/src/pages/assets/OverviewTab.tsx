import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { NetWorthHeadline } from '@/components/assets/NetWorthHeadline';
import { NetWorthTrendChart } from '@/components/assets/NetWorthTrendChart';
import { AllocationDonut } from '@/components/assets/AllocationDonut';
import { getNetWorthCurrent, getNetWorthHistory, getAllocationByClass } from '@/api/netWorthApi';
import { getAssets, getHoldings, bulkAddValuations, BulkValuationResult } from '@/api/assetsApi';
import { getAccounts } from '@/api/accountsApi';
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

export default function OverviewTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' });
  const queryClient = useQueryClient();

  const { data: current } = useQuery({ queryKey: ['networth-current'], queryFn: getNetWorthCurrent });
  const { data: history = [] } = useQuery({ queryKey: ['networth-history'], queryFn: () => getNetWorthHistory() });
  const { data: allocation = {} } = useQuery({ queryKey: ['networth-allocation'], queryFn: getAllocationByClass });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: getAssets });
  const { data: holdings = [] } = useQuery({ queryKey: ['holdings'], queryFn: getHoldings });

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

    setImportState({ phase: 'done', result, parseErrors });
  }

  function closeModal() {
    setImportState({ phase: 'idle' });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Header row with export/import */}
      <div className="flex items-center justify-between">
        <NetWorthHeadline totalIdr={current?.netWorthIdr ?? 0} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md text-foreground hover:bg-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1 lg:col-span-2">
          <NetWorthTrendChart data={history} />
        </div>
        <div className="col-span-1">
          <AllocationDonut data={allocation} />
        </div>
      </div>

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
