import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isElectron, type DirEntry, type FsReadResult } from "./electron-api";
import { useIde } from "./ide-store";
import { languageFor } from "./editor-languages";

export interface OpenTab {
  path: string;
  name: string;
  language: string;
  buffer: string;
  /** Snapshot of buffer at last successful save — used to derive `dirty`. */
  lastSaved: string;
  /** Last known disk mtime for conflict detection. */
  savedMtime: number | null;
  /** True when the user changed the buffer but hasn't saved yet. */
  dirty: boolean;
  /** True when a write is in-flight. */
  saving: boolean;
  /** True when a read is in-flight. */
  loading: boolean;
  /** True when the file on disk is too large to edit (>2MB). */
  readOnly: boolean;
  /** Most recent error message related to this tab, if any. */
  error: string | null;
}

interface FsState {
  folder: { path: string; name: string } | null;
  tree: DirEntry[];
  expanded: Set<string>;
  /** Cached sub-trees keyed by absolute dir path. */
  dirCache: Map<string, DirEntry[]>;
  tabs: OpenTab[];
  activeTab: string | null;
  loadingFolder: boolean;
  error: string | null;

  openFolder: () => Promise<void>;
  closeFolder: () => void;
  openFile: (path: string, options?: { activate?: boolean }) => Promise<void>;
  closeTab: (path: string, options?: { force?: boolean }) => Promise<void>;
  setActiveTab: (path: string) => void;
  toggleDir: (path: string) => Promise<void>;
  setBuffer: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  saveTab: (path: string) => Promise<void>;
  reloadTab: (path: string) => Promise<void>;
  revealInTree: (path: string) => Promise<void>;
  /** True when the user is on the web preview with no real FS. */
  webFallback: boolean;
}

const FsContext = createContext<FsState | null>(null);

/** Return path relative to the current folder, using forward slashes. */
function relPath(folder: string | null, abs: string): string {
  if (!folder) return abs;
  const f = folder.replace(/\\/g, "/");
  const a = abs.replace(/\\/g, "/");
  if (a === f) return "";
  if (a.startsWith(f + "/")) return a.slice(f.length + 1);
  return a;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  return norm.slice(norm.lastIndexOf("/") + 1) || norm;
}

