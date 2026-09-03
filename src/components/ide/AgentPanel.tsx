import { useState } from "react";
import { Plus, History, MoreHorizontal, X, Mic, ArrowRight } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./ModelPicker";
import { SettingsDialog } from "./SettingsDialog";

export function AgentPanel() {
  const { setAgentOpen } = useIde();
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="flex w-[450px] shrink-0 flex-col border-l border-panel-border bg-panel text-chrome-foreground">
      <div className="flex h-[38px] items-center justify-between border-b border-panel-border px-3">
        <span className="text-[16px]">Agent</span>
        <div className="flex items-center gap-1">
          {[
            { icon: Plus, title: "New conversation" },
            { icon: History, title: "History" },
            { icon: MoreHorizontal, title: "More" },
          ].map(({ icon: Icon, title }) => (
            <button key={title} title={title} className="rounded p-1 hover:bg-accent">
              <Icon size={16} />
            </button>
          ))}
          <button title="Close" onClick={() => setAgentOpen(false)} className="rounded p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6">
        <h2 className="mb-3 text-[20px] font-semibold text-foreground">PeakGravity</h2>
        <div className="rounded-xl bg-composer p-3 shadow-[0_2px_8px_oklch(0_0_0/0.4)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything, @ to mention, / for actions"
            rows={1}
            className="w-full resize-none bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-2">
            <button title="Add context" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Plus size={18} />
            </button>
            <ModelPicker onOpenSettings={() => setSettingsOpen(true)} />
            <div className="ml-auto flex items-center gap-2">
              <button title="Voice" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <Mic size={18} />
              </button>
              <button
                title="Send"
                disabled={!input.trim()}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground",
                  input.trim() && "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="px-6 pb-5 text-[14px] leading-snug text-muted-foreground">
        AI may make mistakes. Double-check all generated code.
      </p>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
