/**
 * Bottom panel — Terminal / Problems / Output tabs.
 * L1 ships the empty Problems tab; L2 will populate diagnostics here.
 */

import { Terminal as TerminalIcon, AlertCircle, ListTree } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { useProblemsStore } from "@/lib/problems-store";
import { TerminalPanel } from "./TerminalPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { cn } from "@/lib/utils";

type Tab = "terminal" | "problems" | "output";

const TABS: { id: Tab; label: string; icon: React.ReactNode; group: "primary" | "secondary" }[] = [
  { id: "problems", label: "Problems", icon: <AlertCircle size={12} />, group: "primary" },
  { id: "output", label: "Output", icon: <ListTree size={12} />, group: "primary" },
  { id: "terminal", label: "Terminal", icon: <TerminalIcon size={12} />, group: "primary" },
];

export function BottomPanel() {
  const { bottomTab, setBottomTab } = useIde();
  const problems = useProblemsStore();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[26px] shrink-0 items-center gap-1 border-b border-panel-border bg-chrome text-[11px] text-muted-foreground">
        {TABS.map((t) => {
          const active = bottomTab === t.id;
          const badge =
            t.id === "problems" && problems.errors + problems.warnings > 0
              ? problems.errors + problems.warnings
              : null;
          return (
            <button
              key={t.id}
              onClick={() => setBottomTab(t.id)}
              className={cn(
                "flex h-full items-center gap-1.5 border-b-2 border-transparent px-3 hover:text-foreground",
                active && "border-b-primary text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              {badge !== null && (
                <span className="ml-0.5 rounded bg-secondary px-1 text-[10px] text-foreground/80">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto" />
      </div>
      <div className="min-h-0 flex-1">
        {bottomTab === "terminal" && <TerminalPanel />}
        {bottomTab === "problems" && <ProblemsPanel />}
        {bottomTab === "output" && <OutputPanelPlaceholder />}
      </div>
    </div>
  );
}

function OutputPanelPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
      <div className="max-w-[300px]">
        <ListTree size={20} className="mx-auto mb-2 opacity-50" />
        <p>No output channels yet.</p>
        <p className="mt-1">
          Build, test, and extension logs will appear here once language services and tasks are
          enabled.
        </p>
      </div>
    </div>
  );
}
