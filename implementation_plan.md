# PeakGravity IDE — Fork VS Code & Rebrand

Transform PeakGravity from a custom Electron+React app into a **full VS Code fork**, rebranded as PeakGravity IDE, with your AI agent, BYOK provider system, and "work while I'm gone" autonomous agent built directly into the editor core.

## User Review Required

> [!CAUTION]
> **This is a full codebase migration.** Your current React+TanStack+Vite codebase will be replaced by the VS Code codebase (which uses its own internal framework, not React). Your existing AI agent logic, provider adapters, and Supabase integration will need to be **ported** into VS Code's extension/workbench architecture. This is a multi-week effort.

> [!IMPORTANT]
> **Licensing & Branding:** VS Code's source (Code - OSS) is MIT-licensed, but **Microsoft's branding, logos, and telemetry are trademarked.** We must strip all Microsoft references. You **cannot** use the official VS Code Extension Marketplace — you'll need to use **Open VSX** or host your own.

> [!WARNING]
> **Ongoing maintenance burden:** Every time Microsoft updates VS Code (monthly releases), you'll need to merge upstream changes into your fork. This is the same challenge Cursor and Windsurf face. You should plan a merge strategy from day one.

## Open Questions

> [!IMPORTANT]
> **1. Repository Strategy:** Should we:
> - **(A)** Clone VS Code into the **existing `peakgravity` repo** (replacing the current code), or
> - **(B)** Create a **new separate repository** for the VS Code fork and keep the current repo as a reference?
>
> I recommend **(B)** — keeping the current codebase as a reference while building the fork separately, then migrating the Lovable connection once the fork is stable.

> [!IMPORTANT]
> **2. Extension Marketplace:** Which marketplace should PeakGravity use?
> - **Open VSX** (open-source, community-maintained, most VS Code forks use this)
> - **Self-hosted marketplace** (full control but more infrastructure)
> - **Both** (Open VSX as default + ability to add custom registries)

> [!IMPORTANT]
> **3. Supabase Backend:** Your current app uses Supabase for auth, conversation history, and the key vault. In the VS Code fork:
> - Should Supabase remain the backend (as a built-in extension)?
> - Or should we move to a local-first approach (SQLite/IndexedDB) for conversations, keeping Supabase only for the remote "work while I'm gone" feature?

> [!IMPORTANT]
> **4. "Work While I'm Gone" Architecture:** This is your killer feature. How should it work?
> - The agent runs **locally** on the user's machine even when the IDE is closed (background daemon)?
> - The agent runs on a **remote server** (your infrastructure) and the user monitors via phone/web?
> - Both (local by default, remote as a paid tier)?

---

## Proposed Changes

This is a phased migration plan. Each phase is independently shippable.

---

### Phase 0 — Environment Setup & VS Code Fork

**Goal:** Get a clean, buildable VS Code fork rebranded as PeakGravity.

#### Steps:

1. **Fork `microsoft/vscode`** on GitHub → `Manu-dev78/peakgravity-ide` (or similar)

2. **Clone and build** locally:
   ```bash
   git clone https://github.com/Manu-dev78/peakgravity-ide.git
   cd peakgravity-ide
   # Install the correct Node.js version (check .nvmrc)
   yarn install
   yarn compile
   # Run the dev build
   ./scripts/code.bat  # Windows
   ```

3. **Rebrand `product.json`** — the central identity file:
   ```json
   {
     "nameShort": "PeakGravity",
     "nameLong": "PeakGravity IDE",
     "applicationName": "peakgravity",
     "dataFolderName": ".peakgravity",
     "win32MutexName": "peakgravity",
     "licenseName": "MIT",
     "urlProtocol": "peakgravity",
     "win32DirName": "PeakGravity",
     "win32NameVersion": "PeakGravity",
     "win32AppUserModelId": "PeakGravity.PeakGravity",
     "darwinBundleIdentifier": "dev.peakgravity.ide",
     "extensionsGallery": {
       "serviceUrl": "https://open-vsx.org/vscode/gallery",
       "itemUrl": "https://open-vsx.org/vscode/item",
       "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}"
     }
   }
   ```

4. **Replace icons & logos:**
   - `resources/win32/` — Windows icons (.ico)
   - `resources/darwin/` — macOS icons (.icns)
   - `resources/linux/` — Linux icons (.png)
   - `src/vs/workbench/browser/media/` — Splash/welcome screen assets

5. **Strip Microsoft telemetry:**
   - Remove/disable telemetry endpoints in `product.json`
   - Set `"enableTelemetry": false` as default
   - Remove Microsoft-specific crash reporting

6. **Verify the build** runs and opens as "PeakGravity IDE"

---

### Phase 1 — AI Agent Panel (Port Core Feature)

**Goal:** Port your existing AI agent into VS Code's workbench as a first-class panel.

