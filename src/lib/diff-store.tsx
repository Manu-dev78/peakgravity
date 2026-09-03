/**
 * Diff review queue.
 *
 * When the agent issues an `apply_patch` call, the proposed change is
 * enqueued here as a `PendingDiff`. The `ReviewPanel` lists them, the user
 * accepts (we write the file) or rejects (we drop the diff). The agent
 * loop already moved on by the time the user decides.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isElectron } from "./electron-api";
import { useFsStore } from "./fs-store";

export interface PendingDiff {
  id: string;
  /** Tool call id from the assistant message; helps correlate in the UI. */
  toolCallId: string;
  /** Conversation the diff belongs to. */
  threadId: string;
  path: string;
  oldText: string;
  newText: string;
  replaceAll: boolean;
  matches: number;
  afterContent: string;
  removed: { line: number; text: string }[];
  added: { line: number; text: string }[];
  createdAt: number;
  status: "pending" | "accepted" | "rejected" | "error";
  error?: string;
}

interface DiffState {
  diffs: PendingDiff[];
  pendingCount: number;
  enqueue: (diff: Omit<PendingDiff, "id" | "createdAt" | "status">) => string;
  accept: (id: string) => Promise<void>;
  reject: (id: string) => void;
  acceptAll: () => Promise<void>;
  clearResolved: () => void;
}

const DiffContext = createContext<DiffState | null>(null);
let nextId = 1;

export function DiffProvider({ children }: { children: ReactNode }) {
  const [diffs, setDiffs] = useState<PendingDiff[]>([]);
  const fs = useFsStore();

  // Refresh the file tree when a diff is accepted (the underlying file changed).
  useEffect(() => {
    const accepted = diffs.find((d) => d.status === "accepted");
    if (!accepted) return;
    if (fs.folder) {
      void fs.openFile(accepted.path, { activate: false });
    }
  }, [diffs, fs]);

  const enqueue: DiffState["enqueue"] = useCallback((diff) => {
    const id = `d${nextId++}`;
    setDiffs((prev) => [
      { ...diff, id, createdAt: Date.now(), status: "pending" },
      ...prev,
    ]);
    return id;
  }, []);

  const accept: DiffState["accept"] = useCallback(
    async (id) => {
      if (!isElectron()) {
        toast.error("Apply is only available in the desktop build");
        return;
      }
      const target = diffs.find((d) => d.id === id);
      if (!target || target.status !== "pending") return;
      try {
        await window.api!.fs.writeFile(target.path, target.afterContent);
        setDiffs((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: "accepted" } : d)),
        );
        toast.success(`Applied ${target.path}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Write failed";
        setDiffs((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "error", error: msg } : d,
          ),
        );
        toast.error(`Failed to apply ${target.path}: ${msg}`);
      }
    },
    [diffs],
  );

  const reject: DiffState["reject"] = useCallback((id) => {
    setDiffs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "rejected" } : d)),
    );
  }, []);

  const acceptAll = useCallback(async () => {
    const pending = diffs.filter((d) => d.status === "pending");
    for (const d of pending) {
      // eslint-disable-next-line no-await-in-loop
      await accept(d.id);
    }
  }, [diffs, accept]);

  const clearResolved = useCallback(() => {
    setDiffs((prev) => prev.filter((d) => d.status === "pending"));
  }, []);

  const value = useMemo<DiffState>(
    () => ({
      diffs,
      pendingCount: diffs.filter((d) => d.status === "pending").length,
      enqueue,
      accept,
      reject,
      acceptAll,
      clearResolved,
    }),
    [diffs, enqueue, accept, reject, acceptAll, clearResolved],
  );

  return <DiffContext.Provider value={value}>{children}</DiffContext.Provider>;
}

export function useDiffStore(): DiffState {
  const ctx = useContext(DiffContext);
  if (!ctx) throw new Error("useDiffStore must be used inside DiffProvider");
  return ctx;
}
