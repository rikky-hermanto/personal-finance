import { createContext, createElement, useContext, useRef, useState, type ReactNode } from 'react';
import { streamAsk, fetchFollowUps, type ContextItem } from '@/api/chatApi';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  contexts?: ContextItem[];   // evidence attached to THIS message, not a global panel
  intent?: string;            // "aggregate" | "lookup"
  verified?: boolean;         // citations/markers validated against real context
  totalIdr?: number;          // aggregate — SQL total, rendered from data not prose
  count?: number;             // aggregate — total matching transactions
  error?: boolean;            // stream dropped mid-flight
  followUps?: string[];       // undefined = still loading, [] = none (use static fallback)
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
  const followUpAbortRef = useRef<AbortController | null>(null);

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

    // A new question invalidates any in-flight suggestion request. Without this,
    // a late response would land on the wrong message via patchLast.
    followUpAbortRef.current?.abort();

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    // Buffered alongside the state updates: onDone needs the finished text and the
    // contexts synchronously, and reading them back out of setMessages would race.
    const answerBuffer: string[] = [];
    let contextSnapshot: ContextItem[] = [];
    let intentSnapshot: string | undefined;
    let totalSnapshot: number | undefined;

    const loadFollowUps = () => {
      const controller = new AbortController();
      followUpAbortRef.current = controller;
      fetchFollowUps(
        {
          question: q,
          answer: answerBuffer.join(''),
          intent: intentSnapshot,
          total_idr: totalSnapshot,
          contexts: contextSnapshot,
        },
        controller.signal
      ).then(questions => {
        if (controller.signal.aborted) return;
        patchLast(() => ({ followUps: questions }));
      });
    };

    abortRef.current = streamAsk(
      { query: q },
      {
        onMetadata: (meta) => {
          contextSnapshot = meta.contexts;
          intentSnapshot = meta.intent;
          totalSnapshot = meta.total_idr;
          patchLast(() => ({
            contexts: meta.contexts,
            intent: meta.intent,
            totalIdr: meta.total_idr,
            count: meta.count,
          }));
        },
        onToken: (token) => {
          answerBuffer.push(token);
          patchLast(last => ({ content: last.content + token }));
        },
        onDone: (payload) => {
          setStreaming(false);
          intentSnapshot = payload?.intent ?? intentSnapshot;
          totalSnapshot = payload?.total_idr ?? totalSnapshot;
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

          // Nothing was answered — skip the call rather than pay for suggestions
          // about an empty result. [] resolves the loading state to the fallback.
          if (payload?.confident === false || answerBuffer.length === 0) {
            patchLast(() => ({ followUps: [] }));
            return;
          }
          loadFollowUps();
        },
        onError: () => {
          setStreaming(false);
          patchLast(last => ({
            error: true,
            followUps: [],
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
    followUpAbortRef.current?.abort();
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
