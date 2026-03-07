# Phase 5.1 — VS Code Extension Shell

> Read CLAUDE.md and PROGRESS.md before starting.
> All Phase 4 work must be complete. The core engine must be fully functional.

---

## Goal

Wire up the VS Code extension shell in `packages/extension/`. Register all commands, providers, and the status bar item. Connect to the core engine. The UI panels are stubs at this stage — they get full implementations in Phase 5.2 and 6.1.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/5.1-vscode-shell
```

---

## Deliverables

### 1. `packages/core/src/index.ts` — Export the full core API

Before building the extension, make sure the core package exports everything needed:

```typescript
// packages/core/src/index.ts
export { MemoryManager } from './memory/MemoryManager';
export { FileAdapter } from './memory/FileAdapter';
export { SQLiteAdapter } from './memory/SQLiteAdapter';
export { TeamRegistry } from './registry/TeamRegistry';
export { AgentRuntime } from './runtime/AgentRuntime';
export { SystemPromptBuilder } from './runtime/SystemPromptBuilder';
export { MessageBus } from './bus/MessageBus';
export { ApprovalGate } from './gate/ApprovalGate';
export { Orchestrator } from './orchestrator/Orchestrator';
export { TaskQueue } from './orchestrator/TaskQueue';
export { GitManager } from './git/GitManager';
export type { TaskResult, RuntimeEvents } from './runtime/AgentRuntime';
export type { MessageHandler } from './bus/MessageBus';
export type { ApprovalHandler } from './gate/ApprovalGate';
export type { OrchestratorEvents } from './orchestrator/Orchestrator';
export type { CommitOptions, BranchOptions, PROptions } from './git/GitManager';
```

### 2. `packages/extension/src/ProjectNameSession.ts`

Central session object that holds all core engine instances for a workspace:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import {
  TeamRegistry, MemoryManager, AgentRuntime,
  MessageBus, ApprovalGate, Orchestrator, GitManager
} from '@vscode-ext/core';
import type { ApprovalRequest, ApprovalResolution } from '@vscode-ext/shared';

export class ProjectNameSession {
  public registry: TeamRegistry;
  public memory: MemoryManager;
  public runtime: AgentRuntime;
  public bus: MessageBus;
  public gate: ApprovalGate;
  public orchestrator: Orchestrator;
  public git: GitManager;

  private constructor(
    public readonly projectRoot: string,
    public readonly context: vscode.ExtensionContext,
  ) {
    this.registry = new TeamRegistry(projectRoot);
    this.memory = new MemoryManager();
    this.git = new GitManager(projectRoot);
    this.bus = new MessageBus(projectRoot);

    this.gate = new ApprovalGate(projectRoot);
    // Wire approval handler to VS Code UI
    this.gate.setApprovalHandler(async (request) => {
      return this.handleApprovalRequest(request);
    });

    this.runtime = new AgentRuntime(this.registry, this.memory);
    this.orchestrator = new Orchestrator(this.registry, this.runtime, this.bus);
  }

  static async create(
    projectRoot: string,
    context: vscode.ExtensionContext,
  ): Promise<ProjectNameSession | null> {
    const session = new ProjectNameSession(projectRoot, context);
    const loadResult = await session.registry.load();
    if (!loadResult.success) return null;

    const config = session.registry.getConfig();
    if (!config) return null;

    const memResult = await session.memory.init(config.memory);
    if (!memResult.success) return null;

    session.bus.start();
    return session;
  }

  dispose(): void {
    this.bus.stop();
  }

  private async handleApprovalRequest(
    request: ApprovalRequest
  ): Promise<ApprovalResolution> {
    return new Promise((resolve) => {
      const riskEmoji = { low: '🟡', medium: '🟠', high: '🔴' }[request.riskLevel] ?? '⚪';

      if (request.riskLevel === 'low') {
        // Popup notification for low risk
        vscode.window.showInformationMessage(
          `${riskEmoji} Agent ${request.agentId}: ${request.description}`,
          'Approve', 'Reject'
        ).then(choice => {
          resolve({
            decision: choice === 'Approve' ? 'approved' : 'rejected',
            resolvedAt: new Date().toISOString(),
          });
        });
      } else {
        // Direct to approval queue panel for medium/high
        vscode.commands.executeCommand('projectname.openApprovalQueue');
        vscode.window.showWarningMessage(
          `${riskEmoji} Approval required from agent ${request.agentId}. Check the Approval Queue.`,
          'Open Queue'
        ).then(() => {
          vscode.commands.executeCommand('projectname.openApprovalQueue');
        });

        // Store pending resolve for queue panel to call
        this.context.workspaceState.update(`approval:${request.id}`, request);

        // Poll for resolution (queue panel will update workspaceState)
        const poll = setInterval(() => {
          const resolution = this.context.workspaceState.get<ApprovalResolution>(
            `approval:resolution:${request.id}`
          );
          if (resolution) {
            clearInterval(poll);
            this.context.workspaceState.update(`approval:${request.id}`, undefined);
            this.context.workspaceState.update(`approval:resolution:${request.id}`, undefined);
            resolve(resolution);
          }
        }, 500);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(poll);
          resolve({ decision: 'rejected', feedback: 'Timed out', resolvedAt: new Date().toISOString() });
        }, 5 * 60 * 1000);
      }
    });
  }
}
```

### 3. `packages/extension/src/commands/index.ts`

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { TeamRegistry, MemoryManager } from '@vscode-ext/core';
import { ProjectNameSession } from '../ProjectNameSession';

let currentSession: ProjectNameSession | null = null;

