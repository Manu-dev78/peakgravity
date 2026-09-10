/// <reference lib="webworker" />
/**
 * TypeScript language worker.
 *
 * Runs `@typescript/vfs`'s virtual TS service in a Web Worker. The main
 * thread sends typed messages; this worker responds with a typed payload.
 *
 * The service only sees files explicitly added to its virtual FS. That's
 * fine for "open file" features (hover/def on the current file). Full
 * project graph features (cross-file refactors) would need a project
 * indexer — that's a follow-up.
 */

import * as ts from "typescript";
import {
  createDefaultMapFromNodeModules,
  createSystem,
  createVirtualTypeScriptEnvironment,
  type VirtualTypeScriptEnvironment,
} from "@typescript/vfs";

interface AddFileMsg {
  type: "add";
  id: number;
  path: string;
  content: string;
}
interface UpdateFileMsg {
  type: "update";
  id: number;
  path: string;
  content: string;
}
interface RemoveFileMsg {
  type: "remove";
  id: number;
  path: string;
}
interface SetRootMsg {
  type: "setRoot";
  id: number;
  root: string;
  preloadPaths?: { path: string; content: string }[];
}
interface HoverMsg {
  type: "hover";
  id: number;
  path: string;
  line: number;
  column: number;
}
interface DefinitionMsg {
  type: "definition";
  id: number;
  path: string;
  line: number;
  column: number;
}
interface ReferencesMsg {
  type: "references";
  id: number;
  path: string;
  line: number;
  column: number;
}
interface CompletionsMsg {
  type: "completions";
  id: number;
  path: string;
  line: number;
  column: number;
}
interface RenameMsg {
  type: "rename";
  id: number;
  path: string;
  line: number;
  column: number;
  newName: string;
}
interface DiagnosticsMsg {
  type: "diagnostics";
  id: number;
  path: string;
}
interface DisposeMsg {
  type: "dispose";
}

type Incoming =
  | AddFileMsg
  | UpdateFileMsg
  | RemoveFileMsg
  | SetRootMsg
  | HoverMsg
  | DefinitionMsg
  | ReferencesMsg
  | CompletionsMsg
  | RenameMsg
  | DiagnosticsMsg
  | DisposeMsg;

type HoverInfo = {
  contents: string[];
  range?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
};
type FileLocation = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};
type CompletionItem = { label: string; kind: string; detail?: string; insertText: string };
type Diagnostic = {
  message: string;
  category: "error" | "warning" | "info" | "suggestion";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code?: number;
  source: string;
};

let env: VirtualTypeScriptEnvironment | null = null;

function send(payload: { id?: number; type: string; result?: unknown; error?: string }) {
  (self as DedicatedWorkerGlobalScope).postMessage(payload);
}

function ensureEnv(): VirtualTypeScriptEnvironment {
  if (env) return env;
  const fsMap = createDefaultMapFromNodeModules({ target: ts.ScriptTarget.ES2020 }, ts);
  const system = createSystem(fsMap);
  env = createVirtualTypeScriptEnvironment(
    system,
    [],
    ts,
    {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: true,
      resolveJsonModule: true,
    },
    undefined,
  );
  return env;
}

function addOrUpdate(path: string, content: string) {
  ensureEnv().updateFile(path, content);
}

function remove(path: string) {
  if (!env) return;
  try {
    env.deleteFile(path);
  } catch {
    /* file may not exist */
  }
}

function lineColumnFor(
  path: string,
  start: number,
  length: number,
): { startLine: number; startColumn: number; endLine: number; endColumn: number } | null {
  if (!env) return null;
  const file = env.languageService.getProgram()?.getSourceFile(path);
  if (!file) return null;
  const s = file.getLineAndCharacterOfPosition(start);
  const e = file.getLineAndCharacterOfPosition(start + length);
  return {
    startLine: s.line + 1,
    startColumn: s.character + 1,
    endLine: e.line + 1,
    endColumn: e.character + 1,
  };
}

