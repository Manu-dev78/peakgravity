/**
 * Problems panel — diagnostic list grouped by file, sorted by line/column.
 * Slice L1 ships the scaffold with an empty state; L3 will add filtering,
 * click-to-jump, and the data source from the ProblemsStore.
 */

import { AlertCircle, AlertTriangle, Info, Sparkles, FileWarning } from "lucide-react";
import { useProblemsStore } from "@/lib/problems-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SeverityFilter = "all" | "error" | "warning" | "info";

export function ProblemsPanel() {
  const { problems, errors, warnings, byFile } = useProblemsStore();
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const filtered = problems.filter((p) => {
    if (filter === "all") return true;
    return p.severity === filter;
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-[26px] shrink-0 items-center gap-1 border-b border-panel-border bg-chrome px-2 text-[11px] text-muted-foreground">
        <span>PROBLEMS</span>
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-foreground/80">
          {errors} {errors === 1 ? "error" : "errors"} · {warnings}{" "}
          {warnings === 1 ? "warning" : "warnings"}
        </span>
        <div className="ml-2 flex items-center gap-0.5">
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterBtn>
          <FilterBtn active={filter === "error"} onClick={() => setFilter("error")}>
            <AlertCircle size={10} /> Errors
          </FilterBtn>
          <FilterBtn active={filter === "warning"} onClick={() => setFilter("warning")}>
            <AlertTriangle size={10} /> Warnings
          </FilterBtn>
          <FilterBtn active={filter === "info"} onClick={() => setFilter("info")}>
            <Info size={10} /> Info
          </FilterBtn>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
            <div className="max-w-[280px]">
              <FileWarning size={20} className="mx-auto mb-2 opacity-50" />
              <p>No problems have been detected in this workspace.</p>
              <p className="mt-1">
                Language services (TypeScript, ESLint) will surface diagnostics here as you edit.
              </p>
            </div>
          </div>
        ) : (
          <div className="font-mono text-[12px]">
            {Array.from(byFile.entries())
              .map(([file, list]) => {
                const fileProblems = list.filter((p) => filtered.includes(p));
                if (fileProblems.length === 0) return null;
                return (
                  <div key={file} className="border-b border-panel-border last:border-b-0">
                    <div className="sticky top-0 flex items-center gap-2 bg-chrome/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
                      <Sparkles size={11} />
                      <span className="truncate">{file}</span>
                      <span className="ml-auto">{fileProblems.length}</span>
                    </div>
                    {fileProblems.map((p, i) => (
                      <button
                        key={`${file}-${p.line}-${p.column}-${i}`}
                        onClick={() => {
                          // L3 will wire this to "open the file at line:col"
                          void p;
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-accent/50",
                        )}
                      >
                        <SeverityIcon severity={p.severity} />
                        <span className="shrink-0 text-muted-foreground">
                          [{p.source}
                          {p.code !== undefined ? ` ${p.code}` : ""}]
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {p.line > 0 ? `${p.line}:${p.column}` : "—"}
                        </span>
                        <span className="truncate text-foreground/90">{p.message}</span>
                      </button>
                    ))}
                  </div>
                );
              })
              .filter(Boolean)}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-[20px] items-center gap-1 rounded px-2 text-[11px] hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SeverityIcon({ severity }: { severity: "error" | "warning" | "info" | "hint" }) {
  if (severity === "error") return <AlertCircle size={12} className="shrink-0 text-destructive" />;
  if (severity === "warning") return <AlertTriangle size={12} className="shrink-0 text-warning" />;
  if (severity === "info") return <Info size={12} className="shrink-0 text-primary" />;
  return <Sparkles size={12} className="shrink-0 text-muted-foreground" />;
}
