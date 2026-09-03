import { useEffect, useRef, useState } from "react";
import { Loader2, User, Sparkles, AlertCircle, Wrench } from "lucide-react";
import { useConversation } from "@/lib/conversation-store";
import { useChatStream } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";
import { MessageMarkdown } from "./MessageMarkdown";
import { resolveMentionLabel } from "@/lib/mention-labels";
import type { ChatMessageText } from "@/lib/providers/chat/types";

export function MessageList() {
  const { active, error } = useConversation();
  const { busy } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to the bottom on new content unless the user scrolled up.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages, active?.busy, autoScroll]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distFromBottom < 32);
  };

  if (!active) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
        Start a new conversation to chat with the agent.
      </div>
    );
  }

  if (active.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        <Loader2 size={14} className="mr-2 animate-spin" /> Loading conversation…
      </div>
    );
  }

  if (active.messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
        <div className="max-w-[320px]">
          <p className="text-[15px] text-foreground">PeakGravity</p>
          <p className="mt-1">Ask anything about your code. Use @ to mention a file, / for actions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-[11px] text-foreground shadow-lg hover:bg-accent"
        >
          Jump to latest
        </button>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
          {active.messages.map((m, i) => (
            <Bubble
              key={i}
              message={m}
              isStreaming={
                busy && m.role === "assistant" && i === active.messages.length - 1
              }
            />
          ))}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ message, isStreaming }: { message: ChatMessageText; isStreaming: boolean }) {
  if (message.role === "tool") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-chrome/60 px-3 py-2 text-[12.5px] text-muted-foreground">
        <Wrench size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {message.name ? `Tool: ${message.name}` : "Tool result"}
          </div>
          <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-[12px] text-foreground/80">
            {truncateForDisplay(message.content)}
          </pre>
        </div>
      </div>
    );
  }
  if (message.role === "assistant") {
    const hasToolCalls = !!message.tool_calls && message.tool_calls.length > 0;
    return (
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-primary">
          <Sparkles size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <MessageMarkdown text={message.content} streaming={isStreaming} />
          {hasToolCalls && (
            <div className="mt-2 flex flex-col gap-1">
              {message.tool_calls!.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-start gap-1.5 rounded border border-border bg-chrome/60 px-2 py-1 text-[12px] text-muted-foreground"
                >
                  <Wrench size={11} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground/90">{tc.name}</span>
                    <pre className="mt-0.5 max-h-[120px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                      {summariseArgs(tc.arguments)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  // user
  return (
    <div className="flex items-start justify-end gap-2">
      <div className="min-w-0 flex-1 text-right">
        <div className="inline-block max-w-full rounded-lg bg-primary/15 px-3 py-2 text-left text-[14px] text-foreground">
          <UserText text={message.content} />
        </div>
      </div>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-secondary text-secondary-foreground">
        <User size={13} />
      </div>
    </div>
  );
}

function UserText({ text }: { text: string }) {
  // Render the user text with @-mentions as clickable chips later. For now,
  // collapse newlines.
  return (
    <span className="whitespace-pre-wrap">
      {text.split(/(@[^\s@]+)/g).map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className="rounded bg-primary/25 px-1 py-0.5 text-[13px] text-primary"
            title={resolveMentionLabel(part)}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

function truncateForDisplay(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[${text.length - max} chars truncated]`;
}

function summariseArgs(argsJson: string): string {
  try {
    const parsed: unknown = JSON.parse(argsJson);
    if (parsed && typeof parsed === "object") {
      const entries = Object.entries(parsed as Record<string, unknown>)
        .slice(0, 4)
        .map(([k, v]) => {
          const sv = typeof v === "string" ? v : JSON.stringify(v);
          return `${k}: ${sv.length > 80 ? sv.slice(0, 80) + "…" : sv}`;
        });
      return entries.join("\n");
    }
    return argsJson;
  } catch {
    return argsJson;
  }
}

export { cn };
