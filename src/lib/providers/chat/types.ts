/**
 * Canonical chat shapes shared by provider adapters (OpenAI-compatible,
 * Anthropic, Gemini) and the agent loop. Adapters translate their wire
 * protocol into these types so the consumer side stays uniform.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessageText {
  role: ChatRole;
  /** Plain text content. When `role === "tool"`, this is the tool result body. */
  content: string;
  /** Required when role === "tool": the tool_call_id this result answers. */
  tool_call_id?: string;
  /** Present on assistant messages when the model issued tool calls. */
  tool_calls?: ChatToolCall[];
  /** Optional name for tool role messages. */
  name?: string;
}

export interface ChatToolCall {
  /** Stable id within a single assistant message. */
  id: string;
  /** The tool/function name. */
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

export interface ChatToolSpec {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's parameters. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessageText[];
  signal?: AbortSignal;
  tools?: ChatToolSpec[];
  /** Provider-specific extra headers (e.g. Anthropic requires `anthropic-version`). */
  extraHeaders?: Record<string, string>;
  /** Maximum tokens to generate. */
  maxTokens?: number;
}

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call_delta"; id: string; name?: string; argumentsDelta: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done" }
  | { type: "error"; message: string };

/** Async generator alias. */
export type ChatEventStream = AsyncGenerator<ChatEvent, void, void>;
