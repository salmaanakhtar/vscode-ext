import type { MemoryAdapter, MemoryConfig, MemoryEntry, Result } from '@vscode-ext/shared';
import { generateMemoryId, logger } from '@vscode-ext/shared';
import { FileAdapter } from './FileAdapter';
import { SQLiteAdapter } from './SQLiteAdapter';

export class MemoryManager {
  private adapter: MemoryAdapter;

  constructor(adapter?: MemoryAdapter) {
    this.adapter = adapter ?? new FileAdapter();
  }

  static fromConfig(config: MemoryConfig): MemoryManager {
    let adapter: MemoryAdapter;

    switch (config.backend) {
      case 'sqlite':
        adapter = new SQLiteAdapter();
        break;
      case 'custom': {
        if (!config.customAdapterPath) {
          throw new Error('customAdapterPath required for custom backend');
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const CustomAdapter = require(config.customAdapterPath) as new () => MemoryAdapter;
        adapter = new CustomAdapter();
        break;
      }
      case 'files':
      default:
        adapter = new FileAdapter();
    }

    return new MemoryManager(adapter);
  }

  async init(config: MemoryConfig): Promise<Result<void>> {
    try {
      await this.adapter.init(config);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async write(
    agentId: string,
    type: MemoryEntry['type'],
    content: string,
    tags: string[] = []
  ): Promise<Result<MemoryEntry>> {
    try {
      const now = new Date().toISOString();
      const entry: MemoryEntry = {
        id: generateMemoryId(),
        agentId,
        type,
        content,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      await this.adapter.write(entry);
      return { success: true, data: entry };
    } catch (err) {
      logger.error('Failed to write memory', { agentId, error: (err as Error).message });
      return { success: false, error: err as Error };
    }
  }

  async read(id: string): Promise<Result<MemoryEntry | null>> {
    try {
      const entry = await this.adapter.read(id);
      return { success: true, data: entry };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async list(filter?: Parameters<MemoryAdapter['list']>[0]): Promise<Result<MemoryEntry[]>> {
    try {
      const entries = await this.adapter.list(filter);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async search(query: string, agentId?: string): Promise<Result<MemoryEntry[]>> {
    try {
      const entries = await this.adapter.search(query, agentId);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.adapter.delete(id);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async compact(agentId: string): Promise<Result<void>> {
    try {
      await this.adapter.compact(agentId);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async getAgentContext(agentId: string, limit = 20): Promise<string> {
    const result = await this.list({ agentId, limit });
    if (!result.success || result.data.length === 0) return '';

    return result.data
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n\n');
  }

  async getProjectContext(limit = 10): Promise<string> {
    const result = await this.list({ agentId: 'project', limit });
    if (!result.success || result.data.length === 0) return '';

    return result.data
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n\n');
  }
}
