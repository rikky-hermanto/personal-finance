import { createContext, createElement, useContext, useRef, useState, type ReactNode } from 'react';
import { streamAsk, type ContextItem } from '@/api/chatApi';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSessionContextValue {
  messages: ChatMessage[];
  contexts: ContextItem[];
  input: string;
  setInput: (value: string) => void;
  streaming: boolean;
  send: (query?: string) => void;
  stop: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export const ChatSessionProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = (query?: string) => {
    const q = (query ?? input).trim();
    if (!q || streaming) return;

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setContexts([]);
    setInput('');
    setStreaming(true);

    abortRef.current = streamAsk(
      { query: q },
      {
        onMetadata: setContexts,
        onToken: (token) => {
          setMessages(prev => {
            const msgs = [...prev];
            const lastIdx = msgs.length - 1;
            const last = msgs[lastIdx];
            if (last?.role === 'assistant')
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
              if (last?.role === 'assistant' && last.content === '')
                msgs[lastIdx] = { ...last, content: 'Tidak ada transaksi yang relevan untuk pertanyaan itu.' };
              return msgs;
            });
          }
        },
        onError: () => setStreaming(false),
      }
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return createElement(
    ChatSessionContext.Provider,
    { value: { messages, contexts, input, setInput, streaming, send, stop } },
    children
  );
};

export const useChatSession = () => {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error('useChatSession must be used within a ChatSessionProvider');
  return ctx;
};
