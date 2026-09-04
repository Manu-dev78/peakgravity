import type { ChatEvent, ChatEventStream, ChatRequest, ChatMessageText } from "./types";

/**
 * Anthropic Messages API streaming adapter.
 *
 * TODO(cache-control): Add `cache_control: { type: "ephemeral" }` support on
 * system prompt and tool spec so the agent can mark long-lived context
 * (e.g. file mentions, repo summary) for Anthropic's prompt cache. Tracked
 * in README → "Future work".
 *
 * Wire format notes:
 *  - Endpoint: POST /v1/messages
 *  - Headers: x-api-key, anthropic-version: 2023-06-01
 *  - System prompt is a top-level `system` field, not a message
 *  - Stream events: message_start, content_block_start, content_block_delta,
 *    content_block_stop, message_delta, message_stop, error
 *  - Tool results are sent in a `user` message with content blocks of type
 *    `tool_result` referencing `tool_use_id`
 */
export async function* streamAnthropicChat(req: ChatRequest): ChatEventStream {
  const { baseUrl, apiKey, model, messages, signal, tools, maxTokens, extraHeaders } = req;

  // Split system messages out (Anthropic takes system as a top-level field).
  const systemParts: string[] = [];
  const apiMessages: AnthropicMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      // Tool results must live inside a user message.
      const last = apiMessages[apiMessages.length - 1];
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: m.content,
      };
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as AnthropicContentBlock[]).push(block);
      } else {
        apiMessages.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: safeParseJson(tc.arguments),
        });
      }
      apiMessages.push({ role: "assistant", content: blocks });
      continue;
    }
    apiMessages.push({ role: m.role as "user" | "assistant", content: m.content });
  }

  const wantsTools = !!(tools && tools.length > 0);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    accept: "text/event-stream",
    ...(extraHeaders ?? {}),
  };

  const buildBody = (withTools: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model,
      stream: true,
      messages: apiMessages,
      max_tokens: typeof maxTokens === "number" ? maxTokens : 4096,
    };
    if (systemParts.length > 0) b["system"] = systemParts.join("\n\n");
    if (withTools && tools && tools.length > 0) {
      b["tools"] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    return b;
  };

  // First attempt: with tools. If Anthropic rejects (e.g. some models don't
  // support function calling), retry once without tools so the conversation
  // still works.
  const res = await postAnthropic(baseUrl, headers, buildBody(wantsTools), signal);
  if (!res.ok && wantsTools && res.status === 400) {
    const errBody = await res.text().catch(() => "");
    if (mentionsToolSupport(errBody)) {
      const fallback = await postAnthropic(baseUrl, headers, buildBody(false), signal);
      if (!fallback.ok || !fallback.body) {
        const t = await fallback.text().catch(() => "");
        yield {
          type: "error",
          message: `${fallback.status} ${fallback.statusText || "Error"}${t ? `: ${t.slice(0, 400)}` : ""}`,
        };
        return;
      }
      yield* streamAnthropicChunks(fallback.body, signal);
      return;
    }
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
  yield* streamAnthropicChunks(res.body, signal);
}

async function postAnthropic(
  baseUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  if (signal) init.signal = signal;
  return fetch(`${baseUrl.replace(/\/$/, "")}/messages`, init);
}

function mentionsToolSupport(errorBody: string): boolean {
  const lower = errorBody.toLowerCase();
  return (
    lower.includes("tool") ||
    lower.includes("function") ||
    lower.includes("function calling") ||
    lower.includes("does not support")
  );
}

async function* streamAnthropicChunks(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
): AsyncGenerator<ChatEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const toolBuffers = new Map<number, { id: string; name: string; args: string }>();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let eventName = "";
        let dataLine = "";
        for (const lineRaw of block.split("\n")) {
          const line = lineRaw.trim();
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
        }
        if (!dataLine) continue;
        let payload: unknown;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }
        const ev = handleAnthropicEvent(eventName, payload, toolBuffers, (d) => {
          if (d > 0) outputTokens = d;
        });
        if (ev) {
          if (ev.type === "usage" && ev.inputTokens) inputTokens = ev.inputTokens;
          yield ev;
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return;
    yield { type: "error", message: e instanceof Error ? e.message : "Stream failed" };
    return;
  }

  for (const buf of toolBuffers.values()) {
    if (buf.id && buf.name) {
      yield { type: "tool_call", id: buf.id, name: buf.name, arguments: buf.args };
    }
  }
  if (inputTokens || outputTokens) {
    yield { type: "usage", inputTokens, outputTokens };
  }
  yield { type: "done" };
}

function handleAnthropicEvent(
  eventName: string,
  payload: unknown,
  toolBuffers: Map<number, { id: string; name: string; args: string }>,
  setOutput: (delta: number) => void,
): ChatEvent | null {
  if (eventName === "error") {
    const p = payload as { error?: { message?: string } };
    return { type: "error", message: p.error?.message ?? "Anthropic error" };
  }
  if (eventName === "content_block_start") {
    const p = payload as {
      index: number;
      content_block: { type: string; id?: string; name?: string; input?: unknown };
    };
    if (p.content_block.type === "tool_use") {
      toolBuffers.set(p.index, {
        id: p.content_block.id ?? "",
        name: p.content_block.name ?? "",
        args: JSON.stringify(p.content_block.input ?? {}),
      });
    }
    return null;
  }
  if (eventName === "content_block_delta") {
    const p = payload as {
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "input_json_delta"; partial_json: string }
        | { type: "thinking_delta"; thinking: string };
    };
    if (p.delta.type === "text_delta") {
      return { type: "delta", text: p.delta.text };
    }
    if (p.delta.type === "input_json_delta") {
      const buf = toolBuffers.get(p.index);
      if (buf) {
        // input_json_delta is the *raw* partial JSON; the first delta already
        // includes the opening brace. Replace, don't append.
        if (buf.args.startsWith("{")) {
          buf.args = buf.args.slice(0, -1) + p.delta.partial_json.slice(1);
        } else {
          buf.args += p.delta.partial_json;
        }
        return { type: "tool_call_delta", id: buf.id, argumentsDelta: p.delta.partial_json };
      }
    }
    return null;
  }
  if (eventName === "content_block_stop") {
    const p = payload as { index: number };
    const buf = toolBuffers.get(p.index);
    if (buf && buf.id && buf.name) {
      return { type: "tool_call", id: buf.id, name: buf.name, arguments: buf.args };
    }
    return null;
  }
  if (eventName === "message_delta") {
    const p = payload as { usage?: { output_tokens?: number } };
    if (p.usage?.output_tokens !== undefined) setOutput(p.usage.output_tokens);
    return null;
  }
  if (eventName === "message_start") {
    const p = payload as { message?: { usage?: { input_tokens?: number } } };
    if (p.message?.usage?.input_tokens !== undefined) {
      return { type: "usage", inputTokens: p.message.usage.input_tokens, outputTokens: 0 };
    }
    return null;
  }
  return null;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };
