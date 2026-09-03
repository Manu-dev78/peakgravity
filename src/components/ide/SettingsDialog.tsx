import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Trash2, PlugZap, Loader2, CheckCircle2, XCircle, KeyRound, User, Bot } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS, providerById, type ProviderId } from "@/lib/providers/catalog";
import { deleteKey, getSettings, listKeys, listModelsForKey, saveKey, updateSettings } from "@/lib/keys.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Tab = "providers" | "account" | "agent";

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "providers",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[560px] w-[820px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-border bg-card text-foreground shadow-2xl focus:outline-none">
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Dialog.Description className="sr-only">PeakGravity settings</Dialog.Description>
          <nav className="flex w-[190px] shrink-0 flex-col border-r border-border bg-chrome p-2">
            <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </div>
            {(
              [
                { id: "providers", label: "AI Providers", icon: KeyRound },
                { id: "agent", label: "Agent", icon: Bot },
                { id: "account", label: "Account", icon: User },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent",
                  tab === id && "bg-accent",
                )}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>
          <div className="relative flex-1 overflow-y-auto p-6">
            <Dialog.Close className="absolute right-3 top-3 rounded p-1 hover:bg-accent">
              <X size={16} />
            </Dialog.Close>
            {tab === "providers" && <ProvidersTab />}
            {tab === "agent" && <AgentTab />}
            {tab === "account" && <AccountTab />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProvidersTab() {
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listKeys);
  const save = useServerFn(saveKey);
  const remove = useServerFn(deleteKey);
  const test = useServerFn(listModelsForKey);

  const { data: keys = [], isLoading } = useQuery({ queryKey: ["keys"], queryFn: () => fetchKeys() });

  const [provider, setProvider] = useState<ProviderId>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const info = providerById(provider);

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          provider,
          label: label || info.name,
          apiKey,
          baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Key saved and encrypted");
      setApiKey("");
      setLabel("");
      setBaseUrl("");
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save key"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
  });

  const [testState, setTestState] = useState<Record<string, { status: "loading" | "ok" | "err"; msg: string }>>({});
  const runTest = async (id: string) => {
    setTestState((s) => ({ ...s, [id]: { status: "loading", msg: "" } }));
    const res = await test({ data: { id } });
    setTestState((s) => ({
      ...s,
      [id]: res.ok
        ? { status: "ok", msg: `${res.models.length} models available` }
        : { status: "err", msg: res.error },
    }));
    if (res.ok) qc.invalidateQueries({ queryKey: ["models"] });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    saveMut.mutate();
  };

  return (
    <div>
      <h2 className="text-[18px] font-semibold">AI Providers</h2>
      <p className="mt-1 text-muted-foreground">
        Add your own API keys. They are encrypted before storage and only ever shown as the last 4 characters.
      </p>

      <form onSubmit={onSubmit} className="mt-5 rounded-md border border-border bg-chrome p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
              className="h-8 w-full rounded-[3px] border border-input bg-card px-2 text-[13px] focus:border-ring focus:outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label (optional)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${info.name} key`}
              className="h-8 w-full rounded-[3px] border border-input bg-card px-2 text-[13px] focus:border-ring focus:outline-none"
            />
          </Field>
          <Field label="API key" className="col-span-2">
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              autoComplete="off"
              placeholder={info.keyPlaceholder}
              className="h-8 w-full rounded-[3px] border border-input bg-card px-2 font-mono text-[13px] focus:border-ring focus:outline-none"
            />
          </Field>
          {(info.needsBaseUrl || provider === "openrouter") && (
            <Field label="Base URL" className="col-span-2">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={info.defaultBaseUrl}
                className="h-8 w-full rounded-[3px] border border-input bg-card px-2 font-mono text-[13px] focus:border-ring focus:outline-none"
              />
            </Field>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          {info.keysUrl ? (
            <a href={info.keysUrl} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline">
              Get a {info.name} key ↗
            </a>
          ) : (
            <span className="text-[12px] text-muted-foreground">Works with Ollama, LM Studio, vLLM, etc.</span>
          )}
          <button
            type="submit"
            disabled={!apiKey.trim() || saveMut.isPending}
            className="h-8 rounded-[3px] bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save key"}
          </button>
        </div>
      </form>

      <h3 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Saved keys</h3>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted-foreground">No keys yet. Add one above to unlock the model picker.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => {
            const t = testState[k.id];
            return (
              <li key={k.id} className="flex items-center gap-3 rounded-md border border-border bg-chrome px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.label}</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {providerById(k.provider).name}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[12px] text-muted-foreground">
                    ••••••••{k.last4}
                    {k.baseUrl ? ` · ${k.baseUrl}` : ""}
                  </div>
                  {t && (
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-1 text-[12px]",
                        t.status === "ok" && "text-success",
                        t.status === "err" && "text-destructive",
                      )}
                    >
                      {t.status === "loading" && <Loader2 size={12} className="animate-spin" />}
                      {t.status === "ok" && <CheckCircle2 size={12} />}
                      {t.status === "err" && <XCircle size={12} />}
                      {t.status === "loading" ? "Testing connection…" : t.msg}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => runTest(k.id)}
                  title="Test connection"
                  className="flex h-7 items-center gap-1 rounded px-2 text-[12px] hover:bg-accent"
                >
                  <PlugZap size={14} /> Test
                </button>
                <button
                  onClick={() => removeMut.mutate(k.id)}
                  title="Delete"
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AgentTab() {
  const [autoApprove, setAutoApprove] = useState(false);
  const [toolApprovals, setToolApprovals] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const fetchSettings = useServerFn(getSettings);
  const saveSettings = useServerFn(updateSettings);

  useEffect(() => {
    let mounted = true;
    fetchSettings().then(
      (s) => {
        if (!mounted) return;
        setAutoApprove(s.autoApprove);
        setToolApprovals(s.toolApprovals);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [fetchSettings]);

  const onToggle = (name: string, value: boolean) => {
    setToolApprovals((prev) => ({ ...prev, [name]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ data: { autoApprove, toolApprovals } });
      toast.success("Agent settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-[18px] font-semibold">Agent</h2>
      <p className="mt-1 text-muted-foreground">
        Per-tool auto-approval. When a tool is off, the agent pauses and asks before running it.
      </p>

      <div className="mt-5 rounded-md border border-border bg-chrome p-4">
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <div className="font-medium">Approve all tools by default</div>
            <div className="text-[12px] text-muted-foreground">
              When on, every tool runs without asking. The per-tool toggles below take precedence.
            </div>
          </div>
        </label>
      </div>

      <h3 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Per-tool auto-approve
      </h3>
      <ul className="flex flex-col gap-2">
        {[
          { name: "read_file", label: "read_file", desc: "Read a file's contents", safe: true },
          { name: "list_dir", label: "list_dir", desc: "List a directory", safe: true },
          { name: "search_files", label: "search_files", desc: "Search the workspace", safe: true },
          { name: "apply_patch", label: "apply_patch", desc: "Edit a file (queued for review)", safe: false },
          { name: "run_command", label: "run_command", desc: "Spawn a shell command", safe: false },
        ].map((t) => {
          const v = toolApprovals[t.name] ?? t.safe;
          return (
            <li
              key={t.name}
              className="flex items-center gap-3 rounded-md border border-border bg-chrome px-3 py-2"
            >
              <input
                id={`tool-${t.name}`}
                type="checkbox"
                checked={Boolean(v)}
                onChange={(e) => onToggle(t.name, e.target.checked)}
              />
              <label htmlFor={`tool-${t.name}`} className="flex-1 cursor-pointer">
                <div className="font-mono text-[13px]">{t.label}</div>
                <div className="text-[12px] text-muted-foreground">{t.desc}</div>
              </label>
              <span className="text-[11px] text-muted-foreground">
                default: {t.safe ? "on" : "off"}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => void onSave()}
        disabled={saving}
        className="mt-5 h-8 rounded-[3px] bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function AccountTab() {
  const { user, signOut } = useAuth();
  return (
    <div>
      <h2 className="text-[18px] font-semibold">Account</h2>
      <p className="mt-1 text-muted-foreground">Signed in as</p>
      <p className="mt-1 font-medium">{user?.email}</p>
      <button
        onClick={() => signOut()}
        className="mt-6 h-8 rounded-[3px] border border-border bg-secondary px-4 text-[13px] hover:bg-accent"
      >
        Sign out
      </button>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-[12px] text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
