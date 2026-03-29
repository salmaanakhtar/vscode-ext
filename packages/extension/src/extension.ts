import * as vscode from 'vscode';
import { registerCommands, getSession } from './commands';
import { AgentStatusBar } from './statusbar/AgentStatusBar';

let statusBar: AgentStatusBar;

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);

  statusBar = new AgentStatusBar(getSession);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

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
