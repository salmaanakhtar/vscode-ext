# Phase 5 — VS Code Extension Shell

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phases 1–4 are complete. This is the first phase with VS Code API code.
> The extension package already has a minimal shell from Phase 1.1 — now we flesh it out.

---

## Phase 5 Goal

Build the VS Code extension shell: the extension entry point, command registration, the Agent Panel webview (primary UI), the status bar item, and file tree decorations. By the end of Phase 5, a developer can open VS Code, activate the extension, see the Agent Panel, and chat with the Team Lead.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 5.1 | Extension entry point & command registration | `phase/5-1-extension-entry` |
| 5.2 | Agent Panel webview (React UI) | `phase/5-2-agent-panel` |
| 5.3 | Status bar & file tree decorations | `phase/5-3-statusbar-decorations` |

---

## Sub-phase 5.1 — Extension Entry Point & Command Registration

### What to build

The VS Code extension entry point that activates `ProjectNameCore`, registers all commands, and wires the core engine's events to VS Code notifications and status updates.

### Key reminder

`packages/extension` is the ONLY package that imports from `vscode`. All agent logic lives in `packages/core`. The extension is a thin shell.

### Files to create / update

```
packages/extension/src/
├── extension.ts                 # Main entry point — activate/deactivate
├── commands/
│   ├── index.ts                 # Registers all commands
│   ├── initTeam.ts              # projectname.initTeam
│   ├── addAgent.ts              # projectname.addAgent
│   ├── removeAgent.ts           # projectname.removeAgent
│   ├── startChat.ts             # projectname.startChat
│   ├── openApprovalQueue.ts     # projectname.openApprovalQueue
│   ├── exportAgent.ts           # projectname.exportAgent
│   └── importAgent.ts           # projectname.importAgent
├── CoreManager.ts               # Singleton wrapper for ProjectNameCore in extension context
└── types.ts                     # Extension-specific types (not shared with core)
```

### CoreManager spec

```typescript
// Manages the ProjectNameCore instance lifecycle within the VS Code extension context.
// Ensures one instance per workspace folder.

class CoreManager {
  private static instance: CoreManager;
  private cores: Map<string, ProjectNameCore> = new Map();

  static getInstance(): CoreManager

  // Get or create a core instance for the given workspace folder
  async getCore(workspaceFolder: vscode.WorkspaceFolder): Promise<ProjectNameCore>

  // Dispose all core instances on extension deactivate
  async disposeAll(): Promise<void>

  // Get core for the currently active workspace folder
  async getActiveCore(): Promise<ProjectNameCore | undefined>
}
```

### extension.ts

```typescript
import * as vscode from 'vscode';
import { CoreManager } from './CoreManager';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const coreManager = CoreManager.getInstance();

  // Register all commands
  registerCommands(context, coreManager);

  // Show welcome message if no workspace is open
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showInformationMessage('vscode-ext: Open a project folder to get started.');
    return;
  }

  // Auto-initialise if .agent/ already exists
  for (const folder of vscode.workspace.workspaceFolders) {
    const core = await coreManager.getCore(folder);
    const isInit = await core.isInitialized();
    if (isInit) {
      await core.initialize();
      void vscode.window.showInformationMessage(`vscode-ext: Team loaded for ${folder.name}`);
    }
  }
}

export async function deactivate(): Promise<void> {
  await CoreManager.getInstance().disposeAll();
}
```

### Command implementations

Each command file should follow this pattern:

```typescript
// commands/initTeam.ts
import * as vscode from 'vscode';
import { CoreManager } from '../CoreManager';

export async function initTeam(coreManager: CoreManager): Promise<void> {
  const folder = await getActiveWorkspaceFolder();
  if (!folder) return;

  const core = await coreManager.getCore(folder);

  // Check if already initialised
  if (await core.isInitialized()) {
    void vscode.window.showWarningMessage('vscode-ext: Team already initialised for this project.');
    return;
  }

  // Pick a preset
  const preset = await vscode.window.showQuickPick(
    ['fullstack-web', 'api-service', 'open-source', 'solo', 'custom'],
    { placeHolder: 'Select a team preset' }
  );
  if (!preset) return;

  const projectName = folder.name;
  await core.createTeam(projectName, preset === 'custom' ? undefined : preset);

  void vscode.window.showInformationMessage(`vscode-ext: Team created for ${projectName}!`);
}
```

Implement all 7 commands following this pattern. Commands that need user input should use `vscode.window.showInputBox()` or `vscode.window.showQuickPick()`.

### Package.json contributes

Update `packages/extension/package.json` to declare all commands:

