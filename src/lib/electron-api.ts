/**
 * Renderer-side mirror of the Electron preload bridge.
 * Kept in sync manually with electron/preload.ts (small surface, 1:1 mapping).
 */

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifiedAt: number;
}

export interface FsReadResult {
  path: string;
  content: string;
  size: number;
}

export interface FsWriteResult {
  path: string;
  size: number;
  modifiedAt: number;
}

export interface DialogOpenResult {
  name: string;
  path: string;
}

export interface PeakGravityApi {
  app: {
    getInfo: () => Promise<{ version: string; platform: string; isPackaged: boolean }>;
  };
  fs: {
    readDir: (dir: string, depth?: number) => Promise<DirEntry[]>;
    readFile: (path: string) => Promise<FsReadResult>;
    writeFile: (path: string, content: string) => Promise<FsWriteResult>;
    stat: (path: string) => Promise<DirEntry>;
    exists: (path: string) => Promise<boolean>;
    mkdir: (path: string, recursive?: boolean) => Promise<{ ok: true; path: string }>;
    rename: (from: string, to: string) => Promise<{ ok: true; from: string; to: string }>;
    delete: (path: string) => Promise<{ ok: true; path: string }>;
    watch: (dir: string) => Promise<{ id: string; root: string }>;
    unwatch: (id: string) => Promise<{ ok: true }>;
    onChange: (cb: (payload: { id: string; root: string; changed: string[] }) => void) => () => void;
  };
  dialog: {
    openFolder: () => Promise<DialogOpenResult | null>;
    openFile: (opts?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{
      path: string;
    } | null>;
    saveFile: (opts?: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<{ path: string } | null>;
    confirm: (args: {
      message: string;
      detail?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }) => Promise<{ confirmed: boolean }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: true }>;
    showItemInFolder: (path: string) => Promise<{ ok: true }>;
  };
  window: {
    minimize: () => Promise<{ ok: true }>;
    toggleMaximize: () => Promise<{ ok: true }>;
    isMaximized: () => Promise<boolean>;
    close: () => Promise<{ ok: true }>;
    onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  };
  terminal: {
    spawn: (cwd: string, cols: number, rows: number) => Promise<{ id: string | null; ok: boolean; reason?: string }>;
    write: (id: string, data: string) => Promise<{ ok: boolean }>;
    resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
    kill: (id: string) => Promise<{ ok: boolean }>;
    onData: (cb: (payload: { id: string; data: string }) => void) => () => void;
    onExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void;
  };
  menu: {
    onOpenFolder: (cb: () => void) => () => void;
    onOpenFile: (cb: () => void) => () => void;
    onSave: (cb: () => void) => () => void;
    onSaveAll: (cb: () => void) => () => void;
  };
}

declare global {
  interface Window {
    api?: PeakGravityApi;
    /** Legacy bridge — mirrors window.api.dialog.openFolder. */
    peakgravity?: { openFolder?: () => Promise<DialogOpenResult | null> };
  }
}

export const isElectron = (): boolean => typeof window !== "undefined" && !!window.api;

/**
 * Convenience for components that already accepted a "folder picker" result.
 * Returns null on the web preview or if the user cancels.
 */
export async function pickFolder(): Promise<DialogOpenResult | null> {
  if (!isElectron()) return null;
  return window.api!.dialog.openFolder();
}
