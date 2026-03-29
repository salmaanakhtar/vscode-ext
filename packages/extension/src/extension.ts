import * as vscode from 'vscode';
import { registerCommands, getSession } from './commands';
import { AgentStatusBar } from './statusbar/AgentStatusBar';
import { AgentPanel } from './panels/AgentPanel';
import { ApprovalQueuePanel } from './panels/ApprovalQueuePanel';

let statusBar: AgentStatusBar;
let agentPanel: AgentPanel;
let approvalQueuePanel: ApprovalQueuePanel;

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);

  agentPanel = new AgentPanel(context, getSession);
  context.subscriptions.push({ dispose: () => agentPanel.dispose() });

  approvalQueuePanel = new ApprovalQueuePanel(context, getSession);
  context.subscriptions.push({ dispose: () => approvalQueuePanel.dispose() });

  statusBar = new AgentStatusBar(getSession);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand('projectname.agentTeam.focus', () => {
      agentPanel.show();
    }),
    vscode.commands.registerCommand('projectname.openApprovalQueue', () => {
      approvalQueuePanel.show();
    }),
  );

  autoStart(context);
}

export function deactivate(): void {
  getSession()?.dispose();
}

async function autoStart(_context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  const { TeamRegistry } = await import('@vscode-ext/core');
  const registry = new TeamRegistry(workspaceRoot);
  const initialised = await registry.isInitialised();

  if (initialised) {
    vscode.commands.executeCommand('projectname.startTeamLead');
  }
}
