import { X, Circle, Loader2, AlertCircle, FileText } from "lucide-react";
import { useFsStore, type OpenTab } from "@/lib/fs-store";
import { cn } from "@/lib/utils";

function fileIcon(name: string) {
  if (/\.(md|mdx|txt)$/i.test(name)) return FileText;
  return FileText;
}

function Tab({ tab }: { tab: OpenTab }) {
  const { activeTab, setActiveTab, closeTab } = useFsStore();
  const active = activeTab === tab.path;

  const handleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void closeTab(tab.path);
      return;
    }
    setActiveTab(tab.path);
  };
  const handleAux = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void closeTab(tab.path);
    }
  };
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    void closeTab(tab.path);
  };
  const Icon = fileIcon(tab.name);

  return (
    <div
      role="tab"
      onClick={handleClick}
      onMouseDown={handleAux}
      onAuxClick={handleAux}
      className={cn(
        "group flex h-full max-w-[200px] cursor-pointer items-center gap-2 border-r border-panel-border px-3 text-[13px]",
        active
          ? "bg-editor text-foreground"
          : "bg-tab-inactive text-muted-foreground hover:text-foreground",
      )}
      title={tab.path}
    >
      <Icon size={14} className="shrink-0 opacity-80" />
      <span className="truncate">{tab.name}</span>
      {tab.dirty && tab.saving ? (
        <Loader2 size={11} className="animate-spin text-muted-foreground" />
      ) : tab.dirty ? (
        <Circle size={8} className="shrink-0 fill-primary text-primary" />
      ) : tab.error ? (
        <AlertCircle size={12} className="shrink-0 text-destructive" />
      ) : null}
      <button
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Close tab"
        className={cn(
          "ml-1 flex h-4 w-4 items-center justify-center rounded-sm opacity-0 hover:bg-destructive/30 hover:text-destructive-foreground group-hover:opacity-100",
          active && "opacity-100",
        )}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function EditorTabs() {
  const { tabs, activeTab, setActiveTab } = useFsStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-[35px] shrink-0 select-none overflow-x-auto border-b border-panel-border bg-chrome">
      {tabs.map((t) => (
        <Tab key={t.path} tab={t} />
      ))}
      {activeTab && (
        <div className="ml-auto flex items-center pr-2 text-[11px] text-muted-foreground">
          {tabs.find((t) => t.path === activeTab)?.path}
        </div>
      )}
    </div>
  );
}
