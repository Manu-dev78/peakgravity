import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useFsStore } from "@/lib/fs-store";
import { isElectron, type DirEntry } from "@/lib/electron-api";
import { cn } from "@/lib/utils";

const FOLDER_ICON: Record<string, string> = {
  src: "🧩",
  components: "🧱",
  pages: "📄",
  routes: "🛣️",
  hooks: "🪝",
  lib: "📚",
  utils: "🔧",
  styles: "🎨",
  public: "🌐",
  test: "🧪",
  tests: "🧪",
  __tests__: "🧪",
  docs: "📖",
  scripts: "📜",
  assets: "🖼️",
  images: "🖼️",
  icons: "✨",
};

function getFolderEmoji(name: string): string | null {
  return FOLDER_ICON[name.toLowerCase()] ?? null;
}

function fileIconFor(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["md", "mdx", "txt"].includes(ext)) return FileText;
  return File;
}

interface RowProps {
  entry: DirEntry;
  depth: number;
}

function FileRow({ entry, depth }: RowProps) {
  const { activeTab, openFile, setActiveTab, tabs } = useFsStore();
  const active = activeTab === entry.path;
  const isOpen = tabs.some((t) => t.path === entry.path);
  const Icon = fileIconFor(entry.name);
  const handleClick = () => {
    if (!isElectron()) return;
    void openFile(entry.path);
  };
  const handleAux = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void openFile(entry.path, { activate: false });
    }
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          onClick={handleClick}
          onMouseDown={handleAux}
          onAuxClick={handleAux}
          className={cn(
            "group flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[13px] hover:bg-accent",
            (active || isOpen) && "bg-accent/60",
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
          title={entry.path}
        >
          <span className="w-3 shrink-0" />
          <Icon size={14} className="shrink-0 text-muted-foreground" />
          <span className={cn("truncate", isOpen && "text-foreground")}>{entry.name}</span>
        </button>
      </ContextMenu.Trigger>
      <FileContextMenu entry={entry} onActivate={() => setActiveTab(entry.path)} />
    </ContextMenu.Root>
  );
}

