import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryAdapter, MemoryConfig, MemoryEntry } from '@vscode-ext/shared';
import { logger } from '@vscode-ext/shared';

export class FileAdapter implements MemoryAdapter {
  private basePath: string = '';

  async init(config: MemoryConfig): Promise<void> {
    this.basePath = config.path;
    await fs.mkdir(this.basePath, { recursive: true });
    logger.debug('FileAdapter initialised', { path: this.basePath });
  }

  private entryPath(id: string): string {
    return path.join(this.basePath, `${id}.json`);
  }

  async write(entry: MemoryEntry): Promise<void> {
    const filePath = this.entryPath(entry.id);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  async read(id: string): Promise<MemoryEntry | null> {
    try {
      const content = await fs.readFile(this.entryPath(id), 'utf-8');
      return JSON.parse(content) as MemoryEntry;
    } catch {
      return null;
    }
  }

  async list(filter?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    limit?: number;
    since?: string;
  }): Promise<MemoryEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.basePath);
    } catch {
      return [];
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const entries: MemoryEntry[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(this.basePath, file), 'utf-8');
        const entry = JSON.parse(content) as MemoryEntry;
        entries.push(entry);
      } catch {
        // skip corrupt files
      }
    }

    let results = entries;

    if (filter?.agentId !== undefined) {
      results = results.filter(e => e.agentId === filter.agentId);
    }
    if (filter?.type !== undefined) {
      results = results.filter(e => e.type === filter.type);
    }
    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(e =>
        filter.tags!.some(tag => e.tags.includes(tag))
      );
    }
    if (filter?.since) {
      results = results.filter(e => e.createdAt >= filter.since!);
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async search(query: string, agentId?: string): Promise<MemoryEntry[]> {
    const all = await this.list({ agentId });
    const lower = query.toLowerCase();
    return all.filter(e =>
      e.content.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.entryPath(id));
    } catch {
      // already deleted — ignore
    }
  }

  async compact(agentId: string): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const all = await this.list({ agentId });
    const toArchive = all.filter(e => e.updatedAt < thirtyDaysAgo);

    if (toArchive.length === 0) return;

    const archivePath = path.join(this.basePath, `archive_${agentId}_${Date.now()}.json`);
    await fs.writeFile(archivePath, JSON.stringify(toArchive, null, 2));

    for (const entry of toArchive) {
      await this.delete(entry.id);
    }

    logger.info('Compacted memory entries', { agentId, count: toArchive.length });
  }
}
