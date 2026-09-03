/**
 * Minimal message renderer: splits text into paragraphs and fenced code blocks.
 * No external deps. Code blocks use a monospace block with a tiny language label
 * when detectable.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  className?: string;
  /** While streaming, the partial last block shouldn't reparse trailing whitespace aggressively. */
  streaming?: boolean;
}

interface Block {
  kind: "code" | "p";
  lang?: string;
  text: string;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;
  let buf: string[] = [];
  const flushPara = () => {
    const t = buf.join("\n").trim();
    if (t) blocks.push({ kind: "p", text: t });
    buf = [];
  };
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = line.match(/^```([a-zA-Z0-9_+\-#.]*)\s*$/);
    if (fence) {
      flushPara();
      const lang = fence[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (/^```\s*$/.test(next)) {
          i++;
          break;
        }
        codeLines.push(next);
        i++;
      }
      blocks.push({ kind: "code", lang, text: codeLines.join("\n") });
      continue;
    }
    buf.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

export function MessageMarkdown({ text, className, streaming }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  if (!text) {
    return <span className={cn("text-muted-foreground", className)}>…</span>;
  }
  return (
    <div className={cn("flex flex-col gap-2 text-[14px] leading-relaxed", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "code") {
          return (
            <div key={i} className="overflow-hidden rounded-md border border-border bg-editor">
              {b.lang && (
                <div className="flex h-6 items-center border-b border-border bg-chrome px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {b.lang}
                </div>
              )}
              <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-foreground">
                <code>{b.text}</code>
              </pre>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-foreground/90">
            {b.text}
            {streaming && i === blocks.length - 1 ? <span className="ml-0.5 inline-block h-[1em] w-[6px] translate-y-[2px] animate-pulse bg-foreground/60" /> : null}
          </p>
        );
      })}
    </div>
  );
}
