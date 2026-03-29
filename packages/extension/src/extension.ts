import * as vscode from 'vscode';
import { registerCommands, getSession } from './commands';
import { AgentStatusBar } from './statusbar/AgentStatusBar';
import { AgentPanel } from './panels/AgentPanel';
import { ApprovalQueuePanel } from './panels/ApprovalQueuePanel';
import { AgentFileDecorationProvider } from './providers/AgentFileDecorationProvider';

let statusBar: AgentStatusBar;
let agentPanel: AgentPanel;
let approvalQueuePanel: ApprovalQueuePanel;
let fileDecorationProvider: AgentFileDecorationProvider;

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);

  agentPanel = new AgentPanel(context, getSession);
  context.subscriptions.push({ dispose: () => agentPanel.dispose() });

  approvalQueuePanel = new ApprovalQueuePanel(context, getSession);
  context.subscriptions.push({ dispose: () => approvalQueuePanel.dispose() });

  statusBar = new AgentStatusBar(getSession);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  fileDecorationProvider = new AgentFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorationProvider),
    { dispose: () => fileDecorationProvider.dispose() },
  );

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
  fileDecorationProvider?.clearAll();
}

async function autoStart(_context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  // Check claude CLI is available before attempting to start
  const { checkClaudeInstalled } = await import('@vscode-ext/core');
  const claudeCheck = checkClaudeInstalled();
  if (!claudeCheck.installed) {
    vscode.window.showErrorMessage(
      `vscode-ext: Claude Code CLI not found. ${claudeCheck.error}`,
      'Learn More',
    ).then(choice => {
      if (choice === 'Learn More') {
        vscode.commands.executeCommand(
          'vscode.open',
          vscode.Uri.parse('https://claude.ai/download'),
        );
      }
    });
    return;
  }

  const { TeamRegistry } = await import('@vscode-ext/core');
  const registry = new TeamRegistry(workspaceRoot);

  let initialised: boolean;
  try {
    initialised = await registry.isInitialised();
  } catch {
    // Corrupt .agent/ directory — show actionable error
    vscode.window.showErrorMessage(
      'vscode-ext: Could not read agent team configuration. The .agent/ directory may be corrupt. Run "vscode-ext: Initialise Agent Team" to reinitialise.',
      'Reinitialise',
    ).then(choice => {
      if (choice === 'Reinitialise') {
        vscode.commands.executeCommand('projectname.initTeam');
      }
    });
    return;
  }

  if (initialised) {
    vscode.commands.executeCommand('projectname.startTeamLead');
  }
}
