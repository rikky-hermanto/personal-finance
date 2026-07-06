import { useState, useRef, useEffect } from "react";
import { streamAsk, type ContextItem } from "@/api/chatApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!input.trim() || streaming) return;
    const query = input.trim();

    setMessages(prev => [...prev, { role: "user", content: query }, { role: "assistant", content: "" }]);
    setContexts([]);
    setInput("");
    setStreaming(true);

    abortRef.current = streamAsk(
      { query },
      {
        onMetadata: setContexts,
        onToken: (token) => {
          setMessages(prev => {
            const msgs = [...prev];
            const lastIdx = msgs.length - 1;
            const last = msgs[lastIdx];
            if (last?.role === "assistant")
              msgs[lastIdx] = { ...last, content: last.content + token };
            return msgs;
          });
        },
        onDone: (payload) => {
          setStreaming(false);
          if (payload?.confident === false) {
            setMessages(prev => {
              const msgs = [...prev];
              const lastIdx = msgs.length - 1;
              const last = msgs[lastIdx];
              if (last?.role === "assistant" && last.content === "")
                msgs[lastIdx] = { ...last, content: "Tidak ada transaksi yang relevan untuk pertanyaan itu." };
              return msgs;
            });
          }
        },
        onError: () => setStreaming(false),
      }
    );
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

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

      <ScrollArea className="flex-1">
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

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Berapa pengeluaran makan bulan ini?"
          disabled={streaming}
          className="flex-1"
        />
        <Button onClick={send} disabled={streaming || !input.trim()} size="sm">
          Kirim
        </Button>
      </div>
    </div>
  );
};

export default ChatPage;
