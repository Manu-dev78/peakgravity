import { MoreHorizontal, ChevronDown, ChevronRight, FilePlus, FolderPlus } from "lucide-react";
import { useFsStore } from "@/lib/fs-store";
import { useIde } from "@/lib/ide-store";
import { FileTree } from "./FileTree";
import { isElectron } from "@/lib/electron-api";

const TITLES: Record<string, string> = {
  explorer: "Explorer",
  search: "Search",
  scm: "Source Control",
  run: "Run and Debug",
  remote: "Remote Explorer",
  extensions: "Extensions",
};

export function SideBar() {
  const { activeView } = useIde();
  const { openFolder } = useFsStore();
  if (!activeView) return null;

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-panel-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-[35px] items-center justify-between px-5 text-[11px] uppercase tracking-wide">
        {TITLES[activeView]}
        <div className="flex items-center gap-0.5">
          {activeView === "explorer" && isElectron() && (
            <>
              <button
                title="New File"
                onClick={() => useFsStore.getState()!.openFolder()}
                className="rounded p-0.5 hover:bg-accent"
              >
                <FilePlus size={14} />
              </button>
              <button
                title="New Folder"
                onClick={() => void openFolder()}
                className="rounded p-0.5 hover:bg-accent"
              >
                <FolderPlus size={14} />
              </button>
            </>
          )}
          <button className="rounded p-0.5 hover:bg-accent">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeView === "explorer" && <FileTree />}
        {activeView !== "explorer" && (
          <div className="px-5 py-2 text-[13px] text-muted-foreground">Coming soon.</div>
        )}
      </div>
      {activeView === "explorer" && (
        <div className="border-t border-panel-border">
          {["Outline", "Timeline"].map((s) => (
            <button
              key={s}
              className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-bold uppercase hover:bg-accent"
            >
              <ChevronRight size={14} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

