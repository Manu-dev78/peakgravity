import { useEffect } from "react";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { SideBar } from "./SideBar";
import { StatusBar } from "./StatusBar";
import { AgentPanel } from "./AgentPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { useIde } from "@/lib/ide-store";
import { isElectron, pickFolder } from "@/lib/electron-api";

export function IdeShell() {
  const { sidebarOpen, agentOpen, toggleSidebar, setTerminalOpen, terminalOpen, openWorkspace } = useIde();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setTerminalOpen(!terminalOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, setTerminalOpen, terminalOpen]);

  useEffect(() => {
    if (!isElectron()) return;
    const api = window.api!;
    const offs: Array<() => void> = [];
    offs.push(
      api.menu.onOpenFolder(async () => {
        const res = await pickFolder();
        if (res) openWorkspace({ ...res, openedAt: Date.now() });
      }),
    );
    offs.push(api.menu.onSave(() => window.dispatchEvent(new CustomEvent("pg:save"))));
    offs.push(api.menu.onSaveAll(() => window.dispatchEvent(new CustomEvent("pg:save-all"))));
    return () => offs.forEach((off) => off());
  }, [openWorkspace]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        {sidebarOpen && <SideBar />}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <WelcomeScreen />
          </div>
          {terminalOpen && (
            <div className="h-[220px] shrink-0 border-t border-panel-border bg-chrome p-3 font-mono text-[13px] text-muted-foreground">
              Terminal is available in the desktop build.
            </div>
          )}
        </main>
        {agentOpen && <AgentPanel />}
      </div>
      <StatusBar />
    </div>
  );
}
