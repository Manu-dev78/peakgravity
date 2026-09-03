import {
  ChevronDown,
  LayoutPanelLeft,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Search,
  Settings,
  Minus,
  Square,
  X,
  Sparkles,
  Copy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { SettingsDialog } from "./SettingsDialog";
import { useIde } from "@/lib/ide-store";
import { useAuth } from "@/hooks/useAuth";
import { isElectron } from "@/lib/electron-api";
import { cn } from "@/lib/utils";

const MENUS = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];

function IconBtn({
  children,
  active,
  title,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  title: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "no-drag flex h-7 w-7 items-center justify-center rounded text-chrome-foreground/80 hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const { workspace, sidebarOpen, toggleSidebar, agentOpen, setAgentOpen, terminalOpen, setTerminalOpen } =
    useIde();
  const { user } = useAuth();
  const [settings, setSettings] = useState<{ open: boolean; tab: "providers" | "account" | "agent" }>({
    open: false,
    tab: "providers",
  });
  const [maximized, setMaximized] = useState(false);
  const electron = isElectron();
  const initials = (user?.email ?? "pg").slice(0, 2).toUpperCase();
  const title = workspace ? `${workspace.name} - PeakGravity IDE` : "PeakGravity IDE";

  useEffect(() => {
    if (!electron) return;
    let mounted = true;
    window.api!.window
      .isMaximized()
      .then((m) => {
        if (mounted) setMaximized(m);
      })
      .catch(() => undefined);
    const off = window.api!.window.onMaximizeChange((m) => setMaximized(m));
    return () => {
      mounted = false;
      off();
    };
  }, [electron]);

  return (
    <header className="drag-region relative flex h-[38px] shrink-0 select-none items-center bg-chrome text-chrome-foreground">
      <div className="flex items-center pl-3">
        <Logo size={18} className="text-primary" />
      </div>
      <nav className="no-drag ml-3 flex items-center gap-0.5 text-[13px]">
        {MENUS.map((m) => (
          <button key={m} className="rounded px-2 py-0.5 hover:bg-accent">
            {m}
          </button>
        ))}
      </nav>

      <div className="pointer-events-none absolute inset-x-0 flex justify-center text-[13px] text-chrome-foreground/90">
        {title}
      </div>

      <div className="ml-auto flex items-center gap-0.5 pr-1">
        <IconBtn title="Customize layout">
          <LayoutPanelLeft size={16} />
        </IconBtn>
        <IconBtn title="Toggle primary side bar (Ctrl+B)" active={sidebarOpen} onClick={toggleSidebar}>
          <PanelLeft size={16} />
        </IconBtn>
        <IconBtn title="Toggle panel (Ctrl+J)" active={terminalOpen} onClick={() => setTerminalOpen(!terminalOpen)}>
          <PanelBottom size={16} />
        </IconBtn>
        <IconBtn title="Toggle agent panel" active={agentOpen} onClick={() => setAgentOpen(!agentOpen)}>
          <PanelRight size={16} />
        </IconBtn>
        <IconBtn title="Search (Ctrl+Shift+P)">
          <Search size={16} />
        </IconBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <IconBtn title="PeakGravity AI" onClick={() => setAgentOpen(true)}>
          <Sparkles size={16} />
        </IconBtn>
        <IconBtn title="Settings" onClick={() => setSettings({ open: true, tab: "providers" })}>
          <Settings size={16} />
        </IconBtn>
        <button
          title={user?.email ?? "Account"}
          onClick={() => setSettings({ open: true, tab: "account" })}
          className="no-drag flex h-7 items-center gap-0.5 rounded px-1.5 hover:bg-accent"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">
            {initials}
          </span>
          <ChevronDown size={12} />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        {electron ? (
          <>
            <IconBtn
              title="Minimize"
              className="w-10 rounded-none hover:bg-accent"
              onClick={() => window.api!.window.minimize()}
            >
              <Minus size={14} />
            </IconBtn>
            <IconBtn
              title={maximized ? "Restore" : "Maximize"}
              className="w-10 rounded-none hover:bg-accent"
              onClick={() => window.api!.window.toggleMaximize()}
            >
              {maximized ? <Copy size={12} /> : <Square size={12} />}
            </IconBtn>
            <IconBtn
              title="Close"
              className="w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => window.api!.window.close()}
            >
              <X size={16} />
            </IconBtn>
          </>
        ) : (
          <>
            <IconBtn title="Minimize" className="w-10 rounded-none hover:bg-accent">
              <Minus size={14} />
            </IconBtn>
            <IconBtn title="Maximize" className="w-10 rounded-none hover:bg-accent">
              <Square size={12} />
            </IconBtn>
            <IconBtn title="Close" className="w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground">
              <X size={16} />
            </IconBtn>
          </>
        )}
      </div>
      {settings.open && (
        <SettingsDialog
          key={settings.tab}
          open
          initialTab={settings.tab}
          onOpenChange={(o) => setSettings((s) => ({ ...s, open: o }))}
        />
      )}
    </header>
  );
}