export function FsProvider({ children }: { children: ReactNode }) {
  const ide = useIde();
  const webFallback = !isElectron();

  const [folder, setFolder] = useState<{ path: string; name: string } | null>(null);
  const [tree, setTree] = useState<DirEntry[]>([]);
  const [dirCache, setDirCache] = useState<Map<string, DirEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTabState] = useState<string | null>(null);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchUnsubRef = useRef<(() => void) | null>(null);
  const watchIdRef = useRef<string | null>(null);

  const api = () => (isElectron() ? window.api! : null);

  const refreshRoot = useCallback(async () => {
    const a = api();
    if (!folder || !a) return;
    const next = await a.fs.readDir(folder.path, 4);
    setTree(next);
  }, [folder]);

  const startWatch = useCallback(
    async (dir: string) => {
      const a = api();
      if (!a) return;
      if (watchUnsubRef.current) watchUnsubRef.current();
      if (watchIdRef.current) await a.fs.unwatch(watchIdRef.current).catch(() => undefined);
      try {
        const { id } = await a.fs.watch(dir);
        watchIdRef.current = id;
        watchUnsubRef.current = a.fs.onChange((payload) => {
          if (payload.id !== id) return;
          void handleWatchEvent(payload.changed);
        });
      } catch (e) {
        console.warn("fs watch failed", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleWatchEvent = useCallback(
    async (changed: string[]) => {
      const a = api();
      if (!a || !folder) return;
      // Refresh root if anything inside the visible tree changed.
      const rootPrefix = folder.path.replace(/\\/g, "/");
      const rootHits = changed.filter((p) => {
        const norm = p.replace(/\\/g, "/");
        return norm === rootPrefix || norm.startsWith(rootPrefix + "/");
      });
      if (rootHits.length) {
        try {
          const next = await a.fs.readDir(folder.path, 4);
          setTree(next);
        } catch (e) {
          console.warn("tree refresh failed", e);
        }
      }
      // Drop tabs whose file no longer exists.
      const removed = new Set<string>();
      for (const c of changed) {
        if (!tabs.some((t) => t.path === c)) continue;
        const exists = await a.fs.exists(c).catch(() => false);
        if (!exists) removed.add(c);
      }
      if (removed.size) {
        for (const p of removed) {
          const t = tabs.find((x) => x.path === p);
          if (t?.dirty) {
            const choice = await a.dialog.confirm({
              message: `File was removed on disk: ${t.name}`,
              detail: "You have unsaved changes. Close the tab and discard them?",
              confirmLabel: "Discard",
              cancelLabel: "Keep tab",
            });
            if (!choice.confirmed) continue;
          }
          setTabs((prev) => prev.filter((x) => x.path !== p));
          setActiveTabState((cur) => (cur === p ? null : cur));
        }
      }
    },
    [folder, tabs],
  );

  const openFolder = useCallback(async () => {
    const a = api();
    if (!a) {
      toast.error("Open Folder is only available in the desktop build.");
      return;
    }
    const res = await a.dialog.openFolder();
    if (!res) return;
    setLoadingFolder(true);
    setError(null);
    try {
      setFolder({ path: res.path, name: res.name });
      ide.openWorkspace({ name: res.name, path: res.path, openedAt: Date.now() });
      const next = await a.fs.readDir(res.path, 4);
      setTree(next);
      setDirCache(new Map());
      setExpanded(new Set([res.path]));
      setTabs([]);
      setActiveTabState(null);
      await startWatch(res.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open folder");
      toast.error("Failed to open folder");
    } finally {
      setLoadingFolder(false);
    }
  }, [ide, startWatch]);

  const closeFolder = useCallback(() => {
    const a = api();
    if (a && watchIdRef.current) {
      a.fs.unwatch(watchIdRef.current).catch(() => undefined);
    }
    watchUnsubRef.current?.();
    watchUnsubRef.current = null;
    watchIdRef.current = null;
    setFolder(null);
    setTree([]);
    setDirCache(new Map());
    setExpanded(new Set());
    setTabs([]);
    setActiveTabState(null);
    ide.closeWorkspace();
  }, [ide]);

  const openFile = useCallback(
    async (path: string, options?: { activate?: boolean }) => {
      const a = api();
      if (!a) {
        toast.error("File opening is only available in the desktop build.");
        return;
      }
      const activate = options?.activate ?? true;
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        if (activate) setActiveTabState(path);
        return;
      }
      // Optimistic placeholder
      const placeholder: OpenTab = {
        path,
        name: basename(path),
        language: languageFor(path),
        buffer: "",
        lastSaved: "",
        savedMtime: null,
        dirty: false,
        saving: false,
        loading: true,
        readOnly: false,
        error: null,
      };
      setTabs((prev) => [...prev, placeholder]);
      if (activate) setActiveTabState(path);
      try {
        const res: FsReadResult = await a.fs.readFile(path);
        const stat = await a.fs.stat(path).catch(() => null);
        const tooBig = stat ? stat.size > 2 * 1024 * 1024 : false;
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? {
                  ...t,
                  buffer: res.content,
                  lastSaved: res.content,
                  savedMtime: stat?.modifiedAt ?? null,
                  loading: false,
                  readOnly: tooBig,
                  error: null,
                }
              : t,
          ),
        );
        if (folder) await revealInTree(path);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to read file";
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, loading: false, error: msg } : t)));
        toast.error(`Failed to open ${basename(path)}: ${msg}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, tabs],
  );

  const closeTab = useCallback(
    async (path: string, options?: { force?: boolean }) => {
      const a = api();
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return;
      if (tab.dirty && !options?.force && a) {
        const choice = await a.dialog.confirm({
          message: `Discard unsaved changes in ${tab.name}?`,
          confirmLabel: "Discard",
          cancelLabel: "Cancel",
        });
        if (!choice.confirmed) return;
      }
      setTabs((prev) => prev.filter((t) => t.path !== path));
      setActiveTabState((cur) => {
        if (cur !== path) return cur;
        const remaining = tabs.filter((t) => t.path !== path);
        const last = remaining[remaining.length - 1];
        return last ? last.path : null;
      });
    },
    [tabs],
  );

  const setActiveTab = useCallback((path: string) => {
    setActiveTabState(path);
  }, []);

  const toggleDir = useCallback(
    async (path: string) => {
      const a = api();
      if (!a) return;
      const isOpen = expanded.has(path);
      if (isOpen) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      if (!dirCache.has(path)) {
        try {
          const next = await a.fs.readDir(path, 2);
          setDirCache((prev) => {
            const m = new Map(prev);
            m.set(path, next);
            return m;
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to read directory");
        }
      }
    },
    [dirCache, expanded],
  );

  const setBuffer = useCallback((path: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.path === path
          ? { ...t, buffer: content, dirty: content !== t.lastSaved, error: null }
          : t,
      ),
    );
  }, []);

  const saveTab = useCallback(
    async (path: string) => {
      const a = api();
      if (!a) return;
      const tab = tabs.find((t) => t.path === path);
      if (!tab || tab.readOnly) return;
      setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, saving: true, error: null } : t)));
      try {
        const res = await a.fs.writeFile(path, tab.buffer);
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? {
                  ...t,
                  saving: false,
                  dirty: false,
                  lastSaved: tab.buffer,
                  savedMtime: res.modifiedAt,
                }
              : t,
          ),
        );
        toast.success(`Saved ${tab.name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save";
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, saving: false, error: msg } : t)));
        toast.error(`Failed to save ${tab.name}: ${msg}`);
      }
    },
    [tabs],
  );

  const saveActive = useCallback(async () => {
    if (!activeTab) return;
    await saveTab(activeTab);
  }, [activeTab, saveTab]);

  const saveAll = useCallback(async () => {
    const dirty = tabs.filter((t) => t.dirty);
    for (const t of dirty) {
      // eslint-disable-next-line no-await-in-loop
      await saveTab(t.path);
    }
  }, [tabs, saveTab]);

  const reloadTab = useCallback(
    async (path: string) => {
      const a = api();
      if (!a) return;
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return;
      if (tab.dirty) {
        const choice = await a.dialog.confirm({
          message: `Discard unsaved changes in ${tab.name}?`,
          confirmLabel: "Discard and reload",
          cancelLabel: "Cancel",
        });
        if (!choice.confirmed) return;
      }
      setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, loading: true, error: null } : t)));
      try {
        const res = await a.fs.readFile(path);
        const stat = await a.fs.stat(path).catch(() => null);
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? {
                  ...t,
                  buffer: res.content,
                  lastSaved: res.content,
                  savedMtime: stat?.modifiedAt ?? null,
                  dirty: false,
                  loading: false,
                }
              : t,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to reload";
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, loading: false, error: msg } : t)));
        toast.error(`Failed to reload ${tab.name}: ${msg}`);
      }
    },
    [tabs],
  );

  const revealInTree = useCallback(
    async (path: string) => {
      if (!folder) return;
      const a = api();
      if (!a) return;
      const norm = path.replace(/\\/g, "/");
      const root = folder.path.replace(/\\/g, "/");
      if (norm === root) return;
      if (!norm.startsWith(root + "/")) return;
      const parts = norm.slice(root.length + 1).split("/");
      const dirsToExpand: string[] = [];
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur + "/" + parts[i];
        dirsToExpand.push(cur);
      }
      for (const d of dirsToExpand) {
        if (!dirCache.has(d)) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const next = await a.fs.readDir(d, 2);
            setDirCache((prev) => {
              const m = new Map(prev);
              m.set(d, next);
              return m;
            });
          } catch (e) {
            console.warn("revealInTree failed", e);
          }
        }
        setExpanded((prev) => {
          if (prev.has(d)) return prev;
          const n = new Set(prev);
          n.add(d);
          return n;
        });
      }
    },
    [dirCache, folder],
  );

  // Wire the `pg:save` / `pg:save-all` custom events from the menu (IdeShell).
  useEffect(() => {
    const onSave = () => {
      void saveActive();
    };
    const onSaveAll = () => {
      void saveAll();
    };
    window.addEventListener("pg:save", onSave);
    window.addEventListener("pg:save-all", onSaveAll);
    return () => {
      window.removeEventListener("pg:save", onSave);
      window.removeEventListener("pg:save-all", onSaveAll);
    };
  }, [saveActive, saveAll]);

  // Re-attach the watcher when the folder changes (e.g. via WelcomeScreen).
  useEffect(() => {
    if (folder) {
      void startWatch(folder.path);
    }
    return () => {
      // Cleanup on unmount only — startWatch replaces the subscription.
    };
  }, [folder, startWatch]);

  const value = useMemo<FsState>(
    () => ({
      folder,
      tree,
      expanded,
      dirCache,
      tabs,
      activeTab,
      loadingFolder,
      error,
      openFolder,
      closeFolder,
      openFile,
      closeTab,
      setActiveTab,
      toggleDir,
      setBuffer,
      saveActive,
      saveAll,
      saveTab,
      reloadTab,
      revealInTree,
      webFallback,
    }),
    [
      folder,
      tree,
      expanded,
      dirCache,
      tabs,
      activeTab,
      loadingFolder,
      error,
      openFolder,
      closeFolder,
      openFile,
      closeTab,
      setActiveTab,
      toggleDir,
      setBuffer,
      saveActive,
      saveAll,
      saveTab,
      reloadTab,
      revealInTree,
      webFallback,
    ],
  );

  return <FsContext.Provider value={value}>{children}</FsContext.Provider>;
}

export function useFsStore(): FsState {
  const ctx = useContext(FsContext);
  if (!ctx) throw new Error("useFsStore must be used inside FsProvider");
  return ctx;
}

export { relPath };
