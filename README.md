# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Desktop builds

Desktop installers are produced via `electron-builder` and published as
GitHub pre-releases on every `v*` tag.

```sh
# local dev (vite + electron with HMR)
bun run dev:electron

# build everything for a release
bun run build:web
bun run build:electron
bun run dist           # current OS
bun run dist:win       # nsis + portable
bun run dist:mac       # dmg + zip (x64 + arm64)
bun run dist:linux     # AppImage + deb + rpm
```

The CI workflow is `.github/workflows/release.yml`: it runs on every
`v*` tag, builds all three OS targets in parallel, attaches the
artifacts to a GitHub pre-release (use `pre`/`rc`/`beta` in the tag
to mark a release as pre-release).

## Future work

- **Anthropic `cache_control`** — add `cache_control: { type: "ephemeral" }` support on the system prompt and tool specs in `src/lib/providers/chat/anthropic.ts` so the agent can mark long-lived context (file mentions, repo summary) for prompt caching. Tracked inline as `TODO(cache-control)`.
- **Interactive terminal panel** — the current `TerminalPanel` is a log view backed by `child_process.spawn`. Once `node-pty` builds on this machine (it needs MSVC for native bindings), wire it into `electron/ipc/terminal.ts` so the user can run `vim`, `htop`, and other TUIs. The agent's `run_command` tool already works against the current spawner.
