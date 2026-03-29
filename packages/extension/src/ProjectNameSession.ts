import * as vscode from 'vscode';
import {
  TeamRegistry,
  MemoryManager,
  AgentRuntime,
  MessageBus,
  ApprovalGate,
  Orchestrator,
  GitManager,
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
    request: ApprovalRequest,
  ): Promise<ApprovalResolution> {
    return new Promise((resolve) => {
      const emojiMap: Record<string, string> = { low: '🟡', medium: '🟠', high: '🔴' };
      const riskEmoji = emojiMap[request.riskLevel] ?? '⚪';

      if (request.riskLevel === 'low') {
        vscode.window.showInformationMessage(
          `${riskEmoji} Agent ${request.agentId}: ${request.description}`,
          'Approve', 'Reject',
        ).then(choice => {
          resolve({
            decision: choice === 'Approve' ? 'approved' : 'rejected',
            resolvedAt: new Date().toISOString(),
          });
        });
      } else {
        vscode.commands.executeCommand('projectname.openApprovalQueue');
        vscode.window.showWarningMessage(
          `${riskEmoji} Approval required from agent ${request.agentId}. Check the Approval Queue.`,
          'Open Queue',
        ).then(() => {
          vscode.commands.executeCommand('projectname.openApprovalQueue');
        });

        this.context.workspaceState.update(`approval:${request.id}`, request);

        const poll = setInterval(() => {
          const resolution = this.context.workspaceState.get<ApprovalResolution>(
            `approval:resolution:${request.id}`,
          );
          if (resolution) {
            clearInterval(poll);
            this.context.workspaceState.update(`approval:${request.id}`, undefined);
            this.context.workspaceState.update(`approval:resolution:${request.id}`, undefined);
            resolve(resolution);
          }
        }, 500);

        setTimeout(() => {
          clearInterval(poll);
          resolve({ decision: 'rejected', feedback: 'Timed out', resolvedAt: new Date().toISOString() });
        }, 5 * 60 * 1000);
      }
    });
  }
}
