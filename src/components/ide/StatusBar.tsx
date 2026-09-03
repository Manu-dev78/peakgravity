import { Bell, CircleX, TriangleAlert, GitBranch, RefreshCw, Code2, FolderOpen, X, AlertCircle, Loader2 } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { useFsStore } from "@/lib/fs-store";
import { isElectron } from "@/lib/electron-api";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const { workspace, selectedModel } = useIde();
  const { folder, tabs, activeTab, closeFolder, saveAll, openFolder } = useFsStore();
  const dirty = tabs.filter((t) => t.dirty).length;
  const active = activeTab ? tabs.find((t) => t.path === activeTab) : null;
  const electron = isElectron();

  return (
    <footer className="flex h-[22px] shrink-0 select-none items-center bg-status text-[12px] text-status-foreground">
      <button
        title="Open a remote window"
        className="flex h-full items-center px-2 bg-remote text-primary-foreground hover:brightness-110"
      >
        <Code2 size={14} />
      </button>
      {folder && (
        <>
          <button
            title="Close workspace"
            onClick={() => closeFolder()}
            className="flex h-full items-center gap-1 px-2 hover:bg-accent"
          >
            <FolderOpen size={13} />
            <span className="max-w-[260px] truncate">{folder.name}</span>
            <X size={11} className="opacity-60 hover:opacity-100" />
          </button>
          <button
            onClick={() => void saveAll()}
            disabled={dirty === 0}
            className={cn(
              "flex h-full items-center gap-1 px-2 hover:bg-accent",
              dirty === 0 && "opacity-50",
            )}
            title={dirty === 0 ? "No unsaved changes" : `Save all (${dirty} dirty)`}
          >
            <GitBranch size={13} />
            {dirty > 0 ? `${dirty} unsaved` : "clean"}
            <RefreshCw size={12} className="ml-1" />
          </button>
        </>
      )}
      {!folder && electron && (
        <button
          onClick={() => void openFolder()}
          className="flex h-full items-center gap-1 px-2 hover:bg-accent"
        >
          <FolderOpen size={13} /> Open Folder
        </button>
      )}
      <button className="flex h-full items-center gap-1 px-2 hover:bg-accent">
        <CircleX size={13} /> 0 <TriangleAlert size={13} className="ml-1" /> 0
      </button>
      <div className="ml-auto flex h-full items-center">
        {active && (
          <>
            {active.saving && (
              <span className="flex h-full items-center gap-1 px-2 text-status-foreground">
                <Loader2 size={12} className="animate-spin" /> saving
              </span>
            )}
            {active.error && (
              <span
                title={active.error}
                className="flex h-full items-center gap-1 px-2 text-destructive-foreground"
              >
                <AlertCircle size={12} /> error
              </span>
            )}
            {active.readOnly && (
              <span className="flex h-full items-center gap-1 px-2 text-status-foreground">
                read-only
              </span>
            )}
            {workspace && (
              <>
                <button className="h-full px-2 hover:bg-accent">Ln 1, Col 1</button>
                <button className="h-full px-2 hover:bg-accent">Spaces: 2</button>
                <button className="h-full px-2 hover:bg-accent">UTF-8</button>
                <button className="h-full px-2 hover:bg-accent">LF</button>
              </>
            )}
          </>
        )}
        <button className="h-full px-2 hover:bg-accent">{selectedModel}</button>
        <button title="Notifications" className="flex h-full items-center px-2 hover:bg-accent">
          <Bell size={13} />
        </button>
      </div>
    </footer>
  );
}
