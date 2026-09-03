/**
 * Side-by-side diff renderer.
 * Pure rendering, no new deps. Lines marked removed/added are highlighted;
 * unchanged lines are dimmed. Header shows the file path and match count.
 */

import { useMemo } from "react";
import { Plus, Minus, FileText } from "lucide-react";
import type { PendingDiff } from "@/lib/diff-store";
import { cn } from "@/lib/utils";

interface Row {
  kind: "ctx" | "del" | "add" | "eq";
  oldLine?: number;
  newLine?: number;
  text: string;
}

function buildRows(removed: PendingDiff["removed"], added: PendingDiff["added"]): {
  left: Row[];
  right: Row[];
} {
  // Build a simple interleaved view: show removed lines on the left,
  // added lines on the right. The line numbers come from the source arrays.
  const maxLen = Math.max(removed.length, added.length);
  const left: Row[] = [];
  const right: Row[] = [];
  for (let i = 0; i < maxLen; i++) {
    const r = removed[i];
    const a = added[i];
    left.push(r ? { kind: "del", oldLine: r.line, text: r.text } : { kind: "ctx", text: "" });
    right.push(a ? { kind: "add", newLine: a.line, text: a.text } : { kind: "ctx", text: "" });
  }
  return { left, right };
}

export function DiffViewer({ diff }: { diff: PendingDiff }) {
  const { left, right } = useMemo(() => buildRows(diff.removed, diff.added), [diff]);

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-chrome px-3 py-1.5 text-[12px] text-muted-foreground">
        <FileText size={13} />
        <span className="font-mono">{diff.path}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-0.5 text-destructive">
            <Minus size={11} /> {diff.removed.length}
          </span>
          <span className="flex items-center gap-0.5 text-success">
            <Plus size={11} /> {diff.added.length}
          </span>
          {diff.matches > 1 && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
              {diff.matches} matches
            </span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border bg-editor font-mono text-[12px] leading-relaxed">
        <div className="overflow-x-auto">
          {left.map((row, i) => (
            <DiffRow key={`l-${i}`} row={row} side="left" />
          ))}
        </div>
        <div className="overflow-x-auto">
          {right.map((row, i) => (
            <DiffRow key={`r-${i}`} row={row} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffRow({ row, side }: { row: Row; side: "left" | "right" }) {
  const lineNum = side === "left" ? row.oldLine : row.newLine;
  const bg =
    row.kind === "del"
      ? "bg-destructive/10"
      : row.kind === "add"
      ? "bg-success/10"
      : "bg-transparent";
  const sign =
    row.kind === "del" ? <Minus size={10} className="text-destructive" />
      : row.kind === "add" ? <Plus size={10} className="text-success" />
      : null;
  return (
    <div className={cn("flex items-start gap-2 px-2 py-0.5 hover:bg-accent/30", bg)}>
      <span className="w-8 shrink-0 select-none text-right text-muted-foreground/60">
        {lineNum ?? ""}
      </span>
      <span className="w-3 shrink-0 text-center">{sign}</span>
      <span className="whitespace-pre-wrap break-all text-foreground/90">{row.text || "\u00A0"}</span>
    </div>
  );
}
