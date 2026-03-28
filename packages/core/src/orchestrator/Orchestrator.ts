// packages/core/src/orchestrator/Orchestrator.ts

import type { Task, Result } from '@vscode-ext/shared';
import { TEAM_LEAD_ID, logger } from '@vscode-ext/shared';
import { AgentRuntime } from '../runtime/AgentRuntime';
import { MessageBus } from '../messaging/MessageBus';
import { TeamRegistry } from '../registry/TeamRegistry';
import { TaskQueue } from './TaskQueue';

export interface OrchestratorEvents {
  onDelegation?: (fromAgent: string, toAgent: string, task: Task) => void;
  onTaskComplete?: (task: Task, result: string) => void;
  onResponse?: (response: string) => void;
}

export class Orchestrator {
  private queue: TaskQueue;

  constructor(
    private registry: TeamRegistry,
    private runtime: AgentRuntime,
    private bus: MessageBus,
    private events: OrchestratorEvents = {},
  ) {
    this.queue = new TaskQueue();
  }

  /**
   * Main entry point. Developer sends a message to the Team Lead.
   * The Team Lead decides how to handle it — directly or by delegating.
   */
  async handleUserMessage(message: string): Promise<Result<string>> {
    logger.info('User message received by orchestrator', { length: message.length });

    // Run Team Lead to analyse and respond
    const leadResult = await this.runtime.runTask(TEAM_LEAD_ID, this.buildLeadPrompt(message));

    if (!leadResult.success) {
      return { success: false, error: leadResult.error };
    }

    const leadOutput = leadResult.data.output;

    // Parse delegation instructions from Team Lead output
    const delegations = this.parseDelegations(leadOutput);

    if (delegations.length === 0) {
      // Team Lead handled it directly
      this.events.onResponse?.(leadOutput);
      return { success: true, data: leadOutput };
    }

    // Execute delegations in parallel where possible
    const delegationResults = await this.executeDelegations(delegations);

    // Synthesise results back through Team Lead
    const synthesis = await this.synthesiseResults(message, delegationResults);

    this.events.onResponse?.(synthesis);
    return { success: true, data: synthesis };
  }

  /**
   * Directly run a task on a specific agent (bypassing Team Lead).
   * Used for @mention direct access.
   */
  async runDirectTask(agentId: string, message: string): Promise<Result<string>> {
    logger.info('Direct task for agent', { agentId });

    const result = await this.runtime.runTask(agentId, message);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Notify Team Lead of the direct interaction (non-blocking)
    await this.bus.send(
      agentId,
      TEAM_LEAD_ID,
      'Direct task completed',
      `Agent ${agentId} was addressed directly:\nPrompt: ${message.substring(0, 100)}\nResult: ${result.data.output.substring(0, 200)}`,
    ).catch(() => { /* non-critical */ });

    return { success: true, data: result.data.output };
  }

  /** Return the number of currently active (pending/running/awaiting_approval) tasks. */
  getActiveTaskCount(): number {
    return this.queue.getActive().length;
  }

  /** Return all tasks tracked by this orchestrator session. */
  getAllTasks(): Task[] {
    return this.queue.getAll();
  }

  private buildLeadPrompt(userMessage: string): string {
    const agents = this.registry.getAllAgents();
    const agentList = agents.map(a => `- ${a.id}: ${a.name} (${a.role})`).join('\n');

    return `You are the Team Lead. A developer has sent you this message:

"${userMessage}"

Available agents you can delegate to:
${agentList}

Instructions:
1. If you can answer directly without needing agent help, do so.
2. If you need to delegate, output delegation instructions in this exact format for each delegation:
   DELEGATE:[agent-id]:[task description]
3. You may delegate to multiple agents. One DELEGATE line per agent.
4. After listing delegations, briefly explain what you're doing to the developer.

Respond now.`;
  }

  private parseDelegations(leadOutput: string): Array<{ agentId: string; task: string }> {
    const lines = leadOutput.split('\n');
    const delegations: Array<{ agentId: string; task: string }> = [];

    for (const line of lines) {
      const match = line.match(/^DELEGATE:([^:]+):(.+)$/);
      if (match) {
        const agentId = match[1].trim();
        const task = match[2].trim();
        if (this.registry.getAgent(agentId)) {
          delegations.push({ agentId, task });
        } else {
          logger.warn('Team Lead tried to delegate to unknown agent', { agentId });
        }
      }
    }

    return delegations;
  }

  private async executeDelegations(
    delegations: Array<{ agentId: string; task: string }>
  ): Promise<Array<{ agentId: string; task: string; result: string; success: boolean }>> {
    // Execute all delegations in parallel
    const results = await Promise.all(
      delegations.map(async ({ agentId, task }) => {
        const queuedTask = this.queue.create(agentId, task);
        this.queue.update(queuedTask.id, { status: 'running' });

        this.events.onDelegation?.(TEAM_LEAD_ID, agentId, queuedTask);

        const result = await this.runtime.runTask(agentId, task);

        if (result.success) {
          this.queue.update(queuedTask.id, {
            status: 'complete',
            result: result.data.output,
            completedAt: new Date().toISOString(),
          });
          this.events.onTaskComplete?.(queuedTask, result.data.output);
          return { agentId, task, result: result.data.output, success: true };
        } else {
          this.queue.update(queuedTask.id, {
            status: 'failed',
            error: result.error.message,
            completedAt: new Date().toISOString(),
          });
          return { agentId, task, result: result.error.message, success: false };
        }
      })
    );

    return results;
  }

  private async synthesiseResults(
    originalMessage: string,
    delegationResults: Array<{ agentId: string; task: string; result: string; success: boolean }>
  ): Promise<string> {
    const summary = delegationResults
      .map(r => `### ${r.agentId} (${r.success ? 'complete' : 'failed'})\n${r.result}`)
      .join('\n\n');

    const synthesisPrompt = `The developer asked: "${originalMessage}"

You delegated tasks and received these results:

${summary}

Now provide a clear, synthesised summary to the developer. Be concise. Highlight what was done, any important outcomes, and any follow-up actions needed.`;

    const result = await this.runtime.runTask(TEAM_LEAD_ID, synthesisPrompt);

    if (result.success) {
      return result.data.output;
    }

    // Fallback: return raw summary if synthesis fails
    return `Tasks completed:\n\n${summary}`;
  }
}
