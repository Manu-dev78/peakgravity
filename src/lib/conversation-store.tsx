import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  type ConversationSummary,
  type StoredMessage,
} from "./conversations.functions";
import type { ChatMessageText, ChatToolCall } from "./providers/chat/types";

export interface ConversationThread {
  id: string;
  title: string;
  modelRef: string | null;
  createdAt: string;
  updatedAt: string;
  /** Local-only optimistic messages that haven't been persisted yet. */
  messages: ChatMessageText[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** True while a message is being streamed in or saved. */
  busy: boolean;
}

interface ConversationState {
  threads: ConversationSummary[];
  activeThreadId: string | null;
  active: ConversationThread | null;
  loadingList: boolean;
  error: string | null;

  newConversation: (modelRef?: string | null) => Promise<string | null>;
  selectThread: (id: string | null) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  /** Optimistically append a user message and persist it. */
  appendUserMessage: (content: string, mentions: { path: string; start: number; end: number }[], threadId?: string) => Promise<string | null>;
  /** Optimistically append an assistant message and start streaming deltas. */
  startAssistant: (id: string) => string;
  /** Append a delta to the currently-streaming assistant message. */
  appendAssistantDelta: (id: string, text: string) => void;
  /** Persist the assistant message after the stream completes. */
  finishAssistant: (id: string, opts?: { toolCalls?: ChatToolCall[]; modelRef?: string | null }) => Promise<void>;
  /** Append a tool result message. */
  appendToolResult: (toolCallId: string, name: string, content: string) => Promise<void>;
  /** Cancel streaming and roll back the optimistic assistant message. */
  cancelAssistant: (id: string) => void;
}

const ConversationContext = createContext<ConversationState | null>(null);

/** Build a sensible title from the first user message (first ~6 words). */
function autoTitle(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  const words = cleaned.split(" ").slice(0, 6);
  let title = words.join(" ");
  if (cleaned.split(" ").length > 6) title += "…";
  return title.slice(0, 80);
}

export function ConversationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listConversations);
  const fetchOne = useServerFn(getConversation);
  const createMut = useServerFn(createConversation);
  const renameMut = useServerFn(renameConversation);
  const deleteMut = useServerFn(deleteConversation);
  const appendMut = useServerFn(appendMessage);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [active, setActiveState] = useState<ConversationThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  const list = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchList(),
  });

  // Hydrate the active thread whenever it changes.
  useEffect(() => {
    let cancelled = false;
    if (!activeThreadId) {
      setActiveState(null);
      return;
    }
    setActiveState((prev) =>
      prev && prev.id === activeThreadId
        ? { ...prev, loading: true }
        : { id: activeThreadId, title: "", modelRef: null, createdAt: "", updatedAt: "", messages: [], loading: true, busy: false },
    );
    fetchOne({ data: { id: activeThreadId } })
      .then((raw) => {
        if (cancelled) return;
        const res = raw as { conversation: ConversationSummary; messages: StoredMessage[] };
        const messages: ChatMessageText[] = res.messages.map(storedToMessage);
        setActiveState({
          id: res.conversation.id,
          title: res.conversation.title,
          modelRef: res.conversation.modelRef,
          createdAt: res.conversation.createdAt,
          updatedAt: res.conversation.updatedAt,
          messages,
          loading: false,
          busy: false,
        });
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setActiveState((cur) => (cur && cur.id === activeThreadId ? { ...cur, loading: false } : cur));
        setError(e instanceof Error ? e.message : "Failed to load conversation");
        toast.error("Failed to load conversation");
      });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, fetchOne]);

  const newConversation = useCallback(
    async (modelRef?: string | null): Promise<string | null> => {
      try {
        const res = await createMut({
          data: { modelRef: modelRef ?? null },
        });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        setActiveThreadId(res.id);
        return res.id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create conversation");
        return null;
      }
    },
    [createMut, qc],
  );

  const selectThread = useCallback(async (id: string | null) => {
    setActiveThreadId(id);
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        await deleteMut({ data: { id } });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setActiveState(null);
        }
        toast.success("Conversation deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [deleteMut, qc, activeThreadId],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        await renameMut({ data: { id, title } });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        setActiveState((cur) => (cur && cur.id === id ? { ...cur, title } : cur));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to rename");
      }
    },
    [renameMut, qc],
  );

  const appendUserMessage = useCallback(
    async (
      content: string,
      mentions: { path: string; start: number; end: number }[],
      threadId?: string,
    ): Promise<string | null> => {
      const id = threadId ?? activeThreadId;
      if (!id) return null;
      const optimistic: ChatMessageText = { role: "user", content };
      setActiveState((cur) => {
        const base = cur && cur.id === id
          ? cur
          : { id, title: "", modelRef: null, createdAt: "", updatedAt: "", messages: [], loading: false, busy: false };
        return { ...base, busy: true, messages: [...base.messages, optimistic] };
      });
      try {
        const res = await appendMut({
          data: {
            conversationId: id,
            role: "user",
            content,
            mentions,
            titleHint: autoTitle(content),
          },
        });
        setActiveState((cur) =>
          cur && cur.id === id
            ? { ...cur, updatedAt: res.conversationUpdatedAt, title: res.conversationTitle }
            : cur,
        );
        qc.invalidateQueries({ queryKey: ["conversations"] });
        return res.id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save message");
        setActiveState((cur) =>
          cur && cur.id === id
            ? { ...cur, messages: cur.messages.slice(0, -1), busy: false }
            : cur,
        );
        return null;
      }
    },
    [activeThreadId, appendMut, qc],
  );

  const startAssistant = useCallback(
    (id: string): string => {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      assistantIdRef.current = tempId;
      setActiveState((cur) =>
        cur && cur.id === id
          ? {
              ...cur,
              busy: true,
              messages: [...cur.messages, { role: "assistant", content: "" }],
            }
          : cur,
      );
      return tempId;
    },
    [],
  );

  const appendAssistantDelta = useCallback(
    (id: string, text: string) => {
      if (!text) return;
      setActiveState((cur) => {
        if (!cur || cur.id !== id) return cur;
        const msgs = [...cur.messages];
        if (msgs.length === 0) return cur;
        const last = msgs[msgs.length - 1]!;
        if (last.role !== "assistant") return cur;
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
        return { ...cur, messages: msgs };
      });
    },
    [],
  );

  const finishAssistant = useCallback(
    async (id: string, opts?: { toolCalls?: ChatToolCall[]; modelRef?: string | null }) => {
      assistantIdRef.current = null;
      setActiveState((cur) => {
        if (!cur || cur.id !== id) return cur;
        const msgs = [...cur.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role !== "assistant") {
          return { ...cur, busy: false };
        }
        const final: ChatMessageText = {
          role: "assistant",
          content: last.content,
          ...(opts?.toolCalls ? { tool_calls: opts.toolCalls } : {}),
        };
        msgs[msgs.length - 1] = final;
        return { ...cur, busy: false, messages: msgs };
      });
      // Persist the assistant turn after the optimistic update so we can capture
      // its content + tool_calls atomically.
      try {
        const snap = await new Promise<ChatMessageText | null>((resolve) => {
          setActiveState((cur) => {
            if (!cur || cur.id !== id) {
              resolve(null);
              return cur;
            }
            const last = cur.messages[cur.messages.length - 1];
            if (last?.role === "assistant") resolve(last);
            else resolve(null);
            return cur;
          });
        });
        if (!snap) return;
        const res = await appendMut({
          data: {
            conversationId: id,
            role: "assistant",
            content: snap.content,
            mentions: [],
            ...(snap.tool_calls ? { toolCalls: snap.tool_calls } : {}),
            ...(opts?.modelRef ? { modelRef: opts.modelRef } : {}),
          },
        });
        setActiveState((cur) =>
          cur && cur.id === id ? { ...cur, updatedAt: res.conversationUpdatedAt } : cur,
        );
        qc.invalidateQueries({ queryKey: ["conversations"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save assistant message");
      }
    },
    [appendMut, qc],
  );

  const cancelAssistant = useCallback(
    (id: string) => {
      assistantIdRef.current = null;
      setActiveState((cur) => {
        if (!cur || cur.id !== id) return cur;
        const msgs = [...cur.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role !== "assistant" || last.content.length > 0) {
          return { ...cur, busy: false };
        }
        msgs.pop();
        return { ...cur, busy: false, messages: msgs };
      });
    },
    [],
  );

  const appendToolResult = useCallback(
    async (toolCallId: string, name: string, content: string) => {
      if (!activeThreadId) return;
      const optimistic: ChatMessageText = {
        role: "tool",
        content,
        tool_call_id: toolCallId,
        name,
      };
      setActiveState((cur) =>
        cur && cur.id === activeThreadId
          ? { ...cur, messages: [...cur.messages, optimistic] }
          : cur,
      );
      try {
        await appendMut({
          data: {
            conversationId: activeThreadId,
            role: "tool",
            content,
            mentions: [],
            toolCallId,
            ...(name ? { titleHint: name.slice(0, 60) } : {}),
          },
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save tool result");
        setActiveState((cur) =>
          cur && cur.id === activeThreadId
            ? { ...cur, messages: cur.messages.slice(0, -1) }
            : cur,
        );
      }
    },
    [activeThreadId, appendMut],
  );

  const value = useMemo<ConversationState>(
    () => ({
      threads: list.data ?? [],
      activeThreadId,
      active,
      loadingList: list.isLoading,
      error: error ?? (list.error ? String(list.error.message ?? list.error) : null),
      newConversation,
      selectThread,
      deleteThread,
      rename,
      appendUserMessage,
      startAssistant,
      appendAssistantDelta,
      finishAssistant,
      cancelAssistant,
      appendToolResult,
    }),
    [
      list.data,
      list.isLoading,
      list.error,
      error,
      activeThreadId,
      active,
      newConversation,
      selectThread,
      deleteThread,
      rename,
      appendUserMessage,
      startAssistant,
      appendAssistantDelta,
      finishAssistant,
      cancelAssistant,
      appendToolResult,
    ],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationState {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error("useConversation must be used inside ConversationProvider");
  return ctx;
}

function storedToMessage(m: StoredMessage): ChatMessageText {
  const out: ChatMessageText = { role: m.role, content: m.content };
  if (m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.name) out.name = m.name;
  if (m.toolCalls && Array.isArray(m.toolCalls)) {
    out.tool_calls = m.toolCalls as ChatToolCall[];
  }
  return out;
}

