/**
 * read_file — read a file from the workspace, with optional line range.
 *
 * Args:
 *   path:      string  — absolute or relative-to-root path
 *   startLine: number? — 1-indexed start (inclusive)
 *   endLine:   number? — 1-indexed end (inclusive)
 *
 * Returns the content (with line numbers when truncated to a range) wrapped
 * in a `<file>` block so the model can quote ranges back to apply_patch.
 */

import type { RegisteredTool } from "../registry";
import { isElectron } from "@/lib/electron-api";
import { resolvePath } from "./path-utils";

async function read(abs: string): Promise<{ content: string; size: number } | null> {
  if (!isElectron()) return null;
  try {
    const res = await window.api!.fs.readFile(abs);
    return { content: res.content, size: res.size };
  } catch {
    return null;
  }
}

function numbered(content: string, start: number): string {
  return content
    .split("\n")
    .map((l, i) => `${start + i}\t${l}`)
    .join("\n");
}

export const readFileTool: RegisteredTool = {
  name: "read_file",
  description:
    "Read a file from the active workspace. Returns line-numbered content. Use start_line/end_line to fetch a specific range (1-indexed, inclusive) for large files.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Path to the file. Absolute, or relative to the workspace root (e.g. 'src/index.ts').",
      },
      start_line: { type: "integer", minimum: 1, description: "1-indexed start line (inclusive)." },
      end_line: { type: "integer", minimum: 1, description: "1-indexed end line (inclusive)." },
    },
    required: ["path"],
  },
  requiresApproval: false,
  async execute(args, ctx) {
    const raw = String(args["path"] ?? "");
    const abs = resolvePath(raw, ctx.root);
    const file = await read(abs);
    if (!file) {
      return { content: `<file_missing path="${abs}" />` };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { content: `<file_too_large path="${abs}" size="${file.size}" />` };
    }
    const lines = file.content.split("\n");
    const total = lines.length;
    const startLine = typeof args["start_line"] === "number" ? (args["start_line"] as number) : 1;
    const endLine = typeof args["end_line"] === "number" ? (args["end_line"] as number) : total;
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(total, endLine);
    const slice = lines.slice(startIdx, endIdx).join("\n");
    if (startIdx === 0 && endIdx === total) {
      return {
        content:
          `<file path="${abs}" lines="${total}">\n` +
          numbered(file.content, 1) +
          `\n</file>`,
      };
    }
    return {
      content:
        `<file path="${abs}" lines="${total}" range="${startLine}-${endIdx}">\n` +
        numbered(slice, startLine) +
        `\n</file>`,
    };
  },
};
