import { Files, Search, GitBranch, Bug, MonitorSmartphone, Blocks, Package } from "lucide-react";
import { useIde, type ActivityView } from "@/lib/ide-store";
import { cn } from "@/lib/utils";

const ITEMS: { id: ActivityView; icon: React.ElementType; label: string }[] = [
  { id: "explorer", icon: Files, label: "Explorer (Ctrl+Shift+E)" },
  { id: "search", icon: Search, label: "Search (Ctrl+Shift+F)" },
  { id: "scm", icon: GitBranch, label: "Source Control (Ctrl+Shift+G)" },
  { id: "run", icon: Bug, label: "Run and Debug (Ctrl+Shift+D)" },
  { id: "remote", icon: MonitorSmartphone, label: "Remote Explorer" },
  { id: "extensions", icon: Blocks, label: "Extensions (Ctrl+Shift+X)" },
];

export function ActivityBar() {
  const { activeView, setActiveView, sidebarOpen } = useIde();
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center bg-chrome py-1">
      {ITEMS.map(({ id, icon: Icon, label }) => {
        const active = sidebarOpen && activeView === id;
        return (
          <button
            key={id}
            title={label}
            onClick={() => setActiveView(id)}
            className={cn(
              "relative flex h-12 w-12 items-center justify-center text-chrome-foreground/55 hover:text-chrome-foreground",
              active && "text-chrome-foreground",
            )}
          >
            {active && <span className="absolute left-0 top-2 h-8 w-0.5 bg-chrome-foreground" />}
            <Icon size={24} strokeWidth={1.5} />
          </button>
        );
      })}
      <button
        title="Packages"
        className="flex h-12 w-12 items-center justify-center text-chrome-foreground/55 hover:text-chrome-foreground"
      >
        <Package size={24} strokeWidth={1.5} />
      </button>
    </aside>
  );
}