function DirRow({ entry, depth }: RowProps) {
  const { expanded, toggleDir, dirCache, openFile } = useFsStore();
  const isOpen = expanded.has(entry.path);
  const children = dirCache.get(entry.path) ?? [];
  const emoji = getFolderEmoji(entry.name);

  const onHeaderClick = () => {
    if (!isElectron()) return;
    void toggleDir(entry.path);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <Collapsible.Root open={isOpen}>
          <Collapsible.Trigger asChild>
            <button
              onClick={onHeaderClick}
              className={cn(
                "group flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[13px] hover:bg-accent",
                isOpen && "bg-accent/40",
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
              title={entry.path}
            >
              {isOpen ? (
                <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
              )}
              <span className="shrink-0 text-[14px] leading-none">{emoji ?? "📁"}</span>
              <span className="truncate text-foreground">{entry.name}</span>
            </button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <div className="flex flex-col">
              {children.length === 0 && (
                <div
                  className="text-[12px] text-muted-foreground italic"
                  style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                >
                  {isOpen ? "Empty" : ""}
                </div>
              )}
              {children.map((child) =>
                child.isDirectory ? (
                  <DirRow key={child.path} entry={child} depth={depth + 1} />
                ) : (
                  <FileRow key={child.path} entry={child} depth={depth + 1} />
                ),
              )}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </ContextMenu.Trigger>
      <DirContextMenu entry={entry} />
    </ContextMenu.Root>
  );
}

function FileContextMenu({ entry, onActivate }: { entry: DirEntry; onActivate: () => void }) {
  const { openFile, closeTab } = useFsStore();
  const handleOpen = () => {
    void openFile(entry.path);
  };
  const handleOpenSide = () => {
    void openFile(entry.path, { activate: false });
  };
  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(entry.path);
      toast.success("Path copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  const handleReveal = async () => {
    if (isElectron()) {
      await window.api!.shell.showItemInFolder(entry.path);
    }
  };
  const handleClose = () => {
    void closeTab(entry.path, { force: true });
  };
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-[200px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
        <ContextMenu.Item
          onSelect={handleOpen}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          Open
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={handleOpenSide}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          Open to the Side
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item
          onSelect={onActivate}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          Set as Active
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={handleClose}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          Close Tab
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item
          onSelect={handleCopyPath}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          <Copy size={12} /> Copy Path
        </ContextMenu.Item>
        {isElectron() && (
          <ContextMenu.Item
            onSelect={handleReveal}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
          >
            <ExternalLink size={12} /> Reveal in File Explorer
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item
          onSelect={() => {
            if (isElectron()) {
              void window.api!.dialog.confirm({
                message: `Delete ${entry.name}?`,
                detail: entry.path,
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
              }).then((r) => {
                if (r.confirmed) void window.api!.fs.delete(entry.path);
              });
            }
          }}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] text-destructive outline-none data-[highlighted]:bg-destructive/20"
        >
          <Trash2 size={12} /> Delete…
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function DirContextMenu({ entry }: { entry: DirEntry }) {
  const handleNewFile = async () => {
    if (!isElectron()) return;
    const name = window.prompt(`New file inside ${entry.name} (e.g. notes.md):`);
    if (!name) return;
    const full = `${entry.path.replace(/[\\/]+$/, "")}/${name}`;
    try {
      await window.api!.fs.writeFile(full, "");
      const next = await window.api!.fs.readDir(entry.path, 2);
      useFsStore.getState()!.setState((s) => ({
        dirCache: new Map(s.dirCache).set(entry.path, next),
        expanded: new Set([...s.expanded, entry.path]),
      }));
      void useFsStore.getState()!.openFile(full);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create file");
    }
  };
  const handleNewFolder = async () => {
    if (!isElectron()) return;
    const name = window.prompt(`New folder inside ${entry.name}:`);
    if (!name) return;
    const full = `${entry.path.replace(/[\\/]+$/, "")}/${name}`;
    try {
      await window.api!.fs.mkdir(full);
      const next = await window.api!.fs.readDir(entry.path, 2);
      useFsStore.getState()!.setState((s) => ({
        dirCache: new Map(s.dirCache).set(entry.path, next),
        expanded: new Set([...s.expanded, entry.path]),
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create folder");
    }
  };
  const handleRename = async () => {
    if (!isElectron()) return;
    const next = window.prompt(`Rename ${entry.name} to:`, entry.name);
    if (!next || next === entry.name) return;
    const parent = entry.path.replace(/[\\/]+$/, "").replace(/[^\\/]+$/, "");
    const target = `${parent}${next}`;
    try {
      await window.api!.fs.rename(entry.path, target);
      // Easiest: trigger a root refresh via openFolder's logic, or just reload tree.
      const tree = await window.api!.fs.readDir(parent, 2);
      useFsStore.getState()!.setState((s) => ({
        dirCache: new Map(s.dirCache).set(parent, tree),
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  };
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-[220px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
        <ContextMenu.Item
          onSelect={handleNewFile}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          <FilePlus size={12} /> New File…
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={handleNewFolder}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          <FolderPlus size={12} /> New Folder…
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item
          onSelect={handleRename}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          <Pencil size={12} /> Rename…
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={() => {
            void navigator.clipboard.writeText(entry.path).then(
              () => toast.success("Path copied"),
              () => toast.error("Copy failed"),
            );
          }}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
        >
          <Copy size={12} /> Copy Path
        </ContextMenu.Item>
        {isElectron() && (
          <ContextMenu.Item
            onSelect={() => void window.api!.shell.showItemInFolder(entry.path)}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] outline-none data-[highlighted]:bg-accent"
          >
            <ExternalLink size={12} /> Reveal in File Explorer
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item
          onSelect={() => {
            if (isElectron()) {
              void window.api!.dialog.confirm({
                message: `Delete ${entry.name}?`,
                detail: entry.path,
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
              }).then((r) => {
                if (r.confirmed) void window.api!.fs.delete(entry.path);
              });
            }
          }}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] text-destructive outline-none data-[highlighted]:bg-destructive/20"
        >
          <Trash2 size={12} /> Delete…
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function renderTree(entries: DirEntry[]) {
  return entries.map((e) =>
    e.isDirectory ? (
      <DirRow key={e.path} entry={e} depth={0} />
    ) : (
      <FileRow key={e.path} entry={e} depth={0} />
    ),
  );
}

function NewEntryPopover({ folderPath, kind, onClose }: { folderPath: string; kind: "file" | "dir"; onClose: () => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const onKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if (e.key === "Enter" && value.trim()) {
      const full = `${folderPath.replace(/[\\/]+$/, "")}/${value.trim()}`;
      try {
        if (kind === "file") await window.api!.fs.writeFile(full, "");
        else await window.api!.fs.mkdir(full);
        const next = await window.api!.fs.readDir(folderPath, 2);
        useFsStore.getState()!.setState((s) => ({
          dirCache: new Map(s.dirCache).set(folderPath, next),
          expanded: new Set([...s.expanded, folderPath]),
        }));
        if (kind === "file") await useFsStore.getState()!.openFile(full);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    }
  };
  return (
    <div className="flex items-center gap-1 bg-accent px-2 py-0.5" style={{ paddingLeft: 8 + 0 * 12 }}>
      <span className="w-3" />
      {kind === "file" ? <FileText size={14} /> : <FolderOpen size={14} />}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        onBlur={onClose}
        placeholder={kind === "file" ? "filename.ext" : "folder name"}
        className="ml-1 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function FileTree() {
  const { folder, tree, openFolder, webFallback, error, loadingFolder, reloadTab } =
    useFsStore();
  const [newEntry, setNewEntry] = useState<{ folder: string; kind: "file" | "dir" } | null>(null);

  const handleRefresh = async () => {
    if (!folder || !isElectron()) return;
    const next = await window.api!.fs.readDir(folder.path, 4);
    useFsStore.getState()!.setState(() => ({ tree: next }));
  };

  if (webFallback) {
    return (
      <div className="px-5 py-3 text-[13px] text-muted-foreground">
        <p className="mb-2">You are on the web preview.</p>
        <p>Run the desktop build to browse a real folder.</p>
        <button
          onClick={() => openFolder()}
          className="mt-3 inline-flex items-center gap-1 rounded-[3px] border border-border bg-secondary px-2 py-1 text-[12px] hover:bg-accent"
        >
          <Folder size={12} /> Open Folder (desktop only)
        </button>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="px-5 py-3 text-[13px] text-muted-foreground">
        <p className="mb-3">You have not yet opened a folder.</p>
        <button
          onClick={() => void openFolder()}
          className="inline-flex items-center gap-1 rounded-[3px] border border-border bg-secondary px-2 py-1 text-[12px] hover:bg-accent"
        >
          <Folder size={12} /> Open Folder
        </button>
      </div>
    );
  }

  if (loadingFolder) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 text-[13px] text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 text-[13px] text-destructive">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="group flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold uppercase">
        <ChevronDown size={14} className="text-muted-foreground" />
        <span className="flex-1 truncate">{folder.name}</span>
        <button
          title="New File"
          onClick={() => setNewEntry({ folder: folder.path, kind: "file" })}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <FilePlus size={13} />
        </button>
        <button
          title="New Folder"
          onClick={() => setNewEntry({ folder: folder.path, kind: "dir" })}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <FolderPlus size={13} />
        </button>
        <button
          title="Refresh"
          onClick={() => void handleRefresh()}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      {newEntry && (
        <NewEntryPopover
          folderPath={newEntry.folder}
          kind={newEntry.kind}
          onClose={() => setNewEntry(null)}
        />
      )}
      {tree.length === 0 ? (
        <div className="px-5 py-3 text-[13px] text-muted-foreground">Empty folder.</div>
      ) : (
        renderTree(tree)
      )}
    </div>
  );
}

