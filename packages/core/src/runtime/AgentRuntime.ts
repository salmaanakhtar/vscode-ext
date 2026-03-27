// packages/core/src/runtime/AgentRuntime.ts

import type { Agent, Task, Result, AgentStatus } from '@vscode-ext/shared';
import { generateTaskId, logger, TEAM_LEAD_ID } from '@vscode-ext/shared';
import { TeamRegistry } from '../registry/TeamRegistry';
import { MemoryManager } from '../memory/MemoryManager';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { ClaudeCliRunner } from './ClaudeCliRunner';
import { checkClaudeInstalled } from './checkClaude';

export interface TaskResult {
  taskId: string;
  agentId: string;
  output: string;
  costUsd?: number;
}

export interface RuntimeEvents {
  onTaskStart?: (task: Task) => void;
  onTaskComplete?: (result: TaskResult) => void;
  onTaskError?: (taskId: string, error: Error) => void;
  onTextChunk?: (agentId: string, text: string) => void;
  onStatusChange?: (status: AgentStatus) => void;
}

export class AgentRuntime {
  private activeSessions: Map<string, string> = new Map();
  private activeStatuses: Map<string, AgentStatus> = new Map();
  private promptBuilder: SystemPromptBuilder;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    private registry: TeamRegistry,
    private memory: MemoryManager,
    private events: RuntimeEvents = {},
  ) {
    this.promptBuilder = new SystemPromptBuilder(registry, memory);
  }

  static checkPrerequisites(): { ok: boolean; error?: string } {
    const result = checkClaudeInstalled();
    return result.installed ? { ok: true } : { ok: false, error: result.error };
  }

  async runTask(agentId: string, prompt: string): Promise<Result<TaskResult>> {
    const agent = agentId === TEAM_LEAD_ID
      ? this.getTeamLeadAsAgent()
      : this.registry.getAgent(agentId);

    if (!agent) {
      return { success: false, error: new Error(`Agent not found: ${agentId}`) };
    }

    const task: Task = {
      id: generateTaskId(),
      agentId,
      prompt,
      status: 'running',
      createdAt: new Date().toISOString(),
    };

    this.updateStatus(agentId, 'thinking', task.id);
    this.events.onTaskStart?.(task);

    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      const systemPrompt = await this.promptBuilder.build(agentId);
      const allowedTools = agent.builtinTools ?? ['Read', 'Write', 'Bash'];
      const sessionId = this.activeSessions.get(agentId);

      const runner = new ClaudeCliRunner();
      runner.on('text', (text: string) => {
        this.events.onTextChunk?.(agentId, text);
      });

      this.updateStatus(agentId, 'writing', task.id);

      const cliResult = await runner.run({
        prompt,
        systemPrompt,
        allowedTools,
        cwd: this.registry.getProjectRoot(),
        sessionId,
        outputFormat: 'stream-json',
        abortSignal: abortController.signal,
      });

      if (cliResult.sessionId) {
        this.activeSessions.set(agentId, cliResult.sessionId);
      }

      await this.memory.write(
        agentId,
        'task_summary',
        `Task: ${prompt.substring(0, 100)}\nResult: ${cliResult.output.substring(0, 200)}`,
        ['task', task.id]
      );

      const taskResult: TaskResult = {
        taskId: task.id,
        agentId,
        output: cliResult.output,
        costUsd: cliResult.costUsd,
      };

      this.updateStatus(agentId, 'idle');
      this.events.onTaskComplete?.(taskResult);
      this.abortControllers.delete(task.id);

      return { success: true, data: taskResult };

    } catch (err) {
      this.updateStatus(agentId, 'error');
      this.events.onTaskError?.(task.id, err as Error);
      this.abortControllers.delete(task.id);
      logger.error('Task failed', { agentId, taskId: task.id, error: (err as Error).message });
      return { success: false, error: err as Error };
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
  }

  async endSession(agentId: string): Promise<void> {
    await this.memory.compact(agentId);
    this.activeSessions.delete(agentId);
    this.updateStatus(agentId, 'offline');
    logger.info('Session ended', { agentId });
  }

  getStatus(agentId: string): AgentStatus | null {
    return this.activeStatuses.get(agentId) ?? null;
  }

  getAllStatuses(): AgentStatus[] {
    return Array.from(this.activeStatuses.values());
  }

  private updateStatus(agentId: string, state: AgentStatus['state'], taskId?: string): void {
    const existing = this.activeStatuses.get(agentId);
    const status: AgentStatus = {
      agentId,
      state,
      currentTaskId: taskId,
      lastActivityAt: new Date().toISOString(),
      sessionActive: state !== 'offline',
      tokensUsed: existing?.tokensUsed ?? 0,
      costUsd: existing?.costUsd ?? 0,
    };
    this.activeStatuses.set(agentId, status);
    this.events.onStatusChange?.(status);
  }

  private getTeamLeadAsAgent(): Agent {
    const config = this.registry.getConfig();
    return {
      id: TEAM_LEAD_ID,
      name: 'Team Lead',
      role: 'Orchestrator',
      model: config?.teamLead.model ?? 'claude-sonnet-4-6',
      maxTurns: config?.teamLead.maxTurns ?? 30,
      git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: true, canMerge: false },
      approvalRequired: ['deleteFile', 'forcePush'],
      builtinTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch'],
    };
  }
}
