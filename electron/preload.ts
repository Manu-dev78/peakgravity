import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC } from "./ipc/channels";

/**
 * Type-safe bridge between the renderer and the Electron main process.
 * Every method maps 1:1 to an ipcMain.handle() in electron/ipc/*.
 *
 * Renderer-side types live in src/lib/electron-api.ts.
 */

const api = {
  app: {
    getInfo: (): Promise<{ version: string; platform: NodeJS.Platform; isPackaged: boolean }> =>
      ipcRenderer.invoke(IPC.App.GetInfo),
  },
  fs: {
    readDir: (dir: string, depth = 4) => ipcRenderer.invoke(IPC.Fs.ReadDir, { dir, depth }),
    readFile: (p: string) => ipcRenderer.invoke(IPC.Fs.ReadFile, { path: p }),
    writeFile: (p: string, content: string) => ipcRenderer.invoke(IPC.Fs.WriteFile, { path: p, content }),
    stat: (p: string) => ipcRenderer.invoke(IPC.Fs.Stat, { path: p }),
    exists: (p: string) => ipcRenderer.invoke(IPC.Fs.Exists, { path: p }),
    mkdir: (p: string, recursive = true) => ipcRenderer.invoke(IPC.Fs.Mkdir, { path: p, recursive }),
    rename: (from: string, to: string) => ipcRenderer.invoke(IPC.Fs.Rename, { from, to }),
    delete: (p: string) => ipcRenderer.invoke(IPC.Fs.Delete, { path: p }),
    watch: (dir: string) => ipcRenderer.invoke(IPC.Fs.Watch, { dir }),
    unwatch: (id: string) => ipcRenderer.invoke(IPC.Fs.Unwatch, { id }),
    onChange: (cb: (payload: { id: string; root: string; changed: string[] }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; root: string; changed: string[] }) =>
        cb(payload);
      ipcRenderer.on("fs:watch-event", handler);
      return () => ipcRenderer.off("fs:watch-event", handler);
    },
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.Dialog.OpenFolder),
    openFile: (opts?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke(IPC.Dialog.OpenFile, opts ?? {}),
    saveFile: (opts?: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => ipcRenderer.invoke(IPC.Dialog.SaveFile, opts ?? {}),
    confirm: (args: { message: string; detail?: string; confirmLabel?: string; cancelLabel?: string }) =>
      ipcRenderer.invoke(IPC.Dialog.Confirm, args),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC.Shell.OpenExternal, { url }),
    showItemInFolder: (p: string) => ipcRenderer.invoke(IPC.Shell.ShowItemInFolder, { path: p }),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.Window.Minimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.Window.ToggleMaximize),
    isMaximized: () => ipcRenderer.invoke(IPC.Window.IsMaximized) as Promise<boolean>,
    close: () => ipcRenderer.invoke(IPC.Window.Close),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const handler = () => {
        ipcRenderer
          .invoke(IPC.Window.IsMaximized)
          .then((m: boolean) => cb(Boolean(m)))
          .catch(() => undefined);
      };
      ipcRenderer.on("window:maximized", handler);
      ipcRenderer.on("window:unmaximized", handler);
      return () => {
        ipcRenderer.off("window:maximized", handler);
        ipcRenderer.off("window:unmaximized", handler);
      };
    },
  },
  terminal: {
    spawn: (cwd: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.Terminal.Spawn, { cwd, cols, rows }) as Promise<{ id: string | null; ok: boolean; reason?: string }>,
    write: (id: string, data: string) => ipcRenderer.invoke(IPC.Terminal.Write, { id, data }),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke(IPC.Terminal.Resize, { id, cols, rows }),
    kill: (id: string) => ipcRenderer.invoke(IPC.Terminal.Kill, { id }),
    onData: (cb: (payload: { id: string; data: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; data: string }) => cb(payload);
      ipcRenderer.on(IPC.Terminal.Data, handler);
      return () => ipcRenderer.off(IPC.Terminal.Data, handler);
    },
    onExit: (cb: (payload: { id: string; exitCode: number }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; exitCode: number }) => cb(payload);
      ipcRenderer.on(IPC.Terminal.Exit, handler);
      return () => ipcRenderer.off(IPC.Terminal.Exit, handler);
    },
  },
  menu: {
    onOpenFolder: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on("menu:open-folder", h);
      return () => ipcRenderer.off("menu:open-folder", h);
    },
    onOpenFile: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on("menu:open-file", h);
      return () => ipcRenderer.off("menu:open-file", h);
    },
    onSave: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on("menu:save", h);
      return () => ipcRenderer.off("menu:save", h);
    },
    onSaveAll: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on("menu:save-all", h);
      return () => ipcRenderer.off("menu:save-all", h);
    },
  },
};

contextBridge.exposeInMainWorld("api", api);

// Legacy alias — `WelcomeScreen.tsx` already probes `window.peakgravity.openFolder`.
// Keep this for one release so existing components keep working.
contextBridge.exposeInMainWorld("peakgravity", {
  openFolder: () => api.dialog.openFolder(),
});
