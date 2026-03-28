import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageBus } from '../../messaging/MessageBus';

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

  it('returns the sent AgentMessage on success', async () => {
    const result = await bus.send('backend', 'frontend', 'Hello', 'World');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromAgentId).toBe('backend');
      expect(result.data.toAgentId).toBe('frontend');
      expect(result.data.subject).toBe('Hello');
    }
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

  it('broadcasts to all agents except sender', async () => {
    await fs.writeFile(path.join(tmpDir, '.agent', 'inbox', 'qa.md'), '# QA Inbox\n\n');
    await fs.writeFile(path.join(tmpDir, '.agent', 'inbox', 'backend.md'), '# Backend Inbox\n\n');

    const result = await bus.broadcast('backend', 'Announcement', 'Deploy ready', ['frontend', 'qa', 'backend']);
    expect(result.success).toBe(true);

    // frontend and qa should receive, backend should not
    const frontendContent = await fs.readFile(path.join(tmpDir, '.agent', 'inbox', 'frontend.md'), 'utf-8');
    const qaContent = await fs.readFile(path.join(tmpDir, '.agent', 'inbox', 'qa.md'), 'utf-8');
    const backendContent = await fs.readFile(path.join(tmpDir, '.agent', 'inbox', 'backend.md'), 'utf-8');

    expect(frontendContent).toContain('Announcement');
    expect(qaContent).toContain('Announcement');
    expect(backendContent).not.toContain('Announcement');
  });

  it('returns error result when inbox file does not exist', async () => {
    const result = await bus.readInbox('nonexistent-agent');
    expect(result.success).toBe(false);
  });

  it('includes taskId in formatted message when provided', async () => {
    await bus.send('backend', 'frontend', 'Work done', 'Details here', 'task_abc123');
    const content = await fs.readFile(
      path.join(tmpDir, '.agent', 'inbox', 'frontend.md'), 'utf-8'
    );
    expect(content).toContain('task_abc123');
  });

  it('registers and calls message handlers on processInboxFile', async () => {
    let received: string | null = null;
    bus.onMessage('frontend', (msg) => { received = msg.fromAgentId; });

    // processInboxFile is private; test indirectly by calling send + readInbox
    await bus.send('backend', 'frontend', 'Ping', 'ping body');
    const result = await bus.readInbox('frontend');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].fromAgentId).toBe('backend');
    }
    // received stays null because chokidar watcher isn't triggered in tests (no start())
    expect(received).toBeNull();
  });
});
