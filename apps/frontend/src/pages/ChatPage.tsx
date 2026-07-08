import { useEffect, useRef } from "react";
import { useChatSession } from "@/hooks/useChatSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ChatPage = () => {
  const { messages, contexts, input, setInput, streaming, send, stop } = useChatSession();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat with your finances</h1>
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
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "p-3 rounded-lg text-sm",
                m.role === "user" ? "bg-muted ml-8" : "bg-card border mr-8"
              )}
            >
              {m.content}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          ))}

          {contexts.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 pl-1">
              <p className="font-medium text-foreground/60">Sumber transaksi</p>
              {contexts.map((c, i) => (
                <p key={c.transaction_id}>
                  [{i + 1}] {c.date} · {c.description} ·{" "}
                  <span className={c.flow === "DB" ? "text-destructive" : "text-green-600"}>
                    {c.flow === "DB" ? "−" : "+"}Rp {c.amount_idr.toLocaleString("id-ID")}
                  </span>
                </p>
              ))}
            </div>
          )}
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
