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

      const bodyStart = lines.findIndex(l => l === '') + 1;
      const bodyEnd = lines.findIndex((l, i) => i > bodyStart && l === '---');
      const body = lines.slice(bodyStart, bodyEnd > 0 ? bodyEnd : undefined).join('\n').trim();

      const reLine = lines.find(l => l.startsWith('**Re:**')) ?? '';

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
