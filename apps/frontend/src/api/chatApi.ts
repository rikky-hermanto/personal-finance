import { fetchEventSource } from "@microsoft/fetch-event-source";

export interface ContextItem {
  transaction_id: number;
  date: string;
  description: string;
  amount_idr: number;
  flow: "DB" | "CR";
  wallet: string;
}

export interface AskStreamParams {
  query: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  account?: string;
  top_k?: number;
}

const AI_URL = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

export function streamAsk(
  params: AskStreamParams,
  handlers: {
    onMetadata: (contexts: ContextItem[]) => void;
    onToken: (token: string) => void;
    onDone: (payload?: { confident?: boolean }) => void;
    onError: (err: unknown) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetchEventSource(`${AI_URL}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
    openWhenHidden: true,   // don't pause when tab is hidden
    onmessage(msg) {
      if (msg.event === "metadata") {
        const data = JSON.parse(msg.data) as { contexts: ContextItem[] };
        handlers.onMetadata(data.contexts ?? []);
      } else if (msg.event === "token") {
        handlers.onToken(msg.data);
      } else if (msg.event === "done") {
        const payload = msg.data
          ? (JSON.parse(msg.data) as { confident?: boolean })
          : undefined;
        handlers.onDone(payload);
        controller.abort();   // stream finished — kill the connection so the
                              // library can't reconnect and re-POST the query
      } else if (msg.event === "error") {
        handlers.onError(new Error(msg.data));
        controller.abort();
      }
    },
    onclose() {
      // Server closed without a done event (crash, redeploy). Throwing stops
      // the default silent reconnect, which would re-run the LLM generation.
      throw new Error("stream closed unexpectedly");
    },
    onerror(err) {
      handlers.onError(err);
      throw err;    // stops fetch-event-source from auto-retrying on errors
    },
  });

  return controller;
}
