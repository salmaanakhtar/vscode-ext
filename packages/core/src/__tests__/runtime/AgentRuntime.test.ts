import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRuntime } from '../../runtime/AgentRuntime';
import type { Agent, TeamConfig } from '@vscode-ext/shared';
import { TEAM_LEAD_ID } from '@vscode-ext/shared';

vi.mock('../../runtime/ClaudeCliRunner', () => ({
  ClaudeCliRunner: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    run: vi.fn().mockResolvedValue({
      output: 'Task completed successfully',
      sessionId: 'sess_abc',
      costUsd: 0.05,
      exitCode: 0,
    }),
  })),
}));

vi.mock('../../runtime/checkClaude', () => ({
  checkClaudeInstalled: vi.fn().mockReturnValue({ installed: true, version: '1.0.0' }),
}));

vi.mock('../../runtime/SystemPromptBuilder', () => ({
  SystemPromptBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue('system prompt'),
  })),
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'frontend',
    name: 'Frontend',
    role: 'Frontend specialist',
    model: 'claude-sonnet-4-6',
    maxTurns: 20,
    git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    approvalRequired: ['deleteFile'],
    builtinTools: ['Read', 'Write'],
    ...overrides,
  };
}

function makeRegistry(agent: Agent | null = makeAgent()) {
  const config: TeamConfig = {
    version: '1.0',
    project: 'test',
    teamLead: { model: 'claude-sonnet-4-6', maxTurns: 30 },
    agents: agent ? [agent] : [],
    memory: { backend: 'files', path: '.agent/memory' },
    git: { defaultBranch: 'main', agentBranchPrefix: 'agent', requireReviewBeforeMerge: true },
  };

  return {
    getAgent: vi.fn().mockReturnValue(agent),
    getConfig: vi.fn().mockReturnValue(config),
    getProjectRoot: vi.fn().mockReturnValue('/tmp/test-project'),
  };
}

function makeMemory() {
  return {
    write: vi.fn().mockResolvedValue({ success: true, data: {} }),
    compact: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  };
}

describe('AgentRuntime', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('checkPrerequisites', () => {
    it('returns ok=true when claude is installed', () => {
      const result = AgentRuntime.checkPrerequisites();
      expect(result.ok).toBe(true);
    });

    it('returns ok=false when claude is not installed', async () => {
      const { checkClaudeInstalled } = await import('../../runtime/checkClaude');
      vi.mocked(checkClaudeInstalled).mockReturnValueOnce({
        installed: false,
        error: 'Claude Code CLI not found',
      });
      const result = AgentRuntime.checkPrerequisites();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Claude Code CLI not found');
    });
  });

  describe('runTask', () => {
    it('returns success result for a registered agent', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      const result = await runtime.runTask('frontend', 'Add a button');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentId).toBe('frontend');
        expect(result.data.output).toBe('Task completed successfully');
        expect(result.data.costUsd).toBe(0.05);
      }
    });

    it('returns success result for team-lead agent', async () => {
      const registry = makeRegistry(null);
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      const result = await runtime.runTask(TEAM_LEAD_ID, 'Orchestrate team');
      expect(result.success).toBe(true);
    });

    it('returns failure when agent is not found', async () => {
      const registry = makeRegistry();
      registry.getAgent.mockReturnValue(null);
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      const result = await runtime.runTask('unknown-agent', 'Do something');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('fires event callbacks in order', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      const events = { onTaskStart: vi.fn(), onTaskComplete: vi.fn(), onStatusChange: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any, events);

      await runtime.runTask('frontend', 'Do work');
      expect(events.onTaskStart).toHaveBeenCalledOnce();
      expect(events.onTaskComplete).toHaveBeenCalledOnce();
    });

    it('caches session ID for warm resume on next call', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      const { ClaudeCliRunner } = await import('../../runtime/ClaudeCliRunner');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      await runtime.runTask('frontend', 'First task');
      await runtime.runTask('frontend', 'Second task');

      // Second call should pass the session ID
      const runnerCalls = vi.mocked(ClaudeCliRunner).mock.results;
      expect(runnerCalls.length).toBe(2);
    });

    it('writes task_summary to memory after success', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      await runtime.runTask('frontend', 'Do something');
      expect(memory.write).toHaveBeenCalledWith(
        'frontend',
        'task_summary',
        expect.stringContaining('Do something'),
        expect.arrayContaining(['task'])
      );
    });

    it('returns failure and fires onTaskError when runner throws', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      const { ClaudeCliRunner } = await import('../../runtime/ClaudeCliRunner');
      vi.mocked(ClaudeCliRunner).mockImplementationOnce(() => ({
        on: vi.fn(),
        run: vi.fn().mockRejectedValue(new Error('CLI crashed')),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any);

      const onTaskError = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any, { onTaskError });

      const result = await runtime.runTask('frontend', 'Bad task');
      expect(result.success).toBe(false);
      expect(onTaskError).toHaveBeenCalledOnce();
    });
  });

  describe('cancelTask', () => {
    it('does not throw when task id is unknown', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);
      await expect(runtime.cancelTask('nonexistent-task')).resolves.toBeUndefined();
    });
  });

  describe('endSession', () => {
    it('compacts memory and sets status to offline', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      await runtime.runTask('frontend', 'Some work');
      await runtime.endSession('frontend');

      expect(memory.compact).toHaveBeenCalledWith('frontend');
      expect(runtime.getStatus('frontend')?.state).toBe('offline');
    });
  });

  describe('getStatus / getAllStatuses', () => {
    it('returns null before any task runs', () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);
      expect(runtime.getStatus('frontend')).toBeNull();
    });

    it('returns idle status after successful task', async () => {
      const registry = makeRegistry();
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      await runtime.runTask('frontend', 'Do work');
      const status = runtime.getStatus('frontend');
      expect(status?.state).toBe('idle');
      expect(status?.agentId).toBe('frontend');
    });

    it('getAllStatuses returns all tracked agents', async () => {
      const agent2 = makeAgent({ id: 'backend', name: 'Backend' });
      const registry = makeRegistry();
      registry.getAgent
        .mockReturnValueOnce(makeAgent())
        .mockReturnValueOnce(agent2);
      const memory = makeMemory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = new AgentRuntime(registry as any, memory as any);

      await runtime.runTask('frontend', 'Frontend work');
      await runtime.runTask('backend', 'Backend work');

      const statuses = runtime.getAllStatuses();
      expect(statuses.map(s => s.agentId)).toContain('frontend');
      expect(statuses.map(s => s.agentId)).toContain('backend');
    });
  });
});
