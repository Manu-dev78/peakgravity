/**
 * Agent tool registry entry point.
 * Importing this module registers the built-in tools (read_file, list_dir,
 * apply_patch, search_files) with the registry in registry.ts.
 */

import { registerTool } from "../registry";
import { readFileTool } from "./read_file";
import { listDirTool } from "./list_dir";
import { applyPatchTool } from "./apply_patch";
import { searchFilesTool } from "./search_files";
import { runCommandTool } from "./run_command";

let registered = false;

export function registerBuiltInTools(): void {
  if (registered) return;
  registerTool(readFileTool);
  registerTool(listDirTool);
  registerTool(applyPatchTool);
  registerTool(searchFilesTool);
  registerTool(runCommandTool);
  registered = true;
}

registerBuiltInTools();

export { readFileTool, listDirTool, applyPatchTool, searchFilesTool, runCommandTool };
export type { ApplyPatchDiff } from "./apply_patch";
