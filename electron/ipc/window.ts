import { ipcMain, BrowserWindow } from "electron";
import { IPC } from "./channels";

export function registerWindowHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.Window.Minimize, () => {
    getWindow()?.minimize();
    return { ok: true };
  });
  ipcMain.handle(IPC.Window.ToggleMaximize, () => {
    const w = getWindow();
    if (!w) return { ok: false };
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return { ok: true };
  });
  ipcMain.handle(IPC.Window.IsMaximized, () => Boolean(getWindow()?.isMaximized()));
  ipcMain.handle(IPC.Window.Close, () => {
    getWindow()?.close();
    return { ok: true };
  });
}
