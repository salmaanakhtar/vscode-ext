# Phase 3.1 — Agent Runtime (Claude Code CLI Integration)

> Read CLAUDE.md and PROGRESS.md before starting.
> Phases 2.1 and 2.2 must be complete.

---

## Goal

Implement `AgentRuntime` in `packages/core/src/runtime/`. This is the core module that
spawns agents by invoking the **local `claude` CLI as a subprocess** (`claude -p`), manages
output streaming, builds system prompts, and wraps results.

**No API key. No `@anthropic-ai/claude-agent-sdk` import. No raw Anthropic API calls.**

Authentication is handled entirely by the user's local Claude Code installation. Agents
run on the user's Pro/Max subscription quota, exactly like Cline and Repo Prompt do.

---

## How It Works

The `claude` CLI (installed via `npm install -g @anthropic-ai/claude-code`) exposes a
non-interactive "print" mode via `claude -p`:

```bash
# Basic usage
claude -p "Your task here"

# With system prompt and tools
claude -p "Your task here" \
  --system-prompt "You are a backend specialist..." \
  --allowedTools "Read,Write,Bash" \
  --output-format stream-json

# Resume a session
claude -p "Continue the task" --resume <session-id>
```

`AgentRuntime` wraps this pattern programmatically using Node.js `child_process.spawn`.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/3.1-agent-runtime
```

---

## Prerequisites Check

At runtime (not at build time), verify `claude` is available:

```typescript
import { execSync } from 'child_process';

export function checkClaudeInstalled(): { installed: boolean; version?: string; error?: string } {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8' }).trim();
    return { installed: true, version };
  } catch {
    return {
      installed: false,
      error: 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\nThen log in with: claude login'
    };
  }
}
```

---

## Deliverables

### 1. `packages/core/src/runtime/ClaudeCliRunner.ts`

Low-level wrapper around `claude -p`. Returns a promise that resolves with the full
output, and emits streaming events via an EventEmitter.

```typescript
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '@[projectname]/shared';

export interface CliRunOptions {
  prompt: string;
  systemPrompt?: string;
  allowedTools?: string[];
  cwd?: string;
  sessionId?: string;        // for --resume
  outputFormat?: 'text' | 'stream-json';
  abortSignal?: AbortSignal;
}

export interface CliRunResult {
  output: string;            // final text output
  sessionId?: string;        // session ID for warm resume
  costUsd?: number;
  exitCode: number;
}

export class ClaudeCliRunner extends EventEmitter {

  async run(options: CliRunOptions): Promise<CliRunResult> {
    const args = this.buildArgs(options);
    logger.debug('Spawning claude CLI', { args: args.slice(0, 5) });

    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (options.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          proc.kill('SIGTERM');
        });
      }

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let sessionId: string | undefined;
      let costUsd: number | undefined;

      proc.stdout.setEncoding('utf-8');
      proc.stderr.setEncoding('utf-8');

      proc.stdout.on('data', (chunk: string) => {
        stdoutChunks.push(chunk);

        if (options.outputFormat === 'stream-json') {
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line) as Record<string, unknown>;
              if (msg['type'] === 'system' && typeof msg['session_id'] === 'string') {
                sessionId = msg['session_id'];
              }
              if (msg['type'] === 'result' && typeof msg['cost_usd'] === 'number') {
                costUsd = msg['cost_usd'];
              }
              if (
                msg['type'] === 'stream_event' &&
                typeof msg['event'] === 'object' &&
                msg['event'] !== null
              ) {
                const event = msg['event'] as Record<string, unknown>;
                if (event['delta'] && typeof event['delta'] === 'object') {
                  const delta = event['delta'] as Record<string, unknown>;
                  if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
                    this.emit('text', delta['text']);
                  }
                }
              }
            } catch {
              this.emit('raw', line);
            }
          }
        } else {
          this.emit('text', chunk);
        }
      });

      proc.stderr.on('data', (chunk: string) => {
        stderrChunks.push(chunk);
        this.emit('stderr', chunk);
      });

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(
            'Claude Code CLI not found in PATH.\n' +
            'Install: npm install -g @anthropic-ai/claude-code\n' +
            'Login:   claude login'
          ));
        } else {
          reject(err);
        }
      });

      proc.on('close', (code) => {
        const exitCode = code ?? 1;
        const rawOutput = stdoutChunks.join('');

        if (exitCode !== 0) {
          const stderr = stderrChunks.join('');
          if (stderr.includes('not logged in') || stderr.includes('unauthorized')) {
            reject(new Error(
              'Claude Code is not logged in. Run: claude login\n' +
              'Make sure you have a Pro or Max subscription.'
            ));
            return;
          }
          logger.warn('claude CLI exited with non-zero code', { exitCode, stderr: stderr.slice(0, 200) });
        }

        const output = options.outputFormat === 'stream-json'
          ? this.extractTextFromStreamJson(rawOutput)
          : rawOutput;

        resolve({ output, sessionId, costUsd, exitCode });
      });

      // Write prompt to stdin
      proc.stdin.write(options.prompt);
      proc.stdin.end();
    });
  }

  private buildArgs(options: CliRunOptions): string[] {
    const args: string[] = ['-p', '-']; // read from stdin

    args.push('--output-format', options.outputFormat ?? 'stream-json');

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    return args;
  }

  private extractTextFromStreamJson(raw: string): string {
    const textParts: string[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg['type'] === 'result' && typeof msg['result'] === 'string') {
          return msg['result'];
        }
        if (msg['type'] === 'stream_event' && typeof msg['event'] === 'object' && msg['event'] !== null) {
          const event = msg['event'] as Record<string, unknown>;
          const delta = event['delta'] as Record<string, unknown> | undefined;
          if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
            textParts.push(delta['text']);
          }
        }
      } catch {
        // skip non-JSON lines
      }
    }

    return textParts.join('');
  }
}
```

### 2. `packages/core/src/runtime/SystemPromptBuilder.ts`

```typescript
import { TEAM_LEAD_ID } from '@[projectname]/shared';
import { TeamRegistry } from '../registry/TeamRegistry';
import { MemoryManager } from '../memory/MemoryManager';

