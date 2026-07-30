/* ── AI Chat slide-over panel (Opsi A) — toggled with Ctrl+I ── */
const cnc = (...a) => a.filter(Boolean).join(' ');
const CD = window.PF;

const CHAT_CITATIONS = [
  { d: '09 Mar', n: 'KARTU DEBIT GRANDLUCKY SUPERMARKET', a: '−193.600' },
  { d: '14 Mar', n: 'WSS Batu Bulan 55 — Transfer', a: '−48.950' },
  { d: '21 Mar', n: 'GOFOOD JAKARTA — MERCHANT PAYMENT', a: '−86.000' },
];

function ChatCitations() {
  return (
    <div className="mt-2 border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 bg-secondary/60 border-b border-border">
        Sumber · 3 transaksi teratas
      </div>
      {CHAT_CITATIONS.map((c) => (
        <div key={c.n} className="flex items-baseline gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-xs">
          <span className="text-muted-foreground/60 text-[10px] w-12 flex-shrink-0">{c.d}</span>
          <span className="flex-1 min-w-0 truncate font-mono text-foreground/80">{c.n}</span>
          <span className="text-expense font-medium tabular-nums flex-shrink-0">{c.a}</span>
        </div>
      ))}
    </div>
  );
}

function AiChatPanel({ open, onClose, route }) {
  const [messages, setMessages] = React.useState([
    { role: 'user', content: 'berapa pengeluaran makan bulan maret 2025?' },
    { role: 'assistant', content: 'Total pengeluaran kategori makan di Maret 2025 adalah Rp 1.842.500 dari 23 transaksi — turun 12% dibanding Februari.', cite: true },
  ]);
  const [input, setInput] = React.useState('');
  const bottomRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) inputRef.current && inputRef.current.focus();
  }, [open]);
  React.useEffect(() => {
    if (bottomRef.current) {
      const sc = bottomRef.current.parentElement;
      if (sc) sc.scrollTop = sc.scrollHeight;
    }
  }, [messages, open]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: 'user', content: q },
      { role: 'assistant', content: 'Ini jawaban contoh — di aplikasi asli, respons di-stream dari /ask beserta sumber transaksinya.' }]);
    setInput('');
  };

  if (!open) return null;
  const context = route.startsWith('/journey') ? 'Journey' : 'Cashflow';

  return (
    <div className="w-[420px] flex-shrink-0 flex flex-col h-full bg-card border-l border-border overflow-hidden"
      style={{ boxShadow: '-14px 0 32px rgba(0,0,0,0.07)' }}>
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center flex-shrink-0">
          <Icon name="Sparkles" size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground leading-tight">Ask your finances</div>
          <div className="text-[10px] text-muted-foreground/70">Gemini 3.1 Pro · konteks: {context}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground border border-border border-b-2 rounded px-1.5 py-0.5 bg-secondary/60">Ctrl + I</span>
          <button title="Buka full-page" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Icon name="Maximize2" size={13} />
          </button>
          <button onClick={onClose} title="Tutup (Ctrl+I)" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Icon name="X" size={14} />
          </button>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[85%] bg-secondary rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] text-foreground">{m.content}</div>
          ) : (
            <div key={i} className="self-start max-w-[95%] text-[13px] leading-relaxed text-foreground/90">
              {m.content}
              {m.cite && <ChatCitations />}
            </div>
          )
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {['Bandingkan vs Feb', 'Rinci per minggu', 'Kategori terbesar?'].map((c) => (
            <button key={c} onClick={() => setInput(c)}
              className="text-[11px] text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:text-foreground hover:border-foreground/25 transition-colors">
              {c}
            </button>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="px-4 py-3.5 border-t border-border flex gap-2 flex-shrink-0">
        <input ref={inputRef} value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={`Tanya soal ${context.toLowerCase()}…`}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-lg px-3.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/25" />
        <button onClick={send} className="bg-foreground text-background rounded-lg px-3.5 text-xs font-medium hover:opacity-90 transition-opacity">Kirim</button>
      </div>
    </div>
  );
}

Object.assign(window, { AiChatPanel });
