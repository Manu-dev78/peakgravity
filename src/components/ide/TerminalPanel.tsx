/**
 * Lightweight terminal log panel.
 *
 * Shows recent output streamed from `window.api.terminal.onData` and onExit.
 * Subscribes to events but does NOT spawn its own session — sessions are
 * driven by the agent's `run_command` tool. A "New shell" button spawns a
 * persistent interactive session when the user wants one.
 *
 * This is a Phase-5 placeholder until a full xterm + node-pty build is
 * available; the log view is enough to see `npm test` output, `git diff`,
 * and other agent-driven command output live.
 */

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { isElectron } from "@/lib/electron-api";

interface Line {
  id: number;
  text: string;
  isStderr: boolean;
}

let nextId = 1;

export function TerminalPanel() {
  const [lines, setLines] = useState<Line[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const electron = isElectron();

  useEffect(() => {
    if (!electron) return;
    const offData = window.api!.terminal.onData((payload) => {
      if (activeId && payload.id !== activeId && payload.id !== "oneshot") return;
      setLines((prev) => [
        ...prev,
        ...payload.data
          .split(/\r?\n/)
          .filter((l) => l.length > 0)
          .map((text) => ({ id: nextId++, text, isStderr: payload.isStderr === true })),
      ]);
    });
    const offExit = window.api!.terminal.onExit((payload) => {
      setLines((prev) => [
        ...prev,
        {
          id: nextId++,
          text: `[exit ${payload.exitCode}]`,
          isStderr: payload.exitCode !== 0,
        },
      ]);
    });
    return () => {
      offData();
      offExit();
    };
  }, [electron, activeId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onClear = () => setLines([]);

  if (!electron) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
        Terminal is available in the desktop build.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[26px] shrink-0 items-center gap-1 border-t border-panel-border bg-chrome px-2 text-[11px] text-muted-foreground">
        <span>TERMINAL</span>
        {activeId && <span className="font-mono">· {activeId.slice(0, 8)}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={onClear}
            title="Clear"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
          >
            <Trash2 size={11} />
          </button>
          {activeId && (
            <button
              onClick={() => window.api!.terminal.kill(activeId)}
              title="Kill session"
              className="rounded p-1 hover:bg-accent hover:text-destructive"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-auto bg-editor px-3 py-2 font-mono text-[12px] leading-snug text-foreground"
      >
        {lines.length === 0 ? (
          <div className="text-muted-foreground">No output yet — agent commands will stream here.</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className={l.isStderr ? "text-destructive" : undefined}>
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
