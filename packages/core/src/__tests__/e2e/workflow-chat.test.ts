// packages/core/src/__tests__/e2e/workflow-chat.test.ts
// End-to-end tests for the chat → delegation → completion workflow.
// Uses stub runtime and registry (no real CLI calls).

import { describe, it, expect, vi } from 'vitest';
import { Orchestrator, OrchestratorEvents } from '../../orchestrator/Orchestrator';
import { TEAM_LEAD_ID } from '@vscode-ext/shared';
import {
  makeRuntimeStub,
  makeRegistryStub,
  makeBusStub,
  makeAgent,
  makeDelegationSequence,
} from './setup';

describe('Workflow: Chat → Delegation → Completion', () => {

  // ─── Direct Team Lead responses (no delegation) ───────────────────────────

  describe('direct response (no delegation)', () => {
    it('routes message to Team Lead and returns its response', async () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub({ [TEAM_LEAD_ID]: 'The project is on track.' });
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.handleUserMessage('What is the project status?');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('The project is on track.');
      }
      expect(runtime.runTask).toHaveBeenCalledWith(TEAM_LEAD_ID, expect.any(String));
      expect(runtime.runTask).toHaveBeenCalledTimes(1);
    });

    it('fires onResponse event with the Team Lead output', async () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub({ [TEAM_LEAD_ID]: 'Direct answer.' });
      const bus = makeBusStub();
      const onResponse = vi.fn();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never, { onResponse });

      await orch.handleUserMessage('Any question');

      expect(onResponse).toHaveBeenCalledOnce();
      expect(onResponse).toHaveBeenCalledWith('Direct answer.');
    });

    it('returns error when Team Lead runtime fails', async () => {
      const registry = makeRegistryStub();
      const runtime = { runTask: vi.fn().mockResolvedValue({ success: false, error: new Error('CLI down') }) };
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.handleUserMessage('Do something');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('CLI down');
      }
    });

    it('Team Lead prompt includes the user message', async () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub({ [TEAM_LEAD_ID]: 'OK.' });
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      await orch.handleUserMessage('Build a new feature');

      const promptArg = runtime.runTask.mock.calls[0][1] as string;
      expect(promptArg).toContain('Build a new feature');
    });
  });

  // ─── Team Lead delegation ─────────────────────────────────────────────────

  describe('delegation to agents', () => {
    it('delegates to a single agent and synthesises the result', async () => {
      const agents = [makeAgent({ id: 'frontend', name: 'Frontend', role: 'UI dev' })];
      const registry = makeRegistryStub(agents);
      const runTask = makeDelegationSequence(
        [{ agentId: 'frontend', task: 'Build login form', agentResponse: 'Login form built.' }],
        'Frontend built the login form. Done.',
      );
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      const result = await orch.handleUserMessage('Build login form');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('Frontend built the login form. Done.');
      }
      // Lead call + 1 agent call + synthesis = 3
      expect(runTask).toHaveBeenCalledTimes(3);
    });

    it('delegates to multiple agents in parallel and synthesises', async () => {
      const agents = [
        makeAgent({ id: 'backend', name: 'Backend', role: 'API dev' }),
        makeAgent({ id: 'qa', name: 'QA', role: 'Tester' }),
      ];
      const registry = makeRegistryStub(agents);
      const runTask = makeDelegationSequence(
        [
          { agentId: 'backend', task: 'Build REST API', agentResponse: 'API built.' },
          { agentId: 'qa', task: 'Write tests for the API', agentResponse: 'Tests written.' },
        ],
        'Backend built the API and QA tested it. All done.',
      );
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      const result = await orch.handleUserMessage('Set up the backend with tests');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('All done');
      }
      // Lead + 2 agents + synthesis = 4
      expect(runTask).toHaveBeenCalledTimes(4);
    });

    it('fires onDelegation for each delegated agent', async () => {
      const agents = [makeAgent({ id: 'security', name: 'Security', role: 'Sec' })];
      const registry = makeRegistryStub(agents);
      const runTask = makeDelegationSequence(
        [{ agentId: 'security', task: 'Run security audit', agentResponse: 'No CVEs found.' }],
        'Security audit complete.',
      );
      const bus = makeBusStub();
      const onDelegation = vi.fn();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never, { onDelegation });

      await orch.handleUserMessage('Audit the codebase');

      expect(onDelegation).toHaveBeenCalledOnce();
      const [fromId, toId] = onDelegation.mock.calls[0] as unknown as [string, string];
      expect(fromId).toBe(TEAM_LEAD_ID);
      expect(toId).toBe('security');
    });

    it('fires onTaskComplete when each delegated task finishes', async () => {
      const agents = [makeAgent({ id: 'backend', name: 'Backend', role: 'API dev' })];
      const registry = makeRegistryStub(agents);
      const runTask = makeDelegationSequence(
        [{ agentId: 'backend', task: 'Add endpoint', agentResponse: 'Endpoint added.' }],
        'Backend added the endpoint.',
      );
      const bus = makeBusStub();
      const onTaskComplete = vi.fn();
      const events: OrchestratorEvents = { onTaskComplete };
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never, events);

      await orch.handleUserMessage('Add a new endpoint');

      expect(onTaskComplete).toHaveBeenCalledOnce();
      const [task, taskResult] = onTaskComplete.mock.calls[0] as unknown as [{ agentId: string }, string];
      expect(task.agentId).toBe('backend');
      expect(taskResult).toBe('Endpoint added.');
    });

    it('falls back to raw summary when synthesis call fails', async () => {
      const agents = [makeAgent({ id: 'qa', name: 'QA', role: 'Tester' })];
      const registry = makeRegistryStub(agents);
      const runTask = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:qa:Run tests' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: 'qa', output: 'All tests pass.' } })
        .mockResolvedValueOnce({ success: false, error: new Error('Synthesis failed') });

      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      const result = await orch.handleUserMessage('Run tests');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Tasks completed');
        expect(result.data).toContain('All tests pass.');
      }
    });

    it('ignores DELEGATE lines for unknown agent IDs', async () => {
      const registry = makeRegistryStub([]); // no agents registered
      const runTask = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:ghost:Do something\nHandled.' } })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't2', agentId: TEAM_LEAD_ID, output: 'Handled directly.' } });

      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      const result = await orch.handleUserMessage('Do something');

      // No valid agents → treated as direct response
      expect(result.success).toBe(true);
    });
  });

  // ─── Direct @mention tasks (bypass Team Lead) ─────────────────────────────

  describe('direct @mention task (bypass Team Lead)', () => {
    it('sends task directly to the named agent', async () => {
      const agents = [makeAgent({ id: 'frontend', name: 'Frontend', role: 'UI dev' })];
      const registry = makeRegistryStub(agents);
      const runtime = makeRuntimeStub({ frontend: 'Component reviewed. No issues.' });
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.runDirectTask('frontend', 'Review this component');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('Component reviewed. No issues.');
      }
      // Only one runTask call — directly to frontend, no Team Lead involved
      expect(runtime.runTask).toHaveBeenCalledTimes(1);
      expect(runtime.runTask).toHaveBeenCalledWith('frontend', 'Review this component');
    });

    it('notifies Team Lead via MessageBus after direct task completes', async () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub({ backend: 'Endpoint added.' });
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      await orch.runDirectTask('backend', 'Add GET /users endpoint');

      expect(bus.send).toHaveBeenCalledOnce();
      const args = bus.send.mock.calls[0] as unknown as [string, string];
      expect(args[0]).toBe('backend');
      expect(args[1]).toBe(TEAM_LEAD_ID);
    });

    it('does not throw when bus notification fails (non-critical)', async () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub({ backend: 'Done.' });
      const bus = { send: vi.fn().mockRejectedValue(new Error('bus down')) };
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      await expect(orch.runDirectTask('backend', 'task')).resolves.toMatchObject({ success: true });
    });

    it('returns error when agent runtime fails for direct task', async () => {
      const registry = makeRegistryStub();
      const runtime = { runTask: vi.fn().mockResolvedValue({ success: false, error: new Error('Agent offline') }) };
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      const result = await orch.runDirectTask('frontend', 'Do something');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Agent offline');
      }
    });
  });

  // ─── Task tracking ────────────────────────────────────────────────────────

  describe('task queue tracking', () => {
    it('getActiveTaskCount is 0 before any tasks run', () => {
      const registry = makeRegistryStub();
      const runtime = makeRuntimeStub();
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, runtime as never, bus as never);

      expect(orch.getActiveTaskCount()).toBe(0);
    });

    it('getAllTasks records delegated tasks with correct status', async () => {
      const agents = [makeAgent({ id: 'backend', name: 'Backend', role: 'API dev' })];
      const registry = makeRegistryStub(agents);
      const runTask = makeDelegationSequence(
        [{ agentId: 'backend', task: 'Build endpoints', agentResponse: 'Endpoints built.' }],
        'All done.',
      );
      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      await orch.handleUserMessage('Build endpoints');

      const tasks = orch.getAllTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].agentId).toBe('backend');
      expect(tasks[0].status).toBe('complete');
      expect(tasks[0].result).toBe('Endpoints built.');
    });

    it('records failed task status when agent runtime fails', async () => {
      const agents = [makeAgent({ id: 'backend', name: 'Backend', role: 'API dev' })];
      const registry = makeRegistryStub(agents);
      const runTask = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { taskId: 't1', agentId: TEAM_LEAD_ID, output: 'DELEGATE:backend:Build API' } })
        .mockResolvedValueOnce({ success: false, error: new Error('Agent crashed') })
        .mockResolvedValueOnce({ success: true, data: { taskId: 't3', agentId: TEAM_LEAD_ID, output: 'Task failed.' } });

      const bus = makeBusStub();
      const orch = new Orchestrator(registry as never, { runTask } as never, bus as never);

      await orch.handleUserMessage('Build API');

      const tasks = orch.getAllTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('failed');
    });
  });
});
