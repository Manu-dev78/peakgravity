import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Search, Settings2, Loader2 } from "lucide-react";
import { listKeys, listModelsForKey } from "@/lib/keys.functions";
import { modelRef, parseModelRef, providerById } from "@/lib/providers/catalog";
import { useIde } from "@/lib/ide-store";
import { cn } from "@/lib/utils";

export function useAvailableModels() {
  const fetchKeys = useServerFn(listKeys);
  const fetchModels = useServerFn(listModelsForKey);
  const { data: keys = [] } = useQuery({ queryKey: ["keys"], queryFn: () => fetchKeys() });
  const results = useQueries({
    queries: keys.map((k) => ({
      queryKey: ["models", k.id],
      queryFn: () => fetchModels({ data: { id: k.id } }),
      staleTime: 5 * 60_000,
    })),
  });
  const groups = keys.map((k, i) => ({
    key: k,
    loading: results[i]?.isLoading ?? false,
    error: results[i]?.data && !results[i].data.ok ? results[i].data.error : null,
    models: results[i]?.data?.ok ? results[i].data.models : [],
  }));
  return { keys, groups, loading: results.some((r) => r.isLoading) };
}

export function ModelPicker({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { selectedModel, setSelectedModel } = useIde();
  const { groups, keys, loading } = useAvailableModels();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label = useMemo(() => {
    const parsed = parseModelRef(selectedModel);
    if (!parsed) return keys.length ? "Select a model" : "No model configured";
    for (const g of groups) {
      const m = g.models.find((m) => m.id === parsed.modelId && g.key.id === parsed.keyId);
      if (m) return m.name;
    }
    return parsed.modelId;
  }, [selectedModel, groups, keys.length]);

  // If the currently selected model points at a key that has been deleted
  // (or at a model that no longer exists), reset to "No model configured"
  // so the agent doesn't try to call a keyId that returned 404.
  useEffect(() => {
    if (!selectedModel || selectedModel === "No model configured") return;
    const parsed = parseModelRef(selectedModel);
    if (!parsed) return;
    const group = groups.find((g) => g.key.id === parsed.keyId);
    if (!group) {
      setSelectedModel("No model configured");
      return;
    }
    if (group.error) {
      // Auth/key failure — keep the selection but the user will see the
      // error inline in the popover and can re-pick.
      return;
    }
    if (!group.loading && !group.models.some((m) => m.id === parsed.modelId)) {
      setSelectedModel("No model configured");
    }
  }, [selectedModel, groups, setSelectedModel]);

  const filtered = groups
    .map((g) => ({
      ...g,
      models: g.models.filter(
        (m) => m.id.toLowerCase().includes(q.toLowerCase()) || m.name.toLowerCase().includes(q.toLowerCase()),
      ),
    }))
    .filter((g) => g.models.length || g.loading || g.error);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-1 rounded px-2 py-1 text-[14px] text-foreground/90 hover:bg-accent"
      >
        <span className="truncate">{label}</span>
        {loading ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex w-[360px] flex-col rounded-md border border-border bg-popover shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search models"
              className="flex-1 bg-transparent text-[13px] focus:outline-none"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {keys.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-muted-foreground">
                Add an API key in Settings to see models here.
              </p>
            )}
            {filtered.map((g) => (
              <div key={g.key.id}>
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {providerById(g.key.provider).name} · {g.key.label}
                </div>
                {g.loading && (
                  <div className="flex items-center gap-2 px-3 py-1 text-[12px] text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" /> Loading models…
                  </div>
                )}
                {g.error && <div className="px-3 py-1 text-[12px] text-destructive">{g.error}</div>}
                {g.models.map((m) => {
                  const ref = modelRef(g.key.id, m.id);
                  const active = ref === selectedModel;
                  return (
                    <button
                      key={ref}
                      onClick={() => {
                        setSelectedModel(ref);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full flex-col px-3 py-1 text-left hover:bg-accent",
                        active && "bg-accent",
                      )}
                    >
                      <span className="text-[13px]">{m.name}</span>
                      {m.name !== m.id && <span className="font-mono text-[11px] text-muted-foreground">{m.id}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings2 size={13} /> Manage providers & keys
          </button>
        </div>
      )}
    </div>
  );
}