```json
{
  "contributes": {
    "commands": [
      { "command": "projectname.initTeam", "title": "vscode-ext: Initialize Agent Team" },
      { "command": "projectname.addAgent", "title": "vscode-ext: Add Agent" },
      { "command": "projectname.removeAgent", "title": "vscode-ext: Remove Agent" },
      { "command": "projectname.startChat", "title": "vscode-ext: Open Chat" },
      { "command": "projectname.openApprovalQueue", "title": "vscode-ext: Open Approval Queue" },
      { "command": "projectname.exportAgent", "title": "vscode-ext: Export Agent" },
      { "command": "projectname.importAgent", "title": "vscode-ext: Import Agent" }
    ]
  }
}
```

### Acceptance criteria
- [ ] Extension activates without errors
- [ ] All 7 commands registered and callable from Command Palette
- [ ] `CoreManager` correctly manages one core per workspace folder
- [ ] `initTeam` command creates `.agent/` structure and shows success message
- [ ] Auto-initialise loads existing teams on extension startup

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/5-1-extension-entry
npm run lint && npm run build
git add -A
git commit -m "feat(extension): extension entry point, CoreManager, command registration"
git push origin phase/5-1-extension-entry
git checkout main && git merge phase/5-1-extension-entry --no-ff -m "chore: merge phase/5-1-extension-entry into main"
git push origin main && git branch -d phase/5-1-extension-entry
git checkout -b phase/5-2-agent-panel
```

---

## Sub-phase 5.2 — Agent Panel Webview

### What to build

The primary UI: a VS Code webview panel rendered as a React app. Contains the chat interface, agent team status display, and active task list. This is the main surface developers interact with.

### Architecture note

VS Code webviews are sandboxed HTML pages. Communication between the webview (React) and the extension host (Node.js) uses `postMessage`. The webview cannot import from `packages/core` directly — all data flows through messages.

### Files to create

```
packages/extension/src/
├── panels/
│   ├── AgentPanel.ts            # VS Code webview panel provider
│   └── AgentPanelMessages.ts    # Type-safe message protocol
└── webview/
    ├── index.html               # Webview HTML shell
    ├── index.tsx                # React app entry
    ├── components/
    │   ├── App.tsx
    │   ├── ChatView.tsx         # Main chat interface
    │   ├── AgentList.tsx        # Team status sidebar
    │   ├── TaskList.tsx         # Active tasks display
    │   ├── MessageBubble.tsx    # Individual chat message
    │   └── AgentBadge.tsx       # Agent status indicator
    ├── hooks/
    │   ├── useVSCodeMessaging.ts  # postMessage bridge hook
    │   └── useChatHistory.ts
    └── styles/
        └── webview.css           # Tailwind + custom styles
```

### Message protocol (AgentPanelMessages.ts)

Define every message that can flow between webview and extension host:

```typescript
// Extension → Webview messages
type ExtensionMessage =
  | { type: 'init'; team: TeamConfig; tasks: Task[] }
  | { type: 'taskUpdate'; task: Task }
  | { type: 'agentResponse'; agentId: string; message: string; taskId?: string }
  | { type: 'approvalRequested'; request: ApprovalRequest }
  | { type: 'approvalResolved'; requestId: string }
  | { type: 'error'; message: string }
  | { type: 'thinking'; agentId: string; isThinking: boolean };

// Webview → Extension messages
type WebviewMessage =
  | { type: 'sendMessage'; content: string; targetAgentId?: string }
  | { type: 'resolveApproval'; requestId: string; resolution: ApprovalResolution }
  | { type: 'abortTask'; taskId: string }
  | { type: 'ready' };  // Webview signals it's ready to receive init
