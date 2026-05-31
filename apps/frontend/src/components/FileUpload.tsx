import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Eye, X, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/Transaction';
import TransactionPreview from './TransactionPreview';
import * as transactionsApi from '@/api/transactionsApi';

interface FileUploadProps {
  onFileUpload: (files: File[]) => void;
}

type WorkflowStep = 'upload' | 'review' | 'preview' | 'submitted';

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: 'upload',    label: 'Upload'  },
  { key: 'review',   label: 'Review'  },
  { key: 'preview',  label: 'Preview' },
  { key: 'submitted', label: 'Done'   },
];

const stepIndex = (s: WorkflowStep) => STEPS.findIndex(x => x.key === s);

const isImageFile = (f: File) => f.type.startsWith('image/');

const FileUpload = ({ onFileUpload }: FileUploadProps) => {
  const [isDragging, setIsDragging]           = useState(false);
  const [uploadedFiles, setUploadedFiles]     = useState<File[]>([]);
  const [currentStep, setCurrentStep]         = useState<WorkflowStep>('upload');
  const [parsedTransactions, setParsedTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing]       = useState(false);
  const [pdfPassword, setPdfPassword]         = useState('');
  const [bankHint, setBankHint]               = useState('');
  const [fileHash, setFileHash]               = useState<string | null>(null);
  const [apiError, setApiError]               = useState<string | null>(null);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

  useEffect(() => {
    return () => setApiError(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const validFiles = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'text/csv' || f.type === 'application/pdf' ||
      f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/webp' ||
      f.name.endsWith('.csv') || f.name.endsWith('.pdf')
    );
    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
      setApiError(null);
      setShowPasswordConfirmation(false);
      if (currentStep === 'upload') setCurrentStep('review');
    }
  }, [currentStep]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
      setApiError(null);
      setShowPasswordConfirmation(false);
      if (currentStep === 'upload') setCurrentStep('review');
    }
  }, [currentStep]);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setCurrentStep('upload');
      return next;
    });
    setApiError(null);
    setShowPasswordConfirmation(false);
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          const isValid = file.type === 'text/csv' ||
                         file.type === 'application/pdf' ||
                         file.type.startsWith('image/') ||
                         file.name.endsWith('.csv') ||
                         file.name.endsWith('.pdf');
          if (isValid) {
            if (file.type.startsWith('image/') && file.name === 'image.png') {
              const now = new Date().toISOString().replace(/[:.]/g, '-');
              files.push(new File([file], `pasted-image-${now}.png`, { type: file.type }));
            } else {
              files.push(file);
            }
          }
        }
      }
    }

    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
      setApiError(null);
      if (currentStep === 'upload') setCurrentStep('review');
    }
  }, [currentStep]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleProcessFiles = useCallback(async () => {
    const file = uploadedFiles[0];
    if (!file) return;

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    if (isPdf && !pdfPassword && !showPasswordConfirmation) {
      setShowPasswordConfirmation(true);
      return;
    }

    setIsProcessing(true);
    setApiError(null);
    try {
      const dateFormat = localStorage.getItem('pf_date_format') || undefined;
      const apiTransactions = await transactionsApi.uploadPreview(
        file,
        pdfPassword,
        bankHint || undefined,
        dateFormat
      );
      setFileHash(apiTransactions.hash);
      const transactions: Transaction[] = apiTransactions.transactions.map((t: transactionsApi.TransactionDto, idx: number) => {
        let mappedType: 'income' | 'expense' | 'transfer';
        const rawType = t.type.toLowerCase();
        if (rawType === 'income') {
          mappedType = 'income';
        } else if (rawType.includes('transfer') || rawType.includes('trar') || rawType === 'asset transfer') {
          mappedType = 'transfer';
        } else {
          mappedType = 'expense';
        }

        return {
          id:                 `${t.id}-${idx}`,
          date:               t.date,
          description:        t.description,
          flow:               t.flow,
          amount:             t.flow === 'CR' ? Number(t.amountIdr) : -Number(t.amountIdr),
          type:               mappedType,
          category:           t.category,
          bank:               t.accountName,
          accountId:          t.accountId ?? undefined,
          balance:            t.balance,
          statementBalance: t.statementBalance ?? null,
          isDuplicate:        t.isDuplicate,
        };
      });
      setParsedTransactions(transactions);
      setCurrentStep('preview');
    } catch (error: any) {
      let message = 'Error processing files.';
      try {
        const res: Response | undefined = error.response;
        const data = await res?.json?.();
        const msg = data?.message ?? data?.Message;
        if (msg) {
          message = msg;
          const detail = data?.detail ?? data?.Detail;
          if (detail) message += `: ${detail}`;
          if (res?.status === 503) message += ' You can try again in a moment.';
        }
      } catch {
        if (error instanceof Error && error.message) message = error.message;
      }
      setApiError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, pdfPassword, showPasswordConfirmation, bankHint]);

  const handleConfirmData = useCallback(() => {
    onFileUpload(uploadedFiles);
    setCurrentStep('submitted');
  }, [uploadedFiles, onFileUpload]);

  const handleStartOver = useCallback(() => {
    setUploadedFiles([]);
    setParsedTransactions([]);
    setFileHash(null);
    setApiError(null);
    setShowPasswordConfirmation(false);
    setCurrentStep('upload');
  }, []);

  // ── Step indicator ──────────────────────────────────────────────────────────
  const renderStepIndicator = () => {
    const current = stepIndex(currentStep);
    return (
      <div className="flex items-center justify-center gap-0 mb-10">
        {STEPS.map((step, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center border transition-colors',
                  done   && 'border-foreground/40 bg-transparent text-foreground/60',
                  active && 'border-foreground bg-foreground text-background',
                  !done && !active && 'border-border bg-transparent text-muted-foreground',
                )}>
                  {done
                    ? <CheckCircle className="w-3 h-3" strokeWidth={2} />
                    : <span className="text-[10px] font-semibold leading-none">{i + 1}</span>
                  }
                </div>
                <span className={cn(
                  'text-xs transition-colors',
                  active ? 'text-foreground font-medium' : done ? 'text-foreground/50' : 'text-muted-foreground/50',
                )}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'w-8 h-px mx-3 transition-colors',
                  i < current ? 'bg-foreground/20' : 'bg-border',
                )} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Preview step ────────────────────────────────────────────────────────────
  if (currentStep === 'preview') {
    return (
      <div className="w-full">
        {renderStepIndicator()}
        <TransactionPreview
          transactions={parsedTransactions}
          onConfirm={handleConfirmData}
          onBack={() => setCurrentStep('review')}
          fileHash={fileHash}
          fileName={uploadedFiles[0]?.name}
        />
      </div>
    );
  }

  // ── Submitted step ──────────────────────────────────────────────────────────
  if (currentStep === 'submitted') {
    return (
      <div className="max-w-md mx-auto px-6">
        {renderStepIndicator()}
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-5 h-5 text-success" strokeWidth={1.5} />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">Import complete</p>
          <p className="text-sm text-muted-foreground mb-6">
            {parsedTransactions.length} transaction{parsedTransactions.length !== 1 ? 's' : ''} imported and categorized.
          </p>
          <button
            onClick={handleStartOver}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Import more files
          </button>
        </div>
      </div>
    );
  }

  // ── Review step ─────────────────────────────────────────────────────────────
  if (currentStep === 'review') {
    return (
      <div className="max-w-lg mx-auto px-6">
        {renderStepIndicator()}

        <div className="mb-5">
          <p className="text-xs text-muted-foreground">
            Review files before processing. Only the first file will be parsed.
          </p>
        </div>

        {apiError && (
          <div className="mb-4 px-3 py-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {apiError}
          </div>
        )}

        <div className="space-y-2 mb-5">
          {uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-md">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown'}
                </p>
              </div>
              <button
                onClick={() => handleRemoveFile(index)}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>

        {uploadedFiles.some(f => f.name.toLowerCase().endsWith('.pdf')) && (
          <div className="mb-5">
            <input
              type="password"
              placeholder="PDF password (if protected)"
              value={pdfPassword}
              onChange={e => {
                setPdfPassword(e.target.value);
                if (showPasswordConfirmation) setShowPasswordConfirmation(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all",
                showPasswordConfirmation && "border-warning/50 ring-1 ring-warning/30 bg-warning/5"
              )}
            />
            {showPasswordConfirmation && (
              <p className="mt-1.5 text-[10px] text-warning/80 flex items-center gap-1">
                Confirm: This PDF does not require a password?
              </p>
            )}
          </div>
        )}

        {uploadedFiles.some(isImageFile) && (
          <div className="mb-5">
            <input
              type="text"
              placeholder="Bank name hint, e.g. jago, superbank (optional)"
              value={bankHint}
              onChange={e => setBankHint(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-4 pt-1">
          <button
            onClick={() => setCurrentStep('upload')}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Upload className="w-3 h-3" strokeWidth={1.5} />
            Add files
          </button>
          <button
            onClick={handleProcessFiles}
            disabled={isProcessing || uploadedFiles.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Eye className="w-3 h-3" strokeWidth={1.5} />
            {isProcessing ? 'Processing…' : showPasswordConfirmation ? 'No password, proceed' : `Process (${uploadedFiles.length})`}
          </button>
        </div>
      </div>
    );
  }

  // ── Upload step ─────────────────────────────────────────────────────────────
  if (currentStep === 'upload') {
    return (
      <div className="max-w-lg mx-auto px-6">
        {renderStepIndicator()}

        <div className="mb-5 text-center">
          <h2 className="text-base font-semibold text-foreground mb-1">Upload bank statements</h2>
          <p className="text-xs text-muted-foreground">
            CSV, PDF, or screenshot from BCA, NeoBank, Superbank, Wise, or Bank Jago
          </p>
        </div>

        <input
          type="file"
          multiple
          accept=".csv,.pdf,image/png,image/jpeg,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'block border border-dashed rounded-lg py-10 text-center transition-all duration-150 cursor-pointer',
            isDragging
              ? 'border-foreground/30 bg-muted/40'
              : 'border-border hover:border-foreground/20 hover:bg-muted/20',
          )}
        >
          <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-2.5" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-1">
            Drop files here, paste, or <span className="text-foreground font-medium">click to browse</span>
          </p>
          <p className="text-[11px] text-muted-foreground/50 tracking-wide">
            CSV · PDF · Screenshot &nbsp;·&nbsp; max 10 MB
          </p>
        </label>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">Supported:</span>
          {(['BCA', 'NeoBank', 'Superbank', 'Wise', 'Bank Jago'] as const).map(bank => (
            <span
              key={bank}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-[11px] text-muted-foreground"
            >
              {bank}
            </span>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={transactionsApi.downloadTransactionTemplate}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <FileDown className="w-3 h-3" strokeWidth={1.5} />
            Download Template
          </button>
        </div>
      </div>
    );
  }

};

export default FileUpload;
