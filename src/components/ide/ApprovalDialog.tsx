import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X, ShieldAlert } from "lucide-react";
import { useAgentLoop, type PendingApproval } from "@/lib/agent/loop";

export function ApprovalDialog() {
  const { pending, approve, deny, stop } = useAgentLoop();
  const [busy, setBusy] = useState(false);

  const onApprove = async () => {
    setBusy(true);
    try {
      approve();
    } finally {
      setBusy(false);
    }
  };
  const onDeny = () => {
    setBusy(true);
    try {
      deny();
    } finally {
      setBusy(false);
    }
  };
  const onStop = () => stop();

  return (
    <Dialog.Root open={pending !== null} onOpenChange={(o) => { if (!o) onStop(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-[480px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border bg-card text-foreground shadow-2xl focus:outline-none">
          <Dialog.Title className="sr-only">Approve tool call</Dialog.Title>
          <Dialog.Description className="sr-only">The agent wants to run a tool.</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-border bg-chrome px-4 py-3">
            <ShieldAlert size={16} className="text-warning" />
            <span className="text-[14px] font-medium">Agent wants to run a tool</span>
          </div>
          {pending && <Body pending={pending} busy={busy} onApprove={onApprove} onDeny={onDeny} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({
  pending,
  busy,
  onApprove,
  onDeny,
}: {
  pending: PendingApproval;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <>
      <div className="px-4 py-4">
        <p className="text-[14px] text-foreground">{pending.description}</p>
        <pre className="mt-3 max-h-[200px] overflow-auto rounded-md border border-border bg-editor p-3 font-mono text-[12px] text-foreground/90">
          {pending.detail}
        </pre>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Approve to run, or deny to send the model a refusal. You can also change per-tool defaults in
          Settings → Agent.
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-chrome px-4 py-2">
        <button
          onClick={onDeny}
          disabled={busy}
          className="flex h-7 items-center gap-1 rounded px-3 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <X size={13} /> Deny
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="ml-auto flex h-7 items-center gap-1 rounded bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          <Check size={13} /> Approve
        </button>
      </div>
    </>
  );
}
