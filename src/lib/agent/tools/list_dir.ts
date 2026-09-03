/**
 * list_dir — list a directory's contents.
 *
 * Args:
 *   path:  string?  — defaults to the workspace root
 *   depth: number?  — recursion depth, default 2
 *
 * Skips hidden files, node_modules, .git, and other build outputs.
 */

import type { RegisteredTool } from "../registry";
import { isElectron, type DirEntry } from "@/lib/electron-api";
import { resolvePath } from "./path-utils";

const IGNORED = new Set(["node_modules", ".git", ".next", ".tanstack", ".nitro", "dist", "dist-ssr", ".output", "build", "release", ".wrangler"]);

async function list(abs: string, depth: number, max: number): Promise<DirEntry[]> {
  if (!isElectron()) return [];
  if (depth > max) return [];
  try {
    return await window.api!.fs.readDir(abs, max - depth);
  } catch {
    return [];
  }
}

function render(entries: DirEntry[], root: string, indent: number): string {
  const lines: string[] = [];
  const visible = entries.filter((e) => !e.name.startsWith(".") && !IGNORED.has(e.name));
  visible.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of visible) {
    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}${e.isDirectory ? "📁" : "📄"} ${e.name}`);
  }
  return lines.join("\n");
}

export const listDirTool: RegisteredTool = {
  name: "list_dir",
  description:
    "List a directory in the active workspace. Skips hidden files, node_modules, .git, and build outputs. Use `depth` to recurse (default 2, max 4).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory. Defaults to workspace root." },
      depth: { type: "integer", minimum: 0, maximum: 4, description: "Recursion depth. Default 2." },
    },
  },
  requiresApproval: false,
  async execute(args, ctx) {
    const raw = typeof args["path"] === "string" ? (args["path"] as string) : (ctx.root ?? "");
    const abs = resolvePath(raw, ctx.root);
    if (!abs) {
      return { content: `<error message="No workspace open and no path provided" />` };
    }
    const depth = typeof args["depth"] === "number" ? (args["depth"] as number) : 2;
    const entries = await list(abs, 0, depth);
    if (entries.length === 0) {
      return { content: `<directory path="${abs}" empty="true" />` };
    }
    const body = render(entries, abs, 0);
    // One level of nested listing for depth > 0
    let nested = "";
    if (depth > 0) {
      for (const e of entries.filter((x) => x.isDirectory)) {
        const sub = await list(e.path, 1, depth);
        if (sub.length === 0) continue;
        nested += `\n${render(sub, e.path, 1)}`;
      }
    }
    return {
      content: `<directory path="${abs}" entries="${entries.length}">\n${body}${nested}\n</directory>`,
    };
  },
};
