/**
 * TypeScript language client.
 *
 * Owns a single Web Worker running `ts-language.worker.ts`. The main thread
 * sends messages and awaits the worker's response by id. Calls are
 * concurrent — multiple providers can request hover/definition/etc. at
 * once without re-ordering.
 */

export interface HoverInfo {
  contents: string[];
  range?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

export interface FileLocation {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
  insertText: string;
}

export interface Problem {
  message: string;
  category: "error" | "warning" | "info" | "suggestion";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code?: number;
  source: string;
}

export interface RenameEdit {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  newText: string;
}

interface Pending<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
}

export class TypeScriptLanguageClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending<unknown>>();

  constructor() {
    if (typeof Worker === "undefined") return;
    this.worker = new Worker(new URL("../workers/ts-language.worker.ts", import.meta.url), {
      type: "module",
      name: "ts-language",
    });
    this.worker.onmessage = (e) => {
      const data = e.data as { id?: number; type: string; result?: unknown; error?: string };
      if (!data || data.id == null) return;
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.type === "error") {
        p.reject(new Error(data.error ?? "Worker error"));
      } else {
        p.resolve(data.result);
      }
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Worker error");
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private call<T>(msg: { type: string; [k: string]: unknown }): Promise<T> {
    if (!this.worker) return Promise.resolve(undefined as T);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  setRoot(root: string, preload: { path: string; content: string }[] = []): Promise<void> {
    return this.call<void>({ type: "setRoot", root, preloadPaths: preload });
  }

  add(path: string, content: string): Promise<void> {
    return this.call<void>({ type: "add", path, content });
  }

  update(path: string, content: string): Promise<void> {
    return this.call<void>({ type: "update", path, content });
  }

  remove(path: string): Promise<void> {
    return this.call<void>({ type: "remove", path });
  }

  hover(path: string, line: number, column: number): Promise<HoverInfo | null> {
    return this.call<HoverInfo | null>({ type: "hover", path, line, column });
  }

  definition(path: string, line: number, column: number): Promise<FileLocation[]> {
    return this.call<FileLocation[]>({ type: "definition", path, line, column });
  }

  references(path: string, line: number, column: number): Promise<FileLocation[]> {
    return this.call<FileLocation[]>({ type: "references", path, line, column });
  }

  completions(path: string, line: number, column: number): Promise<CompletionItem[]> {
    return this.call<CompletionItem[]>({ type: "completions", path, line, column });
  }

  rename(
    path: string,
    line: number,
    column: number,
    newName: string,
  ): Promise<RenameEdit | null> {
    return this.call<RenameEdit | null>({ type: "rename", path, line, column, newName });
  }

  diagnostics(path: string): Promise<Problem[]> {
    return this.call<Problem[]>({ type: "diagnostics", path });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

let _client: TypeScriptLanguageClient | null = null;

export function getTsClient(): TypeScriptLanguageClient {
  if (!_client) _client = new TypeScriptLanguageClient();
  return _client;
}
