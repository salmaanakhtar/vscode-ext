import * as vscode from 'vscode';
import * as path from 'path';
import { TeamRegistry, TemplateLibrary, AgentExporter } from '@vscode-ext/core';
import type { Agent } from '@vscode-ext/shared';
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
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('vscode-ext: No workspace open');
        return;
      }

      const lib = new TemplateLibrary();
      const templates = lib.getTemplates();

      const templateItems = [
        ...templates.map(t => ({
          label: t.name,
          description: t.description,
          detail: `Tools: ${t.defaultTools.join(', ')}`,
          templateId: t.id,
        })),
        {
          label: 'Custom Agent',
          description: 'Start from scratch with manual configuration',
          detail: 'No template — you define the role and tools',
          templateId: 'custom' as const,
        },
      ];

      const picked = await vscode.window.showQuickPick(templateItems, {
        placeHolder: 'Select an agent template',
        matchOnDescription: true,
      });
      if (!picked) return;

      let agentName: string | undefined;
      if (picked.templateId === 'custom') {
        agentName = await vscode.window.showInputBox({ prompt: 'Agent name' });
        if (!agentName) return;
      } else {
        agentName = await vscode.window.showInputBox({
          prompt: 'Agent name (press Enter to use default)',
          value: picked.label,
        });
        if (!agentName) return;
      }

      const agentId = agentName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const registry = new TeamRegistry(workspaceRoot);
      const loadResult = await registry.load();
      if (!loadResult.success) {
        vscode.window.showErrorMessage(
          'vscode-ext: Team not initialised. Run "Initialise Agent Team" first.',
        );
        return;
      }

      let agent: Agent;
      if (picked.templateId !== 'custom') {
        const draft = lib.instantiateFromTemplate(picked.templateId, { name: agentName });
        if (!draft) {
          vscode.window.showErrorMessage(`vscode-ext: Template "${picked.templateId}" not found`);
          return;
        }
        agent = { ...draft.agent, id: agentId } as Agent;
      } else {
        agent = {
          id: agentId,
          name: agentName,
          role: agentName,
          model: 'claude-sonnet-4-6',
          maxTurns: 50,
          git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
          approvalRequired: ['deleteFile', 'push', 'runScript'],
          builtinTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
        };
      }

      const result = await registry.registerAgent(agent);
      if (result.success) {
        vscode.window.showInformationMessage(`vscode-ext: Agent "${agentName}" added to the team`);
      } else {
        vscode.window.showErrorMessage(`vscode-ext: Failed to add agent: ${result.error.message}`);
      }
    }),

    vscode.commands.registerCommand('projectname.exportAgent', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('vscode-ext: No workspace open');
        return;
      }

      const registry = new TeamRegistry(workspaceRoot);
      const loadResult = await registry.load();
      if (!loadResult.success) {
        vscode.window.showErrorMessage('vscode-ext: Team not initialised');
        return;
      }

      const agents = registry.getAllAgents();
      if (agents.length === 0) {
        vscode.window.showInformationMessage('vscode-ext: No agents registered in this team');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        agents.map(a => ({ label: a.name, description: a.role, agentId: a.id })),
        { placeHolder: 'Select agent to export' },
      );
      if (!picked) return;

      const agent = registry.getAgent(picked.agentId);
      if (!agent) return;

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(workspaceRoot, `${agent.id}.agentpack`)),
        filters: { 'Agent Pack': ['agentpack'] },
        saveLabel: 'Export Agent',
      });
      if (!saveUri) return;

      const exporter = new AgentExporter();
      const result = await exporter.export(workspaceRoot, agent, saveUri.fsPath);

      if (result.success) {
        vscode.window.showInformationMessage(
          `vscode-ext: Agent "${agent.name}" exported to ${path.basename(saveUri.fsPath)}`,
        );
      } else {
        vscode.window.showErrorMessage(
          `vscode-ext: Export failed: ${result.error.message}`,
        );
      }
    }),

    vscode.commands.registerCommand('projectname.importAgent', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('vscode-ext: No workspace open');
        return;
      }

      const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Agent Pack': ['agentpack'] },
        openLabel: 'Import Agent',
      });
      if (!fileUris || fileUris.length === 0) return;

      const packPath = fileUris[0].fsPath;
      const exporter = new AgentExporter();

      const previewResult = await exporter.preview(packPath);
      if (!previewResult.success) {
        vscode.window.showErrorMessage(
          `vscode-ext: Cannot read agent pack: ${previewResult.error.message}`,
        );
        return;
      }

      const pack = previewResult.data;
      const confirm = await vscode.window.showInformationMessage(
        `Import "${pack.agent.name}" (${pack.agent.role})?`,
        { modal: true },
        'Import',
      );
      if (confirm !== 'Import') return;

      const registry = new TeamRegistry(workspaceRoot);
      const loadResult = await registry.load();
      if (!loadResult.success) {
        vscode.window.showErrorMessage(
          'vscode-ext: Team not initialised. Run "Initialise Agent Team" first.',
        );
        return;
      }

      // Resolve ID conflict
      let agentId = pack.agent.id;
      if (registry.getAgent(agentId)) {
        const override = await vscode.window.showInputBox({
          prompt: `Agent ID "${agentId}" already exists. Enter a new ID`,
          value: `${agentId}-imported`,
        });
        if (!override) return;
        agentId = override;
      }

      const importResult = await exporter.import(packPath, workspaceRoot, agentId);
      if (!importResult.success) {
        vscode.window.showErrorMessage(
          `vscode-ext: Import failed: ${importResult.error.message}`,
        );
        return;
      }

      const agent: Agent = { ...pack.agent, id: agentId, sessionId: undefined };
      const registerResult = await registry.registerAgent(agent);

      if (registerResult.success) {
        vscode.window.showInformationMessage(
          `vscode-ext: Agent "${agent.name}" imported successfully`,
        );
      } else {
        vscode.window.showErrorMessage(
          `vscode-ext: Agent files imported but registration failed: ${registerResult.error.message}`,
        );
      }
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
