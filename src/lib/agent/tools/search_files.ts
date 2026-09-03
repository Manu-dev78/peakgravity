/**
 * search_files - substring search across the workspace.
 *
 * Args:
 *   query:     string  - substring or simple glob (case-sensitive when the
 *                        query contains uppercase letters; otherwise CI)
 *   glob:      string? - file-name pattern like "*.ts" or "src/** / *.tsx"
 *   max_hits:  number? - cap (default 50)
 *
 * The implementation is a recursive read+substring match. We read each file
 * via the FS bridge. Very large files (>2MB) are skipped.
 */

import type { RegisteredTool } from "../registry";
import { isElectron, type DirEntry } from "@/lib/electron-api";
import { resolvePath } from "./path-utils";

const IGNORED = new Set(["node_modules", ".git", ".next", ".tanstack", ".nitro", "dist", "dist-ssr", ".output", "build", "release", ".wrangler"]);

function globToRegex(glob: string): RegExp {
  // Tiny glob → regex. Supports `*` (any chars except `/`) and `**` (any chars).
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (glob[i] === "/") i++;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      i++;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i++;
      continue;
    }
    if (".\\+^$()|{}[]".includes(c!)) {
      re += "\\" + c;
      i++;
      continue;
    }
    re += c;
    i++;
  }
  return new RegExp("^" + re + "$");
}

async function listDir(abs: string, maxDepth: number, depth = 0): Promise<DirEntry[]> {
  if (!isElectron() || depth > maxDepth) return [];
  try {
    return await window.api!.fs.readDir(abs, maxDepth - depth);
  } catch {
    return [];
  }
}

async function walk(root: string, maxDepth: number): Promise<DirEntry[]> {
  const out: DirEntry[] = [];
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const cur = stack.pop()!;
    const entries = await listDir(cur.dir, maxDepth, cur.depth);
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory) {
        if (IGNORED.has(e.name)) continue;
        out.push(e);
        stack.push({ dir: e.path, depth: cur.depth + 1 });
      } else {
        out.push(e);
      }
    }
  }
  return out;
}

function lineMatches(line: string, query: string): boolean {
  if (query !== query.toLowerCase()) return line.includes(query);
  return line.toLowerCase().includes(query.toLowerCase());
}

export const searchFilesTool: RegisteredTool = {
  name: "search_files",
  description:
    "Search for a substring across files in the workspace. Returns up to max_hits matches with file:line:content. Case-insensitive when the query is all-lowercase.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to search for." },
      glob: { type: "string", description: "Optional filename glob, e.g. '*.ts' or 'src/**/*.tsx'." },
      max_hits: { type: "integer", minimum: 1, maximum: 200, description: "Cap on number of matches. Default 50." },
    },
    required: ["query"],
  },
  requiresApproval: false,
  async execute(args, ctx) {
    const query = String(args["query"] ?? "");
    const glob = typeof args["glob"] === "string" ? (args["glob"] as string) : null;
    const maxHits = typeof args["max_hits"] === "number" ? (args["max_hits"] as number) : 50;
    if (!query) return { content: JSON.stringify({ error: "query is required" }) };
    if (!ctx.root) return { content: JSON.stringify({ error: "No workspace open" }) };

    const matcher = glob ? globToRegex(glob) : null;
    const all = await walk(ctx.root, 5);
    const files = all.filter((e) => !e.isDirectory);
    const hits: { path: string; line: number; text: string }[] = [];
    let scanned = 0;
    outer: for (const f of files) {
      const base = f.path.replace(/\\/g, "/");
      const rel = ctx.root ? base.slice(ctx.root.replace(/\\/g, "/").length + 1) : base;
      if (matcher && !matcher.test(rel)) continue;
      if (!isElectron()) break;
      try {
        const res = await window.api!.fs.readFile(f.path);
        scanned++;
        if (res.size > 2 * 1024 * 1024) continue;
        const lines = res.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lineMatches(lines[i]!, query)) {
            hits.push({ path: f.path, line: i + 1, text: lines[i]! });
            if (hits.length >= maxHits) break outer;
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
    if (hits.length === 0) {
      return { content: JSON.stringify({ ok: true, hits: [], scanned, message: "no matches" }) };
    }
    const formatted = hits
      .map((h) => `${h.path}:${h.line}: ${h.text.trim().slice(0, 200)}`)
      .join("\n");
    return {
      content: `<search query="${query.replace(/"/g, '\\"')}" hits="${hits.length}" scanned="${scanned}">\n${formatted}\n</search>`,
    };
  },
};
