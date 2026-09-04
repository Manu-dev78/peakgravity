import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ConversationSummary {
  id: string;
  title: string;
  modelRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  mentions: { path: string; start: number; end: number }[];
  toolCalls: { id: string; name: string; arguments: string }[] | null;
  toolCallId: string | null;
  name: string | null;
  modelRef: string | null;
  createdAt: string;
}

const roleSchema = z.enum(["system", "user", "assistant", "tool"]);

const mentionSchema = z.object({
  path: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
});

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  model_ref: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  mentions: unknown;
  tool_calls: unknown;
  tool_call_id: string | null;
  name: string | null;
  model_ref: string | null;
  created_at: string;
}

function mapConversation(c: ConversationRow): ConversationSummary {
  return {
    id: c.id,
    title: c.title,
    modelRef: c.model_ref,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function mapMessage(m: MessageRow): StoredMessage {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role as StoredMessage["role"],
    content: m.content,
    mentions: Array.isArray(m.mentions) ? (m.mentions as StoredMessage["mentions"]) : [],
    toolCalls: Array.isArray(m.tool_calls)
      ? (m.tool_calls as StoredMessage["toolCalls"])
      : null,
    toolCallId: m.tool_call_id,
    name: m.name,
    modelRef: m.model_ref,
    createdAt: m.created_at,
  };
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, user_id, title, model_ref, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ConversationRow[]).map(mapConversation);
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ conversation: ConversationSummary; messages: StoredMessage[] }> => {
      const { data: row, error: convErr } = await context.supabase
        .from("conversations")
        .select("id, user_id, title, model_ref, created_at, updated_at")
        .eq("id", data.id)
        .single();
      if (convErr || !row) throw new Error("Conversation not found");
      const conv = row as unknown as ConversationRow;
      if (conv.user_id !== context.userId) throw new Error("Forbidden");

      const { data: msgs, error: msgErr } = await context.supabase
        .from("messages")
        .select(
          "id, conversation_id, role, content, mentions, tool_calls, tool_call_id, name, model_ref, created_at",
        )
        .eq("conversation_id", data.id)
        .order("created_at");
      if (msgErr) throw new Error(msgErr.message);

      return {
        conversation: mapConversation(conv),
        messages: ((msgs ?? []) as unknown as MessageRow[]).map(mapMessage),
      };
    },
  );

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        modelRef: z.string().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const insert: { user_id: string; title?: string; model_ref?: string | null } = {
      user_id: context.userId,
      title: data.title ?? "New chat",
    };
    if (data.modelRef !== undefined) insert.model_ref = data.modelRef;
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert(insert)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create conversation");
    return { id: (row as { id: string }).id };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    void context;
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    void context;
    return { ok: true };
  });

export const appendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        role: roleSchema,
        content: z.string().min(1).max(1_000_000),
        mentions: z.array(mentionSchema).max(100).default([]),
        toolCalls: z.array(toolCallSchema).max(20).optional(),
        toolCallId: z.string().max(200).nullable().optional(),
        name: z.string().max(200).nullable().optional(),
        modelRef: z.string().max(200).nullable().optional(),
        /** Update the conversation's title to this (used to auto-title from first user msg). */
        titleHint: z.string().trim().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ id: string; conversationUpdatedAt: string; conversationTitle: string }> => {
      const { data: conv, error: convErr } = await context.supabase
        .from("conversations")
        .select("id, user_id, title")
        .eq("id", data.conversationId)
        .single();
      if (convErr || !conv) throw new Error("Conversation not found");
      const convRow = conv as unknown as { user_id: string; title: string };
      if (convRow.user_id !== context.userId) throw new Error("Forbidden");

      const { data: row, error: msgErr } = await context.supabase
        .from("messages")
        .insert({
          conversation_id: data.conversationId,
          role: data.role,
          content: data.content,
          mentions: data.mentions,
          ...(data.toolCalls !== undefined ? { tool_calls: data.toolCalls } : {}),
          ...(data.toolCallId !== undefined ? { tool_call_id: data.toolCallId } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.modelRef !== undefined ? { model_ref: data.modelRef } : {}),
        })
        .select("id")
        .single();
      if (msgErr || !row) throw new Error(msgErr?.message ?? "Failed to save message");

      const convPatch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
      if (data.titleHint && (convRow.title === "New chat" || !convRow.title)) {
        convPatch.title = data.titleHint;
      }
      const { data: convUpdated, error: updErr } = await context.supabase
        .from("conversations")
        .update(convPatch)
        .eq("id", data.conversationId)
        .select("updated_at, title")
        .single();
      if (updErr) throw new Error(updErr.message);
      if (!convUpdated) throw new Error("Conversation not found after update");

      return {
        id: (row as { id: string }).id,
        conversationUpdatedAt: convUpdated.updated_at,
        conversationTitle: convUpdated.title,
      };
    },
  );
