import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ActivityView = "explorer" | "search" | "scm" | "run" | "remote" | "extensions";
export type BottomTab = "terminal" | "problems" | "output";

export interface RecentWorkspace {
  name: string;
  path: string;
  openedAt: number;
}

interface IdeState {
  activeView: ActivityView | null;
  setActiveView: (v: ActivityView | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  bottomOpen: boolean;
  setBottomOpen: (open: boolean) => void;
  bottomTab: BottomTab;
  setBottomTab: (tab: BottomTab) => void;
  /** Legacy: same as `bottomOpen`; kept for back-compat with old menu wiring. */
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  workspace: RecentWorkspace | null;
  openWorkspace: (ws: RecentWorkspace) => void;
  closeWorkspace: () => void;
  recent: RecentWorkspace[];
  selectedModel: string;
  setSelectedModel: (m: string) => void;
}

const IdeContext = createContext<IdeState | null>(null);
const RECENT_KEY = "peakgravity.recentWorkspaces";
const MODEL_KEY = "peakgravity.selectedModel";

export function IdeProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActivityView | null>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [workspace, setWorkspace] = useState<RecentWorkspace | null>(null);
  const [recent, setRecent] = useState<RecentWorkspace[]>([]);
  const [selectedModel, setSelectedModelState] = useState("No model configured");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
      const m = localStorage.getItem(MODEL_KEY);
      if (m) setSelectedModelState(m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<IdeState>(
    () => ({
      activeView,
      setActiveView: (v) => {
        if (v === activeView && sidebarOpen) setSidebarOpen(false);
        else {
          setActiveView(v);
          setSidebarOpen(true);
        }
      },
      sidebarOpen,
      toggleSidebar: () => setSidebarOpen((s) => !s),
      agentOpen,
      setAgentOpen,
      bottomOpen,
      setBottomOpen,
      bottomTab,
      setBottomTab,
      // Legacy compat: the existing menu/keyboard wiring still calls
      // setTerminalOpen; mirror the open state into the bottom panel.
      terminalOpen: bottomOpen,
      setTerminalOpen: (open: boolean) => {
        setBottomOpen(open);
        if (open) setBottomTab("terminal");
      },
      workspace,
      openWorkspace: (ws) => {
        setWorkspace(ws);
        setRecent((prev) => {
          const next = [ws, ...prev.filter((p) => p.path !== ws.path)].slice(0, 10);
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          return next;
        });
      },
      closeWorkspace: () => setWorkspace(null),
      recent,
      selectedModel,
      setSelectedModel: (m) => {
        setSelectedModelState(m);
        localStorage.setItem(MODEL_KEY, m);
      },
    }),
    [activeView, sidebarOpen, agentOpen, bottomOpen, bottomTab, workspace, recent, selectedModel],
  );

  return <IdeContext.Provider value={value}>{children}</IdeContext.Provider>;
}

export function useIde() {
  const ctx = useContext(IdeContext);
  if (!ctx) throw new Error("useIde must be used inside IdeProvider");
  return ctx;
}