#### What you have today (to port):
| Current File | What It Does |
|---|---|
| [AgentPanel.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/AgentPanel.tsx) | Chat UI container |
| [Composer.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/Composer.tsx) | Message input with @mentions |
| [MessageList.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/MessageList.tsx) | Chat message display |
| [MessageMarkdown.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/MessageMarkdown.tsx) | Markdown rendering in messages |
| [ModelPicker.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/ModelPicker.tsx) | Model selection dropdown |
| [loop.ts](file:///c:/Users/HP/peakgravity/src/lib/agent/loop.ts) | Agent execution loop |
| [registry.ts](file:///c:/Users/HP/peakgravity/src/lib/agent/registry.ts) | Tool registry |
| [settings.ts](file:///c:/Users/HP/peakgravity/src/lib/agent/settings.ts) | Agent settings |
| Agent tools (`src/lib/agent/tools/*`) | read_file, list_dir, search_files, run_command, apply_patch |
| Provider adapters (`src/lib/providers/chat/*`) | OpenAI, Anthropic, Gemini streaming |

#### Architecture in VS Code:

VS Code uses a **Workbench Contribution** pattern. The AI agent will be built as:

1. **A built-in extension** (`extensions/peakgravity-agent/`) — this is how Cursor and Windsurf do it
   - Contains the provider adapters, agent loop, tool registry
   - Registers VS Code commands, views, and keybindings
   
2. **A workbench view container** — adds "PeakGravity Agent" to the activity bar
   - Custom webview panel for the chat UI (rendered with your React components via a webview)
   - OR native VS Code tree views + webview hybrid (like GitHub Copilot Chat)

3. **Deep editor integration:**
   - Inline code suggestions (like Copilot)
   - Diff review panel (you already have [DiffViewer.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/DiffViewer.tsx) and [ReviewPanel.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/ReviewPanel.tsx))
   - Terminal integration for `run_command` tool (VS Code has a full terminal API)

---

### Phase 2 — BYOK Provider System & Settings

**Goal:** Port the key vault and multi-provider system.

#### What you have today:
| Current File | Purpose |
|---|---|
| [SettingsDialog.tsx](file:///c:/Users/HP/peakgravity/src/components/ide/SettingsDialog.tsx) | Provider key management UI |
| [keys.functions.ts](file:///c:/Users/HP/peakgravity/src/lib/keys.functions.ts) | Encrypted key storage (Supabase) |
| [crypto.server.ts](file:///c:/Users/HP/peakgravity/src/lib/crypto.server.ts) | Key encryption |
| [catalog.ts](file:///c:/Users/HP/peakgravity/src/lib/providers/catalog.ts) | Provider catalog |
| [list-models.ts](file:///c:/Users/HP/peakgravity/src/lib/providers/list-models.ts) | Model listing per provider |
| Provider chat adapters | OpenAI, Anthropic, Gemini streaming |

#### In VS Code fork:
- Settings page via VS Code's **Settings UI** (`contributes.configuration` in the extension manifest)
- Encrypted key storage using VS Code's **SecretStorage API** (built-in, OS keychain backed) — this is **better** than Supabase for local keys
- Provider configuration as VS Code settings with custom editor UI

---

### Phase 3 — "Work While I'm Gone" (Autonomous Agent)

**Goal:** The killer differentiator — agent continues working when user is away.

#### Architecture:
1. **Background Agent Daemon** — a Node.js process that runs independently of the IDE
   - Picks up tasks from a queue (local SQLite or Supabase)
   - Uses the same agent loop, tools, and provider adapters
   - Writes changes to a staging branch / working copy

2. **Mobile/Web Dashboard** — lightweight web app to monitor agent progress
   - View agent activity log
   - Approve/reject changes
   - Give new instructions
   - Start/stop the agent remotely
   - This can remain your current TanStack/React app, deployed as a web service

3. **Notification System** — push notifications when agent needs approval
   - Email, SMS, or push notification via Supabase Edge Functions

---

### Phase 4 — Supabase Integration (Cloud Sync)

**Goal:** Wire up Supabase for the features that need a backend.

#### What stays in Supabase:
- User authentication (login/signup)
- Conversation history sync (across devices)
- Remote agent task queue (for "work while I'm gone")
- Usage analytics (optional)

#### What moves local:
- API key storage → VS Code SecretStorage (OS keychain)
- File system operations → VS Code's native file system API
- Editor state → VS Code's built-in state management

---

### Phase 5 — Polish & Distribution

**Goal:** Production-quality builds for all platforms.

1. **CI/CD Pipeline** (GitHub Actions):
   - Build for Windows (NSIS installer + portable), macOS (DMG + ZIP), Linux (AppImage + deb + rpm)
   - Auto-update system (VS Code has this built in)
   - Code signing for macOS and Windows

2. **Landing page & downloads** — website at peakgravity.dev

3. **Extension compatibility testing** — ensure popular VS Code extensions work

---

## Verification Plan

### Automated Tests
- `yarn test` — VS Code's built-in test suite must pass after rebranding
- Custom tests for the agent extension: provider streaming, tool execution, diff generation
- Build verification: `yarn compile && yarn package` on Windows, macOS, Linux

### Manual Verification
- Open the built app → title bar shows "PeakGravity IDE"
- Open a folder → file explorer, Monaco editor, terminal all work
- Install extensions from Open VSX
- Chat with agent → streaming responses from OpenAI/Anthropic/Gemini
- Agent applies file edits → diff review → approve/reject
- "Work while I'm gone" → agent runs in background, user monitors via web

---

## Estimated Timeline

| Phase | Effort | Description |
|---|---|---|
| Phase 0 | 1-2 days | Fork, rebrand, get building |
| Phase 1 | 1-2 weeks | Port AI agent into VS Code extension |
| Phase 2 | 3-5 days | Port BYOK provider system |
| Phase 3 | 2-3 weeks | "Work while I'm gone" autonomous agent |
| Phase 4 | 1 week | Supabase cloud sync |
| Phase 5 | 1 week | CI/CD, distribution, polish |

**Total: ~6-8 weeks** for a production-ready first release.

---

## What You Keep From the Current Codebase

Your existing code is **not thrown away** — the business logic ports over:

| Keep (port to VS Code) | Replace (VS Code provides) |
|---|---|
| Agent loop & tools | Electron wrapper |
| Provider adapters (OpenAI, Anthropic, Gemini) | File explorer & tree view |
| Chat streaming logic | Monaco editor (already built-in) |
| Diff generation | Terminal (full PTY support) |
| Supabase auth & sync | Settings UI |
| "Work while I'm gone" daemon | Keybindings & command palette |
| Key encryption | Extension marketplace |
