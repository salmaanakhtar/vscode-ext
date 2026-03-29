import * as vscode from 'vscode';
import * as path from 'path';
import { TeamRegistry } from '@vscode-ext/core';
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
          'vscode-ext: Failed to start. Is this project initialised? Run "Initialise Agent Team" first.',
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
