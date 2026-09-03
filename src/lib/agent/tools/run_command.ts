/**
 * run_command - spawn a one-shot command via the Electron main process and
 * return its output. Used by the agent to run tests, linters, git, etc.
 *
 * The command runs in the workspace root (or an explicit cwd argument).
 * Output is streamed live to the terminal panel via terminal:data events and
 * the full captured stdout/stderr is returned to the model once the process
 * exits.
 *
 * Args:
 *   command:    string          - executable name (e.g. "npm", "git", "node")
 *   args:       string[]        - argument list
 *   cwd:        string?         - override workspace root
 *   timeout_ms: number?         - abort after N ms (default 60s)
 *
 * Output cap: 64KB per stream.
 */

import type { RegisteredTool } from "../registry";
import { isElectron } from "@/lib/electron-api";
import { resolvePath } from "./path-utils";

export const runCommandTool: RegisteredTool = {
  name: "run_command",
  description:
    "Run a shell command in the workspace. Returns captured stdout, stderr, and the exit code. Live output also streams to the terminal panel. Use this for `npm test`, `git diff`, `node script.js`, etc. Avoid interactive commands (vim, htop).",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Executable name (e.g. 'npm', 'git')." },
      args: { type: "array", items: { type: "string" }, description: "Argument list." },
      cwd: { type: "string", description: "Override the working directory. Defaults to the workspace root." },
      timeout_ms: { type: "integer", minimum: 1000, maximum: 600_000, description: "Timeout in ms. Default 60000." },
    },
    required: ["command", "args"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    const command = String(args["command"] ?? "");
    const argList = Array.isArray(args["args"]) ? (args["args"] as unknown[]).map((a) => String(a)) : [];
    const explicit = typeof args["cwd"] === "string" ? (args["cwd"] as string) : null;
    const cwd = explicit ? resolvePath(explicit, ctx.root) : ctx.root ?? process.cwd();
    const timeoutMs = typeof args["timeout_ms"] === "number" ? (args["timeout_ms"] as number) : 60_000;
    if (!command) {
      return { content: JSON.stringify({ error: "command is required" }) };
    }
    if (!isElectron()) {
      return {
        content: JSON.stringify({
          ok: false,
          error: "run_command is only available in the desktop build",
        }),
      };
    }
    if (ctx.signal.aborted) {
      return { content: JSON.stringify({ ok: false, error: "aborted" }) };
    }
    try {
      const result = await window.api!.terminal.runCommand(cwd, command, argList, timeoutMs);
      const summary = {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        cwd,
        command,
        args: argList,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.stdout.length >= 64 * 1024 || result.stderr.length >= 64 * 1024,
      };
      return { content: JSON.stringify(summary) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Command failed";
      return { content: JSON.stringify({ ok: false, error: msg }) };
    }
  },
};
