# Phase 4.1 — Orchestrator

> Read CLAUDE.md and PROGRESS.md before starting.
> Phase 3.2 (MessageBus & ApprovalGate) must be complete.

---

## Goal

Implement the `Orchestrator` in `packages/core/src/orchestrator/`. This is the Team Lead's brain — it receives user messages, breaks them into tasks, delegates to registered agents, tracks progress, and synthesises results.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/4.1-orchestrator
```

---

## Deliverables

### 1. `packages/core/src/orchestrator/TaskQueue.ts`

```typescript
import type { Task, Result } from '@vscode-ext/shared';
import { generateTaskId, logger } from '@vscode-ext/shared';

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();

  create(agentId: string, prompt: string): Task {
    const task: Task = {
      id: generateTaskId(),
      agentId,
      prompt,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    logger.debug('Task created', { taskId: task.id, agentId });
    return task;
  }

  update(taskId: string, updates: Partial<Task>): Result<Task> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: new Error(`Task not found: ${taskId}`) };
    const updated = { ...task, ...updates };
    this.tasks.set(taskId, updated);
    return { success: true, data: updated };
  }

  get(taskId: string): Task | null {
    return this.tasks.get(taskId) ?? null;
  }

  getByAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.agentId === agentId);
  }

  getActive(): Task[] {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'pending' || t.status === 'running' || t.status === 'awaiting_approval'
    );
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  clear(olderThanMs = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    for (const [id, task] of this.tasks.entries()) {
      if ((task.status === 'complete' || task.status === 'failed') && task.createdAt < cutoff) {
        this.tasks.delete(id);
      }
    }
  }
}
```

### 2. `packages/core/src/orchestrator/Orchestrator.ts`

```typescript
import type { Task, Agent, Result } from '@vscode-ext/shared';
import { TEAM_LEAD_ID, logger } from '@vscode-ext/shared';
import { AgentRuntime } from '../runtime/AgentRuntime';
import { MessageBus } from '../bus/MessageBus';
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
    ).catch(() => {/* non-critical */});

    return { success: true, data: result.data.output };
  }

  getActiveTaskCount(): number {
    return this.queue.getActive().length;
  }

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
```

### 3. `packages/core/src/orchestrator/index.ts`

```typescript
export { Orchestrator } from './Orchestrator';
export { TaskQueue } from './TaskQueue';
export type { OrchestratorEvents } from './Orchestrator';
```

### 4. Unit Tests

`packages/core/src/__tests__/orchestrator/TaskQueue.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../orchestrator/TaskQueue';

describe('TaskQueue', () => {
  it('creates tasks with pending status', () => {
    const q = new TaskQueue();
    const task = q.create('frontend', 'Build login form');
    expect(task.status).toBe('pending');
    expect(task.agentId).toBe('frontend');
  });

  it('updates task status', () => {
    const q = new TaskQueue();
    const task = q.create('frontend', 'task');
    const result = q.update(task.id, { status: 'running' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('running');
  });

  it('returns active tasks', () => {
    const q = new TaskQueue();
    q.create('a1', 'task 1');
    const t2 = q.create('a2', 'task 2');
    q.update(t2.id, { status: 'complete' });
    expect(q.getActive()).toHaveLength(1);
  });

  it('clears old completed tasks', () => {
    const q = new TaskQueue();
    const t = q.create('a1', 'old task');
    q.update(t.id, {
      status: 'complete',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    });
    q.clear(24 * 60 * 60 * 1000);
    expect(q.get(t.id)).toBeNull();
  });
});
```

---

## Acceptance Criteria

- [ ] `Orchestrator.handleUserMessage` runs Team Lead, parses delegations, executes in parallel
- [ ] `Orchestrator.runDirectTask` bypasses Team Lead and notifies it after
- [ ] `TaskQueue` correctly tracks task lifecycle
- [ ] No `vscode` imports
- [ ] Unit tests pass

---

## Self-Review & Merge

```bash
cd packages/core && npm test && npm run typecheck
grep -r "from 'vscode'" packages/core && echo "VIOLATION" || echo "OK"
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/4.1-orchestrator --no-ff -m "merge: complete phase 4.1 — orchestrator"
git push origin main
git tag -a "phase-4.1-complete" -m "Phase 4.1 complete: orchestrator"
git push origin --tags
```

---

## Next Phase

**Phase 4.2 — Git Integration**
Load `_phases/PHASE-4.2.md` in the next session.