export class SystemPromptBuilder {
  constructor(
    private registry: TeamRegistry,
    private memory: MemoryManager,
  ) {}

  async build(agentId: string): Promise<string> {
    const parts: string[] = [];

    const projectInfo = await this.registry.readProjectInfo();
    if (projectInfo) parts.push('# Project Information\n\n' + projectInfo);

    const projectClaude = await this.registry.readProjectClaude();
    if (projectClaude) parts.push('# Shared Team Instructions\n\n' + projectClaude);

    const agentClaude = await this.registry.readAgentClaude(agentId);
    if (agentClaude) parts.push('# Your Role and Instructions\n\n' + agentClaude);

    const agentContext = await this.memory.getAgentContext(agentId, 20);
    if (agentContext) parts.push('# Your Memory (Recent)\n\n' + agentContext);

    const projectContext = await this.memory.getProjectContext(10);
    if (projectContext) parts.push('# Project Shared Memory\n\n' + projectContext);

    return parts.join('\n\n---\n\n');
  }
}
```

### 3. `packages/core/src/runtime/AgentRuntime.ts`

```typescript
import type { Agent, Task, Result, AgentStatus } from '@[projectname]/shared';
import { generateTaskId, logger, TEAM_LEAD_ID } from '@[projectname]/shared';
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
      maxBudgetUsd: config?.teamLead.maxBudgetUsd ?? 2.0,
      git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: true, canMerge: false },
      approvalRequired: ['deleteFile', 'forcePush'],
      builtinTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch'],
    };
  }
}
```

### 4. `packages/core/src/runtime/checkClaude.ts`

```typescript
import { execSync } from 'child_process';

export interface ClaudeCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

export function checkClaudeInstalled(): ClaudeCheckResult {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    return { installed: true, version };
  } catch {
    return {
      installed: false,
      error:
        'Claude Code CLI not found in PATH.\n' +
        'Install it with: npm install -g @anthropic-ai/claude-code\n' +
        'Then log in: claude login\n' +
        'A Claude Pro or Max subscription is required.',
    };
  }
}
```

### 5. `packages/core/src/runtime/index.ts`

```typescript
export { AgentRuntime } from './AgentRuntime';
export { SystemPromptBuilder } from './SystemPromptBuilder';
export { ClaudeCliRunner } from './ClaudeCliRunner';
export { checkClaudeInstalled } from './checkClaude';
export type { TaskResult, RuntimeEvents } from './AgentRuntime';
export type { CliRunOptions, CliRunResult } from './ClaudeCliRunner';
export type { ClaudeCheckResult } from './checkClaude';
```

### 6. Unit Tests

`packages/core/src/__tests__/runtime/ClaudeCliRunner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCliRunner } from '../../runtime/ClaudeCliRunner';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

vi.mock('child_process');

function makeMockProc(stdout: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess & {
    stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };

  (proc as unknown as Record<string, unknown>).stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
  (proc as unknown as Record<string, unknown>).kill = vi.fn();

  setImmediate(() => {
    (proc as unknown as { stdout: EventEmitter }).stdout.emit('data', stdout);
    proc.emit('close', exitCode);
  });

  return proc;
}

