# Phase 3.1 — Agent Runtime (Claude Agent SDK Integration)

> Read CLAUDE.md and PROGRESS.md before starting.
> Phases 2.1 and 2.2 must be complete.

---

## Goal

Implement `AgentRuntime` in `packages/core/src/runtime/`. This is the core module that wraps the Claude Agent SDK, manages agent sessions, builds system prompts, and executes tasks.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/3.1-agent-runtime
```

---

## Key Context

The Claude Agent SDK is `@anthropic-ai/claude-code`. It was renamed from the Claude Code SDK in 2025. The primary function is `query()` which runs an agent session.

```typescript
// SDK usage pattern
import { query } from '@anthropic-ai/claude-code';

const result = await query({
  prompt: 'Your task here',
  options: {
    systemPrompt: 'Agent instructions',
    allowedTools: ['Read', 'Write', 'Bash'],
    maxBudgetUsd: 1.0,
    // resume: 'session-id' for warm sessions
  }
});
```

Check the installed SDK for exact API surface — the above is approximate. Adapt to the actual SDK API.

---

## Deliverables

### 1. `packages/core/src/runtime/SystemPromptBuilder.ts`

Builds the stacked system prompt for an agent session:

```typescript
import type { Agent } from '@vscode-ext/shared';
import { TEAM_LEAD_ID } from '@vscode-ext/shared';
import { TeamRegistry } from '../registry/TeamRegistry';
import { MemoryManager } from '../memory/MemoryManager';

export class SystemPromptBuilder {
  constructor(
    private registry: TeamRegistry,
    private memory: MemoryManager,
  ) {}

  async build(agentId: string): Promise<string> {
    const parts: string[] = [];

    // 1. Project info
    const projectInfo = await this.registry.readProjectInfo();
    if (projectInfo) {
      parts.push('# Project Information\n\n' + projectInfo);
    }

    // 2. Project-level CLAUDE.md (shared instructions)
    const projectClaude = await this.registry.readProjectClaude();
    if (projectClaude) {
      parts.push('# Shared Team Instructions\n\n' + projectClaude);
    }

    // 3. Agent-specific CLAUDE.md
    const agentClaude = await this.registry.readAgentClaude(agentId);
    if (agentClaude) {
      parts.push('# Your Role and Instructions\n\n' + agentClaude);
    }

    // 4. Agent private memory (last 20 entries)
    const agentContext = await this.memory.getAgentContext(agentId, 20);
    if (agentContext) {
      parts.push('# Your Memory (Recent)\n\n' + agentContext);
    }

    // 5. Project shared memory (last 10 entries)
    const projectContext = await this.memory.getProjectContext(10);
    if (projectContext) {
      parts.push('# Project Shared Memory\n\n' + projectContext);
    }

    return parts.join('\n\n---\n\n');
  }
}
```

### 2. `packages/core/src/runtime/AgentRuntime.ts`

```typescript
import type { Agent, Task, Result, AgentStatus } from '@vscode-ext/shared';
import { generateTaskId, logger, TEAM_LEAD_ID } from '@vscode-ext/shared';
import { TeamRegistry } from '../registry/TeamRegistry';
import { MemoryManager } from '../memory/MemoryManager';
import { SystemPromptBuilder } from './SystemPromptBuilder';

export interface TaskResult {
  taskId: string;
  agentId: string;
  output: string;
  cost?: number;
  tokensUsed?: number;
}

export interface RuntimeEvents {
  onTaskStart?: (task: Task) => void;
  onTaskComplete?: (result: TaskResult) => void;
  onTaskError?: (taskId: string, error: Error) => void;
  onApprovalRequired?: (agentId: string, action: string, context: string) => Promise<boolean>;
  onStatusChange?: (status: AgentStatus) => void;
}

export class AgentRuntime {
  private activeSessions: Map<string, string> = new Map(); // agentId -> sessionId
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

    try {
      // Build system prompt
      const systemPrompt = await this.promptBuilder.build(agentId);

      // Get SDK
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { query } = require('@anthropic-ai/claude-code');

      // Set up abort controller
      const abortController = new AbortController();
      this.abortControllers.set(task.id, abortController);

      // Build tool list
      const allowedTools = agent.builtinTools ?? ['Read', 'Write', 'Bash'];

      // Add MCP servers if configured
      const mcpServers = agent.mcpServers?.map(s => ({
        type: 'url' as const,
        url: s.url,
        name: s.name,
      })) ?? [];

      // Resume warm session if available
      const sessionId = this.activeSessions.get(agentId);

      const queryOptions: Record<string, unknown> = {
        systemPrompt,
        allowedTools,
        maxBudgetUsd: agent.maxBudgetUsd,
        abortController,
      };

      if (sessionId) queryOptions['resume'] = sessionId;
      if (mcpServers.length > 0) queryOptions['mcpServers'] = mcpServers;

      this.updateStatus(agentId, 'writing', task.id);

      // Run the agent
      const sdkResult = await query(prompt, queryOptions);

      // Extract output — adapt based on actual SDK response shape
      const output = this.extractOutput(sdkResult);
      const cost = this.extractCost(sdkResult);
      const newSessionId = this.extractSessionId(sdkResult);

      // Cache session for warm resume
      if (newSessionId) {
        this.activeSessions.set(agentId, newSessionId);
      }

      // Write task summary to memory
      await this.memory.write(
        agentId,
        'task_summary',
        `Task completed: ${prompt.substring(0, 100)}\nResult: ${output.substring(0, 200)}`,
        ['task', task.id]
      );

      const taskResult: TaskResult = {
        taskId: task.id,
        agentId,
        output,
        cost,
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
    // Compact memory at session end
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

  private updateStatus(
    agentId: string,
    state: AgentStatus['state'],
    taskId?: string
  ): void {
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
      maxBudgetUsd: config?.teamLead.maxBudgetUsd ?? 2.0,
      git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: true, canMerge: false },
      approvalRequired: ['deleteFile', 'forcePush'],
      builtinTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch'],
    };
  }

