import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Mic, ArrowRight, Square, Hash, FileText, Loader2 } from "lucide-react";
import { useFsStore } from "@/lib/fs-store";
import { useIde } from "@/lib/ide-store";
import { useConversation } from "@/lib/conversation-store";
import { ModelPicker } from "./ModelPicker";
import { SettingsDialog } from "./SettingsDialog";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";
import { useAgentLoop } from "@/lib/agent/loop";
import { parseMentions } from "@/lib/mentions";

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "explain", label: "/explain", description: "Explain the selected code or file", prompt: "/explain" },
  { id: "fix", label: "/fix", description: "Find and fix a bug in the mentioned file", prompt: "/fix" },
  { id: "tests", label: "/tests", description: "Generate unit tests for the mentioned file", prompt: "/tests" },
  { id: "commit", label: "/commit", description: "Draft a commit message for the current diff", prompt: "/commit" },
  { id: "review", label: "/review", description: "Review the active editor tab for issues", prompt: "/review" },
];

type Popover = null | { kind: "mention"; query: string; start: number } | { kind: "slash"; query: string; start: number };

export function Composer() {
  const { selectedModel } = useIde();
  const fs = useFsStore();
  const conv = useConversation();
  const agent = useAgentLoop();
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-resize the textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [input]);

  // Recompute the popover anchor whenever the input changes.
  useEffect(() => {
    setPopover((cur) => computePopover(input, cur));
  }, [input]);

  // Close the popover on outside click
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popover]);

  const mentionOptions = useMemo(() => {
    if (!popover || popover.kind !== "mention") return [];
    const root = fs.folder?.path ?? null;
    if (!root) return [];
    // Suggest files already known in the tree, plus the current open tab.
    const all: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
      if (seen.has(p)) return;
      seen.add(p);
      all.push(p);
    };
    for (const t of fs.tabs) add(t.path);
    const walk = (entries: { path: string; isDirectory: boolean; name: string }[]) => {
      for (const e of entries) {
        if (e.isDirectory) continue;
        add(e.path);
      }
    };
    walk(fs.tree);
    for (const list of fs.dirCache.values()) walk(list as { path: string; isDirectory: boolean; name: string }[]);
    const q = popover.query.toLowerCase();
    return all
      .filter((p) => !q || p.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12);
  }, [popover, fs.folder?.path, fs.tree, fs.dirCache, fs.tabs]);

  const slashOptions = useMemo(() => {
    if (!popover || popover.kind !== "slash") return [];
    const q = popover.query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [popover]);

  useEffect(() => {
    setActiveIdx(0);
  }, [popover?.kind, popover?.query]);

  const applyMention = (path: string) => {
    if (!popover || popover.kind !== "mention") return;
    const before = input.slice(0, popover.start);
    const afterQuery = input.slice(popover.start + 1 + popover.query.length);
    const label = path.startsWith(fs.folder?.path ?? "____")
      ? path.slice((fs.folder?.path?.length ?? 0) + 1)
      : path;
    const inserted = `@${label} `;
    setInput(before + inserted + afterQuery);
    setPopover(null);
  };

  const applySlash = (cmd: SlashCommand) => {
    if (!popover || popover.kind !== "slash") return;
    const before = input.slice(0, popover.start);
    const afterQuery = input.slice(popover.start + 1 + popover.query.length);
    setInput(before + cmd.label + " " + afterQuery.trimStart());
    setPopover(null);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (popover) {
      const opts = popover.kind === "mention" ? mentionOptions : slashOptions;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(opts.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (opts.length > 0) {
          e.preventDefault();
          if (popover.kind === "mention") {
            const pick = mentionOptions[activeIdx] ?? mentionOptions[0]!;
            applyMention(pick);
          } else {
            const pick = slashOptions[activeIdx] ?? slashOptions[0]!;
            applySlash(pick);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPopover(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || agent.busy) return;
    setInput("");
    setPopover(null);
    await agent.send(text);
  };

  const hasInput = input.trim().length > 0;
  const isStreaming = agent.busy;
  const mentions = parseMentions(input, fs.folder?.path ?? null);

  return (
    <div className="px-3 pb-4">
      <div className="relative rounded-xl bg-composer shadow-[0_2px_8px_oklch(0_0_0/0.4)]">
        {popover && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-3 right-3 z-30 mb-2 overflow-hidden rounded-md border border-border bg-popover shadow-2xl"
          >
            {popover.kind === "mention" && (
              <MentionList
                options={mentionOptions}
                activeIdx={activeIdx}
                root={fs.folder?.path ?? null}
                onSelect={applyMention}
              />
            )}
            {popover.kind === "slash" && (
              <SlashList options={slashOptions} activeIdx={activeIdx} onSelect={applySlash} />
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            isElectron()
              ? "Ask anything, @ to mention, / for actions"
              : "Ask anything (model picker disabled on web preview)"
          }
          rows={1}
          className="block w-full resize-none bg-transparent px-3 pb-1 pt-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-1 text-[11px] text-muted-foreground">
            {mentions.map((m, i) => (
              <span key={i} className="rounded bg-primary/15 px-1.5 py-0.5 text-primary" title={m.path}>
                {m.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 px-2 pb-2">
          <button
            title="Add context"
            onClick={() => {
              if (!input.endsWith(" ")) setInput((v) => v + " ");
              setInput((v) => v + "@");
              textareaRef.current?.focus();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus size={16} />
          </button>
          <ModelPicker onOpenSettings={() => setSettingsOpen(true)} />
          <div className="ml-auto flex items-center gap-1">
            <button
              title="Voice (coming soon)"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Mic size={16} />
            </button>
            {isStreaming ? (
              <button
                onClick={agent.stop}
                title="Stop"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:opacity-90"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!hasInput}
                title="Send (Enter)"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-muted-foreground",
                  hasInput && "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
              >
                {isStreaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowRight size={14} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        AI may make mistakes. Double-check all generated code.
      </p>
      {settingsOpen && <SettingsDialog open onOpenChange={setSettingsOpen} />}
    </div>
  );
}

function computePopover(text: string, _cur: Popover): Popover {
  // Slash command: a `/` at the start of the line, or after whitespace.
  const slash = /(^|\s)\/([a-z]*)$/.exec(text);
  if (slash) {
    const start = (slash.index ?? 0) + slash[1]!.length;
    return { kind: "slash", query: slash[2] ?? "", start };
  }
  // Mention: a `@` followed by path-ish chars, no whitespace in between.
  const mention = /(^|\s)@([^\s@]*)$/.exec(text);
  if (mention) {
    const start = (mention.index ?? 0) + mention[1]!.length;
    return { kind: "mention", query: mention[2] ?? "", start };
  }
  return null;
}

function MentionList({
  options,
  activeIdx,
  root,
  onSelect,
}: {
  options: string[];
  activeIdx: number;
  root: string | null;
  onSelect: (p: string) => void;
}) {
  if (options.length === 0) {
    return <div className="px-3 py-2 text-[12px] text-muted-foreground">No matching files</div>;
  }
  return (
    <div className="max-h-[240px] overflow-y-auto py-1">
      {options.map((p, i) => {
        const label = root && p.startsWith(root) ? p.slice(root.length + 1) : p;
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] hover:bg-accent",
              i === activeIdx && "bg-accent",
            )}
          >
            <FileText size={13} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{p}</span>
          </button>
        );
      })}
    </div>
  );
}

function SlashList({
  options,
  activeIdx,
  onSelect,
}: {
  options: SlashCommand[];
  activeIdx: number;
  onSelect: (c: SlashCommand) => void;
}) {
  if (options.length === 0) {
    return <div className="px-3 py-2 text-[12px] text-muted-foreground">No matching commands</div>;
  }
  return (
    <div className="py-1">
      {options.map((c, i) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className={cn(
            "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[13px] hover:bg-accent",
            i === activeIdx && "bg-accent",
          )}
        >
          <span className="flex items-center gap-1.5">
            <Hash size={12} className="text-muted-foreground" />
            <span className="font-medium">{c.label}</span>
          </span>
          <span className="text-[12px] text-muted-foreground">{c.description}</span>
        </button>
      ))}
    </div>
  );
}

// keep imports tidy
