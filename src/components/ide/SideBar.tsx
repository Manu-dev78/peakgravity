import { MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { useIde } from "@/lib/ide-store";

const TITLES: Record<string, string> = {
  explorer: "Explorer",
  search: "Search",
  scm: "Source Control",
  run: "Run and Debug",
  remote: "Remote Explorer",
  extensions: "Extensions",
};

export function SideBar() {
  const { activeView, workspace } = useIde();
  if (!activeView) return null;

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-panel-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-[35px] items-center justify-between px-5 text-[11px] uppercase tracking-wide">
        {TITLES[activeView]}
        <button className="rounded p-0.5 hover:bg-accent">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeView === "explorer" && !workspace && (
          <div className="px-5 py-2 text-[13px] text-muted-foreground">
            <p className="mb-3">You have not yet opened a folder.</p>
            <p>Use the Open Folder button on the welcome page, or File &gt; Open Folder.</p>
          </div>
        )}
        {activeView === "explorer" && workspace && (
          <div>
            <button className="flex w-full items-center gap-1 px-1 py-0.5 text-[11px] font-bold uppercase hover:bg-accent">
              <ChevronDown size={14} /> {workspace.name}
            </button>
            <div className="px-6 py-2 text-[13px] text-muted-foreground">
              File tree loads from disk in the desktop build.
            </div>
          </div>
        )}
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
