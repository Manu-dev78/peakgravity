/**
 * @-mention resolution and truncation for the agent composer.
 *
 * Mentions are tokens in the user text that look like `@/relative/path` or
 * `@relative/path` (both resolve to a file inside the active workspace).
 * A mention is recorded as a span in the original text (start/end char offsets)
 * and is later "resolved" by reading the file and inserting its contents as a
 * system message before the user's turn.
 *
 * Large-file policy (per slice 9 decision):
 *   <= 8KB  → send full content with line numbers
 *   >  8KB → send head (first 200 lines) + tail (last 50 lines) and a
 *            "use apply_patch tool to view ranges" hint so the agent can
 *            still reach the middle via the read_file tool.
 */

export interface Mention {
  /** Absolute path to the file on disk. */
  path: string;
  /** Display label that appeared in the text (e.g. "src/index.ts"). */
  label: string;
  /** Char offset in the original text where the mention starts. */
  start: number;
  /** Char offset (exclusive) where the mention ends. */
  end: number;
}

export interface ResolvedMention {
  mention: Mention;
  /** True if the file was read successfully. */
  ok: boolean;
  /** Human-readable size in bytes (0 if read failed). */
  size: number;
  /** Total line count, when known. */
  totalLines: number;
  /** True when content was truncated. */
  truncated: boolean;
  /** "head" | "tail" | "full" | "error" — what the rendered block represents. */
  shape: "full" | "head_tail" | "missing" | "too_large" | "error";
  /** Rendered text block (already includes the hint, where applicable). */
  text: string;
  /** Optional error message when `ok === false`. */
  error?: string;
}

export const FULL_FILE_BYTES = 8 * 1024;
export const HEAD_LINES = 200;
export const TAIL_LINES = 50;

const MENTION_RE = /(?:^|\s)@((?:\.{0,2}\/)?[^\s@,;]+)/g;

/**
 * Parse mentions out of free-form text. Returns spans in source order,
 * each with the absolute path resolved against the workspace root when
 * `root` is given.
 *
 * Only mention tokens that look like a path (start with `./`, `../`, `/`,
 * or a directory/filename with an extension) are captured — bare `@foo`
 * text isn't treated as a file mention to avoid eating casual chat.
 */
export function parseMentions(text: string, root: string | null): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  // Reset regex state since it's stateful (`g` flag).
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const raw = match[1]!;
    const path = resolveMentionPath(raw, root);
    if (!path) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    // match.index points at the whitespace or BOL right before `@`; advance
    // past it so `start` lands on the `@` itself.
    const leading = match[0].length - raw.length - 1;
    const start = match.index + leading;
    const end = start + 1 + raw.length; // +1 for the `@`
    out.push({ path, label: raw, start, end });
  }
  return out;
}

function resolveMentionPath(raw: string, root: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  if (!root) return null;
  if (raw.startsWith("./") || raw.startsWith("../")) {
    return joinPath(root, raw);
  }
  // Heuristic: must contain a slash or a dot to look like a file path. This
  // avoids treating `@everyone` or `@cursor` as file mentions.
  if (!raw.includes("/") && !raw.includes(".")) return null;
  return joinPath(root, raw);
}

function joinPath(root: string, rel: string): string {
  const r = root.replace(/[\\/]+$/, "");
  const norm = rel.replace(/\\/g, "/");
  if (rel.startsWith("/")) return norm;
  // Resolve `.` and `..` within `rel` only — don't pop parts of `r`.
  const relParts = norm.split("/");
  const stack: string[] = [];
  for (const part of relParts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return r + "/" + stack.join("/");
}

/**
 * Split `text` into segments: the literal user prose and the
 * mention objects in order, so a renderer can turn the text into a
 * list of inline chips + prose.
 */
export function splitWithMentions(
  text: string,
  mentions: Mention[],
): Array<{ kind: "text"; value: string } | { kind: "mention"; mention: Mention }> {
  if (mentions.length === 0) return [{ kind: "text", value: text }];
  const out: Array<{ kind: "text"; value: string } | { kind: "mention"; mention: Mention }> = [];
  let cursor = 0;
  for (const m of mentions) {
    if (m.start > cursor) {
      out.push({ kind: "text", value: text.slice(cursor, m.start) });
    }
    out.push({ kind: "mention", mention: m });
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", value: text.slice(cursor) });
  }
  return out;
}

export type FileReader = (path: string) => Promise<{ content: string; size: number } | null>;

/** Resolve every mention by reading its file. Failures are reported, not thrown. */
export async function resolveMentions(mentions: Mention[], read: FileReader): Promise<ResolvedMention[]> {
  const out: ResolvedMention[] = [];
  for (const m of mentions) {
    const file = await read(m.path);
    if (!file) {
      out.push({
        mention: m,
        ok: false,
        size: 0,
        totalLines: 0,
        truncated: false,
        shape: "missing",
        text: `<file_missing path="${m.path}" label="${escapeAttr(m.label)}" />`,
        error: "File could not be read",
      });
      continue;
    }
    out.push(truncateForContext(m, file.content, file.size));
  }
  return out;
}

function truncateForContext(mention: Mention, content: string, size: number): ResolvedMention {
  const totalLines = content.length === 0 ? 0 : content.split("\n").length;

  if (size <= FULL_FILE_BYTES) {
    return {
      mention,
      ok: true,
      size,
      totalLines,
      truncated: false,
      shape: "full",
      text: `<file path="${mention.path}" label="${escapeAttr(mention.label)}">\n${numbered(content)}\n</file>`,
    };
  }

  if (totalLines <= HEAD_LINES + TAIL_LINES) {
    // Many short lines, but the byte size is large (no newlines). Just include
    // the full content with a hint.
    return {
      mention,
      ok: true,
      size,
      totalLines,
      truncated: false,
      shape: "full",
      text: `<file path="${mention.path}" label="${escapeAttr(mention.label)}" lines="${totalLines}">\n${numbered(content)}\n</file>`,
    };
  }

  const lines = content.split("\n");
  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(-TAIL_LINES);
  const omitted = lines.length - head.length - tail.length;
  const headText = head.map((l, i) => `${i + 1}\t${l}`).join("\n");
  const tailStart = lines.length - tail.length + 1;
  const tailText = tail.map((l, i) => `${tailStart + i}\t${l}`).join("\n");
  return {
    mention,
    ok: true,
    size,
    totalLines: lines.length,
    truncated: true,
    shape: "head_tail",
    text:
      `<file path="${mention.path}" label="${escapeAttr(mention.label)}" lines="${lines.length}" truncated="true">\n` +
      `# head: lines 1-${head.length}\n${headText}\n` +
      `# … ${omitted} lines omitted — use the apply_patch tool with a line range to view them.\n` +
      `# tail: lines ${tailStart}-${lines.length}\n${tailText}\n` +
      `</file>`,
  };
}

function numbered(content: string): string {
  return content
    .split("\n")
    .map((l, i) => `${i + 1}\t${l}`)
    .join("\n");
}

function escapeAttr(s: string): string {
  return s.replace(/[<>"&]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "&":
        return "&amp;";
      default:
        return c;
    }
  });
}

/**
 * Render the resolved mentions into a single system-prompt-style string that
 * we prepend to the user's message. The model sees a `Files mentioned:`
 * header followed by one `<file>...</file>` block per mention.
 */
export function renderResolvedMentions(blocks: ResolvedMention[]): string {
  if (blocks.length === 0) return "";
  const parts: string[] = ["Files mentioned in the user's message:\n"];
  for (const b of blocks) {
    parts.push(b.text);
  }
  return parts.join("\n");
}
