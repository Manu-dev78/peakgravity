/**
 * Canonical tool schema, shared by all provider adapters. The agent loop
 * registers tools once in this shape; `toolSpecToProvider` translates it
 * into the wire format each provider expects.
 */

import type { ChatToolSpec } from "@/lib/providers/chat/types";

export interface ToolContext {
  /** Absolute path of the active workspace root, or null when no folder is open. */
  root: string | null;
  /** AbortSignal that flips when the user stops the agent. */
  signal: AbortSignal;
  /** Request user approval; resolves to true if approved, false if denied. */
  requestApproval: (description: string, detail?: string) => Promise<boolean>;
  /** Tool call id (assistant message) for correlation with the diff store. */
  toolCallId?: string;
  /** Conversation/thread id. */
  threadId?: string;
  /** Enqueue a diff for review (set when a `DiffProvider` is mounted). */
  requestDiffApproval?: (d: import("@/lib/diff-store").PendingDiff) => string;
}

export interface ToolExecutionResult {
  /** Text content to feed back to the model. */
  content: string;
  /** True if the tool wants the loop to stop (e.g. fatal error). */
  fatal?: boolean;
}

export interface RegisteredTool {
  /** Stable name used in ChatToolSpec and in the registry. */
  name: string;
  /** Short blurb shown to the model in the tool spec. */
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
  /** Whether the tool is gated behind per-call approval when auto-approve is off. */
  requiresApproval: boolean;
  /** Execute the tool. */
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolExecutionResult>;
}

const REGISTRY: Map<string, RegisteredTool> = new Map();

export function registerTool(tool: RegisteredTool): void {
  REGISTRY.set(tool.name, tool);
}

export function unregisterTool(name: string): void {
  REGISTRY.delete(name);
}

export function getTool(name: string): RegisteredTool | undefined {
  return REGISTRY.get(name);
}

export function listTools(): RegisteredTool[] {
  return Array.from(REGISTRY.values());
}

export function registeredToolSpecs(): ChatToolSpec[] {
  return listTools().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/** Translate a canonical ChatToolSpec to the OpenAI-compatible wire format. */
export function openAIToolSpec(t: ChatToolSpec) {
  return {
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

/** Translate a canonical ChatToolSpec to the Anthropic wire format. */
export function anthropicToolSpec(t: ChatToolSpec) {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  };
}

/** Translate a canonical ChatToolSpec to the Gemini function-declaration format. */
export function geminiToolSpec(t: ChatToolSpec) {
  return {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  };
}
