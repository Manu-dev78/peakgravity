import type { ChatEvent, ChatEventStream, ChatRequest, ChatMessageText, ChatToolCall } from "./types";

/**
 * OpenAI-compatible chat completions stream.
 * Works for: OpenAI, OpenRouter, Custom (Ollama, LM Studio, vLLM, etc).
 */
export async function* streamOpenAIChat(req: ChatRequest): ChatEventStream {
  const { baseUrl, apiKey, model, messages, signal, tools, maxTokens, extraHeaders } = req;

  const baseBody: Record<string, unknown> = {
    model,
    stream: true,
    messages: messages.map(toOpenAIMessage),
  };
  if (typeof maxTokens === "number") baseBody["max_tokens"] = maxTokens;

  const buildBody = (withTools: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = { ...baseBody };
    if (withTools && tools && tools.length > 0) {
      b["tools"] = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    return b;
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    accept: "text/event-stream",
    ...(extraHeaders ?? {}),
  };

  // First attempt: with tools. Some free / older models reject the `tools`
  // field outright with a 400; if that happens and we have tools, retry
  // once without them so the conversation still works (the agent just
  // can't call functions for this model).
  const wantsTools = !!(tools && tools.length > 0);
  const res = await postChat(baseUrl, headers, buildBody(wantsTools), signal);
  if (!res.ok && wantsTools && res.status === 400) {
    const errBody = await res.text().catch(() => "");
    if (mentionsToolSupport(errBody)) {
      // Retry without tools. The model just doesn't support function calling.
      const fallback = await postChat(baseUrl, headers, buildBody(false), signal);
      if (!fallback.ok || !fallback.body) {
        const t = await fallback.text().catch(() => "");
        yield {
          type: "error",
          message: `${fallback.status} ${fallback.statusText || "Error"}${t ? `: ${t.slice(0, 400)}` : ""}`,
        };
        return;
      }
      yield* streamChunks(fallback.body, signal);
      return;
    }
    // Not a tools complaint — surface the original 400.
    yield {
      type: "error",
      message: `${res.status} ${res.statusText || "Error"}${errBody ? `: ${errBody.slice(0, 400)}` : ""}`,
    };
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield {
      type: "error",
      message: `${res.status} ${res.statusText || "Error"}${text ? `: ${text.slice(0, 400)}` : ""}`,
    };
    return;
  }
  yield* streamChunks(res.body, signal);
}

async function postChat(
  baseUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };
  if (signal) init.signal = signal;
  return fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, init);
}

function mentionsToolSupport(errorBody: string): boolean {
  const lower = errorBody.toLowerCase();
  return (
    lower.includes("tool") ||
    lower.includes("function") ||
    lower.includes("tools is not supported") ||
    lower.includes("function calling") ||
    lower.includes("does not support")
  );
}

async function* streamChunks(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
): AsyncGenerator<ChatEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const tcState = new Map<string, { name: string; args: string }>();
  let usage: { inputTokens: number; outputTokens: number } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = block.split("\n");
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }
          let json: unknown;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          const chunk = json as OpenAIChunk;
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
            };
          }
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (!delta) continue;
          if (typeof delta.content === "string" && delta.content.length > 0) {
            yield { type: "delta", text: delta.content };
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const id = tc.id ?? tcStateKey(tc);
              if (!id) continue;
              const state = tcState.get(id) ?? { name: "", args: "" };
              if (tc.function?.name) state.name = tc.function.name;
              if (tc.function?.arguments) state.args += tc.function.arguments;
              tcState.set(id, state);
              yield {
                type: "tool_call_delta",
                id,
                ...(state.name ? { name: state.name } : {}),
                argumentsDelta: tc.function?.arguments ?? "",
              };
            }
          }
          if (choice.finish_reason) {
            for (const [id, state] of tcState) {
              if (state.name) {
                yield { type: "tool_call", id, name: state.name, arguments: state.args };
              }
            }
            if (usage) yield { type: "usage", ...usage };
            yield { type: "done" };
            return;
          }
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return;
    yield { type: "error", message: e instanceof Error ? e.message : "Stream failed" };
    return;
  }
  for (const [id, state] of tcState) {
    if (state.name) yield { type: "tool_call", id, name: state.name, arguments: state.args };
  }
  if (usage) yield { type: "usage", ...usage };
  yield { type: "done" };
}

function tcStateKey(tc: { index?: number }): string {
  return `idx:${tc.index ?? 0}`;
}

function toOpenAIMessage(m: ChatMessageText): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.tool_call_id ?? "",
      content: m.content,
    };
  }
  if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

interface OpenAIChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; index?: number; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type { ChatToolCall };
