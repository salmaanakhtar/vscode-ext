import { describe, it, expect, vi } from 'vitest';
import { Orchestrator, OrchestratorEvents } from '../../orchestrator/Orchestrator';
import { TEAM_LEAD_ID } from '@vscode-ext/shared';

// ─── Minimal stubs ────────────────────────────────────────────────────────────

function makeRegistry(agents: Array<{ id: string; name: string; role: string }> = []) {
  return {
    getAllAgents: vi.fn(() => agents),
    getAgent: vi.fn((id: string) => agents.find(a => a.id === id) ?? null),
    getProjectRoot: vi.fn(() => '/fake/root'),
    getConfig: vi.fn(() => null),
  };
}

function makeRuntime(responses: Record<string, string> = {}) {
  return {
    runTask: vi.fn(async (agentId: string, _prompt: string) => {
      const output = responses[agentId] ?? `response from ${agentId}`;
      return { success: true, data: { taskId: 'tid', agentId, output } };
    }),
  };
}

function makeBus() {
  return {
    send: vi.fn(async () => ({ success: true, data: {} })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator', () => {
  describe('handleUserMessage — direct response (no delegations)', () => {
    it('returns Team Lead output when no DELEGATE lines present', async () => {
      const registry = makeRegistry();
      const runtime = makeRuntime({ [TEAM_LEAD_ID]: 'Here is my direct answer.' });
      const bus = makeBus();
      const orch = new Orchestrator(
        registry as never,
        runtime as never,
        bus as never,
      );

      const result = await orch.handleUserMessage('What is the project status?');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('Here is my direct answer.');
    });

    it('fires onResponse event with the lead output', async () => {
      const registry = makeRegistry();
      const runtime = makeRuntime({ [TEAM_LEAD_ID]: 'Direct.' });
      const bus = makeBus();
      const onResponse = vi.fn();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never, { onResponse });

      await orch.handleUserMessage('hello');
      expect(onResponse).toHaveBeenCalledWith('Direct.');
    });

    it('returns error when Team Lead runtime fails', async () => {
      const registry = makeRegistry();
      const runtime = {
        runTask: vi.fn(async () => ({ success: false, error: new Error('CLI error') })),
      };
      const bus = makeBus();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.handleUserMessage('do something');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toBe('CLI error');
    });
  });

  describe('handleUserMessage — with delegations', () => {
    it('delegates to agents and synthesises results', async () => {
      const agents = [{ id: 'frontend', name: 'Frontend', role: 'UI dev' }];
      const registry = makeRegistry(agents);
      const runTaskSpy = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:frontend:Build a login page\nI am delegating to frontend.' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: 'frontend', output: 'Login page component created.' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't3', agentId: TEAM_LEAD_ID, output: 'All done! Frontend built the login page.' } });

      const bus = makeBus();
      const orch = new Orchestrator(registry as never, { runTask: runTaskSpy } as never, bus as never);

      const result = await orch.handleUserMessage('Build a login page');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('All done! Frontend built the login page.');
      expect(runTaskSpy).toHaveBeenCalledTimes(3);
    });

    it('fires onDelegation and onTaskComplete events', async () => {
      const agents = [{ id: 'backend', name: 'Backend', role: 'API dev' }];
      const registry = makeRegistry(agents);
      const onDelegation = vi.fn();
      const onTaskComplete = vi.fn();

      const runTaskSpy = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:backend:Build API' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: 'backend', output: 'API built.' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't3', agentId: TEAM_LEAD_ID, output: 'Summary.' } });

      const bus = makeBus();
      const events: OrchestratorEvents = { onDelegation, onTaskComplete };
      const orch = new Orchestrator(registry as never, { runTask: runTaskSpy } as never, bus as never, events);

      await orch.handleUserMessage('Build API');

      expect(onDelegation).toHaveBeenCalledOnce();
      expect(onDelegation.mock.calls[0][0]).toBe(TEAM_LEAD_ID);
      expect(onDelegation.mock.calls[0][1]).toBe('backend');
      expect(onTaskComplete).toHaveBeenCalledOnce();
    });

    it('skips unknown agent ids in DELEGATE lines', async () => {
      const registry = makeRegistry([]); // no agents registered
      const runTaskSpy = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:ghost-agent:Do something' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: TEAM_LEAD_ID, output: 'Handled directly.' } });

      const bus = makeBus();
      const orch = new Orchestrator(registry as never, { runTask: runTaskSpy } as never, bus as never);

      const result = await orch.handleUserMessage('do something');
      // No valid delegations parsed → treated as direct response
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toContain('DELEGATE:ghost-agent');
    });

    it('falls back to raw summary when synthesis fails', async () => {
      const agents = [{ id: 'qa', name: 'QA', role: 'Tester' }];
      const registry = makeRegistry(agents);

      const runTaskSpy = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:qa:Run tests' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: 'qa', output: 'All tests pass.' } })
        .mockResolvedValueOnce({ success: false, error: new Error('Synthesis failed') });

      const bus = makeBus();
      const orch = new Orchestrator(registry as never, { runTask: runTaskSpy } as never, bus as never);

      const result = await orch.handleUserMessage('Run tests');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Tasks completed');
        expect(result.data).toContain('All tests pass.');
      }
    });
  });

  describe('runDirectTask', () => {
    it('returns agent output directly', async () => {
      const registry = makeRegistry([{ id: 'security', name: 'Security', role: 'Sec' }]);
      const runtime = makeRuntime({ security: 'Audit complete. No issues.' });
      const bus = makeBus();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.runDirectTask('security', 'Run audit');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('Audit complete. No issues.');
    });

    it('sends a notification message to team lead after direct task', async () => {
      const registry = makeRegistry();
      const runtime = makeRuntime({ security: 'Done.' });
      const bus = makeBus();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      await orch.runDirectTask('security', 'Run audit');

      expect(bus.send).toHaveBeenCalledOnce();
      const [fromId, toId] = bus.send.mock.calls[0] as unknown as [string, string, string, string];
      expect(fromId).toBe('security');
      expect(toId).toBe(TEAM_LEAD_ID);
    });

    it('returns error when agent runtime fails', async () => {
      const registry = makeRegistry();
      const runtime = {
        runTask: vi.fn(async () => ({ success: false, error: new Error('agent down') })),
      };
      const bus = makeBus();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.runDirectTask('backend', 'do task');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toBe('agent down');
    });

    it('does not throw if bus.send fails (non-critical)', async () => {
      const registry = makeRegistry();
      const runtime = makeRuntime({ backend: 'done' });
      const bus = { send: vi.fn(async () => { throw new Error('bus down'); }) };
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      // Should not throw
      await expect(orch.runDirectTask('backend', 'task')).resolves.toMatchObject({ success: true });
    });
  });

  describe('task tracking', () => {
    it('getActiveTaskCount returns 0 before any tasks', () => {
      const registry = makeRegistry();
      const runtime = makeRuntime();
      const bus = makeBus();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);
      expect(orch.getActiveTaskCount()).toBe(0);
    });

    it('getAllTasks returns tasks created during delegations', async () => {
      const agents = [{ id: 'frontend', name: 'FE', role: 'UI' }];
      const registry = makeRegistry(agents);

      const runTaskSpy = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:frontend:Build UI' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: 'frontend', output: 'UI built.' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't3', agentId: TEAM_LEAD_ID, output: 'Summary.' } });

      const bus = makeBus();
      const orch = new Orchestrator(registry as never, { runTask: runTaskSpy } as never, bus as never);

      await orch.handleUserMessage('Build UI');
      expect(orch.getAllTasks()).toHaveLength(1);
    });
  });
});
