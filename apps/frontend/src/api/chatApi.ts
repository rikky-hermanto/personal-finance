import { fetchEventSource } from "@microsoft/fetch-event-source";
import { authenticatedFetch } from "@/api/authenticatedFetch";
import { supabase } from "@/lib/supabase";

export interface ContextItem {
  transaction_id: number;
  date: string;
  description: string;
  amount_idr: number;
  flow: "DB" | "CR";
  wallet: string;
}

export interface AskMetadata {
  contexts: ContextItem[];
  intent?: string;          // "aggregate" | "lookup"
  total_idr?: number;       // aggregate path — SQL total (source of truth)
  count?: number;           // aggregate path — total matching transactions
}

export interface AskDonePayload {
  confident?: boolean;
  verified?: boolean;       // citations/markers validated against real context
  intent?: string;
  total_idr?: number;
}

export interface AskStreamParams {
  query: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  account?: string;
  top_k?: number;
}

export type ChatRefusalReason = "input_flagged" | "output_flagged";

/** The AI service refused the question (input) or withheld the answer (output) — not an outage. */
export class ChatRefusalError extends Error {
  constructor(readonly reason: ChatRefusalReason) {
    super(reason);
    this.name = "ChatRefusalError";
  }
}

function errorDetail(data: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    // not JSON: fall through to the generic error
  }
  return undefined;
}

// PF-S15: the browser never calls the AI service. Chat goes through the .NET API,
// which verifies the Supabase token and forwards for that user only.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:7209";

export function streamAsk(
  params: AskStreamParams,
  handlers: {
    onMetadata: (meta: AskMetadata) => void;
    onToken: (token: string) => void;
    onDone: (payload?: AskDonePayload) => void;
    onError: (err: unknown) => void;
  }
): AbortController {
  const controller = new AbortController();

  void openAskStream(params, handlers, controller);
  return controller;
}

async function openAskStream(
  params: AskStreamParams,
  handlers: Parameters<typeof streamAsk>[1],
  controller: AbortController
): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    handlers.onError(new Error("Please sign in again."));
    return;
  }

  await fetchEventSource(`${BASE}/api/chat/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
    signal: controller.signal,
    openWhenHidden: true,   // don't pause when tab is hidden
    async onopen(response) {
      if (response.ok && response.headers.get("content-type")?.startsWith("text/event-stream")) return;
      // The API answers a flagged question with 400 {"code":"input_flagged"} (the .NET proxy
      // writes the key in lower case; read both spellings so a casing change cannot break this).
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if ((body?.code ?? body?.Code) === "input_flagged") throw new ChatRefusalError("input_flagged");
      }
      throw new Error(`Unexpected response ${response.status}`);
    },
    onmessage(msg) {
      if (msg.event === "metadata") {
        const data = JSON.parse(msg.data) as AskMetadata;
        handlers.onMetadata({
          contexts: data.contexts ?? [],
          intent: data.intent,
          total_idr: data.total_idr,
          count: data.count,
        });
      } else if (msg.event === "token") {
        handlers.onToken(msg.data);
      } else if (msg.event === "done") {
        const payload = msg.data
          ? (JSON.parse(msg.data) as AskDonePayload)
          : undefined;
        handlers.onDone(payload);
        controller.abort();   // stream finished — kill the connection so the
                              // library can't reconnect and re-POST the query
      } else if (msg.event === "error") {
        handlers.onError(
          errorDetail(msg.data) === "output_flagged"
            ? new ChatRefusalError("output_flagged")
            : new Error(msg.data)
        );
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
  }).catch(() => {
    // Already reported through onError/onclose; the rejection only ends the request.
  });
}

export interface FollowUpParams {
  question: string;
  answer: string;
  intent?: string;
  total_idr?: number;
  contexts: ContextItem[];
}

const FOLLOWUP_TIMEOUT_MS = 8000;

/** Suggestions are optional garnish — every failure resolves to [], never throws. */
export async function fetchFollowUps(
  params: FollowUpParams,
  signal: AbortSignal
): Promise<string[]> {
  try {
    const res = await authenticatedFetch(`${BASE}/api/chat/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.any([signal, AbortSignal.timeout(FOLLOWUP_TIMEOUT_MS)]),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { questions?: string[] };
    return data.questions ?? [];
  } catch {
    return [];
  }
}
