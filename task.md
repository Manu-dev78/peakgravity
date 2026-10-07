# PeakGravity IDE — Task Tracker

## Phase 0 — Fork & Rebrand VS Code

- [x] Check prerequisites (Node.js, yarn, git, Python, build tools)
- [x] Clone `microsoft/vscode` repository
- [x] Rebrand `product.json` (name, identifiers, marketplace)
- [x] Replace icons and logos
- [x] Strip Microsoft telemetry
- [x] Verify clean build as "PeakGravity IDE"

## Phase 1 — AI Agent Panel (Port Core Feature)
- [x] Create built-in extension structure (`extensions/peakgravity-agent/`)
- [x] Port agent loop, registry, and tools
- [x] Port provider adapters (OpenAI, Anthropic, Gemini)
- [x] Build chat webview panel
- [x] Register activity bar icon & keybindings
- [x] Wire up editor integration (inline suggestions, diffs)

## Phase 2 — BYOK Provider System & Settings
- [x] Implement SecretStorage-based key vault
- [x] Port provider catalog and model listing
- [x] Build settings UI for provider configuration

## Phase 3 — "Work While I'm Gone"
- [x] Design autonomous agent daemon architecture
- [x] Build background task queue (TaskManager + daemon process)
- [x] Build mobile/web monitoring dashboard (React + Vite + Supabase real-time)
- [x] Implement notification system (Email via Resend, Push via Web Push API, Supabase Edge Functions)

## Phase 4 — Supabase Integration
- [x] Port auth flow (email/password, GitHub, Google OAuth)
- [x] Implement conversation sync (push/pull conversations)
- [x] Wire up remote agent task queue (create/view remote tasks)

## Phase 5 — Polish & Distribution
- [x] Set up CI/CD (GitHub Actions)
- [x] Cross-platform build verification (Linux x64/ARM64, Windows x64/ARM64, macOS x64/ARM64)
- [x] Auto-update system (updateUrl, releaseNotesUrl, GitHub Releases)
- [x] Landing page (React + Vite + Tailwind-style CSS)
