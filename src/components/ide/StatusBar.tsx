import { Bell, CircleX, TriangleAlert, GitBranch, RefreshCw, Code2 } from "lucide-react";
import { useIde } from "@/lib/ide-store";

export function StatusBar() {
  const { workspace, selectedModel } = useIde();
  return (
    <footer className="flex h-[22px] shrink-0 select-none items-center bg-status text-[12px] text-status-foreground">
      <button
        title="Open a remote window"
        className="flex h-full items-center px-2 bg-remote text-primary-foreground hover:brightness-110"
      >
        <Code2 size={14} />
      </button>
      {workspace && (
        <button className="flex h-full items-center gap-1 px-2 hover:bg-accent">
          <GitBranch size={13} />
          main* <RefreshCw size={12} className="ml-1" />
        </button>
      )}
      <button className="flex h-full items-center gap-1 px-2 hover:bg-accent">
        <CircleX size={13} /> 0 <TriangleAlert size={13} className="ml-1" /> 0
      </button>
      <div className="ml-auto flex h-full items-center">
        {workspace && (
          <>
            <button className="h-full px-2 hover:bg-accent">Ln 1, Col 1</button>
            <button className="h-full px-2 hover:bg-accent">Spaces: 2</button>
            <button className="h-full px-2 hover:bg-accent">UTF-8</button>
            <button className="h-full px-2 hover:bg-accent">LF</button>
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
