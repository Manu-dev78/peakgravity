/**
 * Standalone smoke test for the OpenAI-compatible chat adapter.
 * Run with: node --experimental-strip-types scripts/test-stream.mts
 * (requires the user to set TEST_BASE_URL, TEST_API_KEY, TEST_MODEL env vars).
 */
import { streamOpenAIChat } from "../src/lib/providers/chat/openai-compatible";

const baseUrl = process.env["TEST_BASE_URL"];
const apiKey = process.env["TEST_API_KEY"];
const model = process.env["TEST_MODEL"];

if (!baseUrl || !apiKey || !model) {
  console.log("set TEST_BASE_URL, TEST_API_KEY, TEST_MODEL to run");
  process.exit(0);
}

const events = streamOpenAIChat({
  baseUrl,
  apiKey,
  model,
  messages: [
    { role: "system", content: "You are a helpful assistant. Reply with exactly 12 words." },
    { role: "user", content: "Hello!" },
  ],
  maxTokens: 100,
});

for await (const ev of events) {
  if (ev.type === "delta") process.stdout.write(ev.text);
  else if (ev.type === "error") console.error("\nERROR:", ev.message);
  else if (ev.type === "usage") console.log("\n[usage]", ev);
  else if (ev.type === "done") console.log("\n[done]");
}
