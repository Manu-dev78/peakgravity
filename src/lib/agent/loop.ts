/**
 * Native tool-use loop.
 *
 * The loop is a state machine that drives the model via the /api/chat SSE
 * endpoint until the model returns a final answer (no tool calls). On every
 * iteration:
 *   1. Send the current thread + registered tool specs
 *   2. Stream deltas into the optimistic assistant message
 *   3. On `tool_call` events, queue them
 *   4. On `done` (or stream end), if any tool calls were queued:
 *      - ask the user for approval (per tool, batched)
 *      - execute approved tools sequentially
 *      - append `role: "tool"` result messages
 *      - loop
 *   5. On no tool calls, finish the assistant message and return
 *
 * The loop also enforces a hard `maxSteps` ceiling to avoid runaway agents.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useConversation } from "@/lib/conversation-store";
import { useIde } from "@/lib/ide-store";
import { useFsStore } from "@/lib/fs-store";
import { useDiffStore, type PendingDiff } from "@/lib/diff-store";
import { useAgentSettings } from "./settings";
import { electronFileReader } from "@/lib/mention-readers";
import {
  parseMentions,
  resolveMentions,
  renderResolvedMentions,
  type Mention,
} from "@/lib/mentions";
import { toast } from "sonner";
import {
  getTool,
  registeredToolSpecs,
  type ToolContext,
  type ToolExecutionResult,
} from "./registry";
import type {
  ChatEvent,
  ChatMessageText,
  ChatToolCall,
  ChatToolSpec,
} from "@/lib/providers/chat/types";

export interface AgentStep {
  index: number;
  /** Names of tools called in this step. */
  toolNames: string[];
  /** Whether the user approved all of them. */
  approved: boolean;
}

interface UseAgentLoop {
  busy: boolean;
  error: string | null;
  steps: AgentStep[];
  pending: PendingApproval | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  approve: () => void;
  deny: () => void;
}

export interface PendingApproval {
  stepIndex: number;
  description: string;
  detail: string;
  toolNames: string[];
}

const DEFAULT_MAX_STEPS = 8;

export function useAgentLoop(): UseAgentLoop {
  const { session } = useAuth();
  const conv = useConversation();
  const { selectedModel } = useIde();
  const fs = useFsStore();
  const diff = useDiffStore();
  const agentSettings = useAgentSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [pending, setPending] = useState<PendingApproval | null>(null);
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
      if (!conv.activeThreadId) {
        const id = await conv.newConversation(selectedModel);
        if (!id) return;
      }
      const threadId = conv.activeThreadId ?? (await conv.newConversation(selectedModel));
      if (!threadId) return;
      const root = fs.folder?.path ?? null;
      const mentions = parseMentions(text, root);
      const resolved = await resolveMentions(mentions, electronFileReader);
      const ctxBlock = renderResolvedMentions(resolved);

      const storedId = await conv.appendUserMessage(
        text,
        mentions.map((m) => ({ path: m.path, start: m.start, end: m.end })),
      );
      if (!storedId) return;

      setError(null);
      setSteps([]);
      setBusy(true);
      activeIdRef.current = threadId;

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const signal = ctrl.signal;
      const maxSteps = DEFAULT_MAX_STEPS;

      try {
        for (let step = 0; step < maxSteps; step++) {
          if (signal.aborted) return;
          // Snapshot messages at the start of this step
          const snapshot = await snapshotMessages(conv, threadId);
          const toolsForCall = registeredToolSpecs();
          const messages = buildRequestMessages(snapshot, ctxBlock);
          conv.startAssistant(threadId);
          const events = streamChat({
            accessToken: session.access_token,
            modelRef: selectedModel,
            messages,
            tools: toolsForCall,
            signal,
          });
          const { toolCalls, done, errorMsg } = await consumeChat(events, (delta) =>
            conv.appendAssistantDelta(threadId, delta),
          );
          if (errorMsg) {
            setError(errorMsg);
            toast.error(errorMsg);
            void conv.cancelAssistant(threadId);
            return;
          }
          if (!done && !signal.aborted) {
            // Stream closed without explicit done — treat as done.
          }
          // Persist the assistant turn (with any tool calls it issued)
          await conv.finishAssistant(threadId, {
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            modelRef: selectedModel,
          });
          if (signal.aborted) return;
          if (toolCalls.length === 0) {
            // No more tool calls — we're done.
            return;
          }
          // Need approval? Consult the per-tool auto-approve flags.
          const approved = await askApproval({
            setPending,
            shouldAutoApprove: agentSettings.shouldAutoApprove,
            threadId,
            stepIndex: step,
            calls: toolCalls,
          });
          if (!approved) {
            // User denied — stop the loop and append a note.
            await conv.appendToolResult(
              "denied",
              "user",
              "The user denied the request to run tools. Do not retry these calls.",
            );
            return;
          }
          setSteps((prev) => [...prev, { index: step, toolNames: toolCalls.map((t) => t.name), approved: true }]);
          // Execute tools sequentially
          for (const tc of toolCalls) {
            if (signal.aborted) return;
            const result = await runToolCall(tc, signal, {
              threadId,
              requestDiffApproval: (d) => {
                const id = diff.enqueue(d);
                void id;
                return id;
              },
            });
            await conv.appendToolResult(tc.id, tc.name, result);
          }
        }
        toast.error(`Agent stopped after ${maxSteps} steps`);
      } catch (e) {
        if (!signal.aborted) {
          const msg = e instanceof Error ? e.message : "Agent loop failed";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        setBusy(false);
        activeIdRef.current = null;
        abortRef.current = null;
        modulePendingResolve.current = null;
        setPending(null);
      }
    },
    [session, selectedModel, conv, fs.folder?.path, diff, agentSettings],
  );

  useEffect(() => () => stop(), [stop]);

  const approve = useCallback(() => {
    const r = modulePendingResolve.current;
    modulePendingResolve.current = null;
    r?.(true);
  }, []);

  const deny = useCallback(() => {
    const r = modulePendingResolve.current;
    modulePendingResolve.current = null;
    r?.(false);
  }, []);

  return { busy, error, steps, pending, send, stop, approve, deny };
}

