/**
 * IPC channel names shared between the Electron main process and the renderer.
 * Keep this list small and explicit so the preload bridge stays a 1:1 mirror.
 */

export const IPC = {
  App: {
    GetInfo: "app:get-info",
    SetTitle: "app:set-title",
  },
  Dialog: {
    OpenFolder: "dialog:open-folder",
    OpenFile: "dialog:open-file",
    SaveFile: "dialog:save-file",
    Confirm: "dialog:confirm",
  },
  Fs: {
    ReadDir: "fs:read-dir",
    ReadFile: "fs:read-file",
    WriteFile: "fs:write-file",
    Stat: "fs:stat",
    Exists: "fs:exists",
    Mkdir: "fs:mkdir",
    Rename: "fs:rename",
    Delete: "fs:delete",
    Watch: "fs:watch",
    Unwatch: "fs:unwatch",
  },
  Shell: {
    OpenExternal: "shell:open-external",
    ShowItemInFolder: "shell:show-item-in-folder",
  },
  Window: {
    Minimize: "window:minimize",
    Maximize: "window:maximize",
    Close: "window:close",
    ToggleMaximize: "window:toggle-maximize",
    IsMaximized: "window:is-maximized",
  },
  Terminal: {
    Spawn: "terminal:spawn",
    Write: "terminal:write",
    Resize: "terminal:resize",
    Kill: "terminal:kill",
    RunCommand: "terminal:run-command",
    Data: "terminal:data",
    Exit: "terminal:exit",
  },
} as const;

// Non-handle IPC events (one-way, sent from main to renderer).
export const MENU_EVENTS = [
  "menu:open-folder",
  "menu:open-file",
  "menu:save",
  "menu:save-all",
  "menu:command-palette",
  "menu:toggle-sidebar",
  "menu:toggle-panel",
] as const;
export type MenuEvent = (typeof MENU_EVENTS)[number];

export type IpcChannelMap = typeof IPC;
