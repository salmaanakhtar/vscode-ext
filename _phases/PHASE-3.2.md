# Phase 3.2 — MessageBus & ApprovalGate

> Read CLAUDE.md and PROGRESS.md before starting.
> Phase 3.1 (Agent Runtime) must be complete.

---

## Goal

Implement two critical systems:
1. **MessageBus** — file-based agent-to-agent messaging via inbox files
2. **ApprovalGate** — intercepts risky agent actions and routes them for human approval

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/3.2-messagebus-approvalgate
```

---

## Deliverables

### 1. `packages/core/src/bus/MessageBus.ts`

```typescript
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import chokidar from 'chokidar';
import type { AgentMessage, Result } from '@vscode-ext/shared';
import { generateMessageId, getInboxPath, logger } from '@vscode-ext/shared';

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

export class MessageBus {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  start(): void {
    const inboxDir = `${this.projectRoot}/.agent/inbox`;

    if (!fsSync.existsSync(inboxDir)) {
      logger.warn('Inbox directory not found, MessageBus not started', { inboxDir });
      return;
    }

    this.watcher = chokidar.watch(`${inboxDir}/*.md`, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', async (filePath) => {
      await this.processInboxFile(filePath);
    });

    logger.info('MessageBus started', { inboxDir });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    logger.info('MessageBus stopped');
  }

  async send(
    fromAgentId: string,
    toAgentId: string,
    subject: string,
    body: string,
    taskId?: string,
  ): Promise<Result<AgentMessage>> {
    try {
      const message: AgentMessage = {
        id: generateMessageId(),
        fromAgentId,
        toAgentId,
        subject,
        body,
        taskId,
        sentAt: new Date().toISOString(),
      };

      const inboxPath = getInboxPath(this.projectRoot, toAgentId);
      const formatted = this.formatMessage(message);

      await fs.appendFile(inboxPath, formatted, 'utf-8');
      logger.debug('Message sent', { from: fromAgentId, to: toAgentId, subject });

      return { success: true, data: message };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async broadcast(
    fromAgentId: string,
    subject: string,
    body: string,
    agentIds: string[],
  ): Promise<Result<void>> {
    const results = await Promise.allSettled(
      agentIds
        .filter(id => id !== fromAgentId)
        .map(id => this.send(fromAgentId, id, subject, body))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      return { success: false, error: new Error(`${failed.length} broadcast(s) failed`) };
    }

    return { success: true, data: undefined };
  }

  async readInbox(agentId: string): Promise<Result<AgentMessage[]>> {
    try {
      const inboxPath = getInboxPath(this.projectRoot, agentId);
      const content = await fs.readFile(inboxPath, 'utf-8');
      const messages = this.parseMessages(content, agentId);
      return { success: true, data: messages };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async clearInbox(agentId: string): Promise<Result<void>> {
    try {
      const inboxPath = getInboxPath(this.projectRoot, agentId);
      await fs.writeFile(inboxPath, `# ${agentId} Inbox\n\n`, 'utf-8');
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  onMessage(agentId: string, handler: MessageHandler): void {
    const existing = this.handlers.get(agentId) ?? [];
    this.handlers.set(agentId, [...existing, handler]);
  }

  private async processInboxFile(filePath: string): Promise<void> {
    const agentId = filePath.split('/').pop()?.replace('.md', '') ?? '';
    const handlers = this.handlers.get(agentId) ?? [];

    if (handlers.length === 0) return;

    const result = await this.readInbox(agentId);
    if (!result.success) return;

    const unread = result.data.filter(m => !m.readAt);
    for (const message of unread) {
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (err) {
          logger.error('Message handler error', { agentId, error: (err as Error).message });
        }
      }
    }
  }

  private formatMessage(message: AgentMessage): string {
    return [
      `\n## Message from: ${message.fromAgentId} | ${message.sentAt}`,
      `**To:** ${message.toAgentId}`,
      message.taskId ? `**Re:** Task #${message.taskId} — ${message.subject}` : `**Re:** ${message.subject}`,
      '',
      message.body,
      '',
      '---',
      '',
    ].join('\n');
  }

  private parseMessages(content: string, toAgentId: string): AgentMessage[] {
    const messages: AgentMessage[] = [];
    const sections = content.split('\n## Message from: ').slice(1);

    for (const section of sections) {
      const lines = section.split('\n');
      const headerLine = lines[0] ?? '';
      const [fromAgentId, sentAt] = headerLine.split(' | ');

      const toLine = lines.find(l => l.startsWith('**To:**')) ?? '';
      const reLine = lines.find(l => l.startsWith('**Re:**')) ?? '';

      const bodyStart = lines.findIndex(l => l === '') + 1;
      const bodyEnd = lines.findIndex((l, i) => i > bodyStart && l === '---');
      const body = lines.slice(bodyStart, bodyEnd > 0 ? bodyEnd : undefined).join('\n').trim();

      if (fromAgentId && sentAt) {
        messages.push({
          id: generateMessageId(),
          fromAgentId: fromAgentId.trim(),
          toAgentId,
          subject: reLine.replace('**Re:**', '').trim(),
          body,
          sentAt: sentAt.trim(),
        });
      }
    }

    return messages;
  }
}
```

### 2. `packages/core/src/gate/ApprovalGate.ts`

```typescript
import * as fs from 'fs/promises';
import type {
  ApprovalRequest, ApprovalResolution, RiskAction, RiskLevel, Result
} from '@vscode-ext/shared';
import {
  generateApprovalId, RISK_LEVEL_MAP, getAuditLogPath, logger
} from '@vscode-ext/shared';

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResolution>;

export class ApprovalGate {
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private approvalHandler: ApprovalHandler | null = null;
  private autoApprovedActions = new Set<string>(); // agentId:action combos
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Register the handler that will be called when approval is needed.
   * In VS Code this will surface a notification or panel.
   * In tests this can be a mock that auto-approves.
   */
  setApprovalHandler(handler: ApprovalHandler): void {
    this.approvalHandler = handler;
  }

  /**
   * Auto-approve specific action/agent combinations without prompting.
   * Used for trusted agents with low-risk configured actions.
   */
  setAutoApprove(agentId: string, action: RiskAction): void {
    this.autoApprovedActions.add(`${agentId}:${action}`);
  }

  /**
   * Check if an action requires approval and handle accordingly.
   * Returns true if the action should proceed, false if rejected.
   */
  async check(
    agentId: string,
    action: RiskAction,
    description: string,
    context: string,
    taskId: string,
  ): Promise<Result<boolean>> {
    const riskLevel = this.getRiskLevel(agentId, action);

    // Auto-approved actions proceed immediately
    if (riskLevel === 'auto' || this.autoApprovedActions.has(`${agentId}:${action}`)) {
      return { success: true, data: true };
    }

    if (!this.approvalHandler) {
      logger.warn('No approval handler set — blocking action', { agentId, action });
      return { success: true, data: false };
    }

    const request: ApprovalRequest = {
      id: generateApprovalId(),
      agentId,
      taskId,
      action,
      riskLevel,
      description,
      context,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    this.pendingRequests.set(request.id, request);
    logger.info('Approval requested', { agentId, action, riskLevel, requestId: request.id });

    try {
      const resolution = await this.approvalHandler(request);

      request.status = resolution.decision === 'approved' ? 'approved'
        : resolution.decision === 'modified' ? 'modified'
        : 'rejected';
      request.resolution = resolution;

      this.pendingRequests.delete(request.id);
      await this.writeAuditLog(request);

      const approved = resolution.decision === 'approved' || resolution.decision === 'modified';
      logger.info('Approval resolved', { requestId: request.id, decision: resolution.decision });

      return { success: true, data: approved };
    } catch (err) {
      this.pendingRequests.delete(request.id);
      return { success: false, error: err as Error };
    }
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  getPendingRequest(id: string): ApprovalRequest | null {
    return this.pendingRequests.get(id) ?? null;
  }

  getRiskLevel(agentId: string, action: RiskAction): RiskLevel {
    // Can be overridden per-agent in future; for now use global map
    return RISK_LEVEL_MAP[action] ?? 'medium';
  }

  private async writeAuditLog(request: ApprovalRequest): Promise<void> {
    try {
      const auditPath = getAuditLogPath(this.projectRoot);
      const entry = [
        `\n## ${new Date().toISOString()} | ${request.id}`,
        `**Agent:** ${request.agentId}`,
        `**Action:** ${request.action} (${request.riskLevel})`,
        `**Description:** ${request.description}`,
        `**Decision:** ${request.resolution?.decision ?? 'unknown'}`,
        request.resolution?.feedback ? `**Feedback:** ${request.resolution.feedback}` : '',
        '',
        '---',
      ].filter(Boolean).join('\n');

      await fs.appendFile(auditPath, entry, 'utf-8');
    } catch (err) {
      logger.error('Failed to write audit log', { error: (err as Error).message });
    }
  }
}
```

### 3. `packages/core/src/bus/index.ts` and `packages/core/src/gate/index.ts`

```typescript
// bus/index.ts
export { MessageBus } from './MessageBus';
export type { MessageHandler } from './MessageBus';

// gate/index.ts
export { ApprovalGate } from './ApprovalGate';
export type { ApprovalHandler } from './ApprovalGate';
```

### 4. Unit Tests

`packages/core/src/__tests__/bus/MessageBus.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageBus } from '../../bus/MessageBus';

describe('MessageBus', () => {
  let tmpDir: string;
  let bus: MessageBus;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bus-test-'));
    await fs.mkdir(path.join(tmpDir, '.agent', 'inbox'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agent', 'inbox', 'frontend.md'), '# Frontend Inbox\n\n');
    bus = new MessageBus(tmpDir);
  });

  afterEach(async () => {
    bus.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('sends a message to an agent inbox', async () => {
    const result = await bus.send('backend', 'frontend', 'Auth API ready', 'The endpoint is /api/auth');
    expect(result.success).toBe(true);

    const content = await fs.readFile(
      path.join(tmpDir, '.agent', 'inbox', 'frontend.md'), 'utf-8'
    );
    expect(content).toContain('Auth API ready');
    expect(content).toContain('from: backend');
  });

  it('reads messages from inbox', async () => {
    await bus.send('backend', 'frontend', 'Test subject', 'Test body');
    const result = await bus.readInbox('frontend');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].fromAgentId).toBe('backend');
    }
  });

  it('clears inbox', async () => {
    await bus.send('backend', 'frontend', 'msg', 'body');
    await bus.clearInbox('frontend');
    const result = await bus.readInbox('frontend');
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});
```

`packages/core/src/__tests__/gate/ApprovalGate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ApprovalGate } from '../../gate/ApprovalGate';

describe('ApprovalGate', () => {
  let tmpDir: string;
  let gate: ApprovalGate;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-test-'));
    await fs.mkdir(path.join(tmpDir, '.agent', 'memory'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agent', 'memory', 'audit.md'), '# Audit\n\n');
    gate = new ApprovalGate(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-approves low-risk read actions', async () => {
    // 'createFile' is 'low' which goes through handler, not auto
    // Set an auto-approve override to test the auto path
    gate.setAutoApprove('frontend', 'createFile');
    const result = await gate.check('frontend', 'createFile', 'Create file', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it('calls approval handler for medium risk actions', async () => {
    const handler = vi.fn().mockResolvedValue({
      decision: 'approved',
      resolvedAt: new Date().toISOString(),
    });
    gate.setApprovalHandler(handler);

    const result = await gate.check('frontend', 'runScript', 'Run script', 'ctx', 'task-1');
    expect(handler).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it('blocks action when handler rejects', async () => {
    gate.setApprovalHandler(async () => ({
      decision: 'rejected',
      feedback: 'Too risky',
      resolvedAt: new Date().toISOString(),
    }));

    const result = await gate.check('frontend', 'deleteFile', 'Delete file', 'ctx', 'task-1');
    if (result.success) expect(result.data).toBe(false);
  });

  it('writes to audit log on resolution', async () => {
    gate.setApprovalHandler(async () => ({
      decision: 'approved',
      resolvedAt: new Date().toISOString(),
    }));

    await gate.check('frontend', 'push', 'Push to remote', 'ctx', 'task-1');

    const audit = await fs.readFile(
      path.join(tmpDir, '.agent', 'memory', 'audit.md'), 'utf-8'
    );
    expect(audit).toContain('frontend');
    expect(audit).toContain('approved');
  });

  it('blocks when no handler is set', async () => {
    const result = await gate.check('frontend', 'deleteFile', 'Delete', 'ctx', 'task-1');
    if (result.success) expect(result.data).toBe(false);
  });
});
```

---

## Acceptance Criteria

- [ ] `MessageBus` correctly writes and parses inbox files
- [ ] `ApprovalGate` routes actions by risk level
- [ ] Audit log is written after every approval decision
- [ ] No `vscode` imports
- [ ] Tests pass with >80% coverage

---

## Self-Review & Merge

```bash
cd packages/core && npm test && npm run typecheck
grep -r "from 'vscode'" packages/core && echo "VIOLATION" || echo "OK"
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/3.2-messagebus-approvalgate --no-ff -m "merge: complete phase 3.2 — messagebus and approvalgate"
git push origin main
git tag -a "phase-3.2-complete" -m "Phase 3.2 complete: messagebus and approvalgate"
git push origin --tags
```

---

## Next Phase

**Phase 4.1 — Orchestrator**
Load `_phases/PHASE-4.1.md` in the next session.
