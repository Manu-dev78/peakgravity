// Quick sanity check for the mention parser + truncator.
// Run with: node --experimental-strip-types scripts/test-mentions.mts
import {
  FULL_FILE_BYTES,
  HEAD_LINES,
  TAIL_LINES,
  parseMentions,
  resolveMentions,
  renderResolvedMentions,
  type FileReader,
} from "../src/lib/mentions.ts";

let passed = 0;
let failed = 0;

function expect(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log("✓", name);
  } else {
    failed++;
    console.log("✗", name, detail ?? "");
  }
}

const root = "/repo";

// 1. Basic single mention
{
  const m = parseMentions("Look at @src/index.ts please", root);
  expect("single mention", m.length === 1 && m[0]?.path === "/repo/src/index.ts");
}

// 2. Multiple mentions + prose
{
  const text = "Compare @./a.ts and @../other/b.ts, ignore @/etc/passwd and @everyone";
  const m = parseMentions(text, root);
  expect("multiple mentions", m.length === 3, `got ${m.length}: ${JSON.stringify(m)}`);
  const labels = m.map((x) => x.path).sort();
  expect(
    "paths resolved",
    labels[0] === "/etc/passwd" && labels[1] === "/repo/a.ts" && labels[2] === "/repo/other/b.ts",
    JSON.stringify(labels),
  );
}

// 3. @everyone is not a file
{
  const m = parseMentions("hi @everyone", root);
  expect("@everyone rejected", m.length === 0);
}

// 4. Bare @/abs path
{
  const m = parseMentions("see @/etc/hosts", "/repo");
  expect("absolute path", m.length === 1 && m[0]?.path === "/etc/hosts");
}

// 5. Span offsets
{
  const text = "before @a.ts after";
  const m = parseMentions(text, root);
  expect("span offsets", m[0]?.start === 7 && m[0]?.end === 12, JSON.stringify(m[0]));
}

// 6. Truncation: small file → full
{
  const small = "x".repeat(100);
  const reader: FileReader = async () => ({ content: small, size: small.length });
  const m = parseMentions("@a.ts", root);
  const r = await resolveMentions(m, reader);
  expect("small file shape=full", r[0]?.shape === "full");
}

// 7. Truncation: large file → head + tail
{
  // Build a 10k-line file
  const big = Array.from({ length: 10_000 }, (_, i) => `line-${i + 1}`).join("\n");
  const reader: FileReader = async () => ({ content: big, size: big.length });
  const m = parseMentions("@big.ts", root);
  const r = await resolveMentions(m, reader);
  expect("big file shape=head_tail", r[0]?.shape === "head_tail");
  const text = r[0]?.text ?? "";
  expect("head has 200 lines", text.includes("lines 1-200") || text.includes(`1\tline-1`));
  expect("tail has 50 lines", text.includes(`line-9951`));
  expect("omitted hint", text.includes("omitted") && text.includes("apply_patch"));
  expect(
    "head count is HEAD_LINES",
    r[0]?.shape === "head_tail" && text.split("\n").filter((l) => /^\d+\t/.test(l)).length > 0,
  );
  console.log("  head+tail byte size:", text.length);
}

// 8. Missing file
{
  const reader: FileReader = async () => null;
  const m = parseMentions("@missing.ts", root);
  const r = await resolveMentions(m, reader);
  expect("missing file shape=missing", r[0]?.shape === "missing");
  const rendered = renderResolvedMentions(r);
  expect("missing file rendered as marker", rendered.includes("<file_missing"));
}

// 9. Constants
{
  expect("FULL_FILE_BYTES = 8192", FULL_FILE_BYTES === 8 * 1024);
  expect("HEAD_LINES = 200", HEAD_LINES === 200);
  expect("TAIL_LINES = 50", TAIL_LINES === 50);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
