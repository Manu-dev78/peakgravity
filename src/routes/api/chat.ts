import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseModelRef, providerById, type ProviderId } from "@/lib/providers/catalog";
import { dispatchStream, withProtocol } from "@/lib/providers/chat/dispatch";
import type { ChatMessageText, ChatToolSpec } from "@/lib/providers/chat/types";
import type { Database } from "@/integrations/supabase/types";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  tool_call_id: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }),
    )
    .optional(),
  name: z.string().optional(),
});

const toolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
});

const bodySchema = z.object({
  modelRef: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  tools: z.array(toolSchema).optional(),
  maxTokens: z.number().int().positive().optional(),
});

function encryptionSecret() {
  const s = process.env["PROVIDER_KEY_ENCRYPTION_SECRET"];
  if (!s) throw new Error("Key vault is not configured");
  return s;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function authenticate(request: Request) {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variable(s)");
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");

  const supabase: SupabaseClient<Database> = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized");
  return { supabase, userId: data.claims.sub };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof bodySchema>;
        try {
          const json = await request.json();
          body = bodySchema.parse(json);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          // Log the failing body shape to make validation errors debuggable.
          try {
            const raw = await request.clone().json().catch(() => null);
            const dump = `[api/chat] body validation failed: ${detail}\nraw=${JSON.stringify(raw)?.slice(0, 1500)}\n`;
            console.error(dump);
            try {
              const fs = await import("node:fs/promises");
              await fs.appendFile("electron/api-chat.log", dump + "\n").catch(() => undefined);
            } catch {
              /* ignore */
            }
          } catch {
            console.error("[api/chat] body validation failed:", detail);
          }
          return jsonError(detail, 400);
        }

        const { supabase, userId } = await authenticate(request).catch((e: unknown) => {
          throw e;
        });

        const ref = parseModelRef(body.modelRef);
        if (!ref) return jsonError("Invalid modelRef", 400);

        const { data: keyRow, error: keyErr } = await supabase
          .from("provider_keys")
          .select("id, provider, base_url, key_ciphertext, user_id")
          .eq("id", ref.keyId)
          .single();
        if (keyErr || !keyRow) return jsonError("Key not found", 404);
        if (keyRow.user_id !== userId) return jsonError("Forbidden", 403);

        const keyProvider = keyRow.provider;
        const keyBaseUrl = keyRow.base_url;
        const keyCiphertext = keyRow.key_ciphertext;

        const info = providerById(keyProvider);
        const baseUrl = (keyBaseUrl ?? info.defaultBaseUrl).replace(/\/$/, "");
        const { decryptSecret } = await import("@/lib/crypto.server");
        const apiKey = await decryptSecret(keyCiphertext, encryptionSecret());

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const write = (obj: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              } catch {
                /* closed */
              }
            };
            try {
              const messages: ChatMessageText[] = body.messages.map((m) => {
                const out: ChatMessageText = { role: m.role, content: m.content };
                if (m.tool_call_id !== undefined) out.tool_call_id = m.tool_call_id;
                if (m.tool_calls !== undefined) out.tool_calls = m.tool_calls;
                if (m.name !== undefined) out.name = m.name;
                return out;
              });
              const tools: ChatToolSpec[] | undefined = body.tools;
              const events = dispatchStream(
                withProtocol(
                  {
                    baseUrl,
                    apiKey,
                    model: ref.modelId,
                    messages,
                    ...(tools ? { tools } : {}),
                    ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
                  },
                  keyProvider,
                ),
              );
              for await (const ev of events) {
                write(ev);
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Stream failed";
              write({ type: "error", message: msg });
            } finally {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