```

### AgentPanel.ts (extension host side)

```typescript
class AgentPanel {
  static currentPanel: AgentPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  static createOrShow(context: vscode.ExtensionContext, coreManager: CoreManager): void

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, core: ProjectNameCore) {
    // Subscribe to core events and forward to webview
    core.on('task:created', (task) => this.postMessage({ type: 'taskUpdate', task }));
    core.on('task:complete', (task) => this.postMessage({ type: 'taskUpdate', task }));
    core.on('approval:requested', (req) => this.postMessage({ type: 'approvalRequested', request: req }));

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case 'ready':
          await this.sendInitialState();
          break;
        case 'sendMessage':
          const result = await core.chat(message.content, message.targetAgentId);
          // result flows back through core events
          break;
        case 'resolveApproval':
          core.resolveApproval(message.requestId, message.resolution);
          break;
      }
    });
  }

  private postMessage(message: ExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }
}
```

### React app (webview side)

Build a clean, functional UI with these features:

**ChatView**: Shows conversation history between user and agents. Messages are grouped by sender. Agent messages show the agent name and role. User messages are right-aligned. A text input at the bottom sends messages. A dropdown allows selecting a specific agent (or "Team Lead" default).

**AgentList**: Shows all registered agents with status indicators:
- 🟢 Idle (green dot)
- 🔵 Thinking/working (blue pulsing dot)
- 🟡 Waiting for approval (yellow dot)
- 🔴 Error (red dot)

**TaskList**: A collapsible section showing active and recent tasks with status badges.

### Webview bundling

Add esbuild config for the webview in `packages/extension/package.json`:
```json
{
  "scripts": {
    "build:webview": "esbuild src/webview/index.tsx --bundle --outfile=dist/webview.js --loader:.tsx=tsx",
    "build": "npm run build:extension && npm run build:webview"
  }
}
```

The `index.html` references `dist/webview.js` via the VS Code webview URI mechanism.

### Styling

Use Tailwind CSS utility classes. Match VS Code's dark/light theme by using VS Code CSS variables:
```css
body {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
}
```

### Acceptance criteria
- [ ] Agent Panel opens via command palette
- [ ] Chat interface displays messages correctly
- [ ] Agent list shows all registered agents with status
- [ ] Sending a message triggers core.chat() and response appears
- [ ] Task list updates in real time as tasks change state
- [ ] UI matches VS Code theme (uses VS Code CSS variables)

### Git
```bash
npm run lint && npm run build
git add -A
git commit -m "feat(extension): Agent Panel webview with React chat UI"
git push origin phase/5-2-agent-panel
git checkout main && git merge phase/5-2-agent-panel --no-ff -m "chore: merge phase/5-2-agent-panel into main"
git push origin main && git branch -d phase/5-2-agent-panel
git checkout -b phase/5-3-statusbar-decorations
```

---

## Sub-phase 5.3 — Status Bar & File Tree Decorations

### What to build

A compact status bar item showing active agent count and cost, plus file tree decorations that show which agent is working on each file.

### Files to create

```
packages/extension/src/
├── statusbar/
│   ├── AgentStatusBar.ts
│   └── index.ts
└── decorations/
    ├── AgentFileDecorator.ts
    └── index.ts
```

### AgentStatusBar spec

```typescript
class AgentStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    // Creates status bar item on the right side
    // Default text: "$(robot) No team loaded"
    // Click → opens Agent Panel
  }

  // Update display based on core state
  update(state: {
    activeAgents: number;
    pendingApprovals: number;
    totalCostUsd: number;
    isThinking: boolean;
  }): void
  // Display format: "$(robot) 2 agents | ⚠️ 1 approval | $0.12"
  // When thinking: "$(loading~spin) Working..."

  dispose(): void
}
```

### AgentFileDecorator spec

```typescript
// Implements vscode.FileDecorationProvider
// Shows a coloured badge on files currently being worked on by agents

class AgentFileDecorator implements vscode.FileDecorationProvider {
  private activeFiles: Map<string, string> = new Map(); // filePath → agentId

  onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]>;

  // Mark a file as active for an agent
  setActiveFile(filePath: string, agentId: string): void

  // Clear active file for an agent
  clearActiveFile(filePath: string): void

  // Clear all files for an agent (when agent task completes)
  clearAgentFiles(agentId: string): void

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined
  // Returns a badge with agent initials and tooltip showing agent name
  // Badge colour: blue for active, yellow for waiting approval
}
```

### Wire into extension

Update `extension.ts` to:
1. Instantiate `AgentStatusBar` and `AgentFileDecorator` on activation
2. Register `AgentFileDecorator` as a `FileDecorationProvider`
3. Subscribe to core events to update status bar and decorations:
   - `task:active` → update status bar, set file decorations for the files involved
   - `task:complete` → update status bar, clear file decorations
   - `approval:requested` → update status bar with pending count

### Acceptance criteria
- [ ] Status bar shows agent count, pending approvals, and running cost
- [ ] Status bar click opens Agent Panel
- [ ] Files being worked on show agent badge in file explorer
- [ ] Decorations clear when task completes
- [ ] Status bar updates in real time

### Git
```bash
npm run lint && npm run build
git add -A
git commit -m "feat(extension): status bar item and file tree agent decorations"
git push origin phase/5-3-statusbar-decorations
git checkout main && git merge phase/5-3-statusbar-decorations --no-ff -m "chore: merge phase/5-3-statusbar-decorations into main — Phase 5 complete"
git push origin main && git branch -d phase/5-3-statusbar-decorations
```

### Update PROGRESS.md

Mark Phase 5 complete. Next session: Phase 6 — Approval Queue UI.

---

## Phase 5 Complete Checklist

- [ ] Extension activates cleanly in VS Code
- [ ] All 7 commands accessible from Command Palette
- [ ] Agent Panel opens and shows chat + agent list + tasks
- [ ] Chat messages flow: user → extension host → core → agent → back to webview
- [ ] Status bar shows live agent activity
- [ ] File decorations appear on files being worked on
- [ ] No business logic in extension layer
- [ ] Extension builds with esbuild without errors
- [ ] PROGRESS.md updated
- [ ] Main branch up to date on GitHub
