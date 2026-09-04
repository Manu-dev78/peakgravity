import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useConversation } from "@/lib/conversation-store";
import { useIde } from "@/lib/ide-store";
import { useFsStore } from "@/lib/fs-store";
import {
  parseMentions,
  resolveMentions,
  renderResolvedMentions,
  type Mention,
  type ResolvedMention,
} from "@/lib/mentions";
import { electronFileReader } from "@/lib/mention-readers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StreamEvent {
  type: "delta" | "tool_call" | "done" | "error";
  text?: string;
  toolCall?: { id: string; name: string; arguments: string };
  message?: string;
}

interface UseChatStream {
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
}

export function useChatStream(): UseChatStream {
  const { session } = useAuth();
  const conv = useConversation();
  const { selectedModel } = useIde();
  const fs = useFsStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (activeIdRef.current) {
      conv.cancelAssistant(activeIdRef.current);
    }
    setBusy(false);
  }, [conv]);

  const send = useCallback(
    async (text: string) => {
      if (!session) {
        toast.error("Sign in to chat with the agent");
        return;
      }
      if (!selectedModel || selectedModel === "No model configured") {
        toast.error("Pick a model in the agent panel first");
        return;
      }
      let threadId = conv.activeThreadId;
      if (!threadId) {
        threadId = await conv.newConversation(selectedModel);
        if (!threadId) return;
      }
      if (!threadId) return;
      const root = fs.folder?.path ?? null;
      const mentions = parseMentions(text, root);
      const resolved = await resolveMentions(mentions, electronFileReader);
      const ctxBlock = renderResolvedMentions(resolved);

      // Persist user message + mentions, then start the stream.
      const storedId = await conv.appendUserMessage(
        text,
        mentions.map((m) => ({ path: m.path, start: m.start, end: m.end })),
        threadId,
      );
      if (!storedId) {
        // appendUserMessage already toasts
        return;
      }

      // Build the messages array we send to the server.
      const history = conv.active?.messages ?? [];
      // React state may still contain the pre-send history. Include the
      // current user turn explicitly so empty/new threads never send [] to
      // the API (which is rejected by the server schema with HTTP 400).
      const last = history[history.length - 1];
      const requestHistory =
        last?.role === "user" && last.content === text
          ? history
          : [...history, { role: "user", content: text }];
      const messages = buildRequestMessages(requestHistory, ctxBlock);

      setError(null);
      setBusy(true);
      activeIdRef.current = threadId;
      conv.startAssistant(threadId);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ modelRef: selectedModel, messages }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
        }

        await consumeSse(res.body, {
          onDelta: (d) => conv.appendAssistantDelta(threadId, d),
          onToolCall: () => {
            // Surface tool calls in the UI later. For now we just record
            // them implicitly via the assistant message; full tool execution
            // is wired in the agent slice.
          },
          onDone: () => {
            void conv.finishAssistant(threadId, { modelRef: selectedModel });
          },
          onError: (msg) => {
            setError(msg);
            toast.error(msg);
            void conv.cancelAssistant(threadId);
          },
        });
      } catch (e) {
        if (ctrl.signal.aborted) {
          // already handled by stop()
        } else {
          const msg = e instanceof Error ? e.message : "Stream failed";
          setError(msg);
          toast.error(msg);
          void conv.cancelAssistant(threadId);
        }
      } finally {
        setBusy(false);
        activeIdRef.current = null;
        abortRef.current = null;
      }
    },
    [session, selectedModel, conv, fs.folder?.path],
  );

  // Auto-stop on unmount
  useEffect(() => () => stop(), [stop]);

  return { busy, error, send, stop };
}

function buildRequestMessages(
  history: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string }>,
  ctxBlock: string,
) {
  const out: Array<Record<string, unknown>> = [];
  if (ctxBlock) {
    out.push({ role: "system", content: ctxBlock });
  }
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content };
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        msg["tool_calls"] = m.tool_calls;
      }
      out.push(msg);
    } else if (m.role === "tool") {
      const msg: Record<string, unknown> = { role: "tool", content: m.content };
      if (m.tool_call_id) msg["tool_call_id"] = m.tool_call_id;
      if (m.name) msg["name"] = m.name;
      out.push(msg);
    } else if (m.role === "system") {
      out.push({ role: "system", content: m.content });
    }
  }
  return out;
}

interface SseHandlers {
  onDelta: (text: string) => void;
  onToolCall: (tc: { id: string; name: string; arguments: string }) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}

async function consumeSse(body: ReadableStream<Uint8Array>, handlers: SseHandlers) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let dataLine = "";
      for (const lineRaw of block.split("\n")) {
        const line = lineRaw.trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      let ev: unknown;
      try {
        ev = JSON.parse(dataLine);
      } catch {
        continue;
      }
      const e = ev as StreamEvent;
      if (e.type === "delta" && typeof e.text === "string") handlers.onDelta(e.text);
      else if (e.type === "tool_call" && e.toolCall) handlers.onToolCall(e.toolCall);
      else if (e.type === "error" && e.message) handlers.onError(e.message);
      else if (e.type === "done") {
        handlers.onDone();
        return;
      }
    }
  }
  // Stream ended without explicit done — treat as done
  handlers.onDone();
}

// Re-export Mention so callers don't have to import from two places
export type { Mention, ResolvedMention };
// Suppress unused-import warning (supabase is referenced for future token refresh; harmless)
void supabase;
