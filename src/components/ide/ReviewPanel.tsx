import { useState } from "react";
import { Check, X, FileEdit, CheckCheck, Trash2, Loader2 } from "lucide-react";
import { useDiffStore, type PendingDiff } from "@/lib/diff-store";
import { DiffViewer } from "./DiffViewer";
import { cn } from "@/lib/utils";

type Filter = "pending" | "all" | "resolved";

export function ReviewPanel() {
  const { diffs, pendingCount, accept, reject, acceptAll, clearResolved } = useDiffStore();
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyAll, setBusyAll] = useState(false);

  const filtered = diffs.filter((d) => {
    if (filter === "pending") return d.status === "pending";
    if (filter === "resolved") return d.status !== "pending";
    return true;
  });

  const onAcceptAll = async () => {
    setBusyAll(true);
    try {
      await acceptAll();
    } finally {
      setBusyAll(false);
    }
  };

  if (diffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
        <div className="max-w-[280px]">
          <FileEdit size={20} className="mx-auto mb-2 opacity-50" />
          <p>No pending changes.</p>
          <p className="mt-1 text-[12px]">
            When the agent proposes a file edit, it shows up here for you to review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-1 border-b border-panel-border px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <FilterBtn active={filter === "pending"} onClick={() => setFilter("pending")}>
          Pending {pendingCount > 0 && <span className="ml-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">{pendingCount}</span>}
        </FilterBtn>
        <FilterBtn active={filter === "resolved"} onClick={() => setFilter("resolved")}>
          Resolved
        </FilterBtn>
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterBtn>
        <div className="ml-auto flex items-center gap-1">
          {pendingCount > 0 && (
            <button
              onClick={onAcceptAll}
              disabled={busyAll}
              title="Accept all pending"
              className="flex items-center gap-1 rounded px-2 py-0.5 text-success hover:bg-accent disabled:opacity-50"
            >
              {busyAll ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={12} />}
              Accept all
            </button>
          )}
          <button
            onClick={() => clearResolved()}
            title="Clear resolved"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            Nothing here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((d) => (
              <DiffRow key={d.id} diff={d} onAccept={() => void accept(d.id)} onReject={() => reject(d.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 normal-case tracking-normal hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DiffRow({
  diff,
  onAccept,
  onReject,
}: {
  diff: PendingDiff;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card",
        diff.status === "rejected" && "opacity-60",
      )}
    >
      <DiffViewer diff={diff} />
      <div className="flex items-center gap-1 border-t border-border bg-chrome px-2 py-1.5 text-[12px]">
        {diff.status === "pending" ? (
          <>
            <button
              onClick={onAccept}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground hover:bg-primary-hover"
            >
              <Check size={12} /> Accept
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-foreground hover:bg-accent"
            >
              <X size={12} /> Reject
            </button>
          </>
        ) : diff.status === "accepted" ? (
          <span className="flex items-center gap-1 text-success">
            <Check size={12} /> Applied
          </span>
        ) : diff.status === "rejected" ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <X size={12} /> Rejected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <X size={12} /> {diff.error ?? "Error"}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {new Date(diff.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