describe('ClaudeCliRunner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves with output on success', async () => {
    const jsonLine = JSON.stringify({ type: 'result', result: 'Hello world', cost_usd: 0.01 }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(jsonLine));

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'Say hello', outputFormat: 'stream-json' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('Hello world');
    expect(result.costUsd).toBe(0.01);
  });

  it('emits text events from stream-json delta', async () => {
    const streamLine = JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'chunk ' } }
    }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(streamLine));

    const runner = new ClaudeCliRunner();
    const chunks: string[] = [];
    runner.on('text', (t: string) => chunks.push(t));

    await runner.run({ prompt: 'test', outputFormat: 'stream-json' });
    expect(chunks).toContain('chunk ');
  });

  it('throws with install instructions on ENOENT', async () => {
    const proc = makeMockProc('', 1);
    vi.mocked(childProcess.spawn).mockReturnValue(proc);
    setImmediate(() => {
      proc.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }));
    });

    const runner = new ClaudeCliRunner();
    await expect(runner.run({ prompt: 'test' })).rejects.toThrow('npm install -g @anthropic-ai/claude-code');
  });
});
```

`packages/core/src/__tests__/runtime/SystemPromptBuilder.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
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
    expect(prompt).toContain('Agent instructions');
    expect(prompt.indexOf('Project info')).toBeLessThan(prompt.indexOf('Shared instructions'));
    expect(prompt.indexOf('Shared instructions')).toBeLessThan(prompt.indexOf('Agent instructions'));
  });

  it('returns empty string when all context is empty', async () => {
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
    expect(await builder.build('frontend')).toBe('');
  });
});
```

`packages/core/src/__tests__/runtime/checkClaude.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as childProcess from 'child_process';
import { checkClaudeInstalled } from '../../runtime/checkClaude';

vi.mock('child_process');

describe('checkClaudeInstalled', () => {
  it('returns installed=true when claude is in PATH', () => {
    vi.mocked(childProcess.execSync).mockReturnValue('claude 1.0.0\n' as unknown as Buffer);
    const result = checkClaudeInstalled();
    expect(result.installed).toBe(true);
  });

  it('returns installed=false with helpful error when not found', () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('not found'); });
    const result = checkClaudeInstalled();
    expect(result.installed).toBe(false);
    expect(result.error).toContain('npm install -g @anthropic-ai/claude-code');
    expect(result.error).toContain('claude login');
  });
});
```

---

## Package.json Changes

`@anthropic-ai/claude-code` is a **global tool** the user installs themselves. Do NOT bundle it as a runtime dependency. Add it only as a `peerDependency`:

```json
{
  "peerDependencies": {
    "@anthropic-ai/claude-code": ">=1.0.0"
  }
}
```

Do **not** add `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, or any raw API client as a dependency.

---

## Important Notes

1. **Prompt via stdin**: Using `-p -` reads the prompt from stdin. This avoids shell escaping issues with complex prompts.

2. **Session warm resume**: `--resume <session-id>` continues a prior session. `AgentRuntime` caches session IDs per agent. Call `endSession()` to clear the cache when the user closes a session.

3. **Working directory**: Always pass the project root as `cwd` so the subprocess has correct file and Git context.

4. **Cost display**: `costUsd` from `stream-json` reflects quota consumption on a flat-rate subscription — surface it as "usage estimate" in the UI, not as an actual charge.

5. **Auth errors**: If stderr contains "not logged in", surface: *"Please run `claude login` in your terminal."* Never fall back to API key auth.

---

## Acceptance Criteria

- [ ] `ClaudeCliRunner` uses `child_process.spawn` (not `exec`)
- [ ] Zero `@anthropic-ai/claude-agent-sdk` or `@anthropic-ai/sdk` imports
- [ ] Zero `ANTHROPIC_API_KEY` references in source
- [ ] `AgentRuntime.checkPrerequisites()` detects missing CLI correctly
- [ ] `ClaudeCliRunner` emits real-time `text` events for streaming
- [ ] Session IDs cached and passed via `--resume`
- [ ] ENOENT triggers helpful install/login message
- [ ] Auth errors trigger helpful login message
- [ ] All unit tests pass with mocked `child_process`
- [ ] No `vscode` imports
- [ ] `npm run typecheck` passes

---

## Self-Review & Merge

```bash
cd packages/core && npm test && npm run typecheck
grep -r "from 'vscode'" packages/core && echo "VIOLATION" || echo "OK"
grep -rn "ANTHROPIC_API_KEY\|claude-agent-sdk\|@anthropic-ai/sdk" packages/core/src && echo "VIOLATION" || echo "OK"
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/3.1-agent-runtime --no-ff -m "merge: complete phase 3.1 — agent runtime (CLI subprocess)"
git push origin main
git tag -a "phase-3.1-complete" -m "Phase 3.1 complete: agent runtime via claude CLI"
git push origin --tags
```

---

## Next Phase

**Phase 3.2 — MessageBus & ApprovalGate**
Load `_phases/PHASE-3.2.md` in the next session.
