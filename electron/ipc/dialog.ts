import { ipcMain, dialog, BrowserWindow, type BaseWindow } from "electron";
import { IPC } from "./channels";

function winFor(e: Electron.IpcMainInvokeEvent): BaseWindow {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) return w;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  const all = BrowserWindow.getAllWindows();
  if (all[0]) return all[0];
  throw new Error("No BrowserWindow available for dialog");
}

export function registerDialogHandlers() {
  ipcMain.handle(IPC.Dialog.OpenFolder, async (e) => {
    const res = await dialog.showOpenDialog(winFor(e), {
      title: "Open Folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const folderPath = res.filePaths[0]!;
    const name = folderPath.split(/[\\/]/).filter(Boolean).pop() ?? folderPath;
    return { name, path: folderPath };
  });

  ipcMain.handle(
    IPC.Dialog.OpenFile,
    async (e, args?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
      const res = await dialog.showOpenDialog(winFor(e), {
        title: args?.title ?? "Open File",
        properties: ["openFile"],
        filters: args?.filters,
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return { path: res.filePaths[0]! };
    },
  );

  ipcMain.handle(
    IPC.Dialog.SaveFile,
    async (
      e,
      args?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
    ) => {
      const res = await dialog.showSaveDialog(winFor(e), {
        title: args?.title ?? "Save File",
        defaultPath: args?.defaultPath,
        filters: args?.filters,
      });
      if (res.canceled || !res.filePath) return null;
      return { path: res.filePath };
    },
  );

  ipcMain.handle(
    IPC.Dialog.Confirm,
    async (
      e,
      args: { message: string; detail?: string; confirmLabel?: string; cancelLabel?: string },
    ) => {
      const res = await dialog.showMessageBox(winFor(e), {
        type: "question",
        message: args.message,
        detail: args.detail,
        buttons: [args.confirmLabel ?? "OK", args.cancelLabel ?? "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });
      return { confirmed: res.response === 0 };
    },
  );
}
