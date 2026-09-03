import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettings, updateSettings } from "../keys.functions";
import { listTools } from "./registry";

export interface AgentSettings {
  defaultModel: string | null;
  autoApprove: boolean;
  toolApprovals: Record<string, boolean>;
}

const SAFE_DEFAULT: Record<string, boolean> = {
  read_file: true,
  list_dir: true,
  search_files: true,
  apply_patch: false,
  run_command: false,
};

export function useAgentSettings() {
  const fetchSettings = useServerFn(getSettings);
  const saveSettings = useServerFn(updateSettings);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["agent-settings"],
    queryFn: () => fetchSettings(),
    staleTime: 30_000,
  });

  /** Should this tool auto-approve? */
  const shouldAutoApprove = (toolName: string): boolean => {
    const fromUser = q.data?.toolApprovals?.[toolName];
    if (typeof fromUser === "boolean") return fromUser;
    if (q.data?.autoApprove) return true;
    return SAFE_DEFAULT[toolName] ?? false;
  };

  const allTools = listTools();

  const save = async (next: Partial<AgentSettings>) => {
    await saveSettings({
      data: {
        ...(next.defaultModel !== undefined ? { defaultModel: next.defaultModel } : {}),
        ...(next.autoApprove !== undefined ? { autoApprove: next.autoApprove } : {}),
        ...(next.toolApprovals !== undefined ? { toolApprovals: next.toolApprovals } : {}),
      },
    });
    await qc.invalidateQueries({ queryKey: ["agent-settings"] });
  };

  return {
    settings: q.data,
    isLoading: q.isLoading,
    error: q.error,
    shouldAutoApprove,
    allTools,
    save,
  };
}
