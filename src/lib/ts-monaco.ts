/**
 * Wires the TypeScript language client into Monaco when a TS-family file
 * is opened. The providers (hover, definition, references, rename,
 * completions) are registered against the language id `"plaintext"`-like
 * — we don't reuse Monaco's bundled `typescript` because that one ships
 * its own (slower, no project awareness) worker and we want the VFS-backed
 * one.
 *
 * For L2 we keep this simple: one language id per file, providers mounted
 * per-model. When the file closes we dispose the providers and the model
 * is freed by Monaco itself.
 */

import * as monaco from "monaco-editor";
import { getTsClient, type FileLocation, type Problem } from "./ts-language-client";
import { useProblemsStore } from "./problems-store";

const LANG_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const LANGUAGE_IDS: Record<string, string> = {
  ts: "peakgravity-ts",
  tsx: "peakgravity-tsx",
  mts: "peakgravity-ts",
  cts: "peakgravity-ts",
  js: "peakgravity-js",
  jsx: "peakgravity-jsx",
  mjs: "peakgravity-js",
  cjs: "peakgravity-js",
};

function languageIdFor(path: string): string | null {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  return LANGUAGE_IDS[ext] ?? null;
}

let registered = false;
const providers = new Map<string, monaco.IDisposable[]>();
const diagnosticsOwner = new Map<string, string>(); // uri -> marker owner id

function ensureLanguagesRegistered() {
  if (registered) return;
  registered = true;
  // Register our own language ids so Monaco doesn't share state with its
  // bundled `typescript` worker.
  monaco.languages.register({ id: "peakgravity-ts", extensions: [".ts", ".mts", ".cts"] });
  monaco.languages.register({ id: "peakgravity-tsx", extensions: [".tsx"] });
  monaco.languages.register({ id: "peakgravity-js", extensions: [".js", ".mjs", ".cjs"] });
  monaco.languages.register({ id: "peakgravity-jsx", extensions: [".jsx"] });
  // Inherit TypeScript's Monarch grammar for syntax highlighting. Monaco
  // exposes a few built-in tokens; for L2 this gives a reasonable color
  // scheme. A full TextMate grammar is a follow-up.
  monaco.languages.setMonarchTokensProvider("peakgravity-ts", {
    tokenizer: tsLikeTokens(),
  });
  monaco.languages.setMonarchTokensProvider("peakgravity-tsx", {
    tokenizer: tsLikeTokens(),
  });
  monaco.languages.setMonarchTokensProvider("peakgravity-js", {
    tokenizer: tsLikeTokens(),
  });
  monaco.languages.setMonarchTokensProvider("peakgravity-jsx", {
    tokenizer: tsLikeTokens(),
  });
}

function tsLikeTokens(): monaco.languages.IMonarchLanguage {
  return {
    defaultToken: "",
    tokenPostfix: ".peakgravity",
    keywords: [
      "break", "case", "catch", "class", "continue", "const",
      "debugger", "default", "delete", "do", "else", "export", "extends",
      "false", "finally", "for", "function", "if", "import", "in", "instanceof",
      "let", "new", "null", "return", "super", "switch", "this", "throw",
      "true", "try", "typeof", "var", "void", "while", "with", "yield",
      "async", "await", "of",
    ],
    typeKeywords: [
      "any", "boolean", "number", "string", "symbol", "undefined",
      "never", "unknown",
    ],
    operators: [
      "<=", ">=", "<", ">", "==", "!=", "===", "!==",
      "+", "-", "*", "/", "%", "++", "--",
      "<<", ">>", ">>>", "&", "|", "^", "!",
      "&&", "||", "??", "?", ":", "=", "+=", "-=", "*=", "/=",
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    tokenizer: {
      root: [
        [/[{}()[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        }],
        [/\d+(@digits)\?/ , "number"],
        [/@octaldigits/, "number"],
        [/@binarydigits/, "number"],
        [/@hexdigits/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string"],
        [/'([^'\\]|\\.)*$/, "string"],
        [/`([^`\\]|\\.)*$/, "string.escape"],
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            "@typeKeywords": "type",
            "@keywords": "keyword",
            "@default": "identifier",
          },
        }],
        [/\s+/, ""],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  };
}