function providerFromModelRef(_modelRef: string): "openai" | "anthropic" | "gemini" {
  // The server route already resolves the provider from the model ref. The
  // client doesn't need to pre-shape tool specs because the adapters accept
  // the canonical ChatToolSpec shape and translate to provider-specific forms
  // inside `withProtocol` / `dispatch`. This helper is kept as a forward
  // hook for future per-client shaping.
  void _modelRef;
  return "openai";
}

void providerFromModelRef;

function toolsForProvider(_specs: ChatToolSpec[]): ChatToolSpec[] {
  // Server-side adapter handles the per-provider translation. The client
  // sends canonical ChatToolSpec objects; the adapter wraps them in the
  // shape each provider expects.
  return _specs;
}

void toolsForProvider;

function askApproval(
  ctx: { setPending: (p: PendingApproval | null) => void; shouldAutoApprove: (n: string) => boolean; threadId: string; stepIndex: number; calls: ChatToolCall[] },
): Promise<boolean> {
  // If every tool auto-approves, no UI interaction needed.
  if (ctx.calls.every((c) => ctx.shouldAutoApprove(c.name))) {
    return Promise.resolve(true);
  }
  // Otherwise surface a confirmation in the agent panel and wait.
  const desc = ctx.calls.length === 1
    ? `Run ${ctx.calls[0]!.name}?`
    : `Run ${ctx.calls.length} tools (${ctx.calls.map((c) => c.name).join(", ")})?`;
  const detail = ctx.calls
    .map((c) => {
      let args = c.arguments;
      try {
        const parsed: unknown = JSON.parse(c.arguments);
        if (parsed && typeof parsed === "object") {
          args = Object.entries(parsed as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join("\n");
        }
      } catch {
        /* keep raw */
      }
      return `${c.name}(${args})`;
    })
    .join("\n");
  return new Promise((resolve) => {
    modulePendingResolve.current = (approved: boolean) => {
      ctx.setPending(null);
      resolve(approved);
    };
    ctx.setPending({
      stepIndex: ctx.stepIndex,
      description: desc,
      detail,
      toolNames: ctx.calls.map((c) => c.name),
    });
  });
}

// Module-level handle that the approve/deny callbacks in the hook talk to.
// We can't pass refs from the hook into askApproval because it's a plain
// function; using a module singleton is the simplest fix.
const modulePendingResolve: { current: ((approved: boolean) => void) | null } = { current: null };

async function snapshotMessages(
  conv: ReturnType<typeof useConversation>,
  threadId: string,
): Promise<ChatMessageText[]> {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryRead = () => {
      const active = conv.active;
      if (active && active.id === threadId) {
        resolve(active.messages);
        return;
      }
      attempts++;
      if (attempts > 50) {
        resolve([]);
        return;
      }
      setTimeout(tryRead, 20);
    };
    tryRead();
  });
}

