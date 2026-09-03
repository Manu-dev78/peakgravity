import { useEffect, useRef, useCallback, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useFsStore, type OpenTab } from "@/lib/fs-store";
import { AlertCircle, RefreshCw, Save, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";

function readOnlyBody(tab: OpenTab) {
  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (tab.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px]">
        <AlertCircle size={20} className="text-destructive" />
        <div className="text-destructive">{tab.error}</div>
        <button
          onClick={() => void useFsStore.getState()!.reloadTab(tab.path)}
          className="mt-2 inline-flex items-center gap-1 rounded-[3px] border border-border bg-secondary px-3 py-1 text-[12px] hover:bg-accent"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }
  if (tab.readOnly) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-[35px] items-center gap-2 border-b border-panel-border bg-chrome px-3 text-[12px] text-muted-foreground">
          <Lock size={13} /> Read-only preview — file is larger than 2MB
        </div>
        <pre className="flex-1 overflow-auto bg-editor p-4 font-mono text-[13px] leading-snug text-foreground">
          {tab.buffer}
        </pre>
      </div>
    );
  }
  return null;
}

export function EditorPane() {
  const { tabs, activeTab, setBuffer, saveActive, reloadTab } = useFsStore();
  const tab = activeTab ? tabs.find((t) => t.path === activeTab) : null;
  const tabRef = useRef<OpenTab | null>(null);
  const [monacoTheme] = useState<"vs-dark">("vs-dark");

  // Keep a ref to the current tab so the editor `onChange` knows which path to write to
  useEffect(() => {
    tabRef.current = tab ?? null;
  }, [tab]);

  const onMount: OnMount = useCallback((_editor, monaco: Monaco) => {
    monaco.editor.defineTheme("peakgravity-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#d4d4d4",
        "editorLineNumber.foreground": "#5a5a5a",
        "editorLineNumber.activeForeground": "#c6c6c6",
        "editorCursor.foreground": "#aeafad",
        "editor.selectionBackground": "#264f78",
        "editor.lineHighlightBackground": "#2a2a2a",
      },
    });
    monaco.editor.setTheme("peakgravity-dark");
  }, []);

  // Save with Ctrl+S
  useEffect(() => {
    if (!tab || tab.readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, saveActive]);

  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center bg-editor text-[13px] text-muted-foreground">
        No file open
      </div>
    );
  }

  if (tab.readOnly || tab.loading || tab.error) {
    return <div className="h-full bg-editor">{readOnlyBody(tab)}</div>;
  }

  return (
    <div className="relative h-full bg-editor">
      {tab.saving && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 flex items-center gap-1 rounded bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          Saving…
        </div>
      )}
      <Editor
        key={tab.path}
        height="100%"
        path={tab.path}
        language={tab.language}
        value={tab.buffer}
        theme={monacoTheme}
        onChange={(v) => {
          if (tabRef.current) setBuffer(tabRef.current.path, v ?? "");
        }}
        onMount={onMount}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme("peakgravity-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [],
            colors: {
              "editor.background": "#1e1e1e",
              "editor.foreground": "#d4d4d4",
              "editorLineNumber.foreground": "#5a5a5a",
              "editorLineNumber.activeForeground": "#c6c6c6",
            },
          });
        }}
        loading={
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            Loading editor…
          </div>
        }
        options={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.5,
          minimap: { enabled: true, scale: 1, maxColumn: 120 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          renderWhitespace: "selection",
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "off",
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, bracketPairs: true },
          padding: { top: 8, bottom: 8 },
        }}
      />
      {isElectron() && tab.dirty && (
        <button
          onClick={() => void saveActive()}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground shadow-lg hover:bg-primary-hover"
        >
          <Save size={12} /> Save (Ctrl+S)
        </button>
      )}
    </div>
  );
}

export function EmptyEditor() {
  return (
    <div className="flex h-full items-center justify-center bg-editor text-[13px] text-muted-foreground">
      Select a file from the Explorer
    </div>
  );
}

export { cn };
