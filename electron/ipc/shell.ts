import { ipcMain, shell } from "electron";
import { IPC } from "./channels";

export function registerShellHandlers() {
  ipcMain.handle(IPC.Shell.OpenExternal, async (_e, args: { url: string }) => {
    await shell.openExternal(args.url);
    return { ok: true };
  });

  ipcMain.handle(IPC.Shell.ShowItemInFolder, async (_e, args: { path: string }) => {
    shell.showItemInFolder(args.path);
    return { ok: true };
  });
}