function buildRequestMessages(
  history: ChatMessageText[],
  ctxBlock: string,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (ctxBlock) out.push({ role: "system", content: ctxBlock });
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content };
      if (m.tool_calls && m.tool_calls.length > 0) msg["tool_calls"] = m.tool_calls;
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

function streamChat(args: {
  accessToken: string;
  modelRef: string;
  messages: Array<Record<string, unknown>>;
  tools: ChatToolSpec[];
  signal: AbortSignal;
}): AsyncIterable<ChatEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${args.accessToken}`,
        },
        body: JSON.stringify({
          modelRef: args.modelRef,
          messages: args.messages,
          tools: args.tools,
        }),
        signal: args.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        yield { type: "error", message: `${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}` };
        return;
      }
      yield* parseSse(res.body);
    },
  };
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<ChatEvent> {
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
      const e = ev as ChatEvent;
      if (e.type === "delta" || e.type === "tool_call" || e.type === "error" || e.type === "usage") {
        yield e;
      } else if (e.type === "done") {
        yield e;
        return;
      }
    }
  }
}

interface ConsumeResult {
  toolCalls: ChatToolCall[];
  done: boolean;
  errorMsg?: string;
}

async function consumeChat(
  events: AsyncIterable<ChatEvent>,
  onDelta: (text: string) => void,
): Promise<ConsumeResult> {
  const toolCalls: ChatToolCall[] = [];
  const toolArgBuffers = new Map<string, string>();
  const toolNameBuffers = new Map<string, string>();
  let done = false;
  let errorMsg: string | undefined;
  for await (const e of events) {
    if (e.type === "delta") {
      onDelta(e.text);
    } else if (e.type === "tool_call_delta") {
      const cur = toolArgBuffers.get(e.id) ?? "";
      toolArgBuffers.set(e.id, cur + e.argumentsDelta);
      if (e.name) toolNameBuffers.set(e.id, e.name);
    } else if (e.type === "tool_call") {
      toolCalls.push({ id: e.id, name: e.name, arguments: e.arguments });
    } else if (e.type === "error") {
      errorMsg = e.message;
      break;
    } else if (e.type === "done") {
      done = true;
    }
  }
  // Resolve any buffered tool_call deltas into full tool_calls.
  for (const [id, args] of toolArgBuffers) {
    if (toolCalls.some((t) => t.id === id)) continue;
    const name = toolNameBuffers.get(id) ?? "";
    if (name) toolCalls.push({ id, name, arguments: args });
  }
  const result: ConsumeResult = { toolCalls, done };
  if (errorMsg !== undefined) result.errorMsg = errorMsg;
  return result;
}

async function runToolCall(
  tc: ChatToolCall,
  signal: AbortSignal,
  extras: { threadId: string; requestDiffApproval?: (d: Omit<PendingDiff, "id" | "createdAt" | "status">) => string } = { threadId: "" },
): Promise<string> {
  const tool = getTool(tc.name);
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${tc.name}` });
  }
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(tc.arguments);
    args = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  } catch (e) {
    return JSON.stringify({ error: `Invalid tool arguments: ${e instanceof Error ? e.message : "parse failed"}` });
  }
  const ctx: ToolContext = {
    root: useFsStore.getState()?.folder?.path ?? null,
    signal,
    requestApproval: async () => true,
    toolCallId: tc.id,
    threadId: extras.threadId,
    requestDiffApproval: extras.requestDiffApproval as never,
  };
  try {
    const result: ToolExecutionResult = await tool.execute(args, ctx);
    return result.content;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tool execution failed";
    return JSON.stringify({ error: msg });
  }
}

// (intentionally no unused-import voids)
