import { useState } from "react";
import { Plus, MoreHorizontal, X, Sparkles, FileEdit } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { useConversation } from "@/lib/conversation-store";
import { useDiffStore } from "@/lib/diff-store";
import { SettingsDialog } from "./SettingsDialog";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ThreadList } from "./ThreadList";
import { ReviewPanel } from "./ReviewPanel";
import { ApprovalDialog } from "./ApprovalDialog";
import { cn } from "@/lib/utils";

type PanelTab = "chat" | "review";

export function AgentPanel() {
  const { setAgentOpen } = useIde();
  const conv = useConversation();
  const diff = useDiffStore();
  const [tab, setTab] = useState<PanelTab>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onNewConversation = async () => {
    const id = await conv.newConversation();
    if (id) await conv.selectThread(id);
    setTab("chat");
  };

  return (
    <aside
      className={cn(
        "flex w-[450px] shrink-0 flex-col border-l border-panel-border bg-panel text-chrome-foreground",
      )}
    >
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-panel-border px-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[14px] font-medium text-foreground">Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="New conversation"
            onClick={() => void onNewConversation()}
            className="rounded p-1 hover:bg-accent"
          >
            <Plus size={16} />
          </button>
          <ThreadList
            onOpenSettings={() => setSettingsOpen(true)}
            onClosePanel={() => setTab("chat")}
          />
          <button title="More" className="rounded p-1 hover:bg-accent">
            <MoreHorizontal size={16} />
          </button>
          <button
            title="Close"
            onClick={() => setAgentOpen(false)}
            className="rounded p-1 hover:bg-accent"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex h-[28px] shrink-0 items-center gap-1 border-b border-panel-border px-2 text-[12px]">
        <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
          <Sparkles size={12} /> Chat
        </TabBtn>
        <TabBtn active={tab === "review"} onClick={() => setTab("review")}>
          <FileEdit size={12} /> Review
          {diff.pendingCount > 0 && (
            <span className="ml-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
              {diff.pendingCount}
            </span>
          )}
        </TabBtn>
        {tab === "chat" && conv.active && (
          <span className="ml-auto truncate text-[12px] text-muted-foreground">
            {conv.active.title}
          </span>
        )}
      </div>

      {tab === "chat" ? <MessageList /> : <ReviewPanel />}

      {tab === "chat" && <Composer />}

      {settingsOpen && <SettingsDialog open initialTab="providers" onOpenChange={setSettingsOpen} />}
      <ApprovalDialog />
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-[20px] items-center gap-1 rounded px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
