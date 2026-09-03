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

interface SupabaseAny {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (
          col: string,
          opts?: { ascending?: boolean },
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
      order: (
        col: string,
        opts?: { ascending?: boolean },
      ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      single: () => Promise<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      }>;
    };
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      } & Promise<{ data: unknown; error: { message: string } | null }>;
    };
    delete: () => {
      eq: (
        col: string,
        val: unknown,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

function sbOf(ctx: { supabase: unknown }): SupabaseAny {
  // The Database type is auto-generated from the existing tables; new tables
  // (conversations, messages) need a `supabase gen types` run before this
  // cast can be removed.
  return ctx.supabase as unknown as SupabaseAny;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const sb = sbOf(context);
    const { data, error } = await sb
      .from("conversations")
      .select("id, title, model_ref, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (data ?? []) as Array<{
      id: string;
      title: string;
      model_ref: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return list.map((c) => ({
      id: c.id,
      title: c.title,
      modelRef: c.model_ref,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ conversation: ConversationSummary; messages: StoredMessage[] }> => {
      const sb = sbOf(context);
      const { data: row, error: convErr } = await sb
        .from("conversations")
        .select("id, user_id, title, model_ref, created_at, updated_at")
        .eq("id", data.id)
        .single();
      if (convErr || !row) throw new Error("Conversation not found");
      if (row["user_id"] !== context.userId) throw new Error("Forbidden");

      const { data: msgs, error: msgErr } = await sb
        .from("messages")
        .select(
          "id, conversation_id, role, content, mentions, tool_calls, tool_call_id, name, model_ref, created_at",
        )
        .eq("conversation_id", data.id)
        .order("created_at");
      if (msgErr) throw new Error(msgErr.message);
      const msgList = (msgs ?? []) as Array<{
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
      }>;
      return {
        conversation: {
          id: row["id"] as string,
          title: row["title"] as string,
          modelRef: (row["model_ref"] as string | null) ?? null,
          createdAt: row["created_at"] as string,
          updatedAt: row["updated_at"] as string,
        },
        messages: msgList.map((m) => ({
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
        })),
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
    const sb = sbOf(context);
    const insert: Record<string, unknown> = {
      user_id: context.userId,
      title: data.title ?? "New chat",
    };
    if (data.modelRef !== undefined) insert["model_ref"] = data.modelRef;
    const { data: row, error } = await sb
      .from("conversations")
      .insert(insert)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create conversation");
    return { id: row["id"] as string };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = sbOf(context);
    const { error } = await sb
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = sbOf(context);
    const { error } = await sb.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
      const sb = sbOf(context);
      const { data: conv, error: convErr } = await sb
        .from("conversations")
        .select("id, user_id, title")
        .eq("id", data.conversationId)
        .single();
      if (convErr || !conv) throw new Error("Conversation not found");
      if (conv["user_id"] !== context.userId) throw new Error("Forbidden");

      const insert: Record<string, unknown> = {
        conversation_id: data.conversationId,
        role: data.role,
        content: data.content,
        mentions: data.mentions,
      };
      if (data.toolCalls !== undefined) insert["tool_calls"] = data.toolCalls;
      if (data.toolCallId !== undefined) insert["tool_call_id"] = data.toolCallId;
      if (data.name !== undefined) insert["name"] = data.name;
      if (data.modelRef !== undefined) insert["model_ref"] = data.modelRef;

      const { data: row, error: msgErr } = await sb
        .from("messages")
        .insert(insert)
        .select("id")
        .single();
      if (msgErr || !row) throw new Error(msgErr?.message ?? "Failed to save message");

      const convPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.titleHint && (conv["title"] === "New chat" || !conv["title"])) {
        convPatch["title"] = data.titleHint;
      }
      const { data: convRow, error: updErr } = await sb
        .from("conversations")
        .update(convPatch)
        .eq("id", data.conversationId)
        .select("updated_at, title")
        .single();
      if (updErr) throw new Error(updErr.message);

      return {
        id: row["id"] as string,
        conversationUpdatedAt: convRow?.["updated_at"] as string,
        conversationTitle: convRow?.["title"] as string,
      };
    },
  );