function diagFromDiagnostic(d: ts.Diagnostic): Diagnostic {
  const start = d.start ?? 0;
  const length = d.length ?? 0;
  const lc = lineColumnFor(d.file?.fileName ?? "", start, length) ?? {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1,
  };
  const out: Diagnostic = {
    message: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
    category:
      d.category === ts.DiagnosticCategory.Error
        ? "error"
        : d.category === ts.DiagnosticCategory.Warning
          ? "warning"
          : "info",
    startLine: lc.startLine,
    startColumn: lc.startColumn,
    endLine: lc.endLine,
    endColumn: lc.endColumn,
    source: "typescript",
  };
  if (typeof d.code === "number") out.code = d.code;
  return out;
}

function getFileOrNull(path: string): ts.SourceFile | null {
  if (!env) return null;
  return env.languageService.getProgram()?.getSourceFile(path) ?? null;
}

(self as DedicatedWorkerGlobalScope).onmessage = (e: MessageEvent<Incoming>) => {
  const msg = e.data;
  const id = "id" in msg ? msg.id : 0;
  try {
    if (msg.type === "add" || msg.type === "update") {
      addOrUpdate(msg.path, msg.content);
      send({ id: msg.id, type: msg.type + ":ok" });
      return;
    }
    if (msg.type === "remove") {
      remove(msg.path);
      send({ id: msg.id, type: "remove:ok" });
      return;
    }
    if (msg.type === "setRoot") {
      env = null;
      const e = ensureEnv();
      if (msg.preloadPaths) {
        for (const f of msg.preloadPaths) {
          try {
            e.updateFile(f.path, f.content);
          } catch {
            /* ignore */
          }
        }
      }
      send({ id: msg.id, type: "setRoot:ok" });
      return;
    }

    // From here on, the message has a `path` field. (add/update/remove are
    // already handled above; setRoot/dispose are handled after this block.)
    const pathMsg = msg as
      | HoverMsg
      | DefinitionMsg
      | ReferencesMsg
      | CompletionsMsg
      | RenameMsg
      | DiagnosticsMsg;

    const e = ensureEnv();
    const service = e.languageService;

    if (pathMsg.type === "diagnostics") {
      const syntactic = service.getSyntacticDiagnostics(pathMsg.path);
      const semantic = service.getSemanticDiagnostics(pathMsg.path);
      const suggestion = service.getSuggestionDiagnostics(pathMsg.path);
      const all = [...syntactic, ...semantic, ...suggestion].map(diagFromDiagnostic);
      send({ id: pathMsg.id, type: "diagnostics:result", result: all });
      return;
    }

    // dispose is handled earlier (in the add/update/remove/setRoot section)
    // and isn't a path-bearing message, so pathMsg's type never includes it.

    const file = getFileOrNull(pathMsg.path);
    if (!file) {
      send({ id: pathMsg.id, type: "error", error: `File not in VFS: ${pathMsg.path}` });
      return;
    }
    const position = file.getPositionOfLineAndCharacter(pathMsg.line - 1, pathMsg.column - 1);

    if (pathMsg.type === "hover") {
      const info = service.getQuickInfoAtPosition(pathMsg.path, position);
      const out: HoverInfo | null = info
        ? { contents: [ts.displayPartsToString(info.displayParts) || info.kindModifiers] }
        : null;
      if (info && out) {
        const r = lineColumnFor(pathMsg.path, info.textSpan.start, info.textSpan.length);
        if (r) out.range = r;
      }
      send({ id: pathMsg.id, type: "hover:result", result: out });
      return;
    }

    if (pathMsg.type === "definition") {
      const defs = service.getDefinitionAtPosition(pathMsg.path, position) ?? [];
      const out: FileLocation[] = [];
      for (const d of defs) {
        const lc = lineColumnFor(d.fileName, d.textSpan.start, d.textSpan.length);
        if (!lc) continue;
        out.push({ path: d.fileName, line: lc.startLine, column: lc.startColumn, endLine: lc.endLine, endColumn: lc.endColumn });
      }
      send({ id: pathMsg.id, type: "definition:result", result: out });
      return;
    }

    if (pathMsg.type === "references") {
      const refs = service.getReferencesAtPosition(pathMsg.path, position) ?? [];
      const out: FileLocation[] = [];
      for (const r of refs) {
        const lc = lineColumnFor(r.fileName, r.textSpan.start, r.textSpan.length);
        if (!lc) continue;
        out.push({ path: r.fileName, line: lc.startLine, column: lc.startColumn, endLine: lc.endLine, endColumn: lc.endColumn });
      }
      send({ id: pathMsg.id, type: "references:result", result: out });
      return;
    }

    if (pathMsg.type === "completions") {
      const opts: ts.GetCompletionsAtPositionOptions = {
        triggerKind: ts.CompletionTriggerKind.Invoked,
        includeExternalModuleExports: true,
        includeInsertTextCompletions: true,
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        useLabelDetailsInCompletionEntries: true,
        includeAutomaticOptionalChainCompletions: true,
        includeCompletionsWithObjectLiteralMethodSnippets: true,
      };
      const result = service.getCompletionsAtPosition(pathMsg.path, position, opts);
      const out: CompletionItem[] = [];
      if (result) {
        for (const entry of result.entries) {
          const item: CompletionItem = {
            label: entry.name,
            kind: kindName(entry.kind),
            insertText: entry.insertText ?? entry.name,
          };
          if (entry.kindModifiers) item.detail = entry.kindModifiers;
          out.push(item);
        }
      }
      send({ id: pathMsg.id, type: "completions:result", result: out });
      return;
    }

    if (pathMsg.type === "rename") {
      const span = service.getRenameInfo(pathMsg.path, position, { allowRenameOfImportPath: false });
      if (!span.canRename || !("triggerSpan" in span)) {
        send({ id: pathMsg.id, type: "rename:result", result: null });
        return;
      }
      const triggerSpan = span.triggerSpan;
      const lc = lineColumnFor(pathMsg.path, triggerSpan.start, triggerSpan.length);
      if (!lc) {
        send({ id: pathMsg.id, type: "rename:result", result: null });
        return;
      }
      const newText = file.text.replace(
        file.text.slice(triggerSpan.start, triggerSpan.start + triggerSpan.length),
        pathMsg.newName,
      );
      send({
        id: pathMsg.id,
        type: "rename:result",
        result: {
          path: pathMsg.path,
          startLine: lc.startLine,
          startColumn: lc.startColumn,
          endLine: lc.endLine,
          endColumn: lc.endColumn,
          newText,
        },
      });
      return;
    }
  } catch (err) {
    send({
      id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

function kindName(kind: ts.ScriptElementKind): string {
  const map: Record<string, string> = {
    [ts.ScriptElementKind.alias]: "alias",
    [ts.ScriptElementKind.callSignatureElement]: "call",
    [ts.ScriptElementKind.classElement]: "class",
    [ts.ScriptElementKind.constElement]: "constant",
    [ts.ScriptElementKind.constructorImplementationElement]: "constructor",
    [ts.ScriptElementKind.directory]: "directory",
    [ts.ScriptElementKind.enumElement]: "enum",
    [ts.ScriptElementKind.enumMemberElement]: "enum member",
    [ts.ScriptElementKind.externalModuleName]: "module",
    [ts.ScriptElementKind.memberVariableElement]: "field",
    [ts.ScriptElementKind.scriptElement]: "file",
    [ts.ScriptElementKind.functionElement]: "function",
    [ts.ScriptElementKind.memberGetAccessorElement]: "getter",
    [ts.ScriptElementKind.indexSignatureElement]: "index",
    [ts.ScriptElementKind.interfaceElement]: "interface",
    [ts.ScriptElementKind.keyword]: "keyword",
    [ts.ScriptElementKind.letElement]: "variable",
    [ts.ScriptElementKind.localClassElement]: "class",
    [ts.ScriptElementKind.localFunctionElement]: "function",
    [ts.ScriptElementKind.localVariableElement]: "variable",
    [ts.ScriptElementKind.memberFunctionElement]: "method",
    [ts.ScriptElementKind.moduleElement]: "module",
    [ts.ScriptElementKind.parameterElement]: "parameter",
    [ts.ScriptElementKind.memberSetAccessorElement]: "setter",
    [ts.ScriptElementKind.primitiveType]: "primitive type",
    [ts.ScriptElementKind.string]: "string",
    [ts.ScriptElementKind.typeElement]: "type",
    [ts.ScriptElementKind.typeParameterElement]: "type parameter",
    [ts.ScriptElementKind.variableElement]: "variable",
  };
  return map[kind] ?? String(kind);
}


