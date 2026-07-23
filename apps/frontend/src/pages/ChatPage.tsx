import { useEffect, useRef } from "react";
import { useChatSession, type ChatMessage } from "@/hooks/useChatSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Honest source label: distinguishes cited evidence from merely-considered rows. */
function sourceLabel(m: ChatMessage): string {
  const shown = m.contexts?.length ?? 0;
  if (m.verified === false) return "Transaksi yang dipertimbangkan (tidak dikutip)";
  if (m.intent === "aggregate")
    return `Sumber transaksi (${m.count ?? shown} transaksi, ${shown} terbesar ditampilkan)`;
  return "Sumber transaksi";
}

const MessageSources = ({ m }: { m: ChatMessage }) => {
  const contexts = m.contexts ?? [];
  if (contexts.length === 0) return null;
  const considered = m.verified === false;
  return (
    <div className={cn("text-xs space-y-1 pl-1 mt-2", considered ? "opacity-60" : "")}>
      <p className={cn("font-medium", considered ? "text-muted-foreground" : "text-foreground/60")}>
        {sourceLabel(m)}
      </p>
      {contexts.map((c, i) => (
        <p key={c.transaction_id} className="text-muted-foreground">
          [{i + 1}] {c.date} · {c.description} ·{" "}
          <span className={c.flow === "DB" ? "text-destructive" : "text-green-600"}>
            {c.flow === "DB" ? "−" : "+"}Rp {c.amount_idr.toLocaleString("id-ID")}
          </span>
        </p>
      ))}
    </div>
  );
};

const ChatPage = () => {
  const { messages, input, setInput, streaming, send, stop } = useChatSession();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Chat with your finances</h1>
          <span
            title="Baru bisa menjawab pertanyaan seputar data transaksi"
            className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5"
          >
            Beta · Transaksi
          </span>
        </div>
        {streaming && (
          <button onClick={stop} className="text-xs text-muted-foreground hover:text-foreground">
            Stop
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="space-y-3 pr-2">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Tanyakan tentang pengeluaran, tabungan, atau investasimu.
              <br />
              <span className="text-xs text-muted-foreground/60">
                Saat ini hanya menjawab dari data transaksi.
              </span>
            </p>
          )}
          {messages.map((m, i) => {
            const isLastAssistant = i === messages.length - 1 && m.role === "assistant";
            const finished = m.role === "assistant" && !(streaming && isLastAssistant);
            return (
              <div key={i}>
                <div
                  className={cn(
                    "p-3 rounded-lg text-sm",
                    m.role === "user" ? "bg-muted ml-8" : "bg-card border mr-8",
                    m.error && "text-destructive"
                  )}
                >
                  {m.content}
                  {streaming && isLastAssistant && (
                    <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-middle" />
                  )}

                  {/* Aggregate total renders from the SQL payload, never the prose. */}
                  {finished && m.intent === "aggregate" && typeof m.totalIdr === "number" && (
                    <p className="mt-2 font-mono text-base tabular-nums">
                      Rp {m.totalIdr.toLocaleString("id-ID")}
                    </p>
                  )}

                  {finished && m.verified === false && !m.error && (
                    <span className="inline-block mt-2 text-[11px] text-amber-600 border border-amber-600/40 rounded px-1.5 py-0.5">
                      ⚠ tidak terverifikasi
                    </span>
                  )}
                </div>

                {m.role === "assistant" && <MessageSources m={m} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Berapa pengeluaran makan bulan ini?"
          disabled={streaming}
          className="flex-1"
        />
        <Button onClick={() => send()} disabled={streaming || !input.trim()} size="sm">
          Kirim
        </Button>
      </div>
    </div>
  );
};

export default ChatPage;
