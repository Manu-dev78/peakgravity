/**
 * Map common file extensions to Monaco language ids.
 * Falls back to "plaintext" — Monaco handles unknown langs gracefully.
 */

const MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "html",
  svelte: "html",
  lua: "lua",
  dart: "dart",
  zig: "zig",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

const NAME_OVERRIDES: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  ".bashrc": "shell",
  ".zshrc": "shell",
  ".profile": "shell",
};

export function languageFor(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  if (NAME_OVERRIDES[base]) return NAME_OVERRIDES[base]!;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";
  return MAP[ext] ?? "plaintext";
}

const TEXT_LIKE = new Set([
  "typescript",
  "javascript",
  "json",
  "html",
  "css",
  "scss",
  "less",
  "markdown",
  "python",
  "ruby",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "php",
  "shell",
  "powershell",
  "yaml",
  "ini",
  "xml",
  "sql",
  "graphql",
  "lua",
  "dart",
  "zig",
  "elixir",
  "erlang",
  "haskell",
  "ocaml",
  "dockerfile",
  "makefile",
  "plaintext",
]);

/** Files larger than this won't be opened in the editor; they get a read-only preview. */
export const MAX_EDITABLE_BYTES = 2 * 1024 * 1024; // 2 MB