async function pushDiagnostics(uri: monaco.Uri, problems: Problem[]) {
  const problemsStore = (useProblemsStore as unknown as { getState: () => {
    clearFile: (file: string) => void;
    add: (problem: {
      file: string;
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      severity: "error" | "warning" | "info" | "hint";
      message: string;
      source: string;
      code?: string | number;
    }) => void;
  } | null }).getState();
  if (!problemsStore) return;
  const filePath = uri.fsPath;
  problemsStore.clearFile(filePath);
  for (const p of problems) {
    const problem: Parameters<typeof problemsStore.add>[0] = {
      file: filePath,
      line: p.startLine,
      column: p.startColumn,
      endLine: p.endLine,
      endColumn: p.endColumn,
      severity: p.category === "error" ? "error" : p.category === "warning" ? "warning" : "info",
      message: p.message,
      source: "typescript",
    };
    if (p.code !== undefined) problem.code = p.code;
    problemsStore.add(problem);
  }
}

function severityForCategory(c: Problem["category"]): monaco.MarkerSeverity {
  switch (c) {
    case "error":
      return monaco.MarkerSeverity.Error;
    case "warning":
      return monaco.MarkerSeverity.Warning;
    case "info":
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

async function refreshDiagnostics(model: monaco.editor.ITextModel) {
  const path = model.uri.fsPath;
  const client = getTsClient();
  const problems = await client.diagnostics(path);
  await pushDiagnostics(model.uri, problems);
  const markers: monaco.editor.IMarkerData[] = problems.map((p) => ({
    severity: severityForCategory(p.category),
    message: `[TS${p.code ?? ""}] ${p.message}`,
    startLineNumber: p.startLine,
    startColumn: p.startColumn,
    endLineNumber: p.endLine,
    endColumn: p.endColumn,
  }));
  const owner = diagnosticsOwner.get(path) ?? `ts-${path}`;
  monaco.editor.setModelMarkers(model, owner, markers);
  diagnosticsOwner.set(path, owner);
}

export async function attachTypeScriptToModel(
  model: monaco.editor.ITextModel,
  options: { root: string | null; onOpenFile?: (loc: FileLocation) => void },
): Promise<() => void> {
  const path = model.uri.fsPath;
  if (!LANG_RE.test(path)) return () => undefined;
  const langId = languageIdFor(path);
  if (!langId) return () => undefined;

  ensureLanguagesRegistered();
  // Force the model into our language id.
  monaco.editor.setModelLanguage(model, langId);

  const client = getTsClient();
  if (options.root) {
    // Fire-and-forget: setRoot is idempotent on the worker side.
    void client.setRoot(options.root);
  }
  await client.add(path, model.getValue());

  const disposables: monaco.IDisposable[] = [];

  disposables.push(
    monaco.languages.registerHoverProvider(langId, {
      provideHover: async (m, pos) => {
        if (m.uri.toString() !== model.uri.toString()) return null;
        const info = await client.hover(path, pos.lineNumber, pos.column);
        if (!info || info.contents.length === 0) return null;
        const out: monaco.languages.Hover = {
          contents: [{ value: info.contents.join("") }],
        };
        if (info.range) {
          out.range = {
            startLineNumber: info.range.startLine,
            startColumn: info.range.startColumn,
            endLineNumber: info.range.endLine,
            endColumn: info.range.endColumn,
          };
        }
        return out;
      },
    }),
  );

  disposables.push(
    monaco.languages.registerDefinitionProvider(langId, {
      provideDefinition: async (m, pos) => {
        if (m.uri.toString() !== model.uri.toString()) return null;
        const defs = await client.definition(path, pos.lineNumber, pos.column);
        if (defs.length === 0) return null;
        return defs.map((d) => ({
          uri: monaco.Uri.file(d.path),
          range: {
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine,
            endColumn: d.endColumn,
          },
        }));
      },
    }),
  );

  disposables.push(
    monaco.languages.registerReferenceProvider(langId, {
      provideReferences: async (m, pos) => {
        if (m.uri.toString() !== model.uri.toString()) return null;
        const refs = await client.references(path, pos.lineNumber, pos.column);
        return refs.map((r) => ({
          uri: monaco.Uri.file(r.path),
          range: {
            startLineNumber: r.line,
            startColumn: r.column,
            endLineNumber: r.endLine,
            endColumn: r.endColumn,
          },
        }));
      },
    }),
  );

  disposables.push(
    monaco.languages.registerRenameProvider(langId, {
      provideRenameEdits: async (m, pos, newName) => {
        if (m.uri.toString() !== model.uri.toString()) return null;
        const edit = await client.rename(path, pos.lineNumber, pos.column, newName);
        if (!edit) return null;
        const workspaceEdit = {
          edits: [
            {
              resource: monaco.Uri.file(edit.path),
              edit: {
                range: {
                  startLineNumber: edit.startLine,
                  startColumn: edit.startColumn,
                  endLineNumber: edit.endLine,
                  endColumn: edit.endColumn,
                },
                text: edit.newText,
              },
            },
          ],
        } as unknown as monaco.languages.WorkspaceEdit;
        return workspaceEdit;
      },
    }),
  );

  disposables.push(
    monaco.languages.registerCompletionItemProvider(langId, {
      triggerCharacters: [".", "/", "\\", "<", '"', "'", "`", " "],
      provideCompletionItems: async (m, pos) => {
        if (m.uri.toString() !== model.uri.toString()) return null;
        const items = await client.completions(path, pos.lineNumber, pos.column);
        const suggestions: monaco.languages.CompletionItem[] = items.map((it) => {
          const item: monaco.languages.CompletionItem = {
            label: it.label,
            kind: mapKind(it.kind),
            insertText: it.insertText,
            range: {
              startLineNumber: pos.lineNumber,
              startColumn: Math.max(1, pos.column - 1),
              endLineNumber: pos.lineNumber,
              endColumn: pos.column,
            },
          };
          if (it.detail !== undefined) item.detail = it.detail;
          return item;
        });
        return { suggestions };
      },
    }),
  );

  // Diagnostics: refresh after each change. We debounce with a microtask
  // delay so a burst of typing doesn't queue dozens of requests.
  let pending: ReturnType<typeof setTimeout> | null = null;
  const scheduleDiag = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void refreshDiagnostics(model);
    }, 250);
  };
  await refreshDiagnostics(model);
  disposables.push(model.onDidChangeContent(scheduleDiag));

  // Track the providers for cleanup when the file closes.
  providers.set(path, disposables);

  return () => {
    for (const d of disposables) d.dispose();
    providers.delete(path);
    monaco.editor.setModelMarkers(model, `ts-${path}`, []);
    diagnosticsOwner.delete(path);
    void client.remove(path);
  };
}

function mapKind(kind: string): monaco.languages.CompletionItemKind {
  const lc = kind.toLowerCase();
  if (lc.includes("method") || lc.includes("function")) return monaco.languages.CompletionItemKind.Method;
  if (lc.includes("class")) return monaco.languages.CompletionItemKind.Class;
  if (lc.includes("interface")) return monaco.languages.CompletionItemKind.Interface;
  if (lc.includes("enum")) return monaco.languages.CompletionItemKind.Enum;
  if (lc.includes("property") || lc.includes("field")) return monaco.languages.CompletionItemKind.Property;
  if (lc.includes("variable") || lc.includes("parameter")) return monaco.languages.CompletionItemKind.Variable;
  if (lc.includes("keyword")) return monaco.languages.CompletionItemKind.Keyword;
  if (lc.includes("module") || lc.includes("namespace")) return monaco.languages.CompletionItemKind.Module;
  if (lc.includes("type")) return monaco.languages.CompletionItemKind.TypeParameter;
  if (lc.includes("constant")) return monaco.languages.CompletionItemKind.Constant;
  return monaco.languages.CompletionItemKind.Text;
}
