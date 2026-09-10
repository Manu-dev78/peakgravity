/**
 * ProblemsStore — diagnostics surfaced by language services, linters, and
 * the agent. Slice L1 ships an empty store; L2 (TypeScript) and L3
 * (Problems panel) populate it.
 *
 * Each problem follows the LSP `Diagnostic` shape so we can map server
 * notifications 1:1. We also tag it with a `source` ("typescript",
 * "eslint", "agent", …) and an optional `toolCallId` so the agent can
 * attribute problems it introduced.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface Problem {
  /** Absolute file path or a synthetic id like "(agent)". */
  file: string;
  /** 1-indexed line. 0 means "no specific line". */
  line: number;
  /** 1-indexed column. */
  column: number;
  /** End position, when known. */
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  /** LSP-style source ("typescript", "eslint", "prettier", "agent", ...). */
  source: string;
  /** Optional error code ("TS2304", "no-unused-vars", ...). */
  code?: string | number;
  /** Optional agent attribution. */
  toolCallId?: string;
}

interface ProblemsState {
  problems: Problem[];
  errors: number;
  warnings: number;
  byFile: Map<string, Problem[]>;
  setForFile: (file: string, problems: Problem[]) => void;
  add: (problem: Problem) => void;
  clearFile: (file: string) => void;
  clearAll: () => void;
  clearSource: (source: string) => void;
}

const ProblemsContext = createContext<ProblemsState | null>(null);

export function ProblemsProvider({ children }: { children: ReactNode }) {
  const [problems, setProblems] = useState<Problem[]>([]);

  const setForFile = useCallback((file: string, next: Problem[]) => {
    setProblems((prev) => {
      const others = prev.filter((p) => p.file !== file);
      return [...others, ...next];
    });
  }, []);

  const add = useCallback((problem: Problem) => {
    setProblems((prev) => {
      // Replace any existing problem with the same (file, line, column, source, message)
      // so the same lint message isn't duplicated across re-runs.
      const filtered = prev.filter(
        (p) =>
          !(
            p.file === problem.file &&
            p.line === problem.line &&
            p.column === problem.column &&
            p.source === problem.source &&
            p.message === problem.message
          ),
      );
      return [...filtered, problem];
    });
  }, []);

  const clearFile = useCallback((file: string) => {
    setProblems((prev) => prev.filter((p) => p.file !== file));
  }, []);

  const clearAll = useCallback(() => setProblems([]), []);

  const clearSource = useCallback((source: string) => {
    setProblems((prev) => prev.filter((p) => p.source !== source));
  }, []);

  const byFile = useMemo(() => {
    const m = new Map<string, Problem[]>();
    for (const p of problems) {
      const list = m.get(p.file);
      if (list) list.push(p);
      else m.set(p.file, [p]);
    }
    // Sort each bucket by line/column
    for (const list of m.values()) {
      list.sort((a, b) => (a.line - b.line) || (a.column - b.column));
    }
    return m;
  }, [problems]);

  const errors = useMemo(
    () => problems.filter((p) => p.severity === "error").length,
    [problems],
  );
  const warnings = useMemo(
    () => problems.filter((p) => p.severity === "warning").length,
    [problems],
  );

  const value = useMemo<ProblemsState>(
    () => ({
      problems,
      errors,
      warnings,
      byFile,
      setForFile,
      add,
      clearFile,
      clearAll,
      clearSource,
    }),
    [problems, errors, warnings, byFile, setForFile, add, clearFile, clearAll, clearSource],
  );

  // Mirror the latest value into a module-level handle for non-React callers
  // (Monaco providers, the language worker bridge).
  useEffect(() => {
    _currentProblems = value;
  }, [value]);

  return <ProblemsContext.Provider value={value}>{children}</ProblemsContext.Provider>;
}

export function useProblemsStore(): ProblemsState {
  const ctx = useContext(ProblemsContext);
  if (!ctx) throw new Error("useProblemsStore must be used inside ProblemsProvider");
  return ctx;
}

// Module-level mirror so non-React callers (Monaco providers, the
// language worker bridge) can read + dispatch without needing a hook.
let _currentProblems: ProblemsState | null = null;

interface UseProblemsStoreHook {
  (): ProblemsState;
  getState: () => ProblemsState | null;
}

const useProblemsStoreHook = Object.assign(useProblemsStore, {
  getState: (): ProblemsState | null => _currentProblems,
}) as UseProblemsStoreHook;
