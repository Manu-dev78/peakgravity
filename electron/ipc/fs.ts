import { ipcMain, BrowserWindow } from "electron";
import * as fsp from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { IPC } from "./channels";

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifiedAt: number;
}

export interface FsWatchSubscription {
  id: string;
  root: string;
}

const watchers = new Map<string, { dir: string; timer: NodeJS.Timeout; snapshot: Map<string, number> }>();
let nextWatchId = 1;

/** Hidden / junk dirs we never recurse into. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".tanstack",
  ".nitro",
  ".output",
  "dist",
  "dist-ssr",
  ".DS_Store",
]);

function shouldSkip(name: string, isDir: boolean): boolean {
  if (name.startsWith(".")) return true;
  if (isDir && IGNORED_DIRS.has(name)) return true;
  return false;
}

async function listDirDeep(dir: string, depth: number, maxDepth: number): Promise<DirEntry[]> {
  if (depth > maxDepth) return [];
  const out: DirEntry[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (shouldSkip(e.name, e.isDirectory())) continue;
    const full = path.join(dir, e.name);
    let stat: import("node:fs").Stats | null = null;
    try {
      stat = await fsp.stat(full);
    } catch {
      continue;
    }
    out.push({
      name: e.name,
      path: full,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    });
  }
  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function emitWatchEvent(win: BrowserWindow, id: string, root: string, changed: string[]) {
  if (win.isDestroyed()) return;
  win.webContents.send("fs:watch-event", { id, root, changed });
}

export function registerFsHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.Fs.ReadDir, async (_e, args: { dir: string; depth?: number }) => {
    const depth = args.depth ?? 4;
    return listDirDeep(args.dir, 0, depth);
  });

  ipcMain.handle(IPC.Fs.ReadFile, async (_e, args: { path: string }) => {
    const buf = await fsp.readFile(args.path);
    return {
      path: args.path,
      content: buf.toString("utf8"),
      size: buf.byteLength,
    };
  });

  ipcMain.handle(IPC.Fs.WriteFile, async (_e, args: { path: string; content: string }) => {
    await fsp.mkdir(path.dirname(args.path), { recursive: true });
    await fsp.writeFile(args.path, args.content, "utf8");
    const stat = await fsp.stat(args.path);
    return { path: args.path, size: stat.size, modifiedAt: stat.mtimeMs };
  });

  ipcMain.handle(IPC.Fs.Stat, async (_e, args: { path: string }) => {
    const stat = await fsp.stat(args.path);
    return {
      path: args.path,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    };
  });

  ipcMain.handle(IPC.Fs.Exists, async (_e, args: { path: string }) => existsSync(args.path));

  ipcMain.handle(IPC.Fs.Mkdir, async (_e, args: { path: string; recursive?: boolean }) => {
    await fsp.mkdir(args.path, { recursive: args.recursive ?? true });
    return { ok: true, path: args.path };
  });

  ipcMain.handle(IPC.Fs.Rename, async (_e, args: { from: string; to: string }) => {
    await fsp.mkdir(path.dirname(args.to), { recursive: true });
    await fsp.rename(args.from, args.to);
    return { ok: true, from: args.from, to: args.to };
  });

  ipcMain.handle(IPC.Fs.Delete, async (_e, args: { path: string }) => {
    const stat = await fsp.stat(args.path);
    if (stat.isDirectory()) await fsp.rm(args.path, { recursive: true, force: true });
    else await fsp.unlink(args.path);
    return { ok: true, path: args.path };
  });

  ipcMain.handle(IPC.Fs.Watch, async (_e, args: { dir: string }) => {
    const id = `w${nextWatchId++}`;
    const snapshot = new Map<string, number>();
    const collect = async (root: string, d: number) => {
      if (d > 2) return;
      const entries = await listDirDeep(root, 0, 2);
      for (const e of entries) {
        snapshot.set(e.path, e.modifiedAt);
        if (e.isDirectory) await collect(e.path, d + 1);
      }
    };
    await collect(args.dir, 0);

    const timer = setInterval(async () => {
      const win = getWindow();
      if (!win) return;
      const next = new Map<string, number>();
      const changed: string[] = [];
      const collectNext = async (root: string, d: number) => {
        if (d > 2) return;
        const entries = await listDirDeep(root, 0, 2);
        for (const e of entries) {
          next.set(e.path, e.modifiedAt);
          const prev = snapshot.get(e.path);
          if (prev === undefined || prev !== e.modifiedAt) changed.push(e.path);
          if (e.isDirectory) await collectNext(e.path, d + 1);
        }
      };
      await collectNext(args.dir, 0);

      for (const k of snapshot.keys()) {
        if (!next.has(k)) changed.push(k);
      }
      snapshot.clear();
      for (const [k, v] of next) snapshot.set(k, v);
      if (changed.length) emitWatchEvent(win, id, args.dir, changed);
    }, 1500);

    watchers.set(id, { dir: args.dir, timer, snapshot });
    return { id, root: args.dir };
  });

  ipcMain.handle(IPC.Fs.Unwatch, async (_e, args: { id: string }) => {
    const w = watchers.get(args.id);
    if (w) {
      clearInterval(w.timer);
      watchers.delete(args.id);
    }
    return { ok: true };
  });
}
