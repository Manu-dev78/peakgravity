# PeakGravity

Desktop AI code editor. Bring your own OpenAI / Anthropic / Gemini / OpenRouter
key, let the agent read, search, edit, diff, and run code in your workspace,
review every change before it lands on disk.

## Quick start

```sh
# 1. Install deps
bun install

# 2. Copy the env template and fill in your Supabase project
cp .env.example .env
#    - SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (from your Supabase dashboard)
#    - PROVIDER_KEY_ENCRYPTION_SECRET (see comment in .env.example)

# 3. Apply the database migrations
#    (run the four files in supabase/migrations/ in order via psql
#     or the Supabase dashboard's SQL editor)

# 4. Run the desktop app
bun run dev:electron
```

The desktop app opens with a folder picker; pick a real directory, add a
provider key in Settings → Providers, then chat with the agent.

## Stack

- TanStack Start · React 19 · TypeScript
- Tailwind v4 · Radix UI
- Monaco editor (via `@monaco-editor/react`)
- Supabase (auth + Postgres) for the conversation + key-vault backend
- Electron 33 for the desktop wrapper
- `node-pty` is **not** yet wired; the terminal panel is a log view backed
  by `child_process.spawn` (good for `npm test`, not for `vim`).

## Desktop builds

```sh
# dev (Vite + Electron with HMR)
bun run dev:electron

# build the renderer
bun run build:web

# compile the Electron main + preload
bun run build:electron

# produce an installer for the current OS
bun run dist           # generic
bun run dist:win       # NSIS + portable .exe
bun run dist:mac       # dmg + zip (x64 + arm64)
bun run dist:linux     # AppImage + deb + rpm

# or just an unpacked dir for quick local testing
bun run dist:dir
```

CI: `.github/workflows/release.yml`. It runs on every `v*` tag, builds all
three OS targets in parallel, attaches the artifacts to a GitHub
pre-release. Tags containing `pre` / `rc` / `beta` are marked pre-release
automatically.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` / `Cmd+O` | Open folder |
| `Ctrl+S` / `Cmd+S` | Save current file |
| `Ctrl+Shift+S` | Save all dirty files |
| `Ctrl+B` | Toggle side bar |
| `Ctrl+J` | Toggle terminal panel |
| `Ctrl+Shift+P` | Open command palette (placeholder) |
| `Enter` in composer | Send agent message |
| `Shift+Enter` in composer | Newline |

## Future work

- **Anthropic `cache_control`** — add `cache_control: { type: "ephemeral" }`
  support on the system prompt and tool specs in
  `src/lib/providers/chat/anthropic.ts` so the agent can mark long-lived
  context (file mentions, repo summary) for prompt caching. Tracked inline
  as `TODO(cache-control)`.
- **Interactive terminal panel** — the current `TerminalPanel` is a log
  view backed by `child_process.spawn`. Once `node-pty` builds on this
  machine (it needs MSVC for native bindings), wire it into
  `electron/ipc/terminal.ts` so the user can run `vim`, `htop`, and other
  TUIs. The agent's `run_command` tool already works against the current
  spawner.
- **Command palette** — the title-bar search button dispatches a
  `pg:command-palette` event; no UI is wired yet. Trivial to add a `cmdk`
  palette — `cmdk` is already a dependency.
