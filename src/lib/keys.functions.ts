import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderId } from "./providers/catalog";

const providerSchema = z.enum(["openai", "anthropic", "google", "openrouter", "custom"]);

function encryptionSecret() {
  const s = process.env["PROVIDER_KEY_ENCRYPTION_SECRET"];
  if (!s) throw new Error("Key vault is not configured");
  return s;
}

export interface KeySummary {
  id: string;
  provider: ProviderId;
  label: string;
  baseUrl: string | null;
  last4: string;
  createdAt: string;
}

export const listKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KeySummary[]> => {
    const { data, error } = await context.supabase
      .from("provider_keys")
      .select("id, provider, label, base_url, key_last4, created_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data.map((k) => ({
      id: k.id,
      provider: k.provider as ProviderId,
      label: k.label,
      baseUrl: k.base_url,
      last4: k.key_last4,
      createdAt: k.created_at,
    }));
  });

export const saveKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: providerSchema,
        label: z.string().trim().min(1).max(60),
        apiKey: z.string().trim().min(4).max(4096),
        baseUrl: z.string().trim().url().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import("./crypto.server");
    const ciphertext = await encryptSecret(data.apiKey, encryptionSecret());
    const { data: row, error } = await context.supabase
      .from("provider_keys")
      .insert({
        user_id: context.userId,
        provider: data.provider,
        label: data.label,
        base_url: data.baseUrl ?? null,
        key_ciphertext: ciphertext,
        key_last4: data.apiKey.slice(-4),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("provider_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Validate a key by fetching the live model list from the provider. */
export const listModelsForKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("provider_keys")
      .select("provider, base_url, key_ciphertext")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Key not found");
    const { decryptSecret } = await import("./crypto.server");
    const { listProviderModels } = await import("./providers/list-models");
    const apiKey = await decryptSecret(row.key_ciphertext, encryptionSecret());
    try {
      const models = await listProviderModels(row.provider as ProviderId, apiKey, row.base_url);
      return { ok: true as const, models };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Connection failed" };
    }
  });

/**
 * Returns decrypted keys to their owner. Called once after login by the
 * desktop app; keys stay in memory and are used to call providers directly.
 */
export const getDecryptedKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("provider_keys")
      .select("id, provider, base_url, key_ciphertext");
    if (error) throw new Error(error.message);
    const { decryptSecret } = await import("./crypto.server");
    const secret = encryptionSecret();
    return Promise.all(
      data.map(async (k) => ({
        id: k.id,
        provider: k.provider as ProviderId,
        baseUrl: k.base_url,
        apiKey: await decryptSecret(k.key_ciphertext, secret),
      })),
    );
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data } = await sb
      .from("user_settings")
      .select("default_model, auto_approve, tool_approvals")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      defaultModel: (data?.default_model as string | null) ?? null,
      autoApprove: Boolean(data?.auto_approve),
      toolApprovals: (data?.tool_approvals as Record<string, boolean> | null) ?? {},
    };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        defaultModel: z.string().nullable().optional(),
        autoApprove: z.boolean().optional(),
        toolApprovals: z.record(z.boolean()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const patch: Record<string, unknown> = { user_id: context.userId };
    if (data.defaultModel !== undefined) patch["default_model"] = data.defaultModel;
    if (data.autoApprove !== undefined) patch["auto_approve"] = data.autoApprove;
    if (data.toolApprovals !== undefined) patch["tool_approvals"] = data.toolApprovals;
    const { error } = await sb.from("user_settings").upsert(patch);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

