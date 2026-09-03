import type { ChatEvent, ChatEventStream, ChatRequest, ChatMessageText } from "./types";

/**
 * Google Gemini streaming adapter.
 *
 * Wire format notes:
 *  - Endpoint: POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 *  - Auth: query param `?key=...` (NOT Authorization header) for API key auth
 *  - System prompt goes in `systemInstruction.parts`
 *  - Stream chunks: each `data: {...}` line contains a `candidates[0].content.parts[]`
 *  - Tool results live inside the `user` turn as `functionResponse` parts
 *  - functionCall parts map to our `tool_call` event
 */
export async function* streamGeminiChat(req: ChatRequest): ChatEventStream {
  const { baseUrl, apiKey, model, messages, signal, tools, maxTokens, extraHeaders } = req;

  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      const last = contents[contents.length - 1];
      const part: GeminiPart = {
        functionResponse: { name: m.name ?? "", response: parseOrPassThrough(m.content) },
      };
      if (last && last.role === "user" && Array.isArray(last.parts)) {
        last.parts.push(part);
      } else {
        contents.push({ role: "user", parts: [part] });
      }
      continue;
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) {
        parts.push({
          functionCall: { name: tc.name, args: safeParseJson(tc.arguments) },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }

  const generationConfig: Record<string, unknown> = {};
  if (typeof maxTokens === "number") generationConfig["maxOutputTokens"] = maxTokens;

  const body: Record<string, unknown> = { contents };
  if (systemParts.length > 0) {
    body["systemInstruction"] = { role: "system", parts: [{ text: systemParts.join("\n\n") }] };
  }
  if (Object.keys(generationConfig).length > 0) body["generationConfig"] = generationConfig;
  if (tools && tools.length > 0) {
    body["tools"] = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:streamGenerateContent`,
  );
  url.searchParams.set("alt", "sse");
  url.searchParams.set("key", apiKey);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream",
    ...(extraHeaders ?? {}),
  };

  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  if (signal) init.signal = signal;

  const res = await fetch(url, init);
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield {
      type: "error",
      message: `${res.status} ${res.statusText}${text ? `: ${text.slice(0, 400)}` : ""}`,
    };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const seenToolCalls = new Set<string>();
  let toolCallCounter = 0;

  try {
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
        if (dataLine === "[DONE]") continue;
        let payload: unknown;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }
        const chunk = payload as GeminiChunk;
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
        const cand = chunk.candidates?.[0];
        if (!cand) continue;
        const parts = cand.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p.text === "string" && p.text.length > 0) {
            yield { type: "delta", text: p.text };
          }
          if (p.functionCall) {
            const id = `${p.functionCall.name}-${toolCallCounter++}`;
            if (!seenToolCalls.has(id)) {
              seenToolCalls.add(id);
              yield {
                type: "tool_call",
                id,
                name: p.functionCall.name ?? "",
                arguments: JSON.stringify(p.functionCall.args ?? {}),
              };
            }
          }
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return;
    yield { type: "error", message: e instanceof Error ? e.message : "Stream failed" };
    return;
  }

  if (inputTokens || outputTokens) {
    yield { type: "usage", inputTokens, outputTokens };
  }
  yield { type: "done" };
}

function parseOrPassThrough(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { result: s };
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
