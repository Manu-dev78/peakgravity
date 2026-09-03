/**
 * Path-resolution helper shared by all tools.
 *
 * Rules:
 *   - Absolute paths (POSIX or Windows) are returned as-is, normalized.
 *   - Relative paths are joined onto the workspace root when given.
 *   - `..` is normalized but never escapes the root (we drop the pop).
 */

export function resolvePath(raw: string, root: string | null): string {
  if (!raw) return root ?? "";
  const norm = raw.replace(/\\/g, "/");
  if (norm.startsWith("/")) return norm;
  if (!root) return norm;
  const rel = norm.split("/");
  const stack: string[] = [];
  for (const part of rel) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return root.replace(/[\\/]+$/, "") + "/" + stack.join("/");
}
