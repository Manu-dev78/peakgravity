import { ipcMain, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { IPC } from "./channels";
import { randomUUID } from "node:crypto";

/**
 * Phase 5 implementation: a child_process-backed "terminal" used by the
 * `run_command` agent tool. We don't depend on node-pty yet (it requires
 * native compilation), so this is a buffered, non-interactive spawner:
 *
 *   - one persistent ptyId per workspace cwd (re-used across calls)
 *   - on spawn, output is streamed to the renderer via `terminal:data`
 *   - the caller (agent loop) reads the final `terminal:exit` for stdout/stderr
 *   - `write` and `resize` are no-ops for now (true PTY support requires
 *     node-pty; tracked in TODO at the bottom of this file)
 */

interface Session {
  id: string;
  cwd: string;
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  /** Cap captured output to avoid OOM on long-running processes. */
  maxBytes: number;
}

const sessions = new Map<string, Session>();
let defaultId: string | null = null;

function truncate(buf: string, max: number): string {
  if (buf.length <= max) return buf;
  return buf.slice(buf.length - max);
}

function persistSession(s: Session) {
  sessions.set(s.id, s);
}

function emit(win: BrowserWindow | null, channel: string, payload: unknown) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

export function registerTerminalHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.Terminal.Spawn, async (_e, args: { cwd: string; cols: number; rows: number }) => {
    const id = randomUUID();
    const win = getWindow();
    const cols = Math.max(1, args.cols | 0);
    const rows = Math.max(1, args.rows | 0);
    let proc: ChildProcess;
    try {
      proc = spawn(
        process.platform === "win32" ? "cmd.exe" : "sh",
        [],
        { cwd: args.cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
    } catch (e) {
      return { id: null, ok: false, reason: e instanceof Error ? e.message : "spawn failed" };
    }
    const session: Session = { id, cwd: args.cwd, proc, stdout: "", stderr: "", maxBytes: 64 * 1024 };
    persistSession(session);
    void cols;
    void rows;
    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      session.stdout = truncate(session.stdout + text, session.maxBytes);
      emit(win, "terminal:data", { id, data: text });
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      session.stderr = truncate(session.stderr + text, session.maxBytes);
      emit(win, "terminal:data", { id, data: text, isStderr: true });
    });
    proc.on("exit", (code) => {
      emit(win, "terminal:exit", { id, exitCode: code ?? -1, stdout: session.stdout, stderr: session.stderr });
      sessions.delete(id);
      if (defaultId === id) defaultId = null;
    });
    proc.on("error", (e) => {
      emit(win, "terminal:exit", { id, exitCode: -1, stdout: session.stdout, stderr: session.stderr + "\n" + e.message });
      sessions.delete(id);
      if (defaultId === id) defaultId = null;
    });
    defaultId = id;
    return { id, ok: true };
  });

  ipcMain.handle(IPC.Terminal.Write, async (_e, args: { id: string; data: string }) => {
    const s = sessions.get(args.id);
    if (!s) return { ok: false };
    try {
      s.proc.stdin?.write(args.data);
      s.proc.stdin?.write(process.platform === "win32" ? "\r\n" : "\n");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle(IPC.Terminal.Resize, async () => ({ ok: false }));
  ipcMain.handle(IPC.Terminal.Kill, async (_e, args: { id: string }) => {
    const s = sessions.get(args.id);
    if (!s) return { ok: false };
    try {
      s.proc.kill();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle(
    IPC.Terminal.RunCommand,
    async (
      _e,
      args: { cwd: string; command: string; args?: string[]; timeoutMs?: number },
    ): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }> => {
      const win = getWindow();
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60_000;
      const result = await runCommand(args.cwd, args.command, args.args ?? [], win);
      if (timeoutMs > 0) {
        // Note: timeout enforcement is on the caller (the agent tool wrapper).
        // A long-running command will simply wait this Promise out here.
      }
      return result;
    },
  );
}

/**
 * Spawn a one-shot command and return its output. Used by the agent's
 * `run_command` tool. Streams live output to the renderer via
 * `terminal:data` and resolves with the full captured output on exit.
 */
export function runCommand(
  cwd: string,
  command: string,
  args: string[],
  win: BrowserWindow | null,
  onData?: (chunk: string, isStderr: boolean) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      resolve({ stdout: "", stderr: e instanceof Error ? e.message : "spawn failed", exitCode: -1 });
      return;
    }
    let stdout = "";
    let stderr = "";
    const cap = 64 * 1024;
    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = truncate(stdout + text, cap);
      emit(win, "terminal:data", { id: "oneshot", data: text });
      onData?.(text, false);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = truncate(stderr + text, cap);
      emit(win, "terminal:data", { id: "oneshot", data: text, isStderr: true });
      onData?.(text, true);
    });
    proc.on("exit", (code) => {
      emit(win, "terminal:exit", { id: "oneshot", exitCode: code ?? -1, stdout, stderr });
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    proc.on("error", (e) => {
      resolve({ stdout, stderr: stderr + "\n" + e.message, exitCode: -1 });
    });
  });
}

void defaultId;

/**
 * TODO(pty): once node-pty builds on this machine (or we ship prebuilt
 * binaries), wire it in here for an interactive terminal panel. For now
 * the agent's `run_command` uses runCommand() (one-shot spawn), which is
 * enough to run `npm test`, `git diff`, etc. but doesn't support `vim`,
 * `htop`, or other TUIs.
 */

