/**
 * apply_patch — search-and-replace edit on a file.
 *
 * Args:
 *   path:       string
 *   old_text:   string  — exact substring to find (no regex)
 *   new_text:   string  — replacement
 *   replace_all: boolean? — default false
 *
 * The tool reads the current file, performs the substitution, and reports
 * the resulting diff. It does NOT write the file to disk — the diff review
 * UI in slice 13 collects user approval and applies the change via
 * `window.api.fs.writeFile`.
 *
 * Output is a JSON blob the loop appends to the tool result message so the
 * diff review panel can render it.
 */

import type { RegisteredTool } from "../registry";
import type { PendingDiff } from "@/lib/diff-store";
import { isElectron } from "@/lib/electron-api";
import { resolvePath } from "./path-utils";

export interface ApplyPatchDiff {
  path: string;
  oldText: string;
  newText: string;
  replaceAll: boolean;
  /** Number of times `old_text` was matched. 0 = no-op. */
  matches: number;
  /** What the file would look like after the change. */
  afterContent: string;
  /** Lines removed (with line numbers from the original file). */
  removed: { line: number; text: string }[];
  /** Lines added (with line numbers in the new file). */
  added: { line: number; text: string }[];
}

async function read(abs: string): Promise<{ content: string; size: number } | null> {
  if (!isElectron()) return null;
  try {
    const res = await window.api!.fs.readFile(abs);
    return { content: res.content, size: res.size };
  } catch {
    return null;
  }
}

function findMatches(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const positions: number[] = [];
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + Math.max(1, needle.length);
  }
  return positions;
}

export const applyPatchTool: RegisteredTool = {
  name: "apply_patch",
  description:
    "Edit a file via search-and-replace. Reads the current file, performs the substitution, and returns the proposed new content plus a diff. The change is NOT written to disk until the user approves it in the diff review panel.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file." },
      old_text: { type: "string", description: "Exact substring to find in the file. Include enough surrounding context to be unique." },
      new_text: { type: "string", description: "Replacement text." },
      replace_all: { type: "boolean", description: "Replace every occurrence. Default false." },
    },
    required: ["path", "old_text", "new_text"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    const raw = String(args["path"] ?? "");
    const oldText = String(args["old_text"] ?? "");
    const newText = String(args["new_text"] ?? "");
    const replaceAll = Boolean(args["replace_all"]);
    if (!oldText) {
      return { content: JSON.stringify({ error: "old_text is required" }) };
    }
    const abs = resolvePath(raw, ctx.root);
    const file = await read(abs);
    if (!file) {
      return { content: JSON.stringify({ error: `File not found: ${abs}` }) };
    }
    const positions = findMatches(file.content, oldText);
    if (positions.length === 0) {
      return {
        content: JSON.stringify({
          error: "old_text was not found in the file",
          path: abs,
          hint: "Read the file first with read_file and use the exact text.",
        }),
      };
    }
    const matches = replaceAll ? positions.length : 1;
    const afterContent = replaceAll
      ? file.content.split(oldText).join(newText)
      : file.content.replace(oldText, newText);

    // Compute diff stats: very simple line-based — lines that are removed
    // from the old text and lines that are added in the new text, numbered
    // by their position in the *original* file (for removed) and *new* file
    // (for added). This is enough for a side-by-side review panel.
    const oldLines = file.content.split("\n");
    const newLines = afterContent.split("\n");
    const removed: { line: number; text: string }[] = [];
    const added: { line: number; text: string }[] = [];
    // Mark removed lines (lines present in old, missing in new)
    const newSet = new Set(newLines);
    for (let i = 0; i < oldLines.length; i++) {
      if (!newSet.has(oldLines[i]!)) {
        removed.push({ line: i + 1, text: oldLines[i]! });
      }
    }
    // Mark added lines (lines present in new, missing in old)
    const oldSet = new Set(oldLines);
    for (let i = 0; i < newLines.length; i++) {
      if (!oldSet.has(newLines[i]!)) {
        added.push({ line: i + 1, text: newLines[i]! });
      }
    }

    const diff: ApplyPatchDiff = {
      path: abs,
      oldText,
      newText,
      replaceAll,
      matches,
      afterContent,
      removed,
      added,
    };

    // If the tool context carries a diff-enqueue callback (slice 13), push
    // the change into the review queue instead of writing to disk. The agent
    // loop will see `status: "pending_review"` in the result and continue.
    const enqueue = ctx.requestDiffApproval as
      | ((d: Omit<PendingDiff, "id" | "createdAt" | "status">) => string)
      | undefined;
    if (enqueue) {
      enqueue({
        toolCallId: ctx.toolCallId ?? "",
        threadId: ctx.threadId ?? "",
        path: abs,
        oldText,
        newText,
        replaceAll,
        matches,
        afterContent,
        removed,
        added,
      });
      return {
        content: JSON.stringify({
          ok: true,
          status: "pending_review",
          path: abs,
          matches,
          message: "Diff queued for user review. Continue based on this result; the file is not modified until the user accepts.",
        }),
      };
    }
    return { content: JSON.stringify({ diff, ok: true, path: abs, matches }) };
  },
};