export function getSession(): ProjectNameSession | null {
  return currentSession;
}

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('projectname.initTeam', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('vscode-ext: No workspace open');
        return;
      }

      const projectName = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        value: path.basename(workspaceRoot),
      });
      if (!projectName) return;

      const registry = new TeamRegistry(workspaceRoot);
      const result = await registry.initProject(projectName);

      if (result.success) {
        vscode.window.showInformationMessage(`vscode-ext: Team initialised for "${projectName}"`);
        vscode.commands.executeCommand('projectname.startTeamLead');
      } else {
        vscode.window.showErrorMessage(`vscode-ext: Init failed: ${result.error.message}`);
      }
    }),

    vscode.commands.registerCommand('projectname.startTeamLead', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      if (currentSession) {
        currentSession.dispose();
      }

      currentSession = await ProjectNameSession.create(workspaceRoot, context);

      if (currentSession) {
        vscode.window.showInformationMessage('vscode-ext: Team Lead started');
        vscode.commands.executeCommand('projectname.agentTeam.focus');
      } else {
        vscode.window.showErrorMessage(
          'vscode-ext: Failed to start. Is this project initialised? Run "Initialise Agent Team" first.'
        );
      }
    }),

    vscode.commands.registerCommand('projectname.addAgent', async () => {
      // Stub — full implementation in Phase 5.2
      vscode.window.showInformationMessage('vscode-ext: Add Agent — coming in Phase 5.2');
    }),

    vscode.commands.registerCommand('projectname.openApprovalQueue', async () => {
      // Stub — full implementation in Phase 6.1
      vscode.window.showInformationMessage('vscode-ext: Approval Queue — coming in Phase 6.1');
    }),

    vscode.commands.registerCommand('projectname.exportAgent', async () => {
      // Stub — full implementation in Phase 7.1
      vscode.window.showInformationMessage('vscode-ext: Export Agent — coming in Phase 7.1');
    }),

    vscode.commands.registerCommand('projectname.importAgent', async () => {
      // Stub — full implementation in Phase 7.1
      vscode.window.showInformationMessage('vscode-ext: Import Agent — coming in Phase 7.1');
    }),

    vscode.commands.registerCommand('projectname.viewProgress', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot || !currentSession) return;

      const tasks = currentSession.orchestrator.getAllTasks();
      const active = tasks.filter(t => t.status === 'running' || t.status === 'awaiting_approval');

      const message = active.length > 0
        ? `Active tasks: ${active.map(t => `${t.agentId}: ${t.prompt.substring(0, 40)}`).join(', ')}`
        : 'No active tasks';

      vscode.window.showInformationMessage(`vscode-ext: ${message}`);
    }),
  );
}
```

### 4. `packages/extension/src/statusbar/AgentStatusBar.ts`

```typescript
import * as vscode from 'vscode';
import type { ProjectNameSession } from '../ProjectNameSession';

export class AgentStatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private getSession: () => ProjectNameSession | null) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 100
    );
    this.item.command = 'projectname.viewProgress';
    this.item.tooltip = 'vscode-ext: Click to view agent progress';
    this.update();
    this.timer = setInterval(() => this.update(), 2000);
  }

  update(): void {
    const session = this.getSession();

    if (!session) {
      this.item.text = '$(robot) [PN]';
      this.item.color = new vscode.ThemeColor('statusBar.foreground');
    } else {
      const statuses = session.runtime.getAllStatuses();
      const active = statuses.filter(s => s.state !== 'idle' && s.state !== 'offline');
      const awaiting = statuses.filter(s => s.state === 'awaiting_approval');

      if (awaiting.length > 0) {
        this.item.text = `$(robot) [PN] $(warning) ${awaiting.length} awaiting approval`;
        this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      } else if (active.length > 0) {
        this.item.text = `$(robot) [PN] $(sync~spin) ${active.length} active`;
        this.item.color = new vscode.ThemeColor('statusBar.foreground');
      } else {
        this.item.text = '$(robot) [PN] $(check)';
        this.item.color = new vscode.ThemeColor('statusBar.foreground');
      }
    }

    this.item.show();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }
}
```

### 5. `packages/extension/src/extension.ts` — Full Implementation

```typescript
import * as vscode from 'vscode';
import { registerCommands, getSession } from './commands';
import { AgentStatusBar } from './statusbar/AgentStatusBar';

let statusBar: AgentStatusBar;

export function activate(context: vscode.ExtensionContext): void {
  // Register all commands
  registerCommands(context);

  // Status bar
  statusBar = new AgentStatusBar(getSession);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // Auto-start if project is already initialised
  autoStart(context);
}

export function deactivate(): void {
  getSession()?.dispose();
}

async function autoStart(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  const { TeamRegistry } = await import('@vscode-ext/core');
  const registry = new TeamRegistry(workspaceRoot);
  const initialised = await registry.isInitialised();

  if (initialised) {
    vscode.commands.executeCommand('projectname.startTeamLead');
  }
}
```

---

## Acceptance Criteria

- [ ] Extension activates without errors in VS Code
- [ ] `projectname.initTeam` creates `.agent/` directory correctly
- [ ] `projectname.startTeamLead` starts a session
- [ ] Status bar shows agent count and updates every 2 seconds
- [ ] All commands register without error (stubs are fine for now)
- [ ] `npm run typecheck` passes in `packages/extension`

---

## Self-Review & Merge

```bash
cd packages/extension && npm run typecheck
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/5.1-vscode-shell --no-ff -m "merge: complete phase 5.1 — vscode extension shell"
git push origin main
git tag -a "phase-5.1-complete" -m "Phase 5.1 complete: vscode shell"
git push origin --tags
```

---

## Next Phase

**Phase 5.2 — Agent Panel UI (Webview)**
Load `_phases/PHASE-5.2.md` in the next session.

---
---

