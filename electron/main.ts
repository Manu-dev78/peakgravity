import { app, BrowserWindow, Menu, shell, nativeImage } from "electron";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { registerFsHandlers } from "./ipc/fs";
import { registerDialogHandlers } from "./ipc/dialog";
import { registerShellHandlers } from "./ipc/shell";
import { registerWindowHandlers } from "./ipc/window";
import { registerTerminalHandlers } from "./ipc/terminal";

const isDev = !app.isPackaged && process.env["PEAKGRAVITY_DEV"] !== "0";
const DEV_URL = process.env["PEAKGRAVITY_DEV_URL"] ?? "http://localhost:5173";

let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function resolveAppIcon(): Electron.NativeImage | string | undefined {
  // Dev: ../build/icon.ico|icon.png. Packaged: resources/build/icon.ico|icon.png
  const candidates = [
    path.join(__dirname, "..", "..", "build", "icon.ico"),
    path.join(__dirname, "..", "..", "build", "icon.png"),
    path.join(process.resourcesPath ?? "", "build", "icon.ico"),
    path.join(process.resourcesPath ?? "", "build", "icon.png"),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) {
      try {
        return nativeImage.createFromPath(p);
      } catch {
        return p;
      }
    }
  }
  return undefined;
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:open-folder"),
        },
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => mainWindow?.webContents.send("menu:open-file"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("menu:save"),
        },
        {
          label: "Save All",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow?.webContents.send("menu:save-all"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        {
          label: "Command Palette",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => mainWindow?.webContents.send("menu:command-palette"),
        },
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => mainWindow?.webContents.send("menu:toggle-sidebar"),
        },
        {
          label: "Toggle Panel",
          accelerator: "CmdOrCtrl+J",
          click: () => mainWindow?.webContents.send("menu:toggle-panel"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  const appIcon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "PeakGravity",
    backgroundColor: "#1e1e1e",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: process.platform === "darwin" ? { x: 12, y: 12 } : undefined,
    frame: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  // On Windows/Linux the window icon is also used for the taskbar/dock.
  if (appIcon && process.platform !== "darwin" && typeof appIcon !== "string") {
    try {
      mainWindow.setIcon(appIcon);
    } catch {
      /* ignore */
    }
  }

  mainWindow.once("ready-to-show", () => {
    if (process.platform === "darwin" && app.dock && appIcon && typeof appIcon !== "string") {
      try {
        app.dock.setIcon(appIcon);
      } catch {
        /* ignore */
      }
    }
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  registerFsHandlers(getMainWindow);
  registerDialogHandlers();
  registerShellHandlers();
  registerWindowHandlers(getMainWindow);
  registerTerminalHandlers(getMainWindow);
}

app.whenReady().then(() => {
  app.setName("PeakGravity");
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = resolveAppIcon();
    if (dockIcon && typeof dockIcon !== "string") app.dock.setIcon(dockIcon);
  }
  registerIpc();
  buildAppMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