  // These methods extract data from the SDK response.
  // Adapt based on actual @anthropic-ai/claude-code SDK response shape.
  private extractOutput(sdkResult: unknown): string {
    if (!sdkResult || typeof sdkResult !== 'object') return String(sdkResult);
    const r = sdkResult as Record<string, unknown>;
    // Try common SDK response patterns
    if (typeof r['result'] === 'string') return r['result'];
    if (typeof r['output'] === 'string') return r['output'];
    if (Array.isArray(r['content'])) {
      return (r['content'] as Array<{ type: string; text?: string }>)
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('\n');
    }
    return JSON.stringify(sdkResult);
  }

  private extractCost(sdkResult: unknown): number | undefined {
    if (!sdkResult || typeof sdkResult !== 'object') return undefined;
    const r = sdkResult as Record<string, unknown>;
    if (typeof r['cost_usd'] === 'number') return r['cost_usd'];
    if (typeof r['totalCostUsd'] === 'number') return r['totalCostUsd'];
    return undefined;
  }

  private extractSessionId(sdkResult: unknown): string | undefined {
    if (!sdkResult || typeof sdkResult !== 'object') return undefined;
    const r = sdkResult as Record<string, unknown>;
    if (typeof r['sessionId'] === 'string') return r['sessionId'];
    if (typeof r['session_id'] === 'string') return r['session_id'];
    return undefined;
  }
}
```

### 3. `packages/core/src/runtime/index.ts`

```typescript
export { AgentRuntime } from './AgentRuntime';
export { SystemPromptBuilder } from './SystemPromptBuilder';
export type { TaskResult, RuntimeEvents } from './AgentRuntime';
```

### 4. Unit Tests

`packages/core/src/__tests__/runtime/SystemPromptBuilder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemPromptBuilder } from '../../runtime/SystemPromptBuilder';

describe('SystemPromptBuilder', () => {
  it('includes all context sections in correct order', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue('Project info'),
      readProjectClaude: vi.fn().mockResolvedValue('Shared instructions'),
      readAgentClaude: vi.fn().mockResolvedValue('Agent instructions'),
    };

    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue('Agent memory'),
      getProjectContext: vi.fn().mockResolvedValue('Project memory'),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    const prompt = await builder.build('frontend');

    expect(prompt).toContain('Project info');
    expect(prompt).toContain('Shared instructions');
    expect(prompt).toContain('Agent instructions');
    expect(prompt).toContain('Agent memory');
    expect(prompt).toContain('Project memory');

    // Verify order
    const piIdx = prompt.indexOf('Project info');
    const siIdx = prompt.indexOf('Shared instructions');
    const aiIdx = prompt.indexOf('Agent instructions');
    expect(piIdx).toBeLessThan(siIdx);
    expect(siIdx).toBeLessThan(aiIdx);
  });

  it('handles missing files gracefully', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue(''),
      readProjectClaude: vi.fn().mockResolvedValue(''),
      readAgentClaude: vi.fn().mockResolvedValue(''),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue(''),
      getProjectContext: vi.fn().mockResolvedValue(''),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    const prompt = await builder.build('frontend');
    expect(prompt).toBe('');
  });
});
```

---

## Important Notes

1. The `@anthropic-ai/claude-code` SDK API may differ slightly from what is shown above. After installing, run `npm info @anthropic-ai/claude-code` and inspect the package to get the exact API surface. Adapt `AgentRuntime` accordingly.

2. The `extractOutput`, `extractCost`, and `extractSessionId` methods are intentionally defensive. The SDK response shape should be verified against actual SDK docs.

3. Do not mock the SDK in unit tests for the runtime — instead, mock the `query` function itself. Write integration tests separately in a `__tests__/integration/` folder that can be skipped in CI.

---

## Acceptance Criteria

- [ ] `SystemPromptBuilder` correctly stacks all context layers
- [ ] `AgentRuntime` wraps all SDK calls in try/catch returning `Result<T>`
- [ ] `AgentRuntime` tracks session IDs for warm resume
- [ ] `AgentRuntime` calls `memory.compact()` at session end
- [ ] Status updates fire correctly on state changes
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
git merge phase/3.1-agent-runtime --no-ff -m "merge: complete phase 3.1 — agent runtime"
git push origin main
git tag -a "phase-3.1-complete" -m "Phase 3.1 complete: agent runtime"
git push origin --tags
```

---

## Next Phase

**Phase 3.2 — MessageBus & ApprovalGate**
Load `_phases/PHASE-3.2.md` in the next session.
