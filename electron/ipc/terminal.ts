import { ipcMain, BrowserWindow } from "electron";
import { IPC } from "./channels";

/**
 * Phase 5: full implementation with node-pty (spawn pty, stream data, resize, kill).
 * For Phase 3 the channel set is registered with stubbed handlers so the renderer
 * can feature-detect `window.api.terminal` and degrade gracefully until enabled.
 */
export function registerTerminalHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.Terminal.Spawn, async (_e, args: { cwd: string; cols: number; rows: number }) => {
    void args;
    return { id: null, ok: false, reason: "Terminal backend not yet implemented (Phase 5)" };
  });

  ipcMain.handle(IPC.Terminal.Write, async () => ({ ok: false }));
  ipcMain.handle(IPC.Terminal.Resize, async () => ({ ok: false }));
  ipcMain.handle(IPC.Terminal.Kill, async () => ({ ok: false }));
  void getWindow;
}
