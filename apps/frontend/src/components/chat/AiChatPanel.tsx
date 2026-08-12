import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Maximize2, Sparkles, X } from 'lucide-react';
import { useChatSession } from '@/hooks/useChatSession';
import type { ContextItem } from '@/api/chatApi';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

const CONTEXT_LABELS: Array<[string, string]> = [
  ['/journey', 'Journey'],
  ['/cashflow', 'Cashflow'],
  ['/assets', 'Assets'],
  ['/investment', 'Investment'],
  ['/settings', 'Settings'],
  ['/chat', 'Chat'],
];

function getContextLabel(pathname: string): string {
  const match = CONTEXT_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'Finance';
}

function formatSignedAmount(amountIdr: number, flow: ContextItem['flow']): string {
  const formatted = formatCurrency(amountIdr).replace('Rp', '').trim();
  return flow === 'DB' ? `-${formatted}` : `+${formatted}`;
}

// Fallback only — shown when the LLM suggestion call fails, times out, or the
// answer was unconfident. Each one is a complete question: /ask is stateless, so
// a fragment like "Rinci per minggu" reaches the planner with no antecedent.
const FALLBACK_CHIPS = [
  'Bandingkan pengeluaran bulan ini vs bulan lalu',
  'Rincikan pengeluaran bulan ini per minggu',
  'Kategori apa yang paling boros bulan ini?',
];

const EXAMPLE_QUESTIONS = [
  'Berapa total pengeluaran bulan ini?',
  'Kategori apa yang paling boros?',
  'Transaksi terbesar minggu ini?',
  'Berapa rata-rata pengeluaran harian?',
  'Pemasukan vs pengeluaran bulan ini gimana?',
  'Belanja makanan habis berapa bulan ini?',
  'Ada transaksi yang janggal nggak?',
  'Bandingkan pengeluaran bulan ini vs bulan lalu',
  'Berapa sisa saldo yang aman buat dipakai?',
  'Merchant mana yang paling sering muncul?',
];

function pickRandomQuestions(count: number): string[] {
  const shuffled = [...EXAMPLE_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const CitationCard = ({ contexts }: { contexts: ContextItem[] }) => {
  if (contexts.length === 0) return null;
  return (
    <div className="mt-2 border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 bg-secondary/60 border-b border-border">
        Sumber · {contexts.length} transaksi
      </div>
      {contexts.map((c) => (
        <div
          key={c.transaction_id}
          className="flex items-baseline gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-xs"
        >
          <span className="text-muted-foreground/60 text-[10px] w-12 flex-shrink-0">{c.date}</span>
          <span className="flex-1 min-w-0 truncate font-mono text-foreground/80">{c.description}</span>
          <span
            className={cn(
              'font-medium tabular-nums flex-shrink-0',
              c.flow === 'DB' ? 'text-expense' : 'text-income'
            )}
          >
            {formatSignedAmount(c.amount_idr, c.flow)}
          </span>
        </div>
      ))}
    </div>
  );
};

interface AiChatPanelProps {
  onClose: () => void;
}

const AiChatPanel = ({ onClose }: AiChatPanelProps) => {
  const { messages, input, setInput, streaming, send, stop } = useChatSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contextLabel = getContextLabel(pathname);
  const [exampleQuestions] = useState(() => pickRandomQuestions(3));

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastMessage = messages[messages.length - 1];
  const answered = !streaming && lastMessage?.role === 'assistant' && lastMessage.content !== '';
  // undefined = suggestions still in flight; render nothing rather than flashing
  // the fallback and swapping it out a moment later.
  const chips = !answered
    ? null
    : lastMessage.followUps === undefined
      ? null
      : lastMessage.followUps.length > 0
        ? lastMessage.followUps
        : FALLBACK_CHIPS;

  return (
    <div
      className="w-[420px] flex-shrink-0 flex flex-col h-full bg-card border-l border-border motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      style={{ boxShadow: '-14px 0 32px rgba(0,0,0,0.07)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground leading-tight">Ask your finances</div>
          <div className="text-[10px] text-muted-foreground/70">Gemini 3.1 Pro · konteks: {contextLabel}</div>
        </div>
        <span
          title="Baru bisa menjawab pertanyaan seputar data transaksi"
          className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5 flex-shrink-0"
        >
          Beta · Transaksi
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground border border-border border-b-2 rounded px-1.5 py-0.5 bg-secondary/60">
            Ctrl + I
          </span>
          <button
            onClick={() => navigate('/chat')}
            title="Buka full-page"
            aria-label="Buka full-page"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Tutup (Ctrl+I)"
            aria-label="Tutup panel"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-[13px] text-muted-foreground">
              Tanyakan tentang pengeluaran, tabungan, atau investasimu.
              <br />
              <span className="text-[11px] text-muted-foreground/60">
                Saat ini hanya menjawab dari data transaksi.
              </span>
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 px-2">
              {exampleQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => setInput(question)}
                  className="text-[11px] text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:text-foreground hover:border-foreground/25 transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          if (m.role === 'user') {
            return (
              <div
                key={i}
                className="self-end max-w-[85%] bg-secondary rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] text-foreground"
              >
                {m.content}
              </div>
            );
          }
          return (
            <div key={i} className="self-start max-w-[95%] text-[13px] leading-relaxed text-foreground/90">
              {m.content}
              {streaming && isLast && (
                <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-middle" />
              )}
              {!streaming && <CitationCard contexts={m.contexts ?? []} />}
            </div>
          );
        })}
        {chips && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="text-[11px] text-left text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:text-foreground hover:border-foreground/25 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3.5 border-t border-border flex gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !streaming) send();
          }}
          placeholder={`Tanya soal ${contextLabel.toLowerCase()}…`}
          disabled={streaming}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-lg px-3.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/25 disabled:opacity-60"
        />
        {streaming ? (
          <button
            onClick={stop}
            className="bg-foreground text-background rounded-lg px-3.5 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => send()}
            disabled={!input.trim()}
            className="bg-foreground text-background rounded-lg px-3.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Kirim
          </button>
        )}
      </div>
    </div>
  );
};

export default AiChatPanel;
