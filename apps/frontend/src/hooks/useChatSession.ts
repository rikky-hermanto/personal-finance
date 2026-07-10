import { createContext, createElement, useContext, useRef, useState, type ReactNode } from 'react';
import { streamAsk, type ContextItem } from '@/api/chatApi';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  contexts?: ContextItem[];   // evidence attached to THIS message, not a global panel
  intent?: string;            // "aggregate" | "lookup"
  verified?: boolean;         // citations/markers validated against real context
  totalIdr?: number;          // aggregate — SQL total, rendered from data not prose
  count?: number;             // aggregate — total matching transactions
  error?: boolean;            // stream dropped mid-flight
}

interface ChatSessionContextValue {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  streaming: boolean;
  send: (query?: string) => void;
  stop: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export const ChatSessionProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // All stream events write into the pending assistant message (the last one),
  // so evidence and flags live with the answer they belong to — never a global
  // panel that only ever shows the most recent query's sources.
  const patchLast = (patch: (m: ChatMessage) => Partial<ChatMessage>) => {
    setMessages(prev => {
      const msgs = [...prev];
      const lastIdx = msgs.length - 1;
      const last = msgs[lastIdx];
      if (last?.role === 'assistant') msgs[lastIdx] = { ...last, ...patch(last) };
      return msgs;
    });
  };

  const send = (query?: string) => {
    const q = (query ?? input).trim();
    if (!q || streaming) return;

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    abortRef.current = streamAsk(
      { query: q },
      {
        onMetadata: (meta) => patchLast(() => ({
          contexts: meta.contexts,
          intent: meta.intent,
          totalIdr: meta.total_idr,
          count: meta.count,
        })),
        onToken: (token) => patchLast(last => ({ content: last.content + token })),
        onDone: (payload) => {
          setStreaming(false);
          patchLast(last => {
            const patch: Partial<ChatMessage> = {
              verified: payload?.verified,
              intent: payload?.intent ?? last.intent,
              totalIdr: payload?.total_idr ?? last.totalIdr,
            };
            if (payload?.confident === false && last.content === '')
              patch.content = 'Tidak ada transaksi yang relevan untuk pertanyaan itu.';
            return patch;
          });
        },
        onError: () => {
          setStreaming(false);
          patchLast(last => ({
            error: true,
            content: last.content === ''
              ? 'Terjadi kesalahan saat memuat jawaban — coba lagi.'
              : last.content,
          }));
        },
      }
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return createElement(
    ChatSessionContext.Provider,
    { value: { messages, input, setInput, streaming, send, stop } },
    children
  );
};

export const useChatSession = () => {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error('useChatSession must be used within a ChatSessionProvider');
  return ctx;
};
