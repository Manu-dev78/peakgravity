// Client-safe provider catalog shared by UI and server code.

export type ProviderId = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  keysUrl: string;
  /** Wire protocol used for chat + model listing */
  protocol: "openai" | "anthropic" | "gemini";
  needsBaseUrl?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    keysUrl: "https://platform.openai.com/api-keys",
    protocol: "openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    keysUrl: "https://console.anthropic.com/settings/keys",
    protocol: "anthropic",
  },
  {
    id: "google",
    name: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyPlaceholder: "AIza...",
    keysUrl: "https://aistudio.google.com/app/apikey",
    protocol: "gemini",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyPlaceholder: "sk-or-...",
    keysUrl: "https://openrouter.ai/keys",
    protocol: "openai",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    defaultBaseUrl: "http://localhost:11434/v1",
    keyPlaceholder: "any-token",
    keysUrl: "",
    protocol: "openai",
    needsBaseUrl: true,
  },
];

export const providerById = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  keyId: string;
}

/** Stable identifier for the model picker: keyId::modelId */
export const modelRef = (keyId: string, modelId: string) => `${keyId}::${modelId}`;
export const parseModelRef = (ref: string) => {
  const i = ref.indexOf("::");
  return i === -1 ? null : { keyId: ref.slice(0, i), modelId: ref.slice(i + 2) };
};
