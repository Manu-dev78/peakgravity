import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { History, Plus, MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import { useConversation } from "@/lib/conversation-store";
import { cn } from "@/lib/utils";

export function ThreadList({
  onOpenSettings,
  onClosePanel,
}: {
  onOpenSettings: () => void;
  onClosePanel: () => void;
}) {
  const { threads, activeThreadId, selectThread, newConversation, deleteThread, rename } =
    useConversation();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Reset editing state when the dropdown closes
  useEffect(() => {
    return () => {
      setEditing(null);
    };
  }, []);

  return (
    <DropdownMenu.Root
      onOpenChange={(o) => {
        if (!o) setEditing(null);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button title="History" className="rounded p-1 hover:bg-accent">
          <History size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 flex w-[340px] flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        >
          <DropdownMenu.Item
            onSelect={async () => {
              const id = await newConversation();
              if (id) {
                void selectThread(id);
                onClosePanel();
              }
            }}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent"
          >
            <Plus size={14} /> New conversation
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <div className="max-h-[360px] overflow-y-auto py-1">
            {threads.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              threads.map((t) => {
                const isEditing = editing === t.id;
                const isActive = t.id === activeThreadId;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-center gap-1 rounded px-1 py-1 hover:bg-accent",
                      isActive && "bg-accent",
                    )}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await rename(t.id, editValue.trim() || t.title);
                          setEditing(null);
                        }}
                        className="flex flex-1 items-center gap-1"
                      >
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditing(null);
                            }
                          }}
                          className="flex-1 rounded border border-input bg-card px-1.5 py-0.5 text-[13px] outline-none focus:border-ring"
                        />
                        <button
                          type="submit"
                          className="rounded p-1 text-success hover:bg-accent"
                          title="Save"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditing(null);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            await selectThread(t.id);
                            onClosePanel();
                          }}
                          className="flex flex-1 items-center gap-2 truncate px-1.5 text-left text-[13px]"
                        >
                          <MessageSquare size={13} className="shrink-0 text-muted-foreground" />
                          <span className="truncate">{t.title}</span>
                        </button>
                        <button
                          title="Rename"
                          onClick={() => {
                            setEditing(t.id);
                            setEditValue(t.title);
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          title="Delete"
                          onClick={async () => {
                            if (window.confirm(`Delete "${t.title}"?`)) {
                              await deleteThread(t.id);
                            }
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/30 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={onOpenSettings}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent"
          >
            Configure providers
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
