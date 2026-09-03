import { providerById, type ProviderId } from "../catalog";
import { streamOpenAIChat } from "./openai-compatible";
import { streamAnthropicChat } from "./anthropic";
import { streamGeminiChat } from "./gemini";
import type { ChatEventStream, ChatRequest } from "./types";

/** Pick the right adapter based on the provider's protocol. */
export function dispatchStream(req: ChatRequest): ChatEventStream {
  void providerById; // catalog kept for future "if protocol" branching
  // For now we infer the protocol from the caller's intent by inspecting the
  // shape of the request — but the canonical source is the provider, which the
  // API route already knows. We dispatch via the request itself by tagging.
  return dispatchByTag(req);
}

function dispatchByTag(req: ChatRequest): ChatEventStream {
  const tag = (req as ChatRequest & { __protocol?: "openai" | "anthropic" | "gemini" }).__protocol;
  if (tag === "anthropic") return streamAnthropicChat(req);
  if (tag === "gemini") return streamGeminiChat(req);
  return streamOpenAIChat(req);
}

export function getProtocol(provider: ProviderId): "openai" | "anthropic" | "gemini" {
  return providerById(provider).protocol;
}

/** Wrap a request so it dispatches through the provider's protocol. */
export function withProtocol(
  req: ChatRequest,
  provider: ProviderId,
): ChatRequest & { __protocol: "openai" | "anthropic" | "gemini" } {
  return { ...req, __protocol: getProtocol(provider) };
}
