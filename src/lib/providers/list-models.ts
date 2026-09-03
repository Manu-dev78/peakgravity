import { providerById, type ProviderId } from "./catalog";

export interface RawModel {
  id: string;
  name: string;
}

/**
 * Fetch the live model list for a provider using the user's own key.
 * Runs on the server (key vault) and in the desktop app.
 */
export async function listProviderModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string | null,
): Promise<RawModel[]> {
  const info = providerById(provider);
  const base = (baseUrl || info.defaultBaseUrl).replace(/\/$/, "");

  if (info.protocol === "anthropic") {
    const res = await fetch(`${base}/models?limit=1000`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(await errorText(res));
    const json = (await res.json()) as { data: { id: string; display_name?: string }[] };
    return json.data.map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
  }

  if (info.protocol === "gemini") {
    const res = await fetch(`${base}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) throw new Error(await errorText(res));
    const json = (await res.json()) as {
      models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return json.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName ?? m.name }));
  }

  // OpenAI-compatible
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(await errorText(res));
  const json = (await res.json()) as { data: { id: string; name?: string }[] };
  return json.data
    .map((m) => ({ id: m.id, name: m.name ?? m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function errorText(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const msg = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message);
    if (msg) return `${res.status}: ${msg}`;
  } catch {
    /* not json */
  }
  return `${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`;
}
